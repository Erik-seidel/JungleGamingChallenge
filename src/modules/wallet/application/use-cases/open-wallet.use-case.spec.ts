
import { describe, expect, it, mock } from 'bun:test';

import { Money } from '../../domain/money';
import { Wallet } from '../../domain/wallet';
import { OpenWalletUseCase } from './open-wallet.use-case';
import { WalletOpeningUnitOfWork } from '../ports/wallet-opening.unit-of-work';

describe('OpenWalletUseCase', () => {
    const createDependencies = () => {
        const repositories = {
            wallets: {
                findByPlayerIdAndCurrency: mock(async () => null),
                create: mock(async () => { }),
                findById: mock(async () => null),
                update: mock(async () => { }),
            },
            wagerTransactions: {
                create: mock(async () => { }),
            },
            ledgerEntries: {
                create: mock(async () => { }),
            },
            outbox: {
                enqueue: mock(async () => { }),
            },
        };

        const unitOfWork: WalletOpeningUnitOfWork = {
            execute: mock(async (operation: any) => operation(repositories)),
        };

        return { repositories, unitOfWork };
    };

    it('should create a wallet without transaction, ledger or events when initial balance is zero', async () => {
        const { repositories, unitOfWork } = createDependencies();
        const useCase = new OpenWalletUseCase(unitOfWork);

        const wallet = await useCase.execute({
            playerId: 'player-1',
            initialBalance: Money.zero('BRL'),
        });

        expect(wallet).toBeInstanceOf(Wallet);
        expect(repositories.wallets.create).toHaveBeenCalledTimes(1);
        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
        expect(repositories.ledgerEntries.create).not.toHaveBeenCalled();
        expect(repositories.outbox.enqueue).not.toHaveBeenCalled();
    });

    it('should create an opening transaction, ledger entry and two events for a positive initial balance', async () => {
        const { repositories, unitOfWork } = createDependencies();
        const useCase = new OpenWalletUseCase(unitOfWork);

        const wallet = await useCase.execute({
            playerId: 'player-2',
            initialBalance: Money.from({
                amount: '100.00',
                currency: 'BRL',
            }),
        });

        expect(wallet).toBeInstanceOf(Wallet);
        expect(repositories.wallets.create).toHaveBeenCalledTimes(1);
        expect(repositories.wagerTransactions.create).toHaveBeenCalledTimes(1);
        expect(repositories.ledgerEntries.create).toHaveBeenCalledTimes(1);
        expect(repositories.outbox.enqueue).toHaveBeenCalledTimes(2);

        const events = repositories.outbox.enqueue.mock.calls.map(
            ([event]) => event,
        );

        expect(events[0].eventType).toBe('WagerTransactionProcessed');
        expect(events[1].eventType).toBe('WalletBalanceChanged');
        expect(events[0].aggregateId).toBe(wallet.id);
        expect(events[0].correlationId).toBeTruthy();
        expect(events[0].version).toBe(1);
    });

    it('should reject when a wallet already exists for the player and currency', async () => {
        const { repositories, unitOfWork } = createDependencies();

        repositories.wallets.findByPlayerIdAndCurrency = mock(
            async () => ({ id: 'existing-wallet' } as any),
        );

        const useCase = new OpenWalletUseCase(unitOfWork);

        await expect(
            useCase.execute({
                playerId: 'player-3',
                initialBalance: Money.zero('BRL'),
            }),
        ).rejects.toThrow(
            'Wallet already exists for this player and currency',
        );

        expect(repositories.wallets.create).not.toHaveBeenCalled();
    });

    it('should propagate wallet persistence errors', async () => {
        const { repositories, unitOfWork } = createDependencies();

        repositories.wallets.create = mock(async () => {
            throw new Error('Database failure');
        });

        const useCase = new OpenWalletUseCase(unitOfWork);

        await expect(
            useCase.execute({
                playerId: 'player-4',
                initialBalance: Money.zero('BRL'),
            }),
        ).rejects.toThrow('Database failure');

        expect(repositories.wagerTransactions.create).not.toHaveBeenCalled();
    });
});
