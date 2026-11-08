
import { OpenWalletUseCase } from './application/use-cases/open-wallet.use-case';
import { WalletOpeningUnitOfWork } from './application/ports/wallet-opening.unit-of-work';

import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WalletOrmEntity } from './infrastructure/persistence/wallet.orm-entity';
import { WalletLedgerEntryOrmEntity } from './infrastructure/persistence/wallet-ledger-entry.orm-entity';
import { WalletOpeningMikroOrmUnitOfWork } from './infrastructure/persistence/wallet-opening-mikro-orm.unit-of-work';

import { WagerTransactionOrmEntity } from '../wagering/infrastructure/persistence/wager-transaction.orm-entity';
import { OutboxEventOrmEntity } from '../shared/infrastructure/persistence/outbox-event.orm-entity';

export const WALLET_OPENING_UNIT_OF_WORK = Symbol(
    'WALLET_OPENING_UNIT_OF_WORK',
);

@Module({
    imports: [
        MikroOrmModule.forFeature([
            WalletOrmEntity,
            WalletLedgerEntryOrmEntity,
            WagerTransactionOrmEntity,
            OutboxEventOrmEntity,
        ]),
    ],
    providers: [
        {
            provide: WALLET_OPENING_UNIT_OF_WORK,
            useClass: WalletOpeningMikroOrmUnitOfWork,
        },
        {
            provide: OpenWalletUseCase,
            useFactory: (unitOfWork: WalletOpeningUnitOfWork) =>
                new OpenWalletUseCase(unitOfWork),
            inject: [WALLET_OPENING_UNIT_OF_WORK],

        },
    ],
    exports: [
        WALLET_OPENING_UNIT_OF_WORK,
        OpenWalletUseCase,
    ],
})
export class WalletModule { }
