import { EntityManager } from '@mikro-orm/postgresql';

import { InboxRepository, InboxMessage } from '../../application/ports/inbox.repository';
import { InboxMessageOrmEntity } from './inbox-message.orm-entity';

export class InboxMikroOrmRepository implements InboxRepository {
    constructor(private readonly em: EntityManager) { }

    async findByMessageId(messageId: string): Promise<InboxMessage | null> {
        const entity = await this.em.findOne(InboxMessageOrmEntity, { messageId });

        if (!entity) return null;

        return {
            messageId: entity.messageId,
            payloadHash: entity.payloadHash,
            processedAt: entity.processedAt,
        };
    }

    async create(message: InboxMessage): Promise<void> {
        const entity = this.em.create(InboxMessageOrmEntity, message);
        this.em.persist(entity);
        await this.em.flush();
    }
}