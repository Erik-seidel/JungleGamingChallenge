import { EntityManager } from '@mikro-orm/postgresql';

import { WalletLedgerEntryRepository } from '../../application/ports/wallet-ledger-entry.repository';
import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry';
import { WalletLedgerEntryOrmEntity } from './wallet-ledger-entry.orm-entity';

export class WalletLedgerEntryMikroOrmRepository
    implements WalletLedgerEntryRepository {
    constructor(
        private readonly entityManager: EntityManager,
    ) { }

    async create(entry: WalletLedgerEntry): Promise<void> {
        const entity = this.entityManager.create(
            WalletLedgerEntryOrmEntity,
            {
                id: entry.id,
                walletId: entry.walletId,
                transactionId: entry.transactionId,
                direction: entry.direction,
                amount: entry.money.toString(),
                currency: entry.money.currency,
                balanceBefore: entry.balanceBefore.toString(),
                balanceAfter: entry.balanceAfter.toString(),
                createdAt: entry.createdAt,
            },
        );

        this.entityManager.persist(entity);
        await this.entityManager.flush();
    }
}