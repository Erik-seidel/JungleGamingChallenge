import { WagerTransaction } from '../../domain/wager-transaction';

export interface WagerTransactionRepository {
    create(transaction: WagerTransaction): Promise<void>;

    update(transaction: WagerTransaction): Promise<void>;

    findByProviderAndIdempotencyKey(
        providerId: string,
        idempotencyKey: string,
    ): Promise<WagerTransaction | null>;

    findByProviderAndExternalTransactionId(
        providerId: string,
        externalTransactionId: string,
    ): Promise<WagerTransaction | null>;

    findByProviderAndReferenceTransactionId(
        providerId: string,
        referenceTransactionId: string,
    ): Promise<WagerTransaction[]>;
}