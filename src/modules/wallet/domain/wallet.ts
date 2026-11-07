
import { Money } from './money';

export interface OpenWalletProps {
    id: string;
    playerId: string;
    initialBalance: Money;
}

export interface WalletState {
    id: string;
    playerId: string;
    currency: string;
    balance: Money;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}

export class Wallet {
    private constructor(
        public readonly id: string,
        public readonly playerId: string,
        public readonly currency: string,
        private _balance: Money,
        private _version: number,
        private readonly _createdAt: Date,
        private _updatedAt: Date,
    ) { }

    static open(props: OpenWalletProps): Wallet {
        const { id, playerId, initialBalance } = props;

        if (!id.trim() || !playerId.trim()) {
            throw new Error('Wallet id and playerId are required');
        }

        if (initialBalance.isNegative()) {
            throw new Error('Initial balance cannot be negative');
        }

        return new Wallet(
            id,
            playerId,
            initialBalance.currency,
            initialBalance,
            1,
            new Date(),
            new Date(),
        );
    }

    static rehydrate(state: WalletState): Wallet {
        this.validateState(state);

        return new Wallet(
            state.id,
            state.playerId,
            state.currency,
            state.balance,
            state.version,
            new Date(state.createdAt),
            new Date(state.updatedAt),
        );
    }

    private static validateState(state: WalletState): void {
        if (!state || typeof state !== 'object') {
            throw new Error('Invalid wallet state');
        }

        if (
            typeof state.id !== 'string' ||
            !state.id.trim() ||
            typeof state.playerId !== 'string' ||
            !state.playerId.trim()
        ) {
            throw new Error('Wallet id and playerId are required');
        }

        if (!(state.balance instanceof Money)) {
            throw new Error('Invalid wallet balance');
        }

        if (state.balance.isNegative()) {
            throw new Error('Wallet balance cannot be negative');
        }

        if (
            typeof state.currency !== 'string' ||
            state.currency !== state.balance.currency
        ) {
            throw new Error('Wallet currency mismatch');
        }

        if (!Number.isSafeInteger(state.version) || state.version < 1) {
            throw new Error('Invalid wallet version');
        }

        if (
            !(state.createdAt instanceof Date) ||
            Number.isNaN(state.createdAt.getTime())
        ) {
            throw new Error('Invalid wallet creation date');
        }

        if (
            !(state.updatedAt instanceof Date) ||
            Number.isNaN(state.updatedAt.getTime())
        ) {
            throw new Error('Invalid wallet update date');
        }
    }

    get balance(): Money {
        return this._balance;
    }

    get version(): number {
        return this._version;
    }

    get createdAt(): Date {
        return new Date(this._createdAt);
    }

    get updatedAt(): Date {
        return new Date(this._updatedAt);
    }

    debit(amount: Money, at: Date = new Date()): void {
        this.assertSameCurrency(amount);
        this.assertPositiveAmount(amount);

        if (amount.isZero()) {
            return;
        }

        const newBalance = this._balance.subtract(amount);

        if (newBalance.isNegative()) {
            throw new Error('Insufficient wallet balance');
        }

        this.applyBalanceChange(newBalance, at);
    }

    credit(amount: Money, at: Date = new Date()): void {
        this.assertSameCurrency(amount);
        this.assertPositiveAmount(amount);

        if (amount.isZero()) {
            return;
        }

        const newBalance = this._balance.add(amount);

        this.applyBalanceChange(newBalance, at);
    }

    private assertSameCurrency(amount: Money): void {
        if (this.currency !== amount.currency) {
            throw new Error(
                `Currency mismatch: ${this.currency} and ${amount.currency}`,
            );
        }
    }

    private assertPositiveAmount(amount: Money): void {
        if (amount.isNegative()) {
            throw new Error('Wallet movement amount cannot be negative');
        }
    }

    private applyBalanceChange(
        newBalance: Money,
        at: Date,
    ): void {
        if (Number.isNaN(at.getTime())) {
            throw new Error('Invalid wallet movement date');
        }

        this._balance = newBalance;
        this._version += 1;
        this._updatedAt = new Date(at);
    }
}
