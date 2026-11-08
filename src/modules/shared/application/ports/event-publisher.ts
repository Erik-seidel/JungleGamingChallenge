import { IntegrationEvent } from './outbox.repository';

export interface EventPublisher {
    publish(event: IntegrationEvent): Promise<void>;
}