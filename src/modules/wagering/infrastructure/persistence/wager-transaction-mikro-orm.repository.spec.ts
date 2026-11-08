import { EntityManager } from '@mikro-orm/postgresql';

import { Money } from '../../../wallet/domain/money';
import {
    WagerTransaction,
    WagerTransactionKind,
} from '../../domain/wager-transaction';
import { WagerTransactionOrmEntity } from './wager-transaction.orm-entity';
import { WagerTransactionMikroOrmRepository } from './wager-transaction-mikro-orm.repository';

describe('WagerTransactionMikroOrmRepository', () => {
    let repository: WagerTransactionMikroOrmRepository;

    const entityManager = {
        create: jest.fn(),
        persist: jest.fn(),
        flush: jest.fn(),
        findOne: jest.fn(),
    };

    const createdAt = new Date('2026-11-07T10:00:00.000Z');

    const transaction = WagerTransaction.create({
        id: '11111111-1111-4111-8111-111111111111',
        providerId: 'provider-1',
        externalTransactionId: 'external-1',
        idempotencyKey: 'idempotency-1',
        payloadHash: 'hash-1',
        walletId: '22222222-2222-4222-8222-222222222222',
        playerId: '33333333-3333-4333-8333-333333333333',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: Money.from({
            amount: '25.50',
            currency: 'USD',
        }),
        createdAt,
    });
    describe('findByProviderAndIdempotencyKey', () => {
        it('should rehydrate a persisted transaction with its resulting balance', async () => {
            const ormEntity = {
                id: '55555555-5555-4555-8555-555555555555',
                providerId: 'provider-1',
                externalTransactionId: 'external-3',
                idempotencyKey: 'idempotency-3',
                payloadHash: 'hash-3',
                walletId: '22222222-2222-4222-8222-222222222222',
                playerId: '33333333-3333-4333-8333-333333333333',
                roundId: 'round-3',
                gameId: 'game-3',
                kind: WagerTransactionKind.BET,
                amount: '25.50',
                currency: 'USD',
                balanceAfter: '75.00',
                referenceExternalTransactionId: undefined,
                referenceTransactionId: undefined,
                status: 'PROCESSED',
                failureCode: undefined,
                createdAt,
                processedAt: createdAt,
            } as WagerTransactionOrmEntity;

            entityManager.findOne.mockResolvedValue(ormEntity);

            const result = await repository.findByProviderAndIdempotencyKey(
                'provider-1',
                'idempotency-3',
            );

            expect(entityManager.findOne).toHaveBeenCalledWith(
                WagerTransactionOrmEntity,
                {
                    providerId: 'provider-1',
                    idempotencyKey: 'idempotency-3',
                },
            );

            expect(result).toBeInstanceOf(WagerTransaction);
            expect(result?.id).toBe(ormEntity.id);
            expect(result?.status).toBe('PROCESSED');
            expect(result?.balanceAfter?.toString()).toBe('75.00');
            expect(result?.money.toString()).toBe('25.50');
        });
        it('should return null when the transaction does not exist', async () => {
            entityManager.findOne.mockResolvedValue(null);

            const result = await repository.findByProviderAndIdempotencyKey(
                'provider-1',
                'unknown-key',
            );

            expect(result).toBeNull();
        });
    });

    beforeEach(() => {
        jest.clearAllMocks();

        repository = new WagerTransactionMikroOrmRepository(
            entityManager as unknown as EntityManager,
        );
    });
    describe('findByProviderAndExternalTransactionId', () => {
        it('should find and rehydrate a transaction by external ID', async () => {
            const ormEntity = {
                id: '55555555-5555-4555-8555-555555555555',
                providerId: 'provider-1',
                externalTransactionId: 'external-3',
                idempotencyKey: 'idempotency-3',
                payloadHash: 'hash-3',
                walletId: '22222222-2222-4222-8222-222222222222',
                playerId: '33333333-3333-4333-8333-333333333333',
                roundId: 'round-3',
                gameId: 'game-3',
                kind: WagerTransactionKind.BET,
                amount: '25.50',
                currency: 'USD',
                balanceAfter: '75.00',
                status: 'PROCESSED',
                createdAt,
                processedAt: createdAt,
            } as WagerTransactionOrmEntity;

            entityManager.findOne.mockResolvedValue(ormEntity);

            const result =
                await repository.findByProviderAndExternalTransactionId(
                    'provider-1',
                    'external-3',
                );

            expect(entityManager.findOne).toHaveBeenCalledWith(
                WagerTransactionOrmEntity,
                {
                    providerId: 'provider-1',
                    externalTransactionId: 'external-3',
                },
            );

            expect(result?.id).toBe(ormEntity.id);
            expect(result?.balanceAfter?.toString()).toBe('75.00');
        });

        it('should return null when the external transaction does not exist', async () => {
            entityManager.findOne.mockResolvedValue(null);

            const result =
                await repository.findByProviderAndExternalTransactionId(
                    'provider-1',
                    'unknown-external-id',
                );

            expect(result).toBeNull();
        });
    });

    describe('create', () => {
        it('should persist a transaction with its domain values', async () => {
            const entity = {} as WagerTransactionOrmEntity;

            entityManager.create.mockReturnValue(entity);

            await repository.create(transaction);

            expect(entityManager.create).toHaveBeenCalledWith(
                WagerTransactionOrmEntity,
                expect.objectContaining({
                    id: transaction.id,
                    providerId: transaction.providerId,
                    externalTransactionId:
                        transaction.externalTransactionId,
                    idempotencyKey: transaction.idempotencyKey,
                    payloadHash: transaction.payloadHash,
                    walletId: transaction.walletId,
                    playerId: transaction.playerId,
                    roundId: transaction.roundId,
                    gameId: transaction.gameId,
                    kind: transaction.kind,
                    amount: '25.50',
                    currency: 'USD',
                    referenceExternalTransactionId: undefined,
                    referenceTransactionId: undefined,
                    status: transaction.status,
                    failureCode: undefined,
                    createdAt,
                    processedAt: undefined,
                }),
            );

            expect(entityManager.persist).toHaveBeenCalledWith(entity);
            expect(entityManager.flush).toHaveBeenCalled();
        });

        it('should persist the resulting balance', async () => {
            const processedTransaction = WagerTransaction.create({
                id: '55555555-5555-4555-8555-555555555555',
                providerId: 'provider-1',
                externalTransactionId: 'external-3',
                idempotencyKey: 'idempotency-3',
                payloadHash: 'hash-3',
                walletId: '22222222-2222-4222-8222-222222222222',
                playerId: '33333333-3333-4333-8333-333333333333',
                roundId: 'round-3',
                gameId: 'game-3',
                kind: WagerTransactionKind.BET,
                money: Money.from({
                    amount: '25.50',
                    currency: 'USD',
                }),
                createdAt,
            });

            const balanceAfter = Money.from({
                amount: '75.00',
                currency: 'USD',
            });

            processedTransaction.markProcessed(
                undefined,
                createdAt,
                balanceAfter,
            );

            entityManager.create.mockReturnValue(
                {} as WagerTransactionOrmEntity,
            );

            await repository.create(processedTransaction);

            expect(entityManager.create).toHaveBeenCalledWith(
                WagerTransactionOrmEntity,
                expect.objectContaining({
                    balanceAfter: '75.00',
                }),
            );
        });
        it('should preserve the current transaction status', async () => {
            const rejectedTransaction = WagerTransaction.create({
                id: '44444444-4444-4444-8444-444444444444',
                providerId: 'provider-1',
                externalTransactionId: 'external-2',
                idempotencyKey: 'idempotency-2',
                payloadHash: 'hash-2',
                walletId: '22222222-2222-4222-8222-222222222222',
                playerId: '33333333-3333-4333-8333-333333333333',
                roundId: 'round-2',
                gameId: 'game-2',
                kind: WagerTransactionKind.BET,
                money: Money.from({
                    amount: '10.00',
                    currency: 'USD',
                }),
                createdAt,
            });

            rejectedTransaction.reject(
                'INSUFFICIENT_BALANCE',
                Money.from({
                    amount: '20.00',
                    currency: 'USD',
                }),
            );

            entityManager.create.mockReturnValue(
                {} as WagerTransactionOrmEntity,
            );

            await repository.create(rejectedTransaction);

            expect(entityManager.create).toHaveBeenCalledWith(
                WagerTransactionOrmEntity,
                expect.objectContaining({
                    status: 'REJECTED',
                    failureCode: 'INSUFFICIENT_BALANCE',
                    balanceAfter: '20.00',
                }),
            );
        });
    });
});