import { Migration } from '@mikro-orm/migrations';

export class Migration20261108130000 extends Migration {
    override name = 'Migration20261108130000';

    override up(): void {
        this.addSql(`
            create unique index
            "wager_transactions_processed_reversal_unique"
            on "wager_transactions" (
                "provider_id",
                "reference_transaction_id",
                "kind"
            )
            where
                "status" = 'PROCESSED'
                and "kind" in ('REFUND', 'ROLLBACK')
                and "reference_transaction_id" is not null;
        `);
    }

    override down(): void {
        this.addSql(`
            drop index if exists
            "wager_transactions_processed_reversal_unique";
        `);
    }
}