
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';

import config from './mikro-orm.integration.config';

import { Money } from '../src/modules/wallet/domain/money';
import { OpenWalletUseCase } from '../src/modules/wallet/application/use-cases/open-wallet.use-case';
import { WalletOpeningMikroOrmUnitOfWork } from '../src/modules/wallet/infrastructure/persistence/wallet-opening-mikro-orm.unit-of-work';

import { WalletOrmEntity } from '../src/modules/wallet/infrastructure/persistence/wallet.orm-entity';
import { WalletLedgerEntryOrmEntity } from '../src/modules/wallet/infrastructure/persistence/wallet-ledger-entry.orm-entity';
import { WagerTransactionOrmEntity } from '../src/modules/wagering/infrastructure/persistence/wager-transaction.orm-entity';
import { OutboxEventOrmEntity } from '../src/modules/shared/infrastructure/persistence/outbox-event.orm-entity';

describe('Wallet Opening - PostgreSQL Integration', () => {
    let orm: MikroORM;

    beforeAll(async () => {
        orm = await MikroORM.init(config);
    });

    afterAll(async () => {
        await orm?.close(true);
    });

    it('should persist only the wallet when initial balance is zero', async () => {
        const em = orm.em.fork();
        const playerId = randomUUID();

        const useCase = new OpenWalletUseCase(
            new WalletOpeningMikroOrmUnitOfWork(em),
        );

        const wallet = await useCase.execute({
            playerId,
            initialBalance: Money.zero('BRL'),
        });

        const persistedWallet = await em.findOne(
            WalletOrmEntity,
            { id: wallet.id },
        );

        const transactions = await em.find(
            WagerTransactionOrmEntity,
            { walletId: wallet.id },
        );

        const ledgerEntries = await em.find(
            WalletLedgerEntryOrmEntity,
            { walletId: wallet.id },
        );

        const events = await em.find(
            OutboxEventOrmEntity,
            { aggregateId: wallet.id },
        );

        expect(persistedWallet).toBeDefined();
        expect(persistedWallet?.balance).toBe('0.00');
        expect(persistedWallet?.version).toBe(1);

        expect(transactions).toHaveLength(0);
        expect(ledgerEntries).toHaveLength(0);
        expect(events).toHaveLength(0);
    });

    it('should persist wallet, opening transaction, ledger and outbox events atomically', async () => {
        const em = orm.em.fork();
        const playerId = randomUUID();

        const useCase = new OpenWalletUseCase(
            new WalletOpeningMikroOrmUnitOfWork(em),
        );

        const wallet = await useCase.execute({
            playerId,
            initialBalance: Money.from({
                amount: '100.00',
                currency: 'BRL',
            }),
        });

        const persistedWallet = await em.findOne(
            WalletOrmEntity,
            { id: wallet.id },
        );

        const transactions = await em.find(
            WagerTransactionOrmEntity,
            { walletId: wallet.id },
        );

        const ledgerEntries = await em.find(
            WalletLedgerEntryOrmEntity,
            { walletId: wallet.id },
        );

        const events = await em.find(
            OutboxEventOrmEntity,
            { aggregateId: wallet.id },
        );

        expect(persistedWallet).toBeDefined();
        expect(persistedWallet?.balance).toBe('100.00');
        expect(persistedWallet?.version).toBe(1);

        expect(transactions).toHaveLength(1);
        expect(transactions[0].kind).toBe('OPENING');
        expect(transactions[0].status).toBe('PROCESSED');
        expect(transactions[0].amount).toBe('100.00');

        expect(ledgerEntries).toHaveLength(1);
        expect(ledgerEntries[0].direction).toBe('CREDIT');
        expect(ledgerEntries[0].amount).toBe('100.00');
        expect(ledgerEntries[0].balanceBefore).toBe('0.00');
        expect(ledgerEntries[0].balanceAfter).toBe('100.00');

        expect(events).toHaveLength(2);

        const eventTypes = events.map((event) => event.eventType).sort();

        expect(eventTypes).toEqual([
            'WagerTransactionProcessed',
            'WalletBalanceChanged',
        ]);
    });

    it('should rollback wallet and transaction when ledger persistence fails', async () => {
        const em = orm.em.fork();
        const playerId = randomUUID();
        const connection = orm.em.getConnection();

        const suffix = randomUUID().replace(/-/g, '');
        const triggerName = `test_fail_ledger_${suffix}`;
        const functionName = `test_fail_ledger_fn_${suffix}`;

        const useCase = new OpenWalletUseCase(
            new WalletOpeningMikroOrmUnitOfWork(em),
        );

        const ledgerBefore = await connection.execute(
            'SELECT count(*)::int AS count FROM wallet_ledger_entries',
        );

        const outboxBefore = await connection.execute(
            'SELECT count(*)::int AS count FROM outbox_events',
        );

        try {
            await connection.execute(`
                CREATE FUNCTION ${functionName}()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    RAISE EXCEPTION 'Intentional integration test failure';
                END;
                $$;
            `);

            await connection.execute(`
                CREATE TRIGGER ${triggerName}
                BEFORE INSERT ON wallet_ledger_entries
                FOR EACH ROW
                EXECUTE FUNCTION ${functionName}();
            `);

            await expect(
                useCase.execute({
                    playerId,
                    initialBalance: Money.from({
                        amount: '100.00',
                        currency: 'BRL',
                    }),
                }),
            ).rejects.toThrow();
        } finally {
            await connection.execute(`
                DROP TRIGGER IF EXISTS ${triggerName}
                ON wallet_ledger_entries;
            `);

            await connection.execute(`
                DROP FUNCTION IF EXISTS ${functionName}();
            `);
        }

        const wallets = await em.count(WalletOrmEntity, { playerId });
        const transactions = await em.count(
            WagerTransactionOrmEntity,
            { playerId },
        );

        const ledgerAfter = await connection.execute(
            'SELECT count(*)::int AS count FROM wallet_ledger_entries',
        );

        const outboxAfter = await connection.execute(
            'SELECT count(*)::int AS count FROM outbox_events',
        );

        expect(wallets).toBe(0);
        expect(transactions).toBe(0);

        expect(ledgerAfter[0].count).toBe(ledgerBefore[0].count);
        expect(outboxAfter[0].count).toBe(outboxBefore[0].count);
    });

    it('should rollback all financial records when outbox persistence fails', async () => {
        const em = orm.em.fork();
        const playerId = randomUUID();
        const connection = orm.em.getConnection();

        const suffix = randomUUID().replace(/-/g, '');
        const triggerName = `test_fail_outbox_${suffix}`;
        const functionName = `test_fail_outbox_fn_${suffix}`;

        const useCase = new OpenWalletUseCase(
            new WalletOpeningMikroOrmUnitOfWork(em),
        );

        const ledgerBefore = await connection.execute(
            'SELECT count(*)::int AS count FROM wallet_ledger_entries',
        );

        const outboxBefore = await connection.execute(
            'SELECT count(*)::int AS count FROM outbox_events',
        );

        try {
            await connection.execute(`
                CREATE FUNCTION ${functionName}()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    RAISE EXCEPTION 'Intentional outbox integration test failure';
                END;
                $$;
            `);

            await connection.execute(`
                CREATE TRIGGER ${triggerName}
                BEFORE INSERT ON outbox_events
                FOR EACH ROW
                EXECUTE FUNCTION ${functionName}();
            `);

            await expect(
                useCase.execute({
                    playerId,
                    initialBalance: Money.from({
                        amount: '100.00',
                        currency: 'BRL',
                    }),
                }),
            ).rejects.toThrow();
        } finally {
            await connection.execute(`
                DROP TRIGGER IF EXISTS ${triggerName}
                ON outbox_events;
            `);

            await connection.execute(`
                DROP FUNCTION IF EXISTS ${functionName}();
            `);
        }

        const wallets = await em.count(WalletOrmEntity, { playerId });
        const transactions = await em.count(
            WagerTransactionOrmEntity,
            { playerId },
        );

        const ledgerAfter = await connection.execute(
            'SELECT count(*)::int AS count FROM wallet_ledger_entries',
        );

        const outboxAfter = await connection.execute(
            'SELECT count(*)::int AS count FROM outbox_events',
        );

        expect(wallets).toBe(0);
        expect(transactions).toBe(0);

        expect(ledgerAfter[0].count).toBe(ledgerBefore[0].count);
        expect(outboxAfter[0].count).toBe(outboxBefore[0].count);
    });

    it('should prevent duplicate wallets when two openings happen concurrently', async () => {
        const playerId = randomUUID();

        const createUseCase = () =>
            new OpenWalletUseCase(
                new WalletOpeningMikroOrmUnitOfWork(orm.em.fork()),
            );

        const results = await Promise.allSettled([
            createUseCase().execute({
                playerId,
                initialBalance: Money.zero('BRL'),
            }),
            createUseCase().execute({
                playerId,
                initialBalance: Money.zero('BRL'),
            }),
        ]);

        const successful = results.filter(
            (result) => result.status === 'fulfilled',
        );

        const rejected = results.filter(
            (result) => result.status === 'rejected',
        );

        const em = orm.em.fork();

        const wallets = await em.find(
            WalletOrmEntity,
            { playerId },
        );

        expect(successful).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(wallets).toHaveLength(1);
    });
});
