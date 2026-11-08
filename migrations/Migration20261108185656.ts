import { Migration } from '@mikro-orm/migrations';

export class Migration20261108185656 extends Migration {
  override name = 'Migration20261108185656';

  override up(): void {
    this.addSql(`
            create table "inbox_messages" (
                "message_id" varchar(200) not null,
                "payload_hash" varchar(64) not null,
                "processed_at" timestamptz not null,
                constraint "inbox_messages_pkey"
                    primary key ("message_id")
            );
        `);
  }

  override down(): void {
    this.addSql(`
            drop table if exists "inbox_messages";
        `);
  }
}