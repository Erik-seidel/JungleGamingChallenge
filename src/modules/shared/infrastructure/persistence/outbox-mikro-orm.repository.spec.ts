import { EntityManager } from '@mikro-orm/postgresql';

import { IntegrationEvent } from '../../application/ports/outbox.repository';
import { OutboxEventOrmEntity } from './outbox-event.orm-entity';
import { OutboxMikroOrmRepository } from './outbox-mikro-orm.repository';

describe('OutboxMikroOrmRepository', () => {
    let repository: OutboxMikroOrmRepository;

    const entityManager = {
        create: jest.fn(),
        persist: jest.fn(),
        flush: jest.fn(),
    };

    const occurredAt = new Date('2026-11-07T10:00:00.000Z');

    const event: IntegrationEvent = {
        eventId: '11111111-1111-4111-8111-111111111111',
        eventType: 'WalletBalanceChanged',
        aggregateId: '22222222-2222-4222-8222-222222222222',
        correlationId: '33333333-3333-4333-8333-333333333333',
        causationId: '44444444-4444-4444-8444-444444444444',
        occurredAt,
        version: 1,
        data: {
            walletId: '22222222-2222-4222-8222-222222222222',
            balance: '90.00',
            currency: 'USD',
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();

        repository = new OutboxMikroOrmRepository(
            entityManager as unknown as EntityManager,
        );
    });

    describe('enqueue', () => {
        it('should persist an event with its complete envelope', async () => {
            const entity = {} as OutboxEventOrmEntity;

            entityManager.create.mockReturnValue(entity);

            await repository.enqueue(event);

            expect(entityManager.create).toHaveBeenCalledWith(
                OutboxEventOrmEntity,
                expect.objectContaining({
                    id: event.eventId,
                    aggregateId: event.aggregateId,
                    eventType: event.eventType,
                    occurredAt: event.occurredAt,
                    payload: expect.objectContaining({
                        eventId: event.eventId,
                        eventType: event.eventType,
                        aggregateId: event.aggregateId,
                        correlationId: event.correlationId,
                        causationId: event.causationId,
                        occurredAt: occurredAt.toISOString(),
                        version: event.version,
                        data: event.data,
                    }),
                }),
            );

            expect(entityManager.persist).toHaveBeenCalledWith(entity);
            expect(entityManager.flush).toHaveBeenCalled();
        });

        it('should not persist or flush when entity creation fails', async () => {
            entityManager.create.mockImplementation(() => {
                throw new Error('Entity creation failed');
            });

            await expect(repository.enqueue(event)).rejects.toThrow(
                'Entity creation failed',
            );

            expect(entityManager.persist).not.toHaveBeenCalled();
            expect(entityManager.flush).not.toHaveBeenCalled();
        });
    });
});