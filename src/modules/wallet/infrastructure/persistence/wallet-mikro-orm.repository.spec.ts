import { EntityManager } from '@mikro-orm/postgresql';

import { Money } from '../../domain/money';
import { Wallet } from '../../domain/wallet';
import { WalletOrmEntity } from './wallet.orm-entity';
import { WalletMikroOrmRepository } from './wallet-mikro-orm.repository';

describe('WalletMikroOrmRepository', () => {
    let repository: WalletMikroOrmRepository;

    const entityManager = {
        findOne: jest.fn(),
        create: jest.fn(),
        persist: jest.fn(),
        flush: jest.fn(),
        nativeUpdate: jest.fn(),
    };

    const walletEntity = {
        id: 'wallet-1',
        playerId: 'player-1',
        currency: 'USD',
        balance: '100.00',
        version: 1,
        createdAt: new Date('2026-11-07T10:00:00.000Z'),
        updatedAt: new Date('2026-11-07T10:00:00.000Z'),
    };

    beforeEach(() => {
        jest.clearAllMocks();

        repository = new WalletMikroOrmRepository(
            entityManager as unknown as EntityManager,
        );
    });

    describe('findById', () => {
        it('should return a wallet when it exists', async () => {
            entityManager.findOne.mockResolvedValue(walletEntity);

            const result = await repository.findById('wallet-1');

            expect(entityManager.findOne).toHaveBeenCalledWith(
                WalletOrmEntity,
                { id: 'wallet-1' },
            );
            expect(result).toBeInstanceOf(Wallet);
            expect(result?.balance.toString()).toBe('100.00');
            expect(result?.version).toBe(1);
        });

        it('should return null when the wallet does not exist', async () => {
            entityManager.findOne.mockResolvedValue(null);

            const result = await repository.findById('wallet-404');

            expect(result).toBeNull();
        });
    });

    describe('findByPlayerIdAndCurrency', () => {
        it('should find a wallet by player and currency', async () => {
            entityManager.findOne.mockResolvedValue(walletEntity);

            const result = await repository.findByPlayerIdAndCurrency(
                'player-1',
                'USD',
            );

            expect(entityManager.findOne).toHaveBeenCalledWith(
                WalletOrmEntity,
                { playerId: 'player-1', currency: 'USD' },
            );
            expect(result?.id).toBe('wallet-1');
        });
    });

    describe('create', () => {
        it('should persist a wallet with its domain values', async () => {
            const wallet = Wallet.open({
                id: 'wallet-1',
                playerId: 'player-1',
                initialBalance: Money.from({
                    amount: '100.00',
                    currency: 'USD',
                }),
            });

            const entity = {} as WalletOrmEntity;
            entityManager.create.mockReturnValue(entity);

            await repository.create(wallet);

            expect(entityManager.create).toHaveBeenCalledWith(
                WalletOrmEntity,
                expect.objectContaining({
                    id: wallet.id,
                    playerId: wallet.playerId,
                    currency: wallet.currency,
                    balance: '100.00',
                    version: wallet.version,
                }),
            );
            expect(entityManager.persist).toHaveBeenCalledWith(entity);
            expect(entityManager.flush).toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('should update only when the expected version matches', async () => {
            const wallet = Wallet.open({
                id: 'wallet-1',
                playerId: 'player-1',
                initialBalance: Money.from({
                    amount: '100.00',
                    currency: 'USD',
                }),
            });

            wallet.debit(Money.from({ amount: '10.00', currency: 'USD' }));

            entityManager.nativeUpdate.mockResolvedValue(1);

            await repository.update(wallet, 1);

            expect(entityManager.nativeUpdate).toHaveBeenCalledWith(
                WalletOrmEntity,
                { id: 'wallet-1', version: 1 },
                expect.objectContaining({
                    balance: '90.00',
                    version: 2,
                }),
            );
        });

        it('should reject when the expected version does not match', async () => {
            const wallet = Wallet.open({
                id: 'wallet-1',
                playerId: 'player-1',
                initialBalance: Money.from({
                    amount: '100.00',
                    currency: 'USD',
                }),
            });

            wallet.debit(Money.from({ amount: '10.00', currency: 'USD' }));

            entityManager.nativeUpdate.mockResolvedValue(0);

            await expect(repository.update(wallet, 1)).rejects.toThrow(
                'Wallet version conflict',
            );
        });
    });
});
