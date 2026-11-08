
import { EntityManager } from '@mikro-orm/postgresql';

import {
    ClaimedOutboxEvent,
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

    async claimPending(
        limit: number,
        leaseDurationMs: number,
    ): Promise<ClaimedOutboxEvent[]> {
        if (!Number.isInteger(limit) || limit <= 0) {
            throw new Error('Claim limit must be a positive integer');
        }

        if (!Number.isInteger(leaseDurationMs) || leaseDurationMs <= 0) {
            throw new Error('Lease duration must be a positive integer');
        }

        const rows = await this.entityManager.getConnection().execute(
            `
        WITH candidates AS (
            SELECT id
            FROM outbox_events
            WHERE published_at IS NULL
              AND next_attempt_at <= now()
              AND (
                  locked_until IS NULL
                  OR locked_until <= now()
              )
            ORDER BY occurred_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ?
        )
        UPDATE outbox_events AS event
        SET
            claim_token = gen_random_uuid(),
            locked_until = now() + (? * interval '1 millisecond'),
            attempts = event.attempts + 1
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING
            event.id AS id,
            event.claim_token AS "claimToken",
            event.attempts AS attempts,
            event.payload AS payload
        `,
            [limit, leaseDurationMs],
        );

        return rows.map((row) => ({
            id: row.id,
            claimToken: row.claimToken,
            attempts: row.attempts,
            payload: row.payload,
        }));
    }

    async markPublished(
        eventId: string,
        claimToken: string,
    ): Promise<boolean> {
        const rows = await this.entityManager.getConnection().execute<
            { id: string }[]
        >(
            `
            UPDATE outbox_events
            SET
                published_at = now(),
                locked_until = NULL,
                claim_token = NULL,
                last_error = NULL
            WHERE id = ?
              AND claim_token = ?
              AND published_at IS NULL
            RETURNING id
            `,
            [eventId, claimToken],
        );

        return rows.length > 0;
    }

    async markFailed(
        eventId: string,
        claimToken: string,
        error: string,
        nextAttemptAt: Date,
    ): Promise<boolean> {
        const rows = await this.entityManager.getConnection().execute<
            { id: string }[]
        >(
            `
            UPDATE outbox_events
            SET
                locked_until = NULL,
                claim_token = NULL,
                last_error = ?,
                next_attempt_at = ?
            WHERE id = ?
              AND claim_token = ?
              AND published_at IS NULL
            RETURNING id
            `,
            [error, nextAttemptAt, eventId, claimToken],
        );

        return rows.length > 0;
    }
}
