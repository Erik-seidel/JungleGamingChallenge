import { WagerTransaction } from '../../domain/wager-transaction';

export interface WagerTransactionRepository {
    create(transaction: WagerTransaction): Promise<void>;
}
