import { EntityManager } from '@mikro-orm/postgresql';

import { WagerTransactionRepository } from '../../application/ports/wager-transaction.repository';
import { WagerTransaction } from '../../domain/wager-transaction';
import { WagerTransactionOrmEntity } from './wager-transaction.orm-entity';

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
}