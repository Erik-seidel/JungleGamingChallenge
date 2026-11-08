import 'dotenv/config';

import { Migrator } from '@mikro-orm/migrations';
import {
    defineConfig,
    PostgreSqlDriver,
} from '@mikro-orm/postgresql';

import { WalletOrmEntity } from '../src/modules/wallet/infrastructure/persistence/wallet.orm-entity';
import { WalletLedgerEntryOrmEntity } from '../src/modules/wallet/infrastructure/persistence/wallet-ledger-entry.orm-entity';
import { WagerTransactionOrmEntity } from '../src/modules/wagering/infrastructure/persistence/wager-transaction.orm-entity';
import { OutboxEventOrmEntity } from '../src/modules/shared/infrastructure/persistence/outbox-event.orm-entity';

function requiredEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }

    return value;
}

export default defineConfig({
    driver: PostgreSqlDriver,

    host: requiredEnv('POSTGRES_HOST'),
    port: Number(requiredEnv('POSTGRES_PORT')),
    dbName: requiredEnv('POSTGRES_DB'),
    user: requiredEnv('POSTGRES_USER'),
    password: requiredEnv('POSTGRES_PASSWORD'),

    entities: [
        WalletOrmEntity,
        WalletLedgerEntryOrmEntity,
        WagerTransactionOrmEntity,
        OutboxEventOrmEntity,
    ],

    extensions: [Migrator],

    debug: false,

    migrations: {
        path: './dist/migrations',
        pathTs: './migrations',
        emit: 'ts',
    },
});
