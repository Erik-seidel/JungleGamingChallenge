import { EntityManager } from '@mikro-orm/postgresql';

import { LedgerDirection } from '../../domain/ledger-direction';
import { Money } from '../../domain/money';
import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry';
import { WalletLedgerEntryOrmEntity } from './wallet-ledger-entry.orm-entity';
import { WalletLedgerEntryMikroOrmRepository } from './wallet-ledger-entry-mikro-orm.repository';

describe('WalletLedgerEntryMikroOrmRepository', () => {
    let repository: WalletLedgerEntryMikroOrmRepository;

    const entityManager = {
        create: jest.fn(),
        persist: jest.fn(),
        flush: jest.fn(),
    };

    const createdAt = new Date('2026-11-07T10:00:00.000Z');

    const entry = WalletLedgerEntry.create({
        id: '11111111-1111-4111-8111-111111111111',
        walletId: '22222222-2222-4222-8222-222222222222',
        transactionId: '33333333-3333-4333-8333-333333333333',
        direction: LedgerDirection.DEBIT,
        money: Money.from({
            amount: '25.50',
            currency: 'USD',
        }),
        balanceBefore: Money.from({
            amount: '100.00',
            currency: 'USD',
        }),
        balanceAfter: Money.from({
            amount: '74.50',
            currency: 'USD',
        }),
        createdAt,
    });

    beforeEach(() => {
        jest.clearAllMocks();

        repository = new WalletLedgerEntryMikroOrmRepository(
            entityManager as unknown as EntityManager,
        );
    });

    describe('create', () => {
        it('should persist a ledger entry with its domain values', async () => {
            const entity = {} as WalletLedgerEntryOrmEntity;

            entityManager.create.mockReturnValue(entity);

            await repository.create(entry);

            expect(entityManager.create).toHaveBeenCalledWith(
                WalletLedgerEntryOrmEntity,
                expect.objectContaining({
                    id: entry.id,
                    walletId: entry.walletId,
                    transactionId: entry.transactionId,
                    direction: entry.direction,
                    amount: '25.50',
                    currency: 'USD',
                    balanceBefore: '100.00',
                    balanceAfter: '74.50',
                    createdAt,
                }),
            );

            expect(entityManager.persist).toHaveBeenCalledWith(entity);
            expect(entityManager.flush).toHaveBeenCalled();
        });

        it('should not persist or flush when entity creation fails', async () => {
            entityManager.create.mockImplementation(() => {
                throw new Error('Entity creation failed');
            });

            await expect(repository.create(entry)).rejects.toThrow(
                'Entity creation failed',
            );

            expect(entityManager.persist).not.toHaveBeenCalled();
            expect(entityManager.flush).not.toHaveBeenCalled();
        });
    });
});