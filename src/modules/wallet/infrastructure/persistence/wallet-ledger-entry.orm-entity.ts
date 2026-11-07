
import {
    Entity,
    PrimaryKey,
    Property,
    Unique,
} from '@mikro-orm/decorators/legacy';

import { LedgerDirection } from '../../domain/ledger-direction';

@Entity({ tableName: 'wallet_ledger_entries' })
@Unique({
    properties: ['walletId', 'transactionId'],
})
export class WalletLedgerEntryOrmEntity {
    @PrimaryKey({ type: 'uuid' })
    id!: string;

    @Property({ type: 'uuid' })
    walletId!: string;

    @Property({ type: 'uuid' })
    transactionId!: string;

    @Property({ type: 'string', length: 10 })
    direction!: LedgerDirection;

    @Property({ type: 'numeric', precision: 20, scale: 2 })
    amount!: string;

    @Property({ type: 'string', length: 3 })
    currency!: string;

    @Property({ type: 'numeric', precision: 20, scale: 2 })
    balanceBefore!: string;

    @Property({ type: 'numeric', precision: 20, scale: 2 })
    balanceAfter!: string;

    @Property({ type: 'Date' })
    createdAt!: Date;
}
