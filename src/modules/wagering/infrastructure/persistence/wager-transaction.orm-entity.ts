
import {
    Entity,
    PrimaryKey,
    Property,
    Unique,
} from '@mikro-orm/decorators/legacy';

import {
    WagerTransactionKind,
    WagerTransactionStatus,
} from '../../domain/wager-transaction';

@Entity({ tableName: 'wager_transactions' })
@Unique({
    properties: ['providerId', 'externalTransactionId'],
})
@Unique({
    properties: ['providerId', 'idempotencyKey'],
})
export class WagerTransactionOrmEntity {
    @PrimaryKey({ type: 'uuid' })
    id!: string;

    @Property({ type: 'string', nullable: true })
    providerId?: string;

    @Property({ type: 'string', nullable: true })
    externalTransactionId?: string;

    @Property({ type: 'string', nullable: true })
    idempotencyKey?: string;

    @Property({ type: 'string', nullable: true })
    payloadHash?: string;

    @Property({ type: 'uuid' })
    walletId!: string;

    @Property({ type: 'uuid' })
    playerId!: string;

    @Property({ type: 'string', nullable: true })
    roundId?: string;

    @Property({ type: 'string', nullable: true })
    gameId?: string;

    @Property({ type: 'string', length: 20 })
    kind!: WagerTransactionKind;

    @Property({ type: 'numeric', precision: 20, scale: 2 })
    amount!: string;
    @Property({
        type: 'numeric',
        precision: 20,
        scale: 2,
        nullable: true,
    })
    balanceAfter?: string;
    @Property({ type: 'string', length: 3 })
    currency!: string;

    @Property({ type: 'string', nullable: true })
    referenceExternalTransactionId?: string;

    @Property({ type: 'uuid', nullable: true })
    referenceTransactionId?: string;

    @Property({ type: 'string', length: 30 })
    status!: WagerTransactionStatus;

    @Property({ type: 'string', nullable: true })
    failureCode?: string;

    @Property({ type: 'Date' })
    createdAt!: Date;

    @Property({ type: 'Date', nullable: true })
    processedAt?: Date;
}
