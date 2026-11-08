import { MikroORM } from '@mikro-orm/postgresql';
import config from './mikro-orm.integration.config';

describe('PostgreSQL Integration', () => {
    let orm: MikroORM;

    beforeAll(async () => {
        orm = await MikroORM.init(config);
    });

    afterAll(async () => {
        await orm?.close(true);
    });

    it('should connect to PostgreSQL', async () => {
        const result = await orm.em.getConnection().execute(
            'SELECT 1 AS result',
        );

        expect(result[0].result).toBe(1);
    });

    it('should recognize all financial entities', () => {
        const metadata = orm.getMetadata();

        expect(metadata.get('WalletOrmEntity')).toBeDefined();
        expect(metadata.get('WalletLedgerEntryOrmEntity')).toBeDefined();
        expect(metadata.get('WagerTransactionOrmEntity')).toBeDefined();
        expect(metadata.get('OutboxEventOrmEntity')).toBeDefined();
    });
});
