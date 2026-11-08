import { describe, expect, it, mock } from 'bun:test';

import { Money } from '../../../wallet/domain/money';
import { Wallet } from '../../../wallet/domain/wallet';
import { LedgerDirection } from '../../../wallet/domain/ledger-direction';

import {
    WagerTransaction,
    WagerTransactionKind,
    WagerTransactionStatus,
} from '../../domain/wager-transaction';

import { WageringUnitOfWork } from '../ports/wagering.unit-of-work';
import { ProcessWagerTransactionUseCase } from './process-wager-transaction.use-case';

describe('ProcessWagerTransactionUseCase', () => {
    const createDependencies = () => {
        const wallet = Wallet.open({
            id: 'wallet-1',
            playerId: 'player-1',
            initialBalance: Money.from({
                amount: '100.00',
                currency: 'BRL',
            }),
        });

        const repositories = {
            wallets: {
                findByIdForUpdate: mock(() => Promise.resolve(wallet)),
                findById: mock(async () => wallet),
                findByPlayerIdAndCurrency: mock(async () => null),
                create: mock(async () => { }),
                update: mock(async () => { }),
            },
            wagerTransactions: {
                create: mock(async () => { }),
                update: mock(async () => { }),
                findByProviderAndIdempotencyKey: mock(
                    async () => null,
                ),
                findByProviderAndExternalTransactionId: mock(
                    async () => null,
                ),
                findByProviderAndReferenceTransactionId: mock(
                    async () => [],
                ),
            },
            ledgerEntries: {
                create: mock(async () => { }),
            },
            outbox: {
                enqueue: mock(async () => { }),
            },
        };

        const unitOfWork: WageringUnitOfWork = {
            execute: mock(async (operation: any) =>
                operation(repositories),
            ),
        };

        return { wallet, repositories, unitOfWork };
    };

    it('should process a BET and persist wallet, transaction, ledger and events', async () => {
        const { wallet, repositories, unitOfWork } =
            createDependencies();

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'external-1',
            idempotencyKey: 'provider-1:external-1',
            payloadHash: 'hash-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
        });

        expect(result.status).toBe(WagerTransactionStatus.PROCESSED);
        expect(result.balance.toString()).toBe('70.00');

        expect(wallet.balance.toString()).toBe('70.00');
        expect(wallet.version).toBe(2);

        expect(repositories.wallets.update).toHaveBeenCalledTimes(1);
        expect(repositories.wallets.update.mock.calls[0][1]).toBe(1);

        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).toHaveBeenCalledTimes(1);

        const ledgerEntry =
            repositories.ledgerEntries.create.mock.calls[0][0];

        expect(ledgerEntry.direction).toBe(LedgerDirection.DEBIT);
        expect(ledgerEntry.money.toString()).toBe('30.00');
        expect(ledgerEntry.balanceBefore.toString()).toBe('100.00');
        expect(ledgerEntry.balanceAfter.toString()).toBe('70.00');

        expect(repositories.outbox.enqueue).toHaveBeenCalledTimes(2);

        const events = repositories.outbox.enqueue.mock.calls.map(
            ([event]) => event,
        );

        expect(events.map((event) => event.eventType)).toEqual([
            'WagerTransactionProcessed',
            'WalletBalanceChanged',
        ]);
    });
    it('should reject a BET when the wallet has insufficient funds', async () => {
        const { wallet, repositories, unitOfWork } =
            createDependencies();

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'external-2',
            idempotencyKey: 'provider-1:external-2',
            payloadHash: 'hash-2',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({
                amount: '150.00',
                currency: 'BRL',
            }),
        });

        expect(result.status).toBe(WagerTransactionStatus.REJECTED);
        expect(result.balance.toString()).toBe('100.00');
        expect(result.idempotentReplay).toBe(false);

        expect(wallet.balance.toString()).toBe('100.00');
        expect(wallet.version).toBe(1);

        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();

        expect(repositories.outbox.enqueue).toHaveBeenCalledTimes(1);

        const event = repositories.outbox.enqueue.mock.calls[0][0];

        expect(event.eventType).toBe('WagerTransactionRejected');
        expect(event.data.failureCode).toBe('INSUFFICIENT_FUNDS');
    });

    it('should return the original transaction when the request is an idempotent replay', async () => {
        const { wallet, repositories, unitOfWork } =
            createDependencies();

        const existingTransaction = WagerTransaction.create({
            id: 'transaction-1',
            providerId: 'provider-1',
            externalTransactionId: 'external-1',
            idempotencyKey: 'provider-1:external-1',
            payloadHash: 'hash-1',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            createdAt: new Date(),
        });

        existingTransaction.markProcessed(
            undefined,
            new Date(),
            Money.from({
                amount: '70.00',
                currency: 'BRL',
            }),
        );

        repositories.wagerTransactions.findByProviderAndIdempotencyKey =
            mock(async () => existingTransaction);

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'external-1',
            idempotencyKey: 'provider-1:external-1',
            payloadHash: 'hash-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
        });

        expect(result.status).toBe(WagerTransactionStatus.PROCESSED);
        expect(result.balance.toString()).toBe('70.00');
        expect(result.idempotentReplay).toBe(true);

        expect(wallet.balance.toString()).toBe('100.00');
        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });

    it('should reject an idempotency key reused with a different payload', async () => {
        const { repositories, unitOfWork } = createDependencies();

        const existingTransaction = WagerTransaction.create({
            id: 'transaction-1',
            providerId: 'provider-1',
            externalTransactionId: 'external-1',
            idempotencyKey: 'provider-1:external-1',
            payloadHash: 'original-hash',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            createdAt: new Date(),
        });

        existingTransaction.markProcessed(
            undefined,
            new Date(),
            Money.from({
                amount: '70.00',
                currency: 'BRL',
            }),
        );

        repositories.wagerTransactions.findByProviderAndIdempotencyKey =
            mock(async () => existingTransaction);

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        await expect(
            useCase.execute({
                providerId: 'provider-1',
                externalTransactionId: 'external-1',
                idempotencyKey: 'provider-1:external-1',
                payloadHash: 'different-hash',
                playerId: 'player-1',
                walletId: 'wallet-1',
                roundId: 'round-1',
                gameId: 'game-1',
                kind: WagerTransactionKind.BET,
                money: Money.from({
                    amount: '30.00',
                    currency: 'BRL',
                }),
            }),
        ).rejects.toThrow('Idempotency key payload conflict');

        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });

    it('should reject an external transaction ID reused with another idempotency key', async () => {
        const { repositories, unitOfWork } = createDependencies();

        const existingTransaction = WagerTransaction.create({
            id: 'transaction-1',
            providerId: 'provider-1',
            externalTransactionId: 'external-1',
            idempotencyKey: 'provider-1:external-1',
            payloadHash: 'hash-1',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            createdAt: new Date(),
        });

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async () => existingTransaction);

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        await expect(
            useCase.execute({
                providerId: 'provider-1',
                externalTransactionId: 'external-1',
                idempotencyKey: 'another-idempotency-key',
                payloadHash: 'another-hash',
                playerId: 'player-1',
                walletId: 'wallet-1',
                roundId: 'round-1',
                gameId: 'game-1',
                kind: WagerTransactionKind.BET,
                money: Money.from({
                    amount: '30.00',
                    currency: 'BRL',
                }),
            }),
        ).rejects.toThrow('External transaction ID conflict');

        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });
    it('should reject when the wallet does not exist', async () => {
        const { repositories, unitOfWork } = createDependencies();

        repositories.wallets.findByIdForUpdate = mock(() => Promise.resolve(null));

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        await expect(
            useCase.execute({
                providerId: 'provider-1',
                externalTransactionId: 'external-3',
                idempotencyKey: 'provider-1:external-3',
                payloadHash: 'hash-3',
                playerId: 'player-1',
                walletId: 'wallet-1',
                roundId: 'round-1',
                gameId: 'game-1',
                kind: WagerTransactionKind.BET,
                money: Money.from({
                    amount: '30.00',
                    currency: 'BRL',
                }),
            }),
        ).rejects.toThrow('Wallet not found');

        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });

    it('should reject when the wallet belongs to another player', async () => {
        const { repositories, unitOfWork } = createDependencies();

        const otherWallet = Wallet.open({
            id: 'wallet-1',
            playerId: 'another-player',
            initialBalance: Money.from({
                amount: '100.00',
                currency: 'BRL',
            }),
        });

        repositories.wallets.findByIdForUpdate = mock(() =>
            Promise.resolve(
                Wallet.open({
                    id: 'wallet-1',
                    playerId: 'player-2',
                    initialBalance: Money.from({
                        amount: '100.00',
                        currency: 'BRL',
                    }),
                }),
            ),
        );

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        await expect(
            useCase.execute({
                providerId: 'provider-1',
                externalTransactionId: 'external-4',
                idempotencyKey: 'provider-1:external-4',
                payloadHash: 'hash-4',
                playerId: 'player-1',
                walletId: 'wallet-1',
                roundId: 'round-1',
                gameId: 'game-1',
                kind: WagerTransactionKind.BET,
                money: Money.from({
                    amount: '30.00',
                    currency: 'BRL',
                }),
            }),
        ).rejects.toThrow('Wallet does not belong to player');

        expect(otherWallet.balance.toString()).toBe('100.00');
        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });

    it('should reject when the transaction currency differs from the wallet currency', async () => {
        const { wallet, repositories, unitOfWork } = createDependencies();

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        await expect(
            useCase.execute({
                providerId: 'provider-1',
                externalTransactionId: 'external-5',
                idempotencyKey: 'provider-1:external-5',
                payloadHash: 'hash-5',
                playerId: 'player-1',
                walletId: 'wallet-1',
                roundId: 'round-1',
                gameId: 'game-1',
                kind: WagerTransactionKind.BET,
                money: Money.from({
                    amount: '30.00',
                    currency: 'USD',
                }),
            }),
        ).rejects.toThrow('Wallet currency mismatch');

        expect(wallet.balance.toString()).toBe('100.00');
        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });
    it('should resume a PENDING_REFERENCE transaction when its reference arrives', async () => {
        const { wallet, repositories, unitOfWork } =
            createDependencies();

        const pendingTransaction = WagerTransaction.create({
            id: 'refund-1',
            providerId: 'provider-1',
            externalTransactionId: 'refund-external',
            idempotencyKey: 'refund-key',
            payloadHash: 'refund-hash',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.REFUND,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            referenceExternalTransactionId: 'bet-external',
            createdAt: new Date(),
        });

        pendingTransaction.markPendingReference(
            Money.from({
                amount: '100.00',
                currency: 'BRL',
            }),
        );

        const originalBet = WagerTransaction.create({
            id: 'bet-1',
            providerId: 'provider-1',
            externalTransactionId: 'bet-external',
            idempotencyKey: 'bet-key',
            payloadHash: 'bet-hash',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            createdAt: new Date(),
        });

        originalBet.markProcessed(
            undefined,
            new Date(),
            Money.from({
                amount: '70.00',
                currency: 'BRL',
            }),
        );

        repositories.wagerTransactions.findByProviderAndIdempotencyKey =
            mock(async () => pendingTransaction);

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async (_providerId: string, externalId: string) => {
                if (externalId === 'refund-external') {
                    return pendingTransaction;
                }

                if (externalId === 'bet-external') {
                    return originalBet;
                }

                return null;
            });

        repositories.wagerTransactions.findByProviderAndReferenceTransactionId =
            mock(async () => []);

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'refund-external',
            idempotencyKey: 'refund-key',
            payloadHash: 'refund-hash',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.REFUND,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            referenceExternalTransactionId: 'bet-external',
        });

        expect(result.status).toBe(WagerTransactionStatus.PROCESSED);
        expect(result.balance.toString()).toBe('130.00');
        expect(result.idempotentReplay).toBe(false);

        expect(pendingTransaction.id).toBe('refund-1');
        expect(pendingTransaction.status).toBe(
            WagerTransactionStatus.PROCESSED,
        );

        expect(wallet.balance.toString()).toBe('130.00');

        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.update).toHaveBeenCalledTimes(1);

        expect(repositories.wallets.update).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).toHaveBeenCalledTimes(1);
        expect(repositories.outbox.enqueue).toHaveBeenCalledTimes(2);
    });
    it('should not duplicate a PENDING_REFERENCE transaction when its reference is still missing', async () => {
        const { repositories, unitOfWork } =
            createDependencies();

        const pendingTransaction = WagerTransaction.create({
            id: 'refund-2',
            providerId: 'provider-1',
            externalTransactionId: 'refund-external-2',
            idempotencyKey: 'refund-key-2',
            payloadHash: 'refund-hash-2',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.REFUND,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            referenceExternalTransactionId: 'missing-bet',
            createdAt: new Date(),
        });

        pendingTransaction.markPendingReference(
            Money.from({
                amount: '100.00',
                currency: 'BRL',
            }),
        );
        repositories.wagerTransactions.findByProviderAndIdempotencyKey =
            mock(async () => pendingTransaction);

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async (_providerId: string, externalId: string) =>
                externalId === 'refund-external-2'
                    ? pendingTransaction
                    : null,
            );

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'refund-external-2',
            idempotencyKey: 'refund-key-2',
            payloadHash: 'refund-hash-2',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.REFUND,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            referenceExternalTransactionId: 'missing-bet',
        });

        expect(result.status).toBe(
            WagerTransactionStatus.PENDING_REFERENCE,
        );
        expect(result.balance.toString()).toBe('100.00');
        expect(result.idempotentReplay).toBe(true);

        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.update).not.toHaveBeenCalled();
        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });
    it('should process a WIN and credit the wallet', async () => {
        const { wallet, repositories, unitOfWork } =
            createDependencies();

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'win-1',
            idempotencyKey: 'provider-1:win-1',
            payloadHash: 'win-hash-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.WIN,
            money: Money.from({
                amount: '25.00',
                currency: 'BRL',
            }),
        });

        expect(result.status).toBe(WagerTransactionStatus.PROCESSED);
        expect(result.balance.toString()).toBe('125.00');
        expect(result.idempotentReplay).toBe(false);

        expect(wallet.balance.toString()).toBe('125.00');
        expect(wallet.version).toBe(2);

        expect(repositories.wallets.update).toHaveBeenCalledTimes(1);
        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).toHaveBeenCalledTimes(1);

        const ledgerEntry =
            repositories.ledgerEntries.create.mock.calls[0][0];

        expect(ledgerEntry.direction).toBe(LedgerDirection.CREDIT);
        expect(ledgerEntry.money.toString()).toBe('25.00');
        expect(ledgerEntry.balanceBefore.toString()).toBe('100.00');
        expect(ledgerEntry.balanceAfter.toString()).toBe('125.00');

        expect(repositories.outbox.enqueue).toHaveBeenCalledTimes(2);

        const events = repositories.outbox.enqueue.mock.calls.map(
            ([event]) => event,
        );

        expect(events.map((event) => event.eventType)).toEqual([
            'WagerTransactionProcessed',
            'WalletBalanceChanged',
        ]);
    });
    it('should process a LOSS without changing the wallet balance', async () => {
        const { wallet, repositories, unitOfWork } =
            createDependencies();

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'loss-1',
            idempotencyKey: 'provider-1:loss-1',
            payloadHash: 'loss-hash-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.LOSS,
            money: Money.from({
                amount: '0.00',
                currency: 'BRL',
            }),
        });

        expect(result.status).toBe(WagerTransactionStatus.PROCESSED);
        expect(result.balance.toString()).toBe('100.00');
        expect(result.idempotentReplay).toBe(false);

        expect(wallet.balance.toString()).toBe('100.00');
        expect(wallet.version).toBe(1);

        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();

        expect(repositories.outbox.enqueue).toHaveBeenCalledTimes(1);

        const event = repositories.outbox.enqueue.mock.calls[0][0];

        expect(event.eventType).toBe('WagerTransactionProcessed');
    });
    it('should process a REFUND and credit the original BET amount', async () => {
        const { wallet, repositories, unitOfWork } =
            createDependencies();

        const originalBet = WagerTransaction.create({
            id: 'bet-refund-1',
            providerId: 'provider-1',
            externalTransactionId: 'bet-refund-1',
            idempotencyKey: 'bet-key-1',
            payloadHash: 'bet-hash-1',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            createdAt: new Date(),
        });

        originalBet.markProcessed(
            undefined,
            new Date(),
            Money.from({
                amount: '70.00',
                currency: 'BRL',
            }),
        );

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async (_providerId: string, externalId: string) =>
                externalId === 'bet-refund-1' ? originalBet : null,
            );

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'refund-success-1',
            idempotencyKey: 'refund-key-1',
            payloadHash: 'refund-hash-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.REFUND,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            referenceExternalTransactionId: 'bet-refund-1',
        });

        expect(result.status).toBe(WagerTransactionStatus.PROCESSED);
        expect(result.balance.toString()).toBe('130.00');
        expect(result.idempotentReplay).toBe(false);

        expect(wallet.balance.toString()).toBe('130.00');
        expect(wallet.version).toBe(2);

        expect(repositories.wallets.update).toHaveBeenCalledTimes(1);
        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).toHaveBeenCalledTimes(1);

        const ledgerEntry =
            repositories.ledgerEntries.create.mock.calls[0][0];

        expect(ledgerEntry.direction).toBe(LedgerDirection.CREDIT);
        expect(ledgerEntry.money.toString()).toBe('30.00');
        expect(ledgerEntry.balanceBefore.toString()).toBe('100.00');
        expect(ledgerEntry.balanceAfter.toString()).toBe('130.00');

        expect(repositories.outbox.enqueue).toHaveBeenCalledTimes(2);

        const events = repositories.outbox.enqueue.mock.calls.map(
            ([event]) => event,
        );

        expect(events.map((event) => event.eventType)).toEqual([
            'WagerTransactionProcessed',
            'WalletBalanceChanged',
        ]);
    });
    it('should reject a REFUND referencing a WIN transaction', async () => {
        const { wallet, repositories, unitOfWork } =
            createDependencies();

        const originalWin = WagerTransaction.create({
            id: 'win-reference-1',
            providerId: 'provider-1',
            externalTransactionId: 'win-reference-1',
            idempotencyKey: 'win-key-1',
            payloadHash: 'win-hash-1',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.WIN,
            money: Money.from({
                amount: '30.00',
                currency: 'BRL',
            }),
            createdAt: new Date(),
        });

        originalWin.markProcessed(
            undefined,
            new Date(),
            Money.from({
                amount: '130.00',
                currency: 'BRL',
            }),
        );

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async (_providerId: string, externalId: string) =>
                externalId === 'win-reference-1' ? originalWin : null,
            );

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        await expect(
            useCase.execute({
                providerId: 'provider-1',
                externalTransactionId: 'invalid-refund-1',
                idempotencyKey: 'invalid-refund-key-1',
                payloadHash: 'invalid-refund-hash-1',
                playerId: 'player-1',
                walletId: 'wallet-1',
                roundId: 'round-1',
                gameId: 'game-1',
                kind: WagerTransactionKind.REFUND,
                money: Money.from({
                    amount: '30.00',
                    currency: 'BRL',
                }),
                referenceExternalTransactionId: 'win-reference-1',
            }),
        ).rejects.toThrow('REFUND must reference a BET');

        expect(wallet.balance.toString()).toBe('100.00');
        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });

    it('should reject a duplicate REFUND for the same BET', async () => {
        const { wallet, repositories, unitOfWork } = createDependencies();

        const originalBet = WagerTransaction.create({
            id: 'bet-reference-duplicate',
            providerId: 'provider-1',
            externalTransactionId: 'bet-external-duplicate',
            idempotencyKey: 'bet-key-duplicate',
            payloadHash: 'bet-hash-duplicate',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            createdAt: new Date(),
        });

        originalBet.markProcessed(
            undefined,
            new Date(),
            Money.from({ amount: '70.00', currency: 'BRL' }),
        );

        const previousRefund = WagerTransaction.create({
            id: 'refund-already-processed',
            providerId: 'provider-1',
            externalTransactionId: 'refund-external-previous',
            idempotencyKey: 'refund-key-previous',
            payloadHash: 'refund-hash-previous',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.REFUND,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'bet-external-duplicate',
            createdAt: new Date(),
        });

        previousRefund.markProcessed(
            originalBet.id,
            new Date(),
            Money.from({ amount: '100.00', currency: 'BRL' }),
        );

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async (_providerId: string, externalId: string) =>
                externalId === 'bet-external-duplicate' ? originalBet : null,
            );

        repositories.wagerTransactions.findByProviderAndReferenceTransactionId =
            mock(async () => [previousRefund]);

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        await expect(
            useCase.execute({
                providerId: 'provider-1',
                externalTransactionId: 'refund-external-duplicate',
                idempotencyKey: 'refund-key-duplicate',
                payloadHash: 'refund-hash-duplicate',
                playerId: 'player-1',
                walletId: 'wallet-1',
                roundId: 'round-1',
                gameId: 'game-1',
                kind: WagerTransactionKind.REFUND,
                money: Money.from({ amount: '30.00', currency: 'BRL' }),
                referenceExternalTransactionId: 'bet-external-duplicate',
            }),
        ).rejects.toThrow('Transaction already reversed');

        expect(wallet.balance.toString()).toBe('100.00');
        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });

    it('should successfully ROLLBACK a processed BET', async () => {
        const { wallet, repositories, unitOfWork } = createDependencies();

        const originalBet = WagerTransaction.create({
            id: 'bet-reference-rollback',
            providerId: 'provider-1',
            externalTransactionId: 'bet-external-rollback',
            idempotencyKey: 'bet-key-rollback',
            payloadHash: 'bet-hash-rollback',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.BET,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            createdAt: new Date(),
        });

        originalBet.markProcessed(
            undefined,
            new Date(),
            Money.from({ amount: '70.00', currency: 'BRL' }),
        );

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async (_providerId: string, externalId: string) =>
                externalId === 'bet-external-rollback' ? originalBet : null,
            );

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'rollback-external-1',
            idempotencyKey: 'rollback-key-1',
            payloadHash: 'rollback-hash-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.ROLLBACK,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'bet-external-rollback',
        });

        expect(result.status).toBe(WagerTransactionStatus.PROCESSED);
        expect(result.balance.toString()).toBe('130.00');
        expect(wallet.balance.toString()).toBe('130.00');
        expect(repositories.wallets.update).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).toHaveBeenCalledTimes(1);
        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.outbox.enqueue).toHaveBeenCalled();
    });

    it('should successfully ROLLBACK a processed WIN', async () => {
        const { wallet, repositories, unitOfWork } = createDependencies();

        const originalWin = WagerTransaction.create({
            id: 'win-reference-rollback',
            providerId: 'provider-1',
            externalTransactionId: 'win-external-rollback',
            idempotencyKey: 'win-key-rollback',
            payloadHash: 'win-hash-rollback',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.WIN,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            createdAt: new Date(),
        });

        originalWin.markProcessed(
            undefined,
            new Date(),
            Money.from({ amount: '130.00', currency: 'BRL' }),
        );

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async (_providerId: string, externalId: string) =>
                externalId === 'win-external-rollback' ? originalWin : null,
            );

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'rollback-win-external-1',
            idempotencyKey: 'rollback-win-key-1',
            payloadHash: 'rollback-win-hash-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.ROLLBACK,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'win-external-rollback',
        });

        expect(result.status).toBe(WagerTransactionStatus.PROCESSED);
        expect(result.balance.toString()).toBe('70.00');
        expect(wallet.balance.toString()).toBe('70.00');
        expect(repositories.wallets.update).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).toHaveBeenCalledTimes(1);
        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.outbox.enqueue).toHaveBeenCalled();
    });

    it('should successfully ROLLBACK a processed REFUND', async () => {
        const { wallet, repositories, unitOfWork } = createDependencies();

        const originalRefund = WagerTransaction.create({
            id: 'refund-reference-rollback',
            providerId: 'provider-1',
            externalTransactionId: 'refund-external-rollback',
            idempotencyKey: 'refund-key-rollback',
            payloadHash: 'refund-hash-rollback',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.REFUND,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'bet-external-original',
            createdAt: new Date(),
        });

        originalRefund.markProcessed(
            'original-bet-id',
            new Date(),
            Money.from({ amount: '130.00', currency: 'BRL' }),
        );

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async (_providerId: string, externalId: string) =>
                externalId === 'refund-external-rollback' ? originalRefund : null,
            );

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'rollback-refund-external-1',
            idempotencyKey: 'rollback-refund-key-1',
            payloadHash: 'rollback-refund-hash-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.ROLLBACK,
            money: Money.from({ amount: '30.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'refund-external-rollback',
        });

        expect(result.status).toBe(WagerTransactionStatus.PROCESSED);
        expect(result.balance.toString()).toBe('70.00');
        expect(wallet.balance.toString()).toBe('70.00');
        expect(repositories.wallets.update).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).toHaveBeenCalledTimes(1);
        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.outbox.enqueue).toHaveBeenCalled();
    });

    it('should reject a ROLLBACK when it would cause a negative balance', async () => {
        const { wallet, repositories, unitOfWork } = createDependencies();

        const originalWin = WagerTransaction.create({
            id: 'win-reference-insufficient',
            providerId: 'provider-1',
            externalTransactionId: 'win-external-insufficient',
            idempotencyKey: 'win-key-insufficient',
            payloadHash: 'win-hash-insufficient',
            walletId: 'wallet-1',
            playerId: 'player-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.WIN,
            money: Money.from({ amount: '150.00', currency: 'BRL' }),
            createdAt: new Date(),
        });

        originalWin.markProcessed(
            undefined,
            new Date(),
            Money.from({ amount: '250.00', currency: 'BRL' }),
        );

        repositories.wagerTransactions.findByProviderAndExternalTransactionId =
            mock(async (_providerId: string, externalId: string) =>
                externalId === 'win-external-insufficient' ? originalWin : null,
            );

        const useCase = new ProcessWagerTransactionUseCase(unitOfWork);

        const result = await useCase.execute({
            providerId: 'provider-1',
            externalTransactionId: 'rollback-insufficient-1',
            idempotencyKey: 'rollback-insufficient-key-1',
            payloadHash: 'rollback-insufficient-hash-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: WagerTransactionKind.ROLLBACK,
            money: Money.from({ amount: '150.00', currency: 'BRL' }),
            referenceExternalTransactionId: 'win-external-insufficient',
        });

        expect(result.status).toBe(WagerTransactionStatus.REJECTED);
        expect(wallet.balance.toString()).toBe('100.00');
        expect(repositories.wallets.update).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.outbox.enqueue).toHaveBeenCalled();
    });

});