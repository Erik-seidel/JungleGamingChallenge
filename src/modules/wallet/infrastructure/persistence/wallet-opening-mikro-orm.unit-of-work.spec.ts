
import { EntityManager } from '@mikro-orm/postgresql';
import { WalletOpeningMikroOrmUnitOfWork } from './wallet-opening-mikro-orm.unit-of-work';

import { WalletMikroOrmRepository } from './wallet-mikro-orm.repository';
import { WalletLedgerEntryMikroOrmRepository } from './wallet-ledger-entry-mikro-orm.repository';
import { WagerTransactionMikroOrmRepository } from '../../../wagering/infrastructure/persistence/wager-transaction-mikro-orm.repository';
import { OutboxMikroOrmRepository } from '../../../shared/infrastructure/persistence/outbox-mikro-orm.repository';

jest.mock('./wallet-mikro-orm.repository', () => ({
    WalletMikroOrmRepository: jest.fn().mockImplementation((em) => ({ em })),
}));

jest.mock('./wallet-ledger-entry-mikro-orm.repository', () => ({
    WalletLedgerEntryMikroOrmRepository: jest.fn().mockImplementation((em) => ({ em })),
}));

jest.mock('../../../wagering/infrastructure/persistence/wager-transaction-mikro-orm.repository', () => ({
    WagerTransactionMikroOrmRepository: jest.fn().mockImplementation((em) => ({ em })),
}));

jest.mock('../../../shared/infrastructure/persistence/outbox-mikro-orm.repository', () => ({
    OutboxMikroOrmRepository: jest.fn().mockImplementation((em) => ({ em })),
}));

describe('WalletOpeningMikroOrmUnitOfWork', () => {
    let entityManager: EntityManager;
    let transactionalEntityManager: EntityManager;
    let unitOfWork: WalletOpeningMikroOrmUnitOfWork;

    beforeEach(() => {
        jest.clearAllMocks();

        transactionalEntityManager = {} as EntityManager;

        entityManager = {
            transactional: jest.fn(async (operation) =>
                operation(transactionalEntityManager),
            ),
        } as unknown as EntityManager;

        unitOfWork = new WalletOpeningMikroOrmUnitOfWork(entityManager);
    });

    it('should execute the operation inside a database transaction', async () => {
        const result = await unitOfWork.execute(async () => 'success');

        expect(entityManager.transactional).toHaveBeenCalledTimes(1);
        expect(result).toBe('success');
    });

    it('should create all repositories using the same transactional EntityManager', async () => {
        await unitOfWork.execute(async () => undefined);

        expect(WalletMikroOrmRepository).toHaveBeenCalledWith(
            transactionalEntityManager,
        );

        expect(WalletLedgerEntryMikroOrmRepository).toHaveBeenCalledWith(
            transactionalEntityManager,
        );

        expect(WagerTransactionMikroOrmRepository).toHaveBeenCalledWith(
            transactionalEntityManager,
        );

        expect(OutboxMikroOrmRepository).toHaveBeenCalledWith(
            transactionalEntityManager,
        );
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
