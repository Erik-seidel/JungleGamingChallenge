
import { Money } from '../../wallet/domain/money';
import { LedgerDirection } from '../../wallet/domain/ledger-direction';
import {
    WagerTransaction,
    WagerTransactionKind,
    WagerTransactionStatus,
} from './wager-transaction';

describe('WagerTransaction', () => {
    const validProps = {
        id: 'transaction-1',
        providerId: 'provider-1',
        externalTransactionId: 'external-1',
        idempotencyKey: 'provider-1:external-1',
        payloadHash: 'hash-123',
        walletId: 'wallet-1',
        playerId: 'player-1',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: Money.from({
            amount: '25.00',
            currency: 'BRL',
        }),
        createdAt: new Date('2026-11-07T12:00:00.000Z'),
    };

    describe('create', () => {
        it('should create a transaction with PENDING status', () => {
            const transaction = WagerTransaction.create(validProps);

            expect(transaction.id).toBe(validProps.id);
            expect(transaction.kind).toBe(WagerTransactionKind.BET);
            expect(transaction.status).toBe(
                WagerTransactionStatus.PENDING,
            );
            expect(transaction.money.equals(validProps.money)).toBe(true);
        });

        it('should reject REFUND without referenceExternalTransactionId', () => {
            expect(() =>
                WagerTransaction.create({
                    ...validProps,
                    kind: WagerTransactionKind.REFUND,
                }),
            ).toThrow();
        });

        it('should reject ROLLBACK without referenceExternalTransactionId', () => {
            expect(() =>
                WagerTransaction.create({
                    ...validProps,
                    kind: WagerTransactionKind.ROLLBACK,
                }),
            ).toThrow();
        });

        it('should allow LOSS with zero amount', () => {
            const transaction = WagerTransaction.create({
                ...validProps,
                kind: WagerTransactionKind.LOSS,
                money: Money.zero('BRL'),
            });

            expect(transaction.kind).toBe(WagerTransactionKind.LOSS);
            expect(transaction.money.isZero()).toBe(true);
        });
    });

    describe('state transitions', () => {
        it('should mark a transaction as PROCESSED', () => {
            const transaction = WagerTransaction.create(validProps);
            const processedAt = new Date('2026-11-07T13:00:00.000Z');

            transaction.markProcessed(undefined, processedAt);

            expect(transaction.status).toBe(
                WagerTransactionStatus.PROCESSED,
            );
            expect(transaction.processedAt).toEqual(processedAt);
            expect(transaction.isTerminal()).toBe(true);
        });

        it('should mark a transaction as PENDING_REFERENCE', () => {
            const transaction = WagerTransaction.create({
                ...validProps,
                kind: WagerTransactionKind.REFUND,
                referenceExternalTransactionId: 'external-bet-1',
            });

            transaction.markPendingReference();

            expect(transaction.status).toBe(
                WagerTransactionStatus.PENDING_REFERENCE,
            );
            expect(transaction.isTerminal()).toBe(false);
        });

        it('should reject a transaction with a failure code', () => {
            const transaction = WagerTransaction.create(validProps);

            transaction.reject('INSUFFICIENT_FUNDS');

            expect(transaction.status).toBe(
                WagerTransactionStatus.REJECTED,
            );
            expect(transaction.failureCode).toBe('INSUFFICIENT_FUNDS');
            expect(transaction.isTerminal()).toBe(true);
        });

        it('should mark a transaction as FAILED', () => {
            const transaction = WagerTransaction.create(validProps);

            transaction.fail('PROCESSING_ERROR');

            expect(transaction.status).toBe(
                WagerTransactionStatus.FAILED,
            );
            expect(transaction.failureCode).toBe('PROCESSING_ERROR');
            expect(transaction.isTerminal()).toBe(true);
        });

        it('should prevent transitions from a terminal state', () => {
            const transaction = WagerTransaction.create(validProps);

            transaction.markProcessed(
                undefined,
                new Date('2026-11-07T13:00:00.000Z'),
            );

            expect(() =>
                transaction.reject('INSUFFICIENT_FUNDS'),
            ).toThrow();
        });
        it.each([
            [WagerTransactionStatus.PENDING, false],
            [WagerTransactionStatus.PENDING_REFERENCE, false],
            [WagerTransactionStatus.PROCESSED, true],
            [WagerTransactionStatus.REJECTED, true],
            [WagerTransactionStatus.FAILED, true],
        ])('should identify %s as terminal: %s', (status, expected) => {
            const transaction = WagerTransaction.rehydrate({
                ...validProps,
                status,
                processedAt:
                    status === WagerTransactionStatus.PROCESSED
                        ? new Date('2026-11-07T13:00:00.000Z')
                        : undefined,
                failureCode:
                    status === WagerTransactionStatus.REJECTED ||
                        status === WagerTransactionStatus.FAILED
                        ? 'TEST_ERROR'
                        : undefined,
            });

            expect(transaction.isTerminal()).toBe(expected);
        });
    });
    describe('affectsBalance', () => {
        it.each([
            [WagerTransactionKind.OPENING, true],
            [WagerTransactionKind.BET, true],
            [WagerTransactionKind.WIN, true],
            [WagerTransactionKind.LOSS, false],
            [WagerTransactionKind.REFUND, true],
            [WagerTransactionKind.ROLLBACK, true],
        ])('should identify %s balance impact', (kind, expected) => {
            const transaction = WagerTransaction.create({
                ...validProps,
                kind,
                referenceExternalTransactionId:
                    kind === WagerTransactionKind.REFUND ||
                        kind === WagerTransactionKind.ROLLBACK
                        ? 'external-reference-1'
                        : undefined,
                money: kind === WagerTransactionKind.LOSS
                    ? Money.zero('BRL')
                    : validProps.money,
            });

            expect(transaction.affectsBalance()).toBe(expected);
        });
    });

    describe('requiresReference', () => {
        it.each([
            [WagerTransactionKind.OPENING, false],
            [WagerTransactionKind.BET, false],
            [WagerTransactionKind.WIN, false],
            [WagerTransactionKind.LOSS, false],
            [WagerTransactionKind.REFUND, true],
            [WagerTransactionKind.ROLLBACK, true],
        ])('should identify %s reference requirement', (kind, expected) => {
            const transaction = WagerTransaction.create({
                ...validProps,
                kind,
                referenceExternalTransactionId:
                    kind === WagerTransactionKind.REFUND ||
                        kind === WagerTransactionKind.ROLLBACK
                        ? 'external-reference-1'
                        : undefined,
            });

            expect(transaction.requiresReference()).toBe(expected);
        });
    });
    describe('matchesPayload', () => {
        it('should return true when payload hashes match', () => {
            const transaction = WagerTransaction.create(validProps);

            expect(transaction.matchesPayload('hash-123')).toBe(true);
        });

        it('should return false when payload hashes differ', () => {
            const transaction = WagerTransaction.create(validProps);

            expect(transaction.matchesPayload('different-hash')).toBe(false);
        });
    });
    describe('ledgerDirectionFor', () => {
        it.each([
            [WagerTransactionKind.OPENING, LedgerDirection.CREDIT],
            [WagerTransactionKind.BET, LedgerDirection.DEBIT],
            [WagerTransactionKind.WIN, LedgerDirection.CREDIT],
            [WagerTransactionKind.REFUND, LedgerDirection.CREDIT],
        ])(
            'should return %s ledger direction',
            (kind, expectedDirection) => {
                const transaction = WagerTransaction.create({
                    ...validProps,
                    kind,
                    referenceExternalTransactionId:
                        kind === WagerTransactionKind.REFUND
                            ? 'external-reference-1'
                            : undefined,
                });

                expect(transaction.ledgerDirectionFor()).toBe(
                    expectedDirection,
                );
            },
        );

        it('should throw when kind is LOSS', () => {
            const transaction = WagerTransaction.create({
                ...validProps,
                kind: WagerTransactionKind.LOSS,
                money: Money.zero('BRL'),
            });

            expect(() => transaction.ledgerDirectionFor()).toThrow();
        });

        it.each([
            [WagerTransactionKind.BET, LedgerDirection.CREDIT],
            [WagerTransactionKind.WIN, LedgerDirection.DEBIT],
            [WagerTransactionKind.REFUND, LedgerDirection.DEBIT],
        ])(
            'should return the correct direction when rolling back %s',
            (referenceKind, expectedDirection) => {
                const reference = WagerTransaction.create({
                    ...validProps,
                    id: 'reference-transaction',
                    externalTransactionId: 'external-reference-1',
                    kind: referenceKind,
                    money:
                        referenceKind === WagerTransactionKind.LOSS
                            ? Money.zero('BRL')
                            : validProps.money,
                    referenceExternalTransactionId:
                        referenceKind === WagerTransactionKind.REFUND ||
                            referenceKind === WagerTransactionKind.ROLLBACK
                            ? 'another-reference'
                            : undefined,
                });

                const rollback = WagerTransaction.create({
                    ...validProps,
                    id: 'rollback-transaction',
                    externalTransactionId: 'external-rollback-1',
                    kind: WagerTransactionKind.ROLLBACK,
                    referenceExternalTransactionId:
                        reference.externalTransactionId,
                });

                expect(rollback.ledgerDirectionFor(reference)).toBe(
                    expectedDirection,
                );
            },
        );

        it('should throw when ROLLBACK has no resolved reference', () => {
            const rollback = WagerTransaction.create({
                ...validProps,
                kind: WagerTransactionKind.ROLLBACK,
                referenceExternalTransactionId: 'external-reference-1',
            });

            expect(() => rollback.ledgerDirectionFor()).toThrow();
        });

        it.each([
            WagerTransactionKind.LOSS,
            WagerTransactionKind.ROLLBACK,
        ])(
            'should throw when ROLLBACK references an invalid kind: %s',
            (referenceKind) => {
                const reference = WagerTransaction.create({
                    ...validProps,
                    id: 'reference-transaction',
                    externalTransactionId: 'external-reference-1',
                    kind: referenceKind,
                    money:
                        referenceKind === WagerTransactionKind.LOSS
                            ? Money.zero('BRL')
                            : validProps.money,
                    referenceExternalTransactionId:
                        referenceKind === WagerTransactionKind.ROLLBACK
                            ? 'another-reference'
                            : undefined,
                });

                const rollback = WagerTransaction.create({
                    ...validProps,
                    kind: WagerTransactionKind.ROLLBACK,
                    referenceExternalTransactionId:
                        reference.externalTransactionId,
                });

                expect(() =>
                    rollback.ledgerDirectionFor(reference),
                ).toThrow();
            },
        );
    });
});
