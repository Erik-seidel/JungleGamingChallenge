
import { Money } from './money';
import { Wallet } from './wallet';

describe('Wallet', () => {
    const createMoney = (amount: string) =>
        Money.from({ amount, currency: 'BRL' });

    const createWallet = (balance = '100.00') =>
        Wallet.open({
            id: 'wallet-123',
            playerId: 'player-123',
            initialBalance: createMoney(balance),
        });

    describe('creation', () => {
        it('should create a wallet with initial balance', () => {
            const wallet = createWallet('100.00');

            expect(wallet.id).toBe('wallet-123');
            expect(wallet.playerId).toBe('player-123');
            expect(wallet.currency).toBe('BRL');
            expect(wallet.balance.toString()).toBe('100.00');
            expect(wallet.version).toBe(1);
        });

        it('should create a wallet with zero balance', () => {
            const wallet = createWallet('0.00');

            expect(wallet.balance.isZero()).toBe(true);
            expect(wallet.version).toBe(1);
        });

        it('should reject negative initial balance', () => {
            const negativeBalance = createMoney('10.00').negate();

            expect(() =>
                Wallet.open({
                    id: 'wallet-123',
                    playerId: 'player-123',
                    initialBalance: negativeBalance,
                }),
            ).toThrow('Initial balance cannot be negative');
        });

        it('should reject missing identifiers', () => {
            expect(() =>
                Wallet.open({
                    id: '',
                    playerId: 'player-123',
                    initialBalance: createMoney('100.00'),
                }),
            ).toThrow();
        });
    });

    describe('debit', () => {
        it('should debit the wallet balance', () => {
            const wallet = createWallet();

            wallet.debit(createMoney('30.00'));

            expect(wallet.balance.toString()).toBe('70.00');
        });

        it('should reject debit when balance is insufficient', () => {
            const wallet = createWallet('50.00');

            expect(() =>
                wallet.debit(createMoney('60.00')),
            ).toThrow('Insufficient wallet balance');

            expect(wallet.balance.toString()).toBe('50.00');
        });

        it('should allow debit of the exact available balance', () => {
            const wallet = createWallet('50.00');

            wallet.debit(createMoney('50.00'));

            expect(wallet.balance.toString()).toBe('0.00');
        });

        it('should reject negative debit amounts', () => {
            const wallet = createWallet();
            const negativeAmount = createMoney('10.00').negate();

            expect(() => wallet.debit(negativeAmount)).toThrow();
        });

        it('should not change version when debiting zero', () => {
            const wallet = createWallet();

            wallet.debit(Money.zero('BRL'));

            expect(wallet.version).toBe(1);
            expect(wallet.balance.toString()).toBe('100.00');
        });
    });

    describe('credit', () => {
        it('should credit the wallet balance', () => {
            const wallet = createWallet();

            wallet.credit(createMoney('50.00'));

            expect(wallet.balance.toString()).toBe('150.00');
        });

        it('should reject negative credit amounts', () => {
            const wallet = createWallet();
            const negativeAmount = createMoney('10.00').negate();

            expect(() => wallet.credit(negativeAmount)).toThrow();
        });

        it('should not change version when crediting zero', () => {
            const wallet = createWallet();

            wallet.credit(Money.zero('BRL'));

            expect(wallet.version).toBe(1);
            expect(wallet.balance.toString()).toBe('100.00');
        });
    });

    describe('currency validation', () => {
        it('should reject debit with different currency', () => {
            const wallet = createWallet();
            const usd = Money.from({
                amount: '10.00',
                currency: 'USD',
            });

            expect(() => wallet.debit(usd)).toThrow('Currency mismatch');
        });

        it('should reject credit with different currency', () => {
            const wallet = createWallet();
            const usd = Money.from({
                amount: '10.00',
                currency: 'USD',
            });

            expect(() => wallet.credit(usd)).toThrow('Currency mismatch');
        });
    });

    describe('version control', () => {
        it('should increment version after debit', () => {
            const wallet = createWallet();

            wallet.debit(createMoney('10.00'));

            expect(wallet.version).toBe(2);
        });

        it('should increment version after credit', () => {
            const wallet = createWallet();

            wallet.credit(createMoney('10.00'));

            expect(wallet.version).toBe(2);
        });

        it('should increment version after multiple movements', () => {
            const wallet = createWallet();

            wallet.debit(createMoney('10.00'));
            wallet.credit(createMoney('20.00'));
            wallet.debit(createMoney('5.00'));

            expect(wallet.version).toBe(4);
            expect(wallet.balance.toString()).toBe('105.00');
        });
    });


    describe('rehydration', () => {
        const createRehydrationState = (
            overrides: Partial<Parameters<typeof Wallet.rehydrate>[0]> = {},
        ) => ({
            id: 'wallet-123',
            playerId: 'player-123',
            currency: 'BRL',
            balance: createMoney('75.00'),
            version: 5,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-02T10:00:00Z'),
            ...overrides,
        });

        it('should restore wallet state', () => {
            const state = createRehydrationState();
            const wallet = Wallet.rehydrate(state);

            expect(wallet.id).toBe('wallet-123');
            expect(wallet.balance.toString()).toBe('75.00');
            expect(wallet.version).toBe(5);
            expect(wallet.createdAt).toEqual(state.createdAt);
            expect(wallet.updatedAt).toEqual(state.updatedAt);
        });

        it('should reject empty wallet id', () => {
            expect(() =>
                Wallet.rehydrate(createRehydrationState({ id: '' })),
            ).toThrow();
        });

        it('should reject empty player id', () => {
            expect(() =>
                Wallet.rehydrate(createRehydrationState({ playerId: '' })),
            ).toThrow();
        });

        it('should reject negative balance', () => {
            expect(() =>
                Wallet.rehydrate(
                    createRehydrationState({
                        balance: createMoney('10.00').negate(),
                    }),
                ),
            ).toThrow();
        });

        it('should reject currency mismatch', () => {
            expect(() =>
                Wallet.rehydrate(
                    createRehydrationState({
                        currency: 'USD',
                    }),
                ),
            ).toThrow();
        });

        it('should reject zero version', () => {
            expect(() =>
                Wallet.rehydrate(createRehydrationState({ version: 0 })),
            ).toThrow();
        });

        it('should reject negative version', () => {
            expect(() =>
                Wallet.rehydrate(createRehydrationState({ version: -1 })),
            ).toThrow();
        });

        it('should reject fractional version', () => {
            expect(() =>
                Wallet.rehydrate(createRehydrationState({ version: 1.5 })),
            ).toThrow();
        });

        it('should reject invalid createdAt', () => {
            expect(() =>
                Wallet.rehydrate(
                    createRehydrationState({
                        createdAt: new Date('invalid'),
                    }),
                ),
            ).toThrow();
        });

        it('should reject invalid updatedAt', () => {
            expect(() =>
                Wallet.rehydrate(
                    createRehydrationState({
                        updatedAt: new Date('invalid'),
                    }),
                ),
            ).toThrow();
        });
    });


    describe('immutability of dates', () => {
        it('should not expose mutable internal dates', () => {
            const wallet = createWallet();
            const originalDate = wallet.createdAt;

            originalDate.setFullYear(2000);

            expect(wallet.createdAt.getFullYear()).not.toBe(2000);
        });
    });
});
