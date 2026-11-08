import 'dotenv/config';
import { Migrator } from '@mikro-orm/migrations';
import {
    defineConfig,
    PostgreSqlDriver,
} from '@mikro-orm/postgresql';

import { WalletOrmEntity } from './src/modules/wallet/infrastructure/persistence/wallet.orm-entity';

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

    entities: [WalletOrmEntity],

    extensions: [Migrator],

    debug: false,

    migrations: {
        path: './dist/migrations',
        pathTs: './migrations',
        emit: 'ts',
    },
});