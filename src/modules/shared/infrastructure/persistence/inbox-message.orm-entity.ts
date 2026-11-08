import {
    Entity,
    PrimaryKey,
    Property,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'inbox_messages' })
export class InboxMessageOrmEntity {
    @PrimaryKey({ type: 'string', length: 200 })
    messageId!: string;

    @Property({ type: 'string', length: 64 })
    payloadHash!: string;

    @Property({ type: 'Date' })
    processedAt!: Date;
}