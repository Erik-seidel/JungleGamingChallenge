
import {
    Entity,
    PrimaryKey,
    Property,
    Unique,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'wallets' })
@Unique({
    properties: ['playerId', 'currency'],
})
export class WalletOrmEntity {
    @PrimaryKey({ type: 'uuid' })
    id!: string;

    @Property({ type: 'uuid' })
    playerId!: string;

    @Property({ type: 'string', length: 3 })
    currency!: string;

    @Property({ type: 'numeric', precision: 20, scale: 2 })
    balance!: string;

    @Property({ type: 'integer' })
    version!: number;

    @Property({ type: 'Date' })
    createdAt!: Date;

    @Property({ type: 'Date' })
    updatedAt!: Date;
}
