
import {
    SendMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs';

import { EventPublisher } from '../../application/ports/event-publisher';
import { IntegrationEvent } from '../../application/ports/outbox.repository';

export class SqsEventPublisher implements EventPublisher {
    private readonly client: SQSClient;
    private readonly queueUrl: string;

    constructor() {
        this.queueUrl =
            process.env.SQS_QUEUE_URL ??
            'http://localhost:9324/000000000000/jungle-events';

        this.client = new SQSClient({
            endpoint: process.env.SQS_ENDPOINT ?? 'http://localhost:9324',
            region: process.env.AWS_REGION ?? 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
            },
        });
    }

    async publish(event: IntegrationEvent): Promise<void> {
        await this.client.send(
            new SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: JSON.stringify(event),
            }),
        );
    }

    destroy(): void {
        this.client.destroy();
    }
}
