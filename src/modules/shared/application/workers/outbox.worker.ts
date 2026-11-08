import {
    ClaimedOutboxEvent,
    IntegrationEvent,
    OutboxRepository,
} from '../ports/outbox.repository';
import { EventPublisher } from '../ports/event-publisher';

export interface OutboxWorkerResult {
    claimed: number;
    published: number;
    failed: number;
    lostLease: number;
}

export class OutboxWorker {
    constructor(
        private readonly outbox: OutboxRepository,
        private readonly publisher: EventPublisher,
        private readonly baseRetryDelayMs = 1_000,
        private readonly maxRetryDelayMs = 300_000,
    ) { }

    async runOnce(
        batchSize = 10,
        leaseDurationMs = 30_000,
    ): Promise<OutboxWorkerResult> {
        const events = await this.outbox.claimPending(
            batchSize,
            leaseDurationMs,
        );

        const result: OutboxWorkerResult = {
            claimed: events.length,
            published: 0,
            failed: 0,
            lostLease: 0,
        };

        for (const claimedEvent of events) {
            await this.processEvent(claimedEvent, result);
        }

        return result;
    }

    private async processEvent(
        claimedEvent: ClaimedOutboxEvent,
        result: OutboxWorkerResult,
    ): Promise<void> {
        let event: IntegrationEvent;

        try {
            event = this.normalizeEvent(claimedEvent.payload);
            await this.publisher.publish(event);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            const nextAttemptAt = new Date(
                Date.now() +
                this.calculateRetryDelay(claimedEvent.attempts),
            );

            const marked = await this.outbox.markFailed(
                claimedEvent.id,
                claimedEvent.claimToken,
                message,
                nextAttemptAt,
            );

            if (marked) {
                result.failed++;
            } else {
                result.lostLease++;
            }

            return;
        }

        const marked = await this.outbox.markPublished(
            claimedEvent.id,
            claimedEvent.claimToken,
        );

        if (marked) {
            result.published++;
        } else {
            result.lostLease++;
        }
    }

    private normalizeEvent(
        event: IntegrationEvent,
    ): IntegrationEvent {
        const occurredAt =
            event.occurredAt instanceof Date
                ? event.occurredAt
                : new Date(String(event.occurredAt));

        if (Number.isNaN(occurredAt.getTime())) {
            throw new Error('Invalid outbox event occurredAt');
        }

        return { ...event, occurredAt };
    }

    private calculateRetryDelay(attempts: number): number {
        const exponent = Math.max(0, attempts - 1);

        return Math.min(
            this.baseRetryDelayMs * 2 ** exponent,
            this.maxRetryDelayMs,
        );
    }
}