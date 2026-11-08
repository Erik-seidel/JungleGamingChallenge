import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry';

export interface WalletLedgerEntryRepository {
    create(entry: WalletLedgerEntry): Promise<void>;
}
