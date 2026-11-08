import { EntityManager } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { WageringMikroOrmUnitOfWork } from './wagering-mikro-orm.unit-of-work';
import { WalletMikroOrmRepository } from '../../../wallet/infrastructure/persistence/wallet-mikro-orm.repository';
import { WalletLedgerEntryMikroOrmRepository } from '../../../wallet/infrastructure/persistence/wallet-ledger-entry-mikro-orm.repository';
import { WagerTransactionMikroOrmRepository } from './wager-transaction-mikro-orm.repository';
import { OutboxMikroOrmRepository } from '../../../shared/infrastructure/persistence/outbox-mikro-orm.repository';

describe('WageringMikroOrmUnitOfWork', () => {
    let entityManager: EntityManager;
    let transactionalEntityManager: EntityManager;
    let unitOfWork: WageringMikroOrmUnitOfWork;

    let transactionalSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        transactionalEntityManager = {} as EntityManager;

        entityManager = {
            transactional: mock(async (operation) =>
                operation(transactionalEntityManager),
            ),
        } as unknown as EntityManager;

        transactionalSpy = spyOn(
            entityManager,
            'transactional',
        );

        unitOfWork = new WageringMikroOrmUnitOfWork(entityManager);
    });

    it('should execute the operation inside a database transaction', async () => {
        const result = await unitOfWork.execute(async () => 'success');

        expect(entityManager.transactional).toHaveBeenCalledTimes(1);
        expect(result).toBe('success');
    });

    it('should create all repositories using the same transactional EntityManager', async () => {
        let repositories: unknown;

        await unitOfWork.execute(async (receivedRepositories) => {
            repositories = receivedRepositories;
        });

        expect(repositories).toBeDefined();
        expect(repositories).toHaveProperty('wallets');
        expect(repositories).toHaveProperty('wagerTransactions');
        expect(repositories).toHaveProperty('ledgerEntries');
        expect(repositories).toHaveProperty('outbox');

        expect(transactionalSpy).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from the operation', async () => {
        const error = new Error('Database operation failed');

        await expect(
            unitOfWork.execute(async () => {
                throw error;
            }),
        ).rejects.toBe(error);
    });
});