# Jungle Gaming Backend Challenge

A transactional wagering backend built with NestJS, TypeScript, PostgreSQL, MikroORM, Bun, and SQS-compatible messaging.

This project focuses on financial correctness: exact monetary arithmetic, wallet concurrency control, idempotent transaction processing, an immutable ledger, and reliable event publication through the Transactional Outbox pattern.

Original challenge: https://github.com/junglegaming/backend-challenge

## Features

- Wallet management with balance and version tracking.
- Wager processing for BET, WIN, LOSS, REFUND, and ROLLBACK.
- Decimal.js for monetary arithmetic; no JavaScript floating-point calculations for money.
- PostgreSQL transactions coordinated through a Unit of Work.
- Business idempotency using provider-scoped idempotency keys and payload hashes.
- Pessimistic wallet locking and optimistic version checks.
- Immutable ledger entries for balance-changing operations.
- Inbound SQS consumer for wager requests.
- Transactional Outbox worker with retries and dead-letter queues.
- Unit and integration tests.

## Stack

| Area | Technology |
|---|---|
| Runtime / package manager | Bun |
| Framework | NestJS 12 |
| Language | TypeScript |
| Database | PostgreSQL 17 |
| ORM / migrations | MikroORM 7 |
| Money | Decimal.js |
| Messaging | AWS SDK for JavaScript v3 |
| Local SQS-compatible broker | ElasticMQ |
| Tests | Bun Test / Jest tooling |

## Architecture

The application separates domain behavior, application use cases, and infrastructure adapters.

- Wallet domain: money, wallet behavior, and ledger entries.
- Wagering domain: transaction kinds, statuses, references, and state transitions.
- Application layer: coordinates wager processing through a Unit of Work.
- Persistence: MikroORM repositories and a transaction-scoped EntityManager.
- Messaging: inbound SQS consumer, Outbox publisher, and background worker.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for component responsibilities and processing flows.

## Local setup

### Prerequisites

- Bun
- Docker Desktop
- Git

### 1. Install dependencies

    bun install

### 2. Configure environment

Create a local .env file based on .env.example.

    POSTGRES_DB=jungle_gaming
    POSTGRES_USER=jungle_user
    POSTGRES_PASSWORD=jungle_dev_password
    POSTGRES_PORT=5432
    POSTGRES_HOST=localhost

    SQS_ENDPOINT=http://localhost:9324
    SQS_QUEUE_URL=http://localhost:9324/000000000000/jungle-events
    SQS_WAGER_QUEUE_URL=http://localhost:9324/000000000000/wager-transactions.fifo

    AWS_REGION=us-east-1
    AWS_ACCESS_KEY_ID=test
    AWS_SECRET_ACCESS_KEY=test

The AWS credentials above are local placeholders for ElasticMQ. Do not use them with a real AWS account. Keep .env out of version control.

### 3. Start PostgreSQL and ElasticMQ

    docker compose up -d

| Service | Address | Purpose |
|---|---|---|
| PostgreSQL | localhost:5432 | Application database |
| ElasticMQ | localhost:9324 | Local SQS-compatible broker |

### 4. Create the queues

    bun run scripts/setup-sqs.ts

This creates the outbound standard queue and inbound FIFO queue, each with a dead-letter queue.

### 5. Apply migrations

    bun run migration:up

### 6. Start the application

Development mode:

    bun run start:dev

Standard mode:

    bun run start

The messaging module starts the inbound wager consumer and Outbox worker during application startup.

## Tests and build

    bun test
    bun run build

Optional static analysis:

    bun run lint

## Inbound wager message

The consumer expects this JSON envelope:

~~~json
{
  "messageId": "unique-message-id",
  "type": "WagerTransactionRequested",
  "occurredAt": "2026-11-08T12:00:00.000Z",
  "data": {
    "providerId": "provider-1",
    "externalTransactionId": "external-transaction-1",
    "idempotencyKey": "idempotency-key-1",
    "playerId": "player-uuid",
    "walletId": "wallet-uuid",
    "roundId": "round-1",
    "gameId": "game-1",
    "kind": "BET",
    "money": {
      "amount": "10.00",
      "currency": "BRL"
    }
  }
}
~~~

REFUND and ROLLBACK messages must also include referenceExternalTransactionId in data. Amounts are decimal strings to avoid precision loss.

A local sample message can be sent with:

    bun run scripts/send-test-wager.ts

The helper uses a predefined wallet ID. Ensure that wallet exists and has sufficient funds before running the sample.

## Transaction rules

| Kind | Wallet effect | Reference |
|---|---|---|
| BET | Debit | Not required |
| WIN | Credit | Not required |
| LOSS | No balance change | Not required |
| REFUND | Credit | Processed BET required |
| ROLLBACK | Reverse referenced operation | Supported processed transaction required |

Additional rules:

- OPENING belongs to the wallet-opening flow and is not accepted by the wager-processing use case.
- Debits that exceed the available balance are rejected.
- A REFUND or ROLLBACK cannot be applied more than once for the same reference and operation kind.
- An idempotent replay returns the persisted result instead of applying the financial operation again.

## Messaging guarantees

- Inbound messages are acknowledged after successful use-case completion.
- Failed messages can be retried and eventually moved to the inbound dead-letter queue.
- Outbox events are persisted in the same database transaction as the business operation.
- Outbox delivery is at least once, not exactly once. Downstream consumers should deduplicate events using a stable event identifier.
- ElasticMQ is used for local development. This project has not been validated against a live AWS account as part of local integration testing.

## Main tables

- wallets: current balance, currency, player ownership, and version.
- wager_transactions: provider transaction identity, status, idempotency data, references, and resulting balance.
- wallet_ledger_entries: immutable debit/credit records and before/after balances.
- inbox_messages: consumed message identifiers and payload hashes.
- outbox_events: events awaiting publication, retry metadata, and publication timestamp.

## Project structure

    src/
      database/
      modules/
        shared/
          application/
            ports/
            services/
            workers/
          infrastructure/
            messaging/
            persistence/
        wallet/
          application/
          domain/
          infrastructure/
        wagering/
          application/
          domain/
          infrastructure/
    migrations/
    scripts/
    test/

## Current boundaries

- Wager commands currently enter through SQS; a public HTTP wager endpoint is not exposed.
- ElasticMQ validates the local SQS integration path. AWS IAM, cloud deployment, and production infrastructure are outside the scope of this local setup.
- Production use requires environment-specific secrets, IAM policies, queue configuration, monitoring, and operational alerting.
