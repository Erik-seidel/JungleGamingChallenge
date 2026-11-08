import { describe, expect, it, mock } from 'bun:test';
import { OutboxWorker } from './outbox.worker';
import { OutboxRepository } from '../ports/outbox.repository';
import { EventPublisher } from '../ports/event-publisher';

describe('OutboxWorker', () => {
    const event = {
        eventId: 'event-1',
        eventType: 'WagerTransactionProcessed',
        aggregateId: 'wallet-1',
        correlationId: 'correlation-1',
        occurredAt: '2026-11-08T12:00:00.000Z',
        version: 1,
        data: {},
    };

    const claimedEvent = {
        id: 'event-1',
        claimToken: 'claim-1',
        attempts: 1,
        payload: event,
    };

    function createWorker(
        publish: () => Promise<void>,
        markPublished = async () => true,
        markFailed = async () => true,
    ) {
        const outbox = {
            claimPending: mock(async () => [claimedEvent]),
            markPublished: mock(markPublished),
            markFailed: mock(markFailed),
            enqueue: mock(async () => { }),
        } as unknown as OutboxRepository;

        const publisher = {
            publish: mock(publish),
        } as unknown as EventPublisher;

        return {
            worker: new OutboxWorker(outbox, publisher, 100, 1_000),
            outbox,
            publisher,
        };
    }

    it('should publish and mark the event as published', async () => {
        const { worker, outbox, publisher } = createWorker(
            async () => { },
        );

        const result = await worker.runOnce();

        expect(result).toEqual({
            claimed: 1,
            published: 1,
            failed: 0,
            lostLease: 0,
        });

        expect(publisher.publish).toHaveBeenCalledTimes(1);
        expect(outbox.markPublished).toHaveBeenCalledTimes(1);
        expect(outbox.markFailed).not.toHaveBeenCalled();
    });

    it('should mark the event as failed when publishing fails', async () => {
        const { worker, outbox } = createWorker(async () => {
            throw new Error('Publisher unavailable');
        });

        const result = await worker.runOnce();

        expect(result.failed).toBe(1);
        expect(result.published).toBe(0);
        expect(outbox.markFailed).toHaveBeenCalledTimes(1);
        expect(outbox.markPublished).not.toHaveBeenCalled();
    });

    it('should count lost lease when markPublished returns false', async () => {
        const { worker, outbox } = createWorker(
            async () => { },
            async () => false,
        );

        const result = await worker.runOnce();

        expect(result.lostLease).toBe(1);
        expect(result.published).toBe(0);
        expect(outbox.markFailed).not.toHaveBeenCalled();
    });

    it('should not mark as failed when markPublished throws', async () => {
        const { worker, outbox } = createWorker(
            async () => { },
            async () => {
                throw new Error('Database unavailable');
            },
        );

        await expect(worker.runOnce()).rejects.toThrow(
            'Database unavailable',
        );

        expect(outbox.markFailed).not.toHaveBeenCalled();
    });

    it('should convert occurredAt into a Date before publishing', async () => {
        const { worker, publisher } = createWorker(async () => { });

        await worker.runOnce();

        const publishedEvent = (
            publisher.publish as ReturnType<typeof mock>
        ).mock.calls[0][0];

        expect(publishedEvent.occurredAt).toBeInstanceOf(Date);
    });
});