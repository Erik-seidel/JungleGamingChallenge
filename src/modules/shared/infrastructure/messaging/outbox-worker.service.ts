
import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { InjectEntityManager } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/postgresql';

import { OutboxWorker } from '../../application/workers/outbox.worker';
import { OutboxMikroOrmRepository } from '../persistence/outbox-mikro-orm.repository';
import { SqsEventPublisher } from './sqs-event.publisher';

@Injectable()
export class OutboxWorkerService
    implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(OutboxWorkerService.name);
    private timer?: ReturnType<typeof setInterval>;
    private running = false;

    constructor(
        @Inject(EntityManager)
        private readonly entityManager: EntityManager,
        private readonly publisher: SqsEventPublisher,
    ) { }

    onModuleInit(): void {
        this.logger.log('Outbox worker started');

        void this.processBatch();

        this.timer = setInterval(() => {
            void this.processBatch();
        }, 1000);
    }

    onModuleDestroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }

        this.publisher.destroy();

        this.logger.log('Outbox worker stopped');
    }

    private async processBatch(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;

        try {
            const repository = new OutboxMikroOrmRepository(
                this.entityManager.fork(),
            );

            const worker = new OutboxWorker(
                repository,
                this.publisher,
            );

            const result = await worker.runOnce(10, 30_000);

            if (result.claimed > 0) {
                this.logger.log(
                    `Outbox batch: ${JSON.stringify(result)}`,
                );
            }
        } catch (error) {
            this.logger.error(
                'Outbox processing failed',
                error instanceof Error ? error.stack : String(error),
            );
        } finally {
            this.running = false;
        }
    }
}
