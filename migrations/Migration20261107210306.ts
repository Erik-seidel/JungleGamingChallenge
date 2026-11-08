import { Migration } from '@mikro-orm/migrations';

export class Migration20261107210306 extends Migration {

  override name = 'Migration20261107210306';

  override up(): void | Promise<void> {
    this.addSql(`
      create table "outbox_events" (
        "id" uuid not null,
        "aggregate_id" uuid not null,
        "event_type" varchar(64) not null,
        "payload" jsonb not null,
        "occurred_at" timestamptz not null,
        "attempts" integer not null default 0,
        "next_attempt_at" timestamptz not null default now(),
        "published_at" timestamptz null,
        "locked_until" timestamptz null,
        "claim_token" uuid null,
        "last_error" text null,
        "created_at" timestamptz not null default now(),

        constraint "outbox_events_pkey"
          primary key ("id"),

        constraint "outbox_events_type_valid"
          check ("event_type" in (
            'WagerTransactionProcessed',
            'WagerTransactionRejected',
            'WalletBalanceChanged',
            'WagerTransactionPendingReference'
          )),

        constraint "outbox_events_attempts_non_negative"
          check ("attempts" >= 0),

        constraint "outbox_events_payload_object"
          check (jsonb_typeof("payload") = 'object'),

        constraint "outbox_events_payload_envelope_valid"
  check (
    coalesce(
      (
        "payload" ?& ARRAY[
          'eventId',
          'eventType',
          'aggregateId',
          'correlationId',
          'occurredAt',
          'version',
          'data'
        ]
        and "payload"->>'eventId' = "id"::text
        and "payload"->>'eventType' = "event_type"
        and "payload"->>'aggregateId' = "aggregate_id"::text
        and nullif(btrim("payload"->>'correlationId'), '') is not null
        and nullif(btrim("payload"->>'occurredAt'), '') is not null
        and jsonb_typeof("payload"->'version') = 'number'
        and ("payload"->>'version') ~ '^[1-9][0-9]*$'
        and jsonb_typeof("payload"->'data') = 'object'
      ),
      false
    )
  ),

        constraint "outbox_events_claim_consistency"
          check (
            ("locked_until" is null and "claim_token" is null)
            or
            ("locked_until" is not null and "claim_token" is not null)
          ),

        constraint "outbox_events_published_unlocked"
          check (
            "published_at" is null
            or ("locked_until" is null and "claim_token" is null)
          )
      );
    `);

    this.addSql(`
      create index "outbox_events_pending_idx"
      on "outbox_events" ("next_attempt_at", "occurred_at", "id")
      where "published_at" is null;
    `);

    this.addSql(`
      create index "outbox_events_aggregate_idx"
      on "outbox_events" ("aggregate_id", "occurred_at");
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "outbox_events";`);
  }

}
