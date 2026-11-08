import { EntityManager } from '@mikro-orm/postgresql';

import {
    IntegrationEvent,
    OutboxRepository,
} from '../../application/ports/outbox.repository';
import { OutboxEventOrmEntity } from './outbox-event.orm-entity';

export class OutboxMikroOrmRepository implements OutboxRepository {
    constructor(
        private readonly entityManager: EntityManager,
    ) { }

    async enqueue(event: IntegrationEvent): Promise<void> {
        const entity = this.entityManager.create(
            OutboxEventOrmEntity,
            {
                id: event.eventId,
                aggregateId: event.aggregateId,
                eventType: event.eventType,
                occurredAt: event.occurredAt,
                attempts: 0,
                nextAttemptAt: event.occurredAt,
                createdAt: new Date(),
                payload: {
                    eventId: event.eventId,
                    eventType: event.eventType,
                    aggregateId: event.aggregateId,
                    correlationId: event.correlationId,
                    ...(event.causationId
                        ? { causationId: event.causationId }
                        : {}),
                    occurredAt: event.occurredAt.toISOString(),
                    version: event.version,
                    data: event.data,
                },
            },
        );

        this.entityManager.persist(entity);
        await this.entityManager.flush();
    }
}