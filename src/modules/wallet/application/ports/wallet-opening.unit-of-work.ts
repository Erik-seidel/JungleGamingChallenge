import { WalletRepository } from './wallet.repository';
import { WalletLedgerEntryRepository } from './wallet-ledger-entry.repository';
import { WagerTransactionRepository } from '../../../wagering/application/ports/wager-transaction.repository';
import { OutboxRepository } from '../../../shared/application/ports/outbox.repository';

export interface WalletOpeningRepositories {
    wallets: WalletRepository;
    wagerTransactions: WagerTransactionRepository;
    ledgerEntries: WalletLedgerEntryRepository;
    outbox: OutboxRepository;
}

export interface WalletOpeningUnitOfWork {
    execute<T>(
        operation: (
            repositories: WalletOpeningRepositories,
        ) => Promise<T>,
    ): Promise<T>;
}
