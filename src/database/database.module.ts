import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { InboxMessageOrmEntity } from '../modules/shared/infrastructure/persistence/inbox-message.orm-entity';
import { WalletOrmEntity } from '../modules/wallet/infrastructure/persistence/wallet.orm-entity';
import { WalletLedgerEntryOrmEntity } from '../modules/wallet/infrastructure/persistence/wallet-ledger-entry.orm-entity';
import { WagerTransactionOrmEntity } from '../modules/wagering/infrastructure/persistence/wager-transaction.orm-entity';
import { OutboxEventOrmEntity } from '../modules/shared/infrastructure/persistence/outbox-event.orm-entity';

@Global()
@Module({
    imports: [
        ConfigModule,
        MikroOrmModule.forRootAsync({
            driver: PostgreSqlDriver,
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                host: configService.getOrThrow<string>('POSTGRES_HOST'),
                port: Number(configService.getOrThrow<string>('POSTGRES_PORT')),
                dbName: configService.getOrThrow<string>('POSTGRES_DB'),
                user: configService.getOrThrow<string>('POSTGRES_USER'),
                password: configService.getOrThrow<string>('POSTGRES_PASSWORD'),
                entities: [
                    WalletOrmEntity,
                    WalletLedgerEntryOrmEntity,
                    WagerTransactionOrmEntity,
                    OutboxEventOrmEntity,
                    InboxMessageOrmEntity,
                ],
                debug: false,
            }),
        }),
    ],
})
export class DatabaseModule { }