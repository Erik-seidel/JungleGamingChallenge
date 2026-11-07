import { Money } from './money';
import { LedgerDirection } from './ledger-direction';

export interface CreateLedgerEntryProps {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
    createdAt: Date;
}

export type LedgerEntryState = CreateLedgerEntryProps;

export class WalletLedgerEntry {
    private readonly _createdAt: Date;

    private constructor(
        public readonly id: string,
        public readonly walletId: string,
        public readonly transactionId: string,
        public readonly direction: LedgerDirection,
        public readonly money: Money,
        public readonly balanceBefore: Money,
        public readonly balanceAfter: Money,
        createdAt: Date,
    ) {
        this._createdAt = new Date(createdAt);
        Object.freeze(this);
    }

    static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
        this.validateProps(props);

        const entry = new WalletLedgerEntry(
            props.id,
            props.walletId,
            props.transactionId,
            props.direction,
            props.money,
            props.balanceBefore,
            props.balanceAfter,
            props.createdAt,
        );

        if (!entry.isBalanced()) {
            throw new Error('Unbalanced ledger entry');
        }

        return entry;
    }

    static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
        this.validateProps(state);

        return new WalletLedgerEntry(
            state.id,
            state.walletId,
            state.transactionId,
            state.direction,
            state.money,
            state.balanceBefore,
            state.balanceAfter,
            state.createdAt,
        );
    }

    private static validateProps(
        props: CreateLedgerEntryProps,
    ): void {
        if (!props || typeof props !== 'object') {
            throw new Error('Invalid ledger entry state');
        }

        if (
            typeof props.id !== 'string' ||
            !props.id.trim() ||
            typeof props.walletId !== 'string' ||
            !props.walletId.trim() ||
            typeof props.transactionId !== 'string' ||
            !props.transactionId.trim()
        ) {
            throw new Error('Ledger entry identifiers are required');
        }

        if (
            !Object.values(LedgerDirection).includes(props.direction)
        ) {
            throw new Error('Invalid ledger direction');
        }

        if (
            !(props.money instanceof Money) ||
            !(props.balanceBefore instanceof Money) ||
            !(props.balanceAfter instanceof Money)
        ) {
            throw new Error('Invalid ledger monetary values');
        }

        if (
            props.money.currency !== props.balanceBefore.currency ||
            props.money.currency !== props.balanceAfter.currency
        ) {
            throw new Error('Ledger entry currency mismatch');
        }

        if (
            !(props.createdAt instanceof Date) ||
            Number.isNaN(props.createdAt.getTime())
        ) {
            throw new Error('Invalid ledger entry creation date');
        }
    }

    get createdAt(): Date {
        return new Date(this._createdAt);
    }

    isBalanced(): boolean {
        const expectedBalance =
            this.direction === LedgerDirection.CREDIT
                ? this.balanceBefore.add(this.money)
                : this.balanceBefore.subtract(this.money);

        return expectedBalance.equals(this.balanceAfter);
    }
}
