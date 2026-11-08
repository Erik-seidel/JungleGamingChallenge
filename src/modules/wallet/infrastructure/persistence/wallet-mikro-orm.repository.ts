import { EntityManager } from '@mikro-orm/postgresql';

import { Money } from '../../domain/money';
import { Wallet } from '../../domain/wallet';
import { WalletRepository } from '../../application/ports/wallet.repository';
import { WalletOrmEntity } from './wallet.orm-entity';

export class WalletMikroOrmRepository implements WalletRepository {
    constructor(
        private readonly entityManager: EntityManager,
    ) { }

    async findById(id: string): Promise<Wallet | null> {
        const entity = await this.entityManager.findOne(
            WalletOrmEntity,
            { id },
        );

        return entity ? this.toDomain(entity) : null;
    }

    async findByPlayerIdAndCurrency(
        playerId: string,
        currency: string,
    ): Promise<Wallet | null> {
        const entity = await this.entityManager.findOne(
            WalletOrmEntity,
            { playerId, currency },
        );

        return entity ? this.toDomain(entity) : null;
    }

    async create(wallet: Wallet): Promise<void> {
        const entity = this.entityManager.create(WalletOrmEntity, {
            id: wallet.id,
            playerId: wallet.playerId,
            currency: wallet.currency,
            balance: wallet.balance.toString(),
            version: wallet.version,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
        });

        this.entityManager.persist(entity);
        await this.entityManager.flush();
    }

    async update(
        wallet: Wallet,
        expectedVersion: number,
    ): Promise<void> {
        const affectedRows = await this.entityManager.nativeUpdate(
            WalletOrmEntity,
            {
                id: wallet.id,
                version: expectedVersion,
            },
            {
                balance: wallet.balance.toString(),
                version: wallet.version,
                updatedAt: wallet.updatedAt,
            },
        );

        if (affectedRows === 0) {
            throw new Error('Wallet version conflict');
        }
    }

    private toDomain(entity: WalletOrmEntity): Wallet {
        return Wallet.rehydrate({
            id: entity.id,
            playerId: entity.playerId,
            currency: entity.currency,
            balance: Money.from({
                amount: entity.balance,
                currency: entity.currency,
            }),
            version: entity.version,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        });
    }
}
