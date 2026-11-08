export interface IntegrationEvent<
    TData extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
    readonly eventId: string;
    readonly eventType: string;
    readonly aggregateId: string;
    readonly correlationId: string;
    readonly causationId?: string;
    readonly occurredAt: Date;
    readonly version: number;
    readonly data: TData;
}

export interface ClaimedOutboxEvent {
    readonly id: string;
    readonly claimToken: string;
    readonly attempts: number;
    readonly payload: IntegrationEvent;
}

export interface OutboxRepository {
    enqueue(event: IntegrationEvent): Promise<void>;

    claimPending(
        limit: number,
        leaseDurationMs: number,
    ): Promise<ClaimedOutboxEvent[]>;

    markPublished(
        eventId: string,
        claimToken: string,
    ): Promise<boolean>;

    markFailed(
        eventId: string,
        claimToken: string,
        error: string,
        nextAttemptAt: Date,
    ): Promise<boolean>;
}