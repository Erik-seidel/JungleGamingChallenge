import {
    ClaimedOutboxEvent,
    OutboxRepository,
} from '../ports/outbox.repository';

import { EventPublisher } from '../ports/event-publisher';

export interface OutboxWorkerOptions {
    batchSize: number;
    leaseDurationMs: number;
    retryBaseDelayMs: number;
    retryMaxDelayMs: number;
}

export interface OutboxWorkerResult {
    claimed: number;
    published: number;
    failed: number;
    lostClaims: number;
}

export class OutboxWorker {
    constructor(
        private readonly repository: OutboxRepository,
        private readonly publisher: EventPublisher,
        private readonly options: OutboxWorkerOptions,
    ) {
        this.validateOptions();
    }

    async runOnce(): Promise<OutboxWorkerResult> {
        const events = await this.repository.claimPending(
            this.options.batchSize,
            this.options.leaseDurationMs,
        );

        const result: OutboxWorkerResult = {
            claimed: events.length,
            published: 0,
            failed: 0,
            lostClaims: 0,
        };

        for (const event of events) {
            await this.processEvent(event, result);
        }

        return result;
    }

    private async processEvent(
        event: ClaimedOutboxEvent,
        result: OutboxWorkerResult,
    ): Promise<void> {
        try {
            await this.publisher.publish(event.payload);

            const published = await this.repository.markPublished(
                event.id,
                event.claimToken,
            );

            if (published) {
                result.published++;
            } else {
                result.lostClaims++;
            }
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);

            const nextAttemptAt = new Date(
                Date.now() + this.calculateRetryDelay(event.attempts),
            );

            const failed = await this.repository.markFailed(
                event.id,
                event.claimToken,
                message,
                nextAttemptAt,
            );

            if (failed) {
                result.failed++;
            } else {
                result.lostClaims++;
            }
        }
    }

    private calculateRetryDelay(attempts: number): number {
        const delay = this.options.retryBaseDelayMs
            * Math.pow(2, Math.max(0, attempts - 1));

        return Math.min(
            delay,
            this.options.retryMaxDelayMs,
        );
    }

    private validateOptions(): void {
        const values = [
            this.options.batchSize,
            this.options.leaseDurationMs,
            this.options.retryBaseDelayMs,
            this.options.retryMaxDelayMs,
        ];

        if (values.some(
            (value) => !Number.isInteger(value) || value <= 0,
        )) {
            throw new Error('All worker options must be positive integers');
        }

        if (
            this.options.retryMaxDelayMs
            < this.options.retryBaseDelayMs
        ) {
            throw new Error(
                'Maximum retry delay cannot be lower than base retry delay',
            );
        }
    }
}