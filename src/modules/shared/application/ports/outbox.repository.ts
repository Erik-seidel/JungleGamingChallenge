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

export interface OutboxRepository {
    enqueue(event: IntegrationEvent): Promise<void>;
}
