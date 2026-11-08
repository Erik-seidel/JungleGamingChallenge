import { Module } from '@nestjs/common';
import { MikroOrmModule, getEntityManagerToken } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/postgresql';
import { WalletOrmEntity } from '../wallet/infrastructure/persistence/wallet.orm-entity';
import { WalletLedgerEntryOrmEntity } from '../wallet/infrastructure/persistence/wallet-ledger-entry.orm-entity';
import { WagerTransactionOrmEntity } from './infrastructure/persistence/wager-transaction.orm-entity';
import { OutboxEventOrmEntity } from '../shared/infrastructure/persistence/outbox-event.orm-entity';
import { InboxMessageOrmEntity } from '../shared/infrastructure/persistence/inbox-message.orm-entity';
import { DatabaseModule } from '../../database/database.module';
import {
    WageringUnitOfWork,
} from './application/ports/wagering.unit-of-work';
import {
    WageringMikroOrmUnitOfWork,
} from './infrastructure/persistence/wagering-mikro-orm.unit-of-work';
import {
    ProcessWagerTransactionUseCase,
} from './application/use-cases/process-wager-transaction.use-case';

export const WAGERING_UNIT_OF_WORK = Symbol(
    'WAGERING_UNIT_OF_WORK',
);

@Module({
    imports: [
        DatabaseModule,
        MikroOrmModule.forFeature([
            WalletOrmEntity,
            WalletLedgerEntryOrmEntity,
            WagerTransactionOrmEntity,
            OutboxEventOrmEntity,
            InboxMessageOrmEntity,
        ]),
    ],
    providers: [
        {
            provide: WAGERING_UNIT_OF_WORK,
            inject: [EntityManager],
            useFactory: (entityManager: EntityManager) =>
                new WageringMikroOrmUnitOfWork(entityManager),
        },
        {
            provide: ProcessWagerTransactionUseCase,
            inject: [WAGERING_UNIT_OF_WORK],
            useFactory: (unitOfWork: WageringUnitOfWork) =>
                new ProcessWagerTransactionUseCase(unitOfWork),
        },
    ],
    exports: [
        WAGERING_UNIT_OF_WORK,
        ProcessWagerTransactionUseCase,
    ],
})
export class WageringModule { }
