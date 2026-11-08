import {
    CreateQueueCommand,
    GetQueueAttributesCommand,
    SQSClient,
} from '@aws-sdk/client-sqs';

const client = new SQSClient({
    endpoint: process.env.SQS_ENDPOINT ?? 'http://localhost:9324',
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
});

async function createQueue(
    name: string,
    attributes: Record<string, string> = {},
): Promise<string> {
    try {
        const result = await client.send(
            new CreateQueueCommand({
                QueueName: name,
                Attributes: {
                    VisibilityTimeout: '30',
                    MessageRetentionPeriod: '1209600',
                    ...attributes,
                },
            }),
        );

        if (!result.QueueUrl) {
            throw new Error(`Could not create queue: ${name}`);
        }

        console.log(`${name}: ${result.QueueUrl}`);
        return result.QueueUrl;
    } catch (error) {
        if (
            error instanceof Error &&
            (error.name === 'QueueNameExists' ||
                error.name === 'QueueAlreadyExists')
        ) {
            const result = await client.send(
                new CreateQueueCommand({ QueueName: name }),
            );

            if (!result.QueueUrl) {
                throw new Error(`Could not retrieve existing queue: ${name}`);
            }

            console.log(`${name} (existing): ${result.QueueUrl}`);
            return result.QueueUrl;
        }

        throw error;
    }
}

async function getQueueArn(queueUrl: string): Promise<string> {
    const result = await client.send(
        new GetQueueAttributesCommand({
            QueueUrl: queueUrl,
            AttributeNames: ['QueueArn'],
        }),
    );

    const arn = result.Attributes?.QueueArn;

    if (!arn) {
        throw new Error(`Could not retrieve ARN for ${queueUrl}`);
    }

    return arn;
}

async function main(): Promise<void> {
    // Outbound: eventos da Outbox (standard).
    const eventsDlqUrl = await createQueue('jungle-events-dlq');
    const eventsDlqArn = await getQueueArn(eventsDlqUrl);

    const eventsUrl = await createQueue('jungle-events', {
        RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: eventsDlqArn,
            maxReceiveCount: '5',
        }),
    });

    // Inbound: comandos financeiros (FIFO).
    const wagerDlqUrl = await createQueue(
        'wager-transactions-dlq.fifo',
        {
            FifoQueue: 'true',
            ContentBasedDeduplication: 'true',
        },
    );

    const wagerDlqArn = await getQueueArn(wagerDlqUrl);

    const wagerUrl = await createQueue(
        'wager-transactions.fifo',
        {
            FifoQueue: 'true',
            ContentBasedDeduplication: 'true',
            RedrivePolicy: JSON.stringify({
                deadLetterTargetArn: wagerDlqArn,
                maxReceiveCount: '5',
            }),
        },
    );

    console.log('\nSQS queues provisioned successfully.');
    console.log({
        eventsUrl,
        eventsDlqUrl,
        wagerUrl,
        wagerDlqUrl,
    });
}

main()
    .catch((error) => {
        console.error('SQS provisioning failed:', error);
        process.exitCode = 1;
    })
    .finally(() => client.destroy());