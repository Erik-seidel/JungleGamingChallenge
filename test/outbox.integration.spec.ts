
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';

import config from './mikro-orm.integration.config';

import { OutboxEventOrmEntity } from '../src/modules/shared/infrastructure/persistence/outbox-event.orm-entity';
import { OutboxMikroOrmRepository } from '../src/modules/shared/infrastructure/persistence/outbox-mikro-orm.repository';
import { IntegrationEvent } from '../src/modules/shared/application/ports/outbox.repository';

describe('Outbox - PostgreSQL Integration', () => {
    let orm: MikroORM;

    beforeAll(async () => {
        orm = await MikroORM.init(config);
    });

    afterAll(async () => {
        await orm?.close(true);
    });

    const createEvent = (): IntegrationEvent => {
        const walletId = randomUUID();

        return {
            eventId: randomUUID(),
            eventType: 'WalletBalanceChanged',
            aggregateId: walletId,
            correlationId: randomUUID(),
            occurredAt: new Date(),
            version: 1,
            data: {
                walletId,
                balance: '100.00',
                currency: 'BRL',
            },
        };
    };

    it('should claim pending events and increment attempts', async () => {
        const em = orm.em.fork();
        const repository = new OutboxMikroOrmRepository(em);
        const event = createEvent();

        await repository.enqueue(event);

        const claimed = await repository.claimPending(1000, 30_000);
        const result = claimed.find(
            (item) => item.id === event.eventId,
        );

        expect(result).toBeDefined();
        expect(result?.attempts).toBe(1);
        expect(result?.claimToken).toBeDefined();
        expect(result?.payload.eventId).toBe(event.eventId);

        const persisted = await em.findOne(
            OutboxEventOrmEntity,
            { id: event.eventId },
        );

        expect(persisted?.attempts).toBe(1);
        expect(persisted?.claimToken).toBe(result?.claimToken);
        expect(persisted?.lockedUntil).toBeDefined();
    });

    it('should not claim the same event from concurrent workers', async () => {
        const event = createEvent();

        await new OutboxMikroOrmRepository(
            orm.em.fork(),
        ).enqueue(event);

        const workerA = new OutboxMikroOrmRepository(
            orm.em.fork(),
        );

        const workerB = new OutboxMikroOrmRepository(
            orm.em.fork(),
        );

        const [claimedA, claimedB] = await Promise.all([
            workerA.claimPending(10, 30_000),
            workerB.claimPending(10, 30_000),
        ]);

        const occurrences = [
            ...claimedA,
            ...claimedB,
        ].filter((item) => item.id === event.eventId);

        expect(occurrences).toHaveLength(1);
    });

    it('should publish only with the current claim token', async () => {
        const em = orm.em.fork();
        const repository = new OutboxMikroOrmRepository(em);
        const event = createEvent();

        await repository.enqueue(event);

        const claimed = await repository.claimPending(1000, 30_000);
        const result = claimed.find(
            (item) => item.id === event.eventId,
        );

        expect(result).toBeDefined();

        const invalidTokenResult = await repository.markPublished(
            event.eventId,
            randomUUID(),
        );

        expect(invalidTokenResult).toBe(false);

        const published = await repository.markPublished(
            event.eventId,
            result!.claimToken,
        );

        expect(published).toBe(true);

        const persisted = await em.findOne(
            OutboxEventOrmEntity,
            { id: event.eventId },
        );

        expect(persisted?.publishedAt).toBeDefined();
        expect(persisted?.claimToken).toBeNull();
        expect(persisted?.lockedUntil).toBeNull();
    });

    it('should release a failed claim and schedule the next attempt', async () => {
        const em = orm.em.fork();
        const repository = new OutboxMikroOrmRepository(em);
        const event = createEvent();

        await repository.enqueue(event);

        const claimed = await repository.claimPending(1000, 30_000);
        const result = claimed.find(
            (item) => item.id === event.eventId,
        );

        expect(result).toBeDefined();

        const nextAttemptAt = new Date(Date.now() + 60_000);

        const failed = await repository.markFailed(
            event.eventId,
            result!.claimToken,
            'Simulated publisher failure',
            nextAttemptAt,
        );

        expect(failed).toBe(true);

        const persisted = await em.findOne(
            OutboxEventOrmEntity,
            { id: event.eventId },
        );

        expect(persisted?.attempts).toBe(1);
        expect(persisted?.lastError).toBe('Simulated publisher failure');
        expect(persisted?.claimToken).toBeNull();
        expect(persisted?.lockedUntil).toBeNull();

        expect(persisted?.nextAttemptAt?.getTime()).toBe(
            nextAttemptAt.getTime(),
        );
    });
});
