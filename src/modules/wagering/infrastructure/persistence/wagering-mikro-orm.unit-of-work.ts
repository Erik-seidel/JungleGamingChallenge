import { EntityManager } from '@mikro-orm/postgresql';
import { InboxMikroOrmRepository } from '../../../shared/infrastructure/persistence/inbox-mikro-orm.repository';
import {
    WageringRepositories,
    WageringUnitOfWork,
} from '../../application/ports/wagering.unit-of-work';
import { WalletMikroOrmRepository } from '../../../wallet/infrastructure/persistence/wallet-mikro-orm.repository';
import { WalletLedgerEntryMikroOrmRepository } from '../../../wallet/infrastructure/persistence/wallet-ledger-entry-mikro-orm.repository';
import { WagerTransactionMikroOrmRepository } from './wager-transaction-mikro-orm.repository';
import { OutboxMikroOrmRepository } from '../../../shared/infrastructure/persistence/outbox-mikro-orm.repository';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@mikro-orm/nestjs';



export class WageringMikroOrmUnitOfWork implements WageringUnitOfWork {
    constructor(
        private readonly entityManager: EntityManager,
    ) { }

    async execute<T>(
        operation: (repositories: WageringRepositories) => Promise<T>,
    ): Promise<T> {
        return this.entityManager.transactional(async (transactionalEm) => {
            const repositories: WageringRepositories = {
                wallets: new WalletMikroOrmRepository(transactionalEm),
                wagerTransactions: new WagerTransactionMikroOrmRepository(
                    transactionalEm,
                ),
                ledgerEntries: new WalletLedgerEntryMikroOrmRepository(
                    transactionalEm,
                ),
                outbox: new OutboxMikroOrmRepository(transactionalEm),
                inboxMessages: new InboxMikroOrmRepository(transactionalEm),
            };

            return operation(repositories);
        });
    }
}