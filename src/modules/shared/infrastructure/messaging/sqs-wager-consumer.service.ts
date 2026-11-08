import {
    DeleteMessageCommand,
    ReceiveMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs';
import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { Money } from '../../../wallet/domain/money';
import {
    WagerTransactionKind,
} from '../../../wagering/domain/wager-transaction';
import {
    ProcessWagerTransactionUseCase,
} from '../../../wagering/application/use-cases/process-wager-transaction.use-case';
import {
    DuplicateInboxMessageError,
} from '../../application/ports/duplicate-inbox-message.error';

interface WagerMessageData {
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: {
        amount: string;
        currency: string;
    };
    referenceExternalTransactionId?: string;
}

interface WagerMessage {
    messageId: string;
    type: 'WagerTransactionRequested';
    occurredAt: string;
    data: WagerMessageData;
}

@Injectable()
export class SqsWagerConsumerService
    implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SqsWagerConsumerService.name);

    private readonly client = new SQSClient({
        endpoint: process.env.SQS_ENDPOINT ?? 'http://localhost:9324',
        region: process.env.AWS_REGION ?? 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
        },
    });

    private readonly queueUrl = process.env.SQS_WAGER_QUEUE_URL;

    private stopping = false;
    private loopPromise?: Promise<void>;

    constructor(
        private readonly processWager: ProcessWagerTransactionUseCase,
    ) { }

    onModuleInit(): void {
        if (!this.queueUrl) {
            this.logger.warn(
                'SQS_WAGER_QUEUE_URL not configured; wager consumer disabled',
            );
            return;
        }

        this.logger.log('Wager SQS consumer started');
        this.loopPromise = this.consumeLoop();
    }

    async onModuleDestroy(): Promise<void> {
        this.stopping = true;

        if (this.loopPromise) {
            await this.loopPromise;
        }

        this.client.destroy();
        this.logger.log('Wager SQS consumer stopped');
    }

    private async consumeLoop(): Promise<void> {
        while (!this.stopping) {
            try {
                const result = await this.client.send(
                    new ReceiveMessageCommand({
                        QueueUrl: this.queueUrl!,
                        MaxNumberOfMessages: 1,
                        WaitTimeSeconds: 10,
                        VisibilityTimeout: 60,
                    }),
                );

                for (const message of result.Messages ?? []) {
                    if (this.stopping) {
                        break;
                    }

                    await this.processMessage(message);
                }
            } catch (error) {
                if (this.stopping) {
                    break;
                }

                this.logger.error(
                    'Wager SQS receive failed',
                    error instanceof Error ? error.stack : String(error),
                );

                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }
    }

    private async processMessage(message: {
        Body?: string;
        ReceiptHandle?: string;
    }): Promise<void> {
        if (!message.Body || !message.ReceiptHandle) {
            this.logger.error('SQS message has no body or receipt handle');
            return;
        }

        try {
            const envelope = JSON.parse(message.Body) as WagerMessage;

            this.validateEnvelope(envelope);

            const data = envelope.data;

            const canonicalPayload = JSON.stringify({
                providerId: data.providerId,
                externalTransactionId: data.externalTransactionId,
                playerId: data.playerId,
                walletId: data.walletId,
                roundId: data.roundId,
                gameId: data.gameId,
                kind: data.kind,
                money: {
                    amount: data.money.amount,
                    currency: data.money.currency,
                },
                referenceExternalTransactionId:
                    data.referenceExternalTransactionId ?? null,
            });

            const payloadHash = createHash('sha256')
                .update(canonicalPayload)
                .digest('hex');

            const inboxPayloadHash = createHash('sha256')
                .update(message.Body)
                .digest('hex');

            await this.processWager.execute({
                providerId: data.providerId,
                externalTransactionId: data.externalTransactionId,
                idempotencyKey: data.idempotencyKey,
                payloadHash,
                playerId: data.playerId,
                walletId: data.walletId,
                roundId: data.roundId,
                gameId: data.gameId,
                kind: data.kind,
                money: Money.from(data.money),
                referenceExternalTransactionId:
                    data.referenceExternalTransactionId,
                inboxMessageId: envelope.messageId,
                inboxPayloadHash,
            });

            await this.acknowledge(message.ReceiptHandle);

            this.logger.log(
                `Wager message processed: ${envelope.messageId}`,
            );
        } catch (error) {
            if (error instanceof DuplicateInboxMessageError) {
                await this.acknowledge(message.ReceiptHandle);
                this.logger.warn('Duplicate wager message acknowledged');
                return;
            }

            this.logger.error(
                'Wager message processing failed; message will be retried',
                error instanceof Error ? error.stack : String(error),
            );
        }
    }

    private async acknowledge(receiptHandle: string): Promise<void> {
        await this.client.send(
            new DeleteMessageCommand({
                QueueUrl: this.queueUrl!,
                ReceiptHandle: receiptHandle,
            }),
        );
    }

    private validateEnvelope(message: WagerMessage): void {
        if (
            !message ||
            typeof message.messageId !== 'string' ||
            !message.messageId.trim() ||
            message.type !== 'WagerTransactionRequested' ||
            !message.data
        ) {
            throw new Error('Invalid wager message envelope');
        }

        const data = message.data;

        const requiredStrings = [
            data.providerId,
            data.externalTransactionId,
            data.idempotencyKey,
            data.playerId,
            data.walletId,
            data.roundId,
            data.gameId,
            data.money?.amount,
            data.money?.currency,
        ];

        if (
            requiredStrings.some(
                (value) => typeof value !== 'string' || !value.trim(),
            )
        ) {
            throw new Error('Invalid wager message data');
        }

        if (!Object.values(WagerTransactionKind).includes(data.kind)) {
            throw new Error('Invalid wager transaction kind');
        }

        if (
            data.referenceExternalTransactionId !== undefined &&
            typeof data.referenceExternalTransactionId !== 'string'
        ) {
            throw new Error('Invalid reference transaction ID');
        }
    }
}