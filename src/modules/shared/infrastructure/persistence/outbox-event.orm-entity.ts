import {
    Entity,
    PrimaryKey,
    Property,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'outbox_events' })
export class OutboxEventOrmEntity {
    @PrimaryKey({ type: 'uuid' })
    id!: string;

    @Property({ type: 'uuid' })
    aggregateId!: string;

    @Property({ type: 'string', length: 64 })
    eventType!: string;

    @Property({ type: 'json', columnType: 'jsonb' })
    payload!: Record<string, unknown>;

    @Property({ type: 'Date' })
    occurredAt!: Date;

    @Property({ type: 'integer', default: 0 })
    attempts!: number;

    @Property({ type: 'Date', defaultRaw: 'now()' })
    nextAttemptAt!: Date;

    @Property({ type: 'Date', nullable: true })
    publishedAt?: Date;

    @Property({ type: 'Date', nullable: true })
    lockedUntil?: Date;

    @Property({ type: 'uuid', nullable: true })
    claimToken?: string;

    @Property({ type: 'text', nullable: true })
    lastError?: string;

    @Property({ type: 'Date', defaultRaw: 'now()' })
    createdAt!: Date;
}
