import { WalletRepository } from '../../../wallet/application/ports/wallet.repository';
import { WalletLedgerEntryRepository } from '../../../wallet/application/ports/wallet-ledger-entry.repository';
import { WagerTransactionRepository } from './wager-transaction.repository';
import { OutboxRepository } from '../../../shared/application/ports/outbox.repository';
import { InboxRepository } from '../../../shared/application/ports/inbox.repository';

export interface WageringRepositories {
    wallets: WalletRepository;
    wagerTransactions: WagerTransactionRepository;
    ledgerEntries: WalletLedgerEntryRepository;
    outbox: OutboxRepository;
    inboxMessages: InboxRepository;
}

export interface WageringUnitOfWork {
    execute<T>(
        operation: (
            repositories: WageringRepositories,
        ) => Promise<T>,
    ): Promise<T>;
}