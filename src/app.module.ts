
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { WalletOrmEntity } from './modules/wallet/infrastructure/persistence/wallet.orm-entity';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WalletLedgerEntryOrmEntity } from './modules/wallet/infrastructure/persistence/wallet-ledger-entry.orm-entity';
import { WagerTransactionOrmEntity } from './modules/wagering/infrastructure/persistence/wager-transaction.orm-entity';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        host: configService.getOrThrow<string>('POSTGRES_HOST'),
        port: Number(
          configService.getOrThrow<string>('POSTGRES_PORT'),
        ),
        dbName: configService.getOrThrow<string>('POSTGRES_DB'),
        user: configService.getOrThrow<string>('POSTGRES_USER'),
        password: configService.getOrThrow<string>('POSTGRES_PASSWORD'),
        entities: [
          WalletOrmEntity,
          WalletLedgerEntryOrmEntity,
          WagerTransactionOrmEntity,
        ],
        debug: true,
      }),
    }),

    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'api',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
