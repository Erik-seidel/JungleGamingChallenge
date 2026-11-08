
import { Migration } from '@mikro-orm/migrations';

export class Migration20261108123000 extends Migration {

    override name = 'Migration20261108123000';

    override up(): void | Promise<void> {
        this.addSql(`
      alter table "wager_transactions"
      add column "balance_after" numeric(20, 2) null;
    `);
    }

    override down(): void | Promise<void> {
        this.addSql(`
      alter table "wager_transactions"
      drop column "balance_after";
    `);
    }

}
