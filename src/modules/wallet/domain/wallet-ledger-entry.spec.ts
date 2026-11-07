import { Money } from './money';
import { LedgerDirection } from './ledger-direction';
import { WalletLedgerEntry } from './wallet-ledger-entry';

describe('WalletLedgerEntry', () => {
    const createMoney = (amount: string, currency = 'BRL') =>
        Money.from({ amount, currency });

    const createProps = (overrides: Record<string, unknown> = {}) => ({
        id: 'ledger-123',
        walletId: 'wallet-123',
        transactionId: 'transaction-123',
        direction: LedgerDirection.CREDIT,
        money: createMoney('25.00'),
        balanceBefore: createMoney('100.00'),
        balanceAfter: createMoney('125.00'),
        createdAt: new Date('2026-01-01T10:00:00Z'),
        ...overrides,
    });

    describe('creation', () => {
        it('should create a valid CREDIT entry', () => {
            const entry = WalletLedgerEntry.create(createProps());

            expect(entry.direction).toBe(LedgerDirection.CREDIT);
            expect(entry.money.toString()).toBe('25.00');
            expect(entry.balanceBefore.toString()).toBe('100.00');
            expect(entry.balanceAfter.toString()).toBe('125.00');
            expect(entry.isBalanced()).toBe(true);
        });

        it('should create a valid DEBIT entry', () => {
            const entry = WalletLedgerEntry.create(
                createProps({
                    direction: LedgerDirection.DEBIT,
                    balanceBefore: createMoney('100.00'),
                    balanceAfter: createMoney('75.00'),
                }),
            );

            expect(entry.direction).toBe(LedgerDirection.DEBIT);
            expect(entry.balanceAfter.toString()).toBe('75.00');
            expect(entry.isBalanced()).toBe(true);
        });

        it('should reject an unbalanced CREDIT entry', () => {
            expect(() =>
                WalletLedgerEntry.create(
                    createProps({
                        balanceAfter: createMoney('120.00'),
                    }),
                ),
            ).toThrow();
        });

        it('should reject an unbalanced DEBIT entry', () => {
            expect(() =>
                WalletLedgerEntry.create(
                    createProps({
                        direction: LedgerDirection.DEBIT,
                        balanceAfter: createMoney('80.00'),
                    }),
                ),
            ).toThrow();
        });

        it('should reject different currencies', () => {
            expect(() =>
                WalletLedgerEntry.create(
                    createProps({
                        money: createMoney('25.00', 'USD'),
                    }),
                ),
            ).toThrow();
        });

        it('should reject an empty ledger entry ID', () => {
            expect(() =>
                WalletLedgerEntry.create(createProps({ id: '' })),
            ).toThrow();
        });

        it('should reject an empty wallet ID', () => {
            expect(() =>
                WalletLedgerEntry.create(createProps({ walletId: '' })),
            ).toThrow();
        });

        it('should reject an empty transaction ID', () => {
            expect(() =>
                WalletLedgerEntry.create(createProps({ transactionId: '' })),
            ).toThrow();
        });

        it('should reject an invalid direction', () => {
            expect(() =>
                WalletLedgerEntry.create(createProps({ direction: 'INVALID' })),
            ).toThrow();
        });

        it('should reject an invalid creation date', () => {
            expect(() =>
                WalletLedgerEntry.create(
                    createProps({ createdAt: new Date('invalid') }),
                ),
            ).toThrow();
        });
    });

    describe('rehydration', () => {
        it('should restore an unbalanced persisted entry without revalidating the balance', () => {
            const state = createProps({
                balanceAfter: createMoney('120.00'),
            });

            const entry = WalletLedgerEntry.rehydrate(state);

            expect(entry.balanceAfter.toString()).toBe('120.00');
            expect(entry.isBalanced()).toBe(false);
        });
        it('should restore a persisted ledger entry', () => {
            const state = createProps();
            const entry = WalletLedgerEntry.rehydrate(state);

            expect(entry.id).toBe(state.id);
            expect(entry.walletId).toBe(state.walletId);
            expect(entry.transactionId).toBe(state.transactionId);
            expect(entry.direction).toBe(state.direction);
            expect(entry.money.toString()).toBe('25.00');
            expect(entry.balanceBefore.toString()).toBe('100.00');
            expect(entry.balanceAfter.toString()).toBe('125.00');
            expect(entry.createdAt).toEqual(state.createdAt);
        });
    });

    describe('immutability', () => {
        it('should freeze the ledger entry', () => {
            const entry = WalletLedgerEntry.create(createProps());

            expect(Object.isFrozen(entry)).toBe(true);
        });

        it('should not retain a mutable reference to the original creation date', () => {
            const createdAt = new Date('2026-01-01T10:00:00Z');
            const entry = WalletLedgerEntry.create(createProps({ createdAt }));

            createdAt.setFullYear(2000);

            expect(entry.createdAt.getFullYear()).toBe(2026);
        });
        it('should not expose a mutable internal creation date', () => {
            const entry = WalletLedgerEntry.create(createProps());

            const date = entry.createdAt;
            date.setFullYear(2000);

            expect(entry.createdAt.getFullYear()).toBe(2026);
        });
    });
});
