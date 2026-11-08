import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';

const client = new SQSClient({
    endpoint: process.env.SQS_ENDPOINT ?? 'http://localhost:9324',
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
});

const messageId = randomUUID();

const message = {
    messageId,
    type: 'WagerTransactionRequested',
    occurredAt: new Date().toISOString(),
    data: {
        providerId: 'test-provider',
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
        playerId: 'a68e7d78-a4fa-4538-bae8-98ceeec8bc09',
        walletId: '6fa591bd-e390-48be-ba83-d947d09b8707',
        roundId: 'test-round-001',
        gameId: 'test-game-001',
        kind: 'BET',
        money: {
            amount: '10.00',
            currency: 'BRL',
        },
    },
};

try {
    const result = await client.send(new SendMessageCommand({
        QueueUrl: 'http://localhost:9324/000000000000/wager-transactions.fifo',
        MessageBody: JSON.stringify(message),
        MessageGroupId: message.data.playerId,
        MessageDeduplicationId: messageId,
    }));

    console.log('Mensagem enviada:', result.MessageId);
    console.log('ID de negócio:', message.data.externalTransactionId);
} finally {
    client.destroy();
}
