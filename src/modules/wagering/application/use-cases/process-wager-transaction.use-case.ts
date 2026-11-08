
import { randomUUID } from 'node:crypto';

import { Money } from '../../../wallet/domain/money';
import { WalletLedgerEntry } from '../../../wallet/domain/wallet-ledger-entry';
import { LedgerDirection } from '../../../wallet/domain/ledger-direction';
import { DuplicateInboxMessageError } from '../../../shared/application/ports/duplicate-inbox-message.error';
import {
    WagerTransaction,
    WagerTransactionKind,
    WagerTransactionStatus,
} from '../../domain/wager-transaction';

import { WageringUnitOfWork } from '../ports/wagering.unit-of-work';

export interface ProcessWagerTransactionInput {
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: Money;
    referenceExternalTransactionId?: string;
    inboxMessageId?: string;
    inboxPayloadHash?: string;
}

export interface ProcessWagerTransactionResult {
    status: WagerTransactionStatus;
    balance: Money;
    idempotentReplay: boolean;
}

export class ProcessWagerTransactionUseCase {
    constructor(
        private readonly unitOfWork: WageringUnitOfWork,
    ) { }

    async execute(
        input: ProcessWagerTransactionInput,
    ): Promise<ProcessWagerTransactionResult> {
        if (input.kind === WagerTransactionKind.OPENING) {
            throw new Error('OPENING transactions are not accepted here');
        }

        const requiresReference =
            input.kind === WagerTransactionKind.REFUND ||
            input.kind === WagerTransactionKind.ROLLBACK;

        if (
            requiresReference &&
            !input.referenceExternalTransactionId?.trim()
        ) {
            throw new Error('Reference transaction ID is required');
        }

        if (
            !requiresReference &&
            input.referenceExternalTransactionId
        ) {
            throw new Error(
                'Reference transaction ID is not allowed for this kind',
            );
        }

        if (
            input.kind === WagerTransactionKind.LOSS
                ? !input.money.isZero()
                : !input.money.isPositive()
        ) {
            throw new Error('Invalid transaction amount');
        }

        return this.unitOfWork.execute(async (repositories) => {
            if (
                Boolean(input.inboxMessageId) !==
                Boolean(input.inboxPayloadHash)
            ) {
                throw new Error(
                    'Inbox message ID and payload hash must be provided together',
                );
            }

            if (
                input.inboxMessageId !== undefined &&
                (
                    !input.inboxMessageId.trim() ||
                    input.inboxMessageId.length > 200
                )
            ) {
                throw new Error('Invalid inbox message ID');
            }

            if (
                input.inboxPayloadHash &&
                !/^[a-f0-9]{64}$/.test(input.inboxPayloadHash)
            ) {
                throw new Error('Invalid inbox payload hash');
            }

            // Verifica duplicidade antes de qualquer operação financeira.
            if (input.inboxMessageId && input.inboxPayloadHash) {
                const existingInboxMessage =
                    await repositories.inboxMessages.findByMessageId(
                        input.inboxMessageId,
                    );

                if (existingInboxMessage) {
                    if (
                        existingInboxMessage.payloadHash !==
                        input.inboxPayloadHash
                    ) {
                        throw new Error('Inbox message payload conflict');
                    }

                    throw new DuplicateInboxMessageError();
                }
            }

            // A gravação ocorre somente no final de cada caminho bem-sucedido.
            const persistInboxMessage = async (): Promise<void> => {
                if (!input.inboxMessageId || !input.inboxPayloadHash) {
                    return;
                }

                await repositories.inboxMessages.create({
                    messageId: input.inboxMessageId,
                    payloadHash: input.inboxPayloadHash,
                    processedAt: new Date(),
                });
            };

            const findReplay = async (
                existing: WagerTransaction | null,
            ): Promise<ProcessWagerTransactionResult | null> => {
                if (!existing) {
                    return null;
                }

                if (!existing.matchesPayload(input.payloadHash)) {
                    throw new Error('Idempotency key payload conflict');
                }

                if (
                    existing.status === WagerTransactionStatus.PENDING_REFERENCE &&
                    requiresReference
                ) {

                    return null;
                }

                if (!existing.balanceAfter) {
                    throw new Error(
                        'Original transaction has no recorded balance',
                    );
                }

                return {
                    status: existing.status,
                    balance: existing.balanceAfter,
                    idempotentReplay: true,
                };
            };

            const existingByIdempotency =
                await repositories.wagerTransactions
                    .findByProviderAndIdempotencyKey(
                        input.providerId,
                        input.idempotencyKey,
                    );

            const initialReplay = await findReplay(
                existingByIdempotency,
            );

            if (initialReplay) {
                await persistInboxMessage();
                return initialReplay;
            }

            const wallet = await repositories.wallets.findByIdForUpdate(
                input.walletId,
            );

            if (!wallet) {
                throw new Error('Wallet not found');
            }

            if (wallet.playerId !== input.playerId) {
                throw new Error('Wallet does not belong to player');
            }

            if (wallet.currency !== input.money.currency) {
                throw new Error('Wallet currency mismatch');
            }

            // Revalida a idempotência depois de adquirir o lock da carteira.
            const existingAfterLock =
                await repositories.wagerTransactions
                    .findByProviderAndIdempotencyKey(
                        input.providerId,
                        input.idempotencyKey,
                    );

            const lockedReplay = await findReplay(existingAfterLock);

            if (lockedReplay) {
                await persistInboxMessage();
                return lockedReplay;
            }

            const balanceBefore = wallet.balance;
            const expectedVersion = wallet.version;

            const isResumingPendingReference =
                existingAfterLock?.status ===
                WagerTransactionStatus.PENDING_REFERENCE;

            let transaction: WagerTransaction;

            if (isResumingPendingReference) {
                transaction = existingAfterLock!;
            } else {
                if (existingAfterLock) {
                    throw new Error('Transaction is in an unexpected state');
                }

                transaction = WagerTransaction.create({
                    id: randomUUID(),
                    providerId: input.providerId,
                    externalTransactionId: input.externalTransactionId,
                    idempotencyKey: input.idempotencyKey,
                    payloadHash: input.payloadHash,
                    walletId: input.walletId,
                    playerId: input.playerId,
                    roundId: input.roundId,
                    gameId: input.gameId,
                    kind: input.kind,
                    money: input.money,
                    referenceExternalTransactionId:
                        input.referenceExternalTransactionId,
                    createdAt: new Date(),
                });
            }

            const existingByExternalId =
                await repositories.wagerTransactions
                    .findByProviderAndExternalTransactionId(
                        input.providerId,
                        input.externalTransactionId,
                    );

            if (
                existingByExternalId &&
                existingByExternalId.id !== transaction.id
            ) {
                throw new Error('External transaction ID conflict');
            }
            let referenceTransaction: WagerTransaction | null = null;

            // Resolve a transação original de REFUND ou ROLLBACK.
            if (requiresReference) {
                referenceTransaction =
                    await repositories.wagerTransactions
                        .findByProviderAndExternalTransactionId(
                            input.providerId,
                            input.referenceExternalTransactionId!,
                        );

                // A referência ainda não chegou. Persiste para resolução posterior.
                if (!referenceTransaction) {
                    if (!referenceTransaction) {
                        if (isResumingPendingReference) {
                            if (!transaction.balanceAfter) {
                                throw new Error(
                                    'Pending transaction has no recorded balance',
                                );
                            }

                            return {
                                status: transaction.status,
                                balance: transaction.balanceAfter,
                                idempotentReplay: true,
                            };
                        }

                        transaction.markPendingReference(balanceBefore);

                        await repositories.wagerTransactions.create(transaction);

                        await repositories.outbox.enqueue({
                            eventId: randomUUID(),
                            eventType: 'WagerTransactionPendingReference',
                            aggregateId: wallet.id,
                            correlationId: randomUUID(),
                            causationId: transaction.id,
                            occurredAt: new Date(),
                            version: wallet.version,
                            data: {
                                transactionId: transaction.id,
                                walletId: wallet.id,
                                providerId: input.providerId,
                                referenceExternalTransactionId:
                                    input.referenceExternalTransactionId,
                                kind: input.kind,
                                status: transaction.status,
                            },
                        });
                        await persistInboxMessage();
                        return {
                            status: transaction.status,
                            balance: balanceBefore,
                            idempotentReplay: false,
                        };
                    }

                    return {
                        status: transaction.status,
                        balance: balanceBefore,
                        idempotentReplay: false,
                    };
                }

                // A referência precisa ser uma transação efetivamente processada.
                if (
                    referenceTransaction.status !==
                    WagerTransactionStatus.PROCESSED ||
                    referenceTransaction.providerId !== input.providerId ||
                    referenceTransaction.playerId !== input.playerId ||
                    referenceTransaction.walletId !== wallet.id ||
                    referenceTransaction.money.currency !==
                    input.money.currency ||
                    !referenceTransaction.money.equals(input.money) ||
                    referenceTransaction.roundId !== input.roundId
                ) {
                    throw new Error('Invalid reference transaction');
                }

                if (
                    input.kind === WagerTransactionKind.REFUND &&
                    referenceTransaction.kind !== WagerTransactionKind.BET
                ) {
                    throw new Error('REFUND must reference a BET');
                }

                if (
                    input.kind === WagerTransactionKind.ROLLBACK &&
                    ![
                        WagerTransactionKind.BET,
                        WagerTransactionKind.WIN,
                        WagerTransactionKind.REFUND,
                    ].includes(referenceTransaction.kind)
                ) {
                    throw new Error('Invalid ROLLBACK reference kind');
                }

                // Impede repetir uma reversão já processada.
                const previousReversals =
                    await repositories.wagerTransactions
                        .findByProviderAndReferenceTransactionId(
                            input.providerId,
                            referenceTransaction.id,
                        );

                const alreadyReversed = previousReversals.some(
                    (previous) =>
                        previous.kind === input.kind &&
                        previous.status ===
                        WagerTransactionStatus.PROCESSED,
                );

                if (alreadyReversed) {
                    throw new Error('Transaction already reversed');
                }
            }

            // Determina como a operação afeta a carteira.
            let ledgerDirection: LedgerDirection | undefined;

            switch (input.kind) {
                case WagerTransactionKind.BET:
                    ledgerDirection = LedgerDirection.DEBIT;
                    break;

                case WagerTransactionKind.WIN:
                case WagerTransactionKind.REFUND:
                    ledgerDirection = LedgerDirection.CREDIT;
                    break;

                case WagerTransactionKind.ROLLBACK:
                    ledgerDirection = transaction.ledgerDirectionFor(
                        referenceTransaction!,
                    );
                    break;

                case WagerTransactionKind.LOSS:
                    ledgerDirection = undefined;
                    break;

                default:
                    throw new Error('Unsupported wager transaction kind');
            }

            // Verifica saldo somente quando a operação exige débito.
            const insufficientBalance =
                ledgerDirection === LedgerDirection.DEBIT &&
                balanceBefore.isLessThan(input.money);

            if (insufficientBalance) {
                const failureCode =
                    input.kind === WagerTransactionKind.ROLLBACK
                        ? 'REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE'
                        : 'INSUFFICIENT_FUNDS';

                transaction.reject(failureCode, balanceBefore);

                if (isResumingPendingReference) {
                    await repositories.wagerTransactions.update(transaction);
                } else {
                    await repositories.wagerTransactions.create(transaction);
                }

                await repositories.outbox.enqueue({
                    eventId: randomUUID(),
                    eventType: 'WagerTransactionRejected',
                    aggregateId: wallet.id,
                    correlationId: randomUUID(),
                    causationId: transaction.id,
                    occurredAt: new Date(),
                    version: wallet.version,
                    data: {
                        transactionId: transaction.id,
                        walletId: wallet.id,
                        playerId: wallet.playerId,
                        kind: transaction.kind,
                        amount: transaction.money.toString(),
                        currency: transaction.money.currency,
                        status: transaction.status,
                        failureCode: transaction.failureCode,
                    },
                });

                return {
                    status: transaction.status,
                    balance: balanceBefore,
                    idempotentReplay: false,
                };
            }

            // Executa a movimentação financeira.
            if (ledgerDirection === LedgerDirection.DEBIT) {
                wallet.debit(input.money);
            } else if (ledgerDirection === LedgerDirection.CREDIT) {
                wallet.credit(input.money);
            }

            const balanceAfter = wallet.balance;
            const processedAt = new Date();

            transaction.markProcessed(
                referenceTransaction?.id,
                processedAt,
                balanceAfter,
            );

            // Persiste a transação antes do ledger para respeitar a FK.
            if (isResumingPendingReference) {
                await repositories.wagerTransactions.update(transaction);
            } else {
                await repositories.wagerTransactions.create(transaction);
            }

            // LOSS não altera carteira nem gera lançamento contábil.
            if (ledgerDirection) {
                await repositories.wallets.update(
                    wallet,
                    expectedVersion,
                );

                await repositories.ledgerEntries.create(
                    WalletLedgerEntry.create({
                        id: randomUUID(),
                        walletId: wallet.id,
                        transactionId: transaction.id,
                        direction: ledgerDirection,
                        money: input.money,
                        balanceBefore,
                        balanceAfter,
                        createdAt: processedAt,
                    }),
                );
            }
            const correlationId = randomUUID();

            // Toda operação aplicada gera evento de processamento.
            await repositories.outbox.enqueue({
                eventId: randomUUID(),
                eventType: 'WagerTransactionProcessed',
                aggregateId: wallet.id,
                correlationId,
                causationId: transaction.id,
                occurredAt: processedAt,
                version: wallet.version,
                data: {
                    transactionId: transaction.id,
                    walletId: wallet.id,
                    playerId: wallet.playerId,
                    kind: transaction.kind,
                    amount: transaction.money.toString(),
                    currency: transaction.money.currency,
                    status: transaction.status,
                },
            });

            // Só publica alteração de saldo quando houve movimentação.
            if (ledgerDirection) {
                await repositories.outbox.enqueue({
                    eventId: randomUUID(),
                    eventType: 'WalletBalanceChanged',
                    aggregateId: wallet.id,
                    correlationId,
                    causationId: transaction.id,
                    occurredAt: processedAt,
                    version: wallet.version,
                    data: {
                        walletId: wallet.id,
                        playerId: wallet.playerId,
                        previousBalance: balanceBefore.toString(),
                        currentBalance: balanceAfter.toString(),
                        currency: wallet.currency,
                        transactionId: transaction.id,
                    },
                });
            }
            await persistInboxMessage();
            return {
                status: transaction.status,
                balance: balanceAfter,
                idempotentReplay: false,
            };
        });
    }
}
