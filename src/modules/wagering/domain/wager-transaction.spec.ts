
import { Money } from '../../wallet/domain/money';
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
    });

});
