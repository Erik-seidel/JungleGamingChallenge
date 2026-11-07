
import { Migration } from '@mikro-orm/migrations';

export class Migration20261107200414 extends Migration {
  override name = 'Migration20261107200414';

  override up(): void {
    // Wallets
    this.addSql(`
      create table "wallets" (
        "id" uuid not null,
        "player_id" uuid not null,
        "currency" varchar(3) not null,
        "balance" numeric(20,2) not null,
        "version" int not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        primary key ("id"),
        constraint "wallets_player_id_currency_unique"
          unique ("player_id", "currency"),
        constraint "wallets_id_player_currency_unique"
          unique ("id", "player_id", "currency"),
        constraint "wallets_id_currency_unique"
          unique ("id", "currency"),
        constraint "wallets_balance_non_negative"
          check ("balance" >= 0),
        constraint "wallets_version_positive"
          check ("version" >= 1),
        constraint "wallets_currency_format"
          check ("currency" ~ '^[A-Z]{3}$')
      );
    `);

    // Wager transactions
    this.addSql(`
      create table "wager_transactions" (
        "id" uuid not null,
        "provider_id" varchar(255) null,
        "external_transaction_id" varchar(255) null,
        "idempotency_key" varchar(255) null,
        "payload_hash" varchar(255) null,
        "wallet_id" uuid not null,
        "player_id" uuid not null,
        "round_id" varchar(255) null,
        "game_id" varchar(255) null,
        "kind" varchar(20) not null,
        "amount" numeric(20,2) not null,
        "currency" varchar(3) not null,
        "reference_external_transaction_id" varchar(255) null,
        "reference_transaction_id" uuid null,
        "status" varchar(30) not null,
        "failure_code" varchar(255) null,
        "created_at" timestamptz not null,
        "processed_at" timestamptz null,

        primary key ("id"),

        constraint "wager_transactions_provider_id_idempotency_key_unique"
          unique ("provider_id", "idempotency_key"),

        constraint "wager_transactions_provider_id_external_transaction_id_unique"
          unique ("provider_id", "external_transaction_id"),

        constraint "wager_transactions_id_wallet_unique"
          unique ("id", "wallet_id"),

        constraint "wager_transactions_id_wallet_currency_unique"
          unique ("id", "wallet_id", "currency"),

        constraint "wager_transactions_wallet_player_currency_fk"
          foreign key ("wallet_id", "player_id", "currency")
          references "wallets" ("id", "player_id", "currency")
          on delete restrict,

        constraint "wager_transactions_reference_wallet_fk"
          foreign key ("reference_transaction_id", "wallet_id")
          references "wager_transactions" ("id", "wallet_id")
          on delete restrict,

        constraint "wager_transactions_kind_valid"
          check ("kind" in (
            'OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'
          )),

        constraint "wager_transactions_status_valid"
          check ("status" in (
            'PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'
          )),

        constraint "wager_transactions_amount_non_negative"
          check ("amount" >= 0),

        constraint "wager_transactions_currency_format"
          check ("currency" ~ '^[A-Z]{3}$'),

        constraint "wager_transactions_metadata_valid"
          check (
            (
              "kind" = 'OPENING'
              and "provider_id" is null
              and "external_transaction_id" is null
              and "idempotency_key" is null
              and "payload_hash" is null
              and "round_id" is null
              and "game_id" is null
            )
            or
            (
              "kind" <> 'OPENING'
              and "provider_id" is not null
              and btrim("provider_id") <> ''
              and "external_transaction_id" is not null
              and btrim("external_transaction_id") <> ''
              and "idempotency_key" is not null
              and btrim("idempotency_key") <> ''
              and "payload_hash" is not null
              and btrim("payload_hash") <> ''
              and "round_id" is not null
              and btrim("round_id") <> ''
              and "game_id" is not null
              and btrim("game_id") <> ''
            )
          ),

        constraint "wager_transactions_reference_required"
          check (
            (
              "kind" not in ('REFUND', 'ROLLBACK')
              or (
                "reference_external_transaction_id" is not null
                and btrim("reference_external_transaction_id") <> ''
              )
            )
          )
      );
    `);

    // Wallet ledger entries
    this.addSql(`
      create table "wallet_ledger_entries" (
        "id" uuid not null,
        "wallet_id" uuid not null,
        "transaction_id" uuid not null,
        "direction" varchar(10) not null,
        "amount" numeric(20,2) not null,
        "currency" varchar(3) not null,
        "balance_before" numeric(20,2) not null,
        "balance_after" numeric(20,2) not null,
        "created_at" timestamptz not null,

        primary key ("id"),

        constraint "wallet_ledger_entries_wallet_id_transaction_id_unique"
          unique ("wallet_id", "transaction_id"),

        constraint "wallet_ledger_entries_wallet_currency_fk"
          foreign key ("wallet_id", "currency")
          references "wallets" ("id", "currency")
          on delete restrict,

        constraint "wallet_ledger_entries_transaction_wallet_currency_fk"
          foreign key ("transaction_id", "wallet_id", "currency")
          references "wager_transactions" ("id", "wallet_id", "currency")
          on delete restrict,

        constraint "wallet_ledger_entries_direction_valid"
          check ("direction" in ('CREDIT', 'DEBIT')),

        constraint "wallet_ledger_entries_amount_non_negative"
          check ("amount" >= 0),

        constraint "wallet_ledger_entries_balances_non_negative"
          check ("balance_before" >= 0 and "balance_after" >= 0),

        constraint "wallet_ledger_entries_currency_format"
          check ("currency" ~ '^[A-Z]{3}$'),

        constraint "wallet_ledger_entries_arithmetic_valid"
          check (
            (
              "direction" = 'CREDIT'
              and "balance_before" + "amount" = "balance_after"
            )
            or
            (
              "direction" = 'DEBIT'
              and "balance_before" - "amount" = "balance_after"
            )
          )
      );
    `);

    // Prevent UPDATE and DELETE on ledger entries.
    this.addSql(`
      create function prevent_wallet_ledger_entries_mutation()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'Wallet ledger entries are immutable';
      end;
      $$;
    `);

    this.addSql(`
      create trigger "wallet_ledger_entries_immutable"
      before update or delete
      on "wallet_ledger_entries"
      for each row
      execute function prevent_wallet_ledger_entries_mutation();
    `);

    // Prevent TRUNCATE from bypassing row-level immutability.
    this.addSql(`
      create trigger "wallet_ledger_entries_no_truncate"
      before truncate
      on "wallet_ledger_entries"
      for each statement
      execute function prevent_wallet_ledger_entries_mutation();
    `);
  }

  override down(): void {
    this.addSql(`
      drop table if exists "wallet_ledger_entries";
    `);

    this.addSql(`
      drop table if exists "wager_transactions";
    `);

    this.addSql(`
      drop table if exists "wallets";
    `);

    this.addSql(`
      drop function if exists prevent_wallet_ledger_entries_mutation();
    `);
  }
}
