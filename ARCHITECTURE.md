# Architecture

## 1. Overview

The backend is organized around domain logic and application use cases. NestJS modules compose the application, while MikroORM and SQS adapters provide persistence and messaging.

The primary design goals are:

1. Keep monetary calculations exact.
2. Commit a wager and its financial side effects atomically.
3. Protect wallet balances from concurrent updates.
4. Make retries safe through business idempotency and message deduplication.
5. Publish events reliably without coupling database commits to broker availability.

## 2. High-level component view

~~~mermaid
flowchart TB
    SQSIn[Inbound SQS FIFO queue] --> Consumer[SqsWagerConsumerService]
    Consumer --> UseCase[ProcessWagerTransactionUseCase]
    UseCase --> UOW[WageringMikroOrmUnitOfWork]
    UOW --> DB[(PostgreSQL)]
    UOW --> WalletRepo[Wallet repository]
    UOW --> WagerRepo[Wager transaction repository]
    UOW --> LedgerRepo[Ledger repository]
    UOW --> InboxRepo[Inbox repository]
    UOW --> OutboxRepo[Outbox repository]
    OutboxRepo --> DB
    DB --> Worker[OutboxWorkerService]
    Worker --> Publisher[SqsEventPublisher]
    Publisher --> SQSOut[Outbound SQS standard queue]
~~~

The Unit of Work creates repositories using the transaction-scoped EntityManager. Repositories participating in one use-case execution therefore share the same database transaction.

## 3. Module responsibilities

### Wallet module

Owns wallet behavior and balance integrity.

- Money encapsulates currency and decimal arithmetic using Decimal.js.
- Wallet owns debit, credit, balance, and version behavior.
- The wallet repository loads the wallet under a pessimistic write lock.
- Updates check the expected version to detect stale writes.
- Ledger entries record balance-changing operations with before/after balances.

### Wagering module

Owns wagering business rules.

- WagerTransaction models transaction identity, kind, status, references, and resulting balance.
- ProcessWagerTransactionUseCase coordinates validation, idempotency, reference resolution, wallet changes, ledger entries, and events.
- WageringUnitOfWork is the application port for atomic repository operations.
- WageringMikroOrmUnitOfWork provides the PostgreSQL/MikroORM implementation.

### Shared messaging and persistence

- SqsWagerConsumerService receives and validates inbound wager envelopes.
- InboxMikroOrmRepository stores message IDs and payload hashes.
- OutboxMikroOrmRepository persists events and claims work for publication.
- OutboxWorker claims pending events, publishes them, and records success or retry state.
- SqsEventPublisher sends serialized events to the outbound queue.
- OutboxWorkerService runs the worker in the Nest application lifecycle.

## 4. Wager processing sequence

1. The SQS consumer receives a message and validates its envelope and required fields.
2. It computes hashes and maps the message into the application input.
3. The use case opens a Unit of Work.
4. The Inbox is checked for an already processed message ID. A matching payload is treated as a duplicate; a different payload for the same message ID is a conflict.
5. The use case checks the provider-scoped idempotency key and payload hash.
6. The wallet is loaded under a pessimistic write lock.
7. Wallet ownership, currency, transaction identity, amount, and any reference transaction are validated.
8. The transaction is applied or rejected according to its kind and available balance.
9. The wager transaction, wallet update, ledger entry, Inbox record, and Outbox events are persisted within the database transaction as applicable.
10. The database transaction commits.
11. The SQS consumer acknowledges the inbound message after successful use-case completion.

If an error occurs before commit, the database transaction rolls back. Ordinary processing failures are not acknowledged, allowing the broker to redeliver the message.

## 5. Transactional consistency

The Unit of Work wraps the use-case operation in MikroORM's transactional EntityManager and supplies transaction-scoped repositories.

For a successful balance-changing wager, the database transaction includes:

- the wager transaction state;
- the updated wallet balance and version;
- the immutable ledger entry;
- the corresponding Outbox event records;
- the Inbox record for an inbound SQS message.

LOSS does not change the wallet balance and does not create a ledger entry, but it creates a processed wager transaction and a processing event.

