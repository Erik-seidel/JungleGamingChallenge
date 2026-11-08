import { randomUUID } from 'node:crypto';

import { Money } from '../../domain/money';
import { Wallet } from '../../domain/wallet';
import { LedgerDirection } from '../../domain/ledger-direction';
import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry';

import {
    WagerTransaction,
    WagerTransactionKind,
} from '../../../wagering/domain/wager-transaction';

import { WalletOpeningUnitOfWork } from '../ports/wallet-opening.unit-of-work';

export interface OpenWalletInput {
    playerId: string;
    initialBalance: Money;
}

export class OpenWalletUseCase {
    constructor(
        private readonly unitOfWork: WalletOpeningUnitOfWork,
    ) { }

    async execute(input: OpenWalletInput): Promise<Wallet> {
        return this.unitOfWork.execute(async (repositories) => {
            const { playerId, initialBalance } = input;

            const existingWallet =
                await repositories.wallets.findByPlayerIdAndCurrency(
                    playerId,
                    initialBalance.currency,
                );

            if (existingWallet) {
                throw new Error(
                    'Wallet already exists for this player and currency',
                );
            }

            const now = new Date();
            const walletId = randomUUID();

            const wallet = Wallet.open({
                id: walletId,
                playerId,
                initialBalance,
            });

            await repositories.wallets.create(wallet);

            // Saldo inicial zero não gera transação, ledger ou eventos.
            if (initialBalance.isZero()) {
                return wallet;
            }

            const transactionId = randomUUID();

            const transaction = WagerTransaction.create({
                id: transactionId,
                walletId,
                playerId,
                kind: WagerTransactionKind.OPENING,
                money: initialBalance,
                createdAt: now,
            });

            transaction.markProcessed(undefined, now, initialBalance);

            await repositories.wagerTransactions.create(transaction);

            const ledgerEntry = WalletLedgerEntry.create({
                id: randomUUID(),
                walletId,
                transactionId,
                direction: LedgerDirection.CREDIT,
                money: initialBalance,
                balanceBefore: Money.zero(initialBalance.currency),
                balanceAfter: initialBalance,
                createdAt: now,
            });

            await repositories.ledgerEntries.create(ledgerEntry);

            const correlationId = randomUUID();

            await repositories.outbox.enqueue({
                eventId: randomUUID(),
                eventType: 'WagerTransactionProcessed',
                aggregateId: walletId,
                correlationId,
                causationId: transactionId,
                occurredAt: now,
                version: 1,
                data: {
                    transactionId,
                    walletId,
                    playerId,
                    kind: WagerTransactionKind.OPENING,
                    amount: initialBalance.toString(),
                    currency: initialBalance.currency,
                    status: transaction.status,
                },
            });

            await repositories.outbox.enqueue({
                eventId: randomUUID(),
                eventType: 'WalletBalanceChanged',
                aggregateId: walletId,
                correlationId,
                causationId: transactionId,
                occurredAt: now,
                version: 1,
                data: {
                    walletId,
                    playerId,
                    previousBalance: Money.zero(initialBalance.currency).toString(),
                    currentBalance: initialBalance.toString(),
                    currency: initialBalance.currency,
                    transactionId,
                },
            });

            return wallet;
        });
    }
}