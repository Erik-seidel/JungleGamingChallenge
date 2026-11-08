import { EntityManager } from '@mikro-orm/postgresql';

import { WagerTransactionRepository } from '../../application/ports/wager-transaction.repository';
import { WagerTransaction } from '../../domain/wager-transaction';
import { WagerTransactionOrmEntity } from './wager-transaction.orm-entity';
import { Money } from '../../../wallet/domain/money';

export class WagerTransactionMikroOrmRepository
    implements WagerTransactionRepository {
    constructor(
        private readonly entityManager: EntityManager,
    ) { }

    async create(transaction: WagerTransaction): Promise<void> {

        const entity = this.entityManager.create(
            WagerTransactionOrmEntity,
            {
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
                amount: transaction.money.toString(),
                balanceAfter: transaction.balanceAfter?.toString(),
                currency: transaction.money.currency,
                referenceExternalTransactionId:
                    transaction.referenceExternalTransactionId,
                referenceTransactionId:
                    transaction.referenceTransactionId,
                status: transaction.status,
                failureCode: transaction.failureCode,
                createdAt: transaction.createdAt,
                processedAt: transaction.processedAt,
            },
        );


        this.entityManager.persist(entity);
        await this.entityManager.flush();
    }
    async update(transaction: WagerTransaction): Promise<void> {
        const entity = await this.entityManager.findOne(
            WagerTransactionOrmEntity,
            { id: transaction.id },
        );

        if (!entity) {
            throw new Error(
                `Wager transaction ${transaction.id} not found`,
            );
        }

        entity.status = transaction.status;
        entity.referenceTransactionId =
            transaction.referenceTransactionId;
        entity.failureCode = transaction.failureCode;
        entity.balanceAfter = transaction.balanceAfter?.toString();
        entity.processedAt = transaction.processedAt;

        await this.entityManager.flush();
    }
    async findByProviderAndIdempotencyKey(
        providerId: string,
        idempotencyKey: string,
    ): Promise<WagerTransaction | null> {
        const entity = await this.entityManager.findOne(
            WagerTransactionOrmEntity,
            {
                providerId,
                idempotencyKey,
            },
        );

        if (!entity) {
            return null;
        }

        return this.rehydrate(entity);
    }
    async findByProviderAndReferenceTransactionId(
        providerId: string,
        referenceTransactionId: string,
    ): Promise<WagerTransaction[]> {
        const entities = await this.entityManager.find(
            WagerTransactionOrmEntity,
            {
                providerId,
                referenceTransactionId,
            },
        );

        return entities.map((entity) => this.rehydrate(entity));
    }

    async findByProviderAndExternalTransactionId(
        providerId: string,
        externalTransactionId: string,
    ): Promise<WagerTransaction | null> {
        const entity = await this.entityManager.findOne(
            WagerTransactionOrmEntity,
            {
                providerId,
                externalTransactionId,
            },
        );

        if (!entity) {
            return null;
        }

        return this.rehydrate(entity);
    }

    private rehydrate(
        entity: WagerTransactionOrmEntity,
    ): WagerTransaction {
        return WagerTransaction.rehydrate({
            id: entity.id,
            providerId: entity.providerId,
            externalTransactionId: entity.externalTransactionId,
            idempotencyKey: entity.idempotencyKey,
            payloadHash: entity.payloadHash,
            walletId: entity.walletId,
            playerId: entity.playerId,
            roundId: entity.roundId,
            gameId: entity.gameId,
            kind: entity.kind,
            money: Money.from({
                amount: entity.amount,
                currency: entity.currency,
            }),
            referenceExternalTransactionId:
                entity.referenceExternalTransactionId,
            createdAt: entity.createdAt,
            status: entity.status,
            referenceTransactionId: entity.referenceTransactionId,
            failureCode: entity.failureCode,
            processedAt: entity.processedAt,
            balanceAfter: entity.balanceAfter
                ? Money.from({
                    amount: entity.balanceAfter,
                    currency: entity.currency,
                })
                : undefined,
        });
    }
}