A rejected debit does not change the wallet or create a ledger movement. Rejection is represented by the wager transaction status and a rejection event.

## 6. Idempotency and concurrency

### Business idempotency

The provider ID and idempotency key identify a business request. The stored payload hash is compared with a retry:

- Same key and same payload: return the persisted result.
- Same key and different payload: reject as an idempotency conflict.

Provider-scoped external transaction IDs are also checked to prevent conflicting duplicate transaction identities.

### Message idempotency

Inbound messages carry a message ID. The Inbox stores that ID with a hash of the received message body. A repeated message ID with the same hash is recognized as a duplicate; a different hash is treated as a conflict.

### Wallet concurrency

The wallet is locked for update while a wager is being applied. The repository also checks the expected wallet version when persisting an update. This protects the balance from concurrent financial operations.

## 7. Transaction kinds

| Kind | Effect | Important rule |
|---|---|---|
| BET | Debit wallet | Rejected when funds are insufficient |
| WIN | Credit wallet | Positive amount |
| LOSS | No balance change | Zero amount |
| REFUND | Credit wallet | References a processed BET |
| ROLLBACK | Reverse the referenced transaction's ledger direction | References a supported processed transaction and cannot be repeated for the same kind |

REFUND and ROLLBACK depend on a reference transaction. If the referenced transaction has not arrived yet, the request can be stored as PENDING_REFERENCE and resolved when the reference becomes available.

OPENING is part of wallet creation and is not accepted by the wager-processing use case.

## 8. Transactional Outbox

The application does not publish domain events directly during the financial transaction.

1. The use case writes event records to outbox_events in the same SQL transaction as the business operation.
2. The worker claims eligible records using row-level locking with FOR UPDATE SKIP LOCKED.
3. A claim/lease token protects ownership of a claimed event while the worker is publishing it.
4. Successful publication marks the event as published.
5. Failed publication records the attempt and schedules a retry using backoff.

This avoids losing an event when the database commit succeeds but the message broker is temporarily unavailable.

Delivery is at least once, not exactly once. A process can publish an event and fail before recording that publication in PostgreSQL. Consumers of outbound events must deduplicate using the event ID or another stable business key.

## 9. Queues

Local development uses ElasticMQ through the AWS SDK SQS client.

| Queue | Type | Direction | Purpose |
|---|---|---|---|
| wager-transactions.fifo | FIFO | Inbound | Wager commands |
| wager-transactions-dlq.fifo | FIFO | Inbound failure | Wager messages that exceed retry policy |
| jungle-events | Standard | Outbound | Published domain events |
| jungle-events-dlq | Standard | Outbound failure | Events that exceed broker redrive policy |

The inbound FIFO message group is based on the player ID, preserving order for messages within the same group.

Queue provisioning is implemented in scripts/setup-sqs.ts.

## 10. Persistence model

| Table | Responsibility |
|---|---|
| wallets | Current balance, currency, player ownership, and version |
| wager_transactions | Provider transaction identity, idempotency, status, reference, and resulting balance |
| wallet_ledger_entries | Immutable debit/credit records and before/after balances |
| inbox_messages | Consumed message ID, payload hash, and processing timestamp |
| outbox_events | Events awaiting publication, retry metadata, leases, and publication timestamp |

Schema changes are versioned with MikroORM migrations in migrations/.

## 11. Testing strategy

The test suite covers domain and application rules, persistence adapters, Unit of Work behavior, and Outbox worker behavior.

~~~bash
bun test
bun run build
~~~

The local SQS integration can be exercised with:

~~~bash
bun run scripts/setup-sqs.ts
bun run scripts/send-test-wager.ts
~~~

The test message helper uses a predefined wallet ID; that wallet must exist in the local database before sending the sample BET.

## 12. Current boundaries

- Wager commands enter through SQS. The application does not currently expose a public HTTP wager endpoint.
- ElasticMQ validates the local SQS integration path; it is not a substitute for deployment testing against AWS.
- Production deployment still requires environment-specific secrets, IAM policies, queue configuration, monitoring, and operational alerting.
