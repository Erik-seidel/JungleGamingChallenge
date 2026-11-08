import { Wallet } from '../../domain/wallet';

export interface WalletRepository {
    findById(id: string): Promise<Wallet | null>;

    findByPlayerIdAndCurrency(
        playerId: string,
        currency: string,
    ): Promise<Wallet | null>;
    findByIdForUpdate(id: string): Promise<Wallet | null>;
    create(wallet: Wallet): Promise<void>;

    update(
        wallet: Wallet,
        expectedVersion: number,
    ): Promise<void>;
}