import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../../../database/database.module';
import { WageringModule } from '../../../wagering/wagering.module';

import { SqsEventPublisher } from './sqs-event.publisher';
import { OutboxWorkerService } from './outbox-worker.service';
import { SqsWagerConsumerService } from './sqs-wager-consumer.service';

@Module({
    imports: [
        DatabaseModule,
        WageringModule,
    ],
    providers: [
        SqsEventPublisher,
        OutboxWorkerService,
        SqsWagerConsumerService,
    ],
})
export class MessagingModule { }