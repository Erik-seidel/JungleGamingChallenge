
import { EntityManager } from '@mikro-orm/postgresql';

import {
    WalletOpeningRepositories,
    WalletOpeningUnitOfWork,
} from '../../application/ports/wallet-opening.unit-of-work';
import { WalletMikroOrmRepository } from './wallet-mikro-orm.repository';
import { WalletLedgerEntryMikroOrmRepository } from './wallet-ledger-entry-mikro-orm.repository';
import { WagerTransactionMikroOrmRepository } from '../../../wagering/infrastructure/persistence/wager-transaction-mikro-orm.repository';
import { OutboxMikroOrmRepository } from '../../../shared/infrastructure/persistence/outbox-mikro-orm.repository';

export class WalletOpeningMikroOrmUnitOfWork
    implements WalletOpeningUnitOfWork {
    constructor(private readonly entityManager: EntityManager) { }

    async execute<T>(
        operation: (repositories: WalletOpeningRepositories) => Promise<T>,
    ): Promise<T> {
        return this.entityManager.transactional(async (transactionalEm) => {
            const repositories: WalletOpeningRepositories = {
                wallets: new WalletMikroOrmRepository(transactionalEm),
                wagerTransactions: new WagerTransactionMikroOrmRepository(
                    transactionalEm,
                ),
                ledgerEntries: new WalletLedgerEntryMikroOrmRepository(
                    transactionalEm,
                ),
                outbox: new OutboxMikroOrmRepository(transactionalEm),
            };

            return operation(repositories);
        });
    }
}
