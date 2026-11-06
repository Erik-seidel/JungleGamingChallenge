
import { Money } from './money';

describe('Money', () => {
    describe('creation', () => {
        it('should create a valid monetary value', () => {
            const money = Money.from({
                amount: '25.50',
                currency: 'BRL',
            });

            expect(money.toString()).toBe('25.50');
            expect(money.currency).toBe('BRL');
        });

        it('should format integer values with two decimal places', () => {
            const money = Money.from({
                amount: '25',
                currency: 'BRL',
            });

            expect(money.toString()).toBe('25.00');
        });

        it('should reject values with more than two decimal places', () => {
            expect(() =>
                Money.from({
                    amount: '10.555',
                    currency: 'BRL',
                }),
            ).toThrow();
        });

        it('should reject negative input values', () => {
            expect(() =>
                Money.from({
                    amount: '-10.00',
                    currency: 'BRL',
                }),
            ).toThrow();
        });

        it('should reject scientific notation', () => {
            expect(() =>
                Money.from({
                    amount: '1e3',
                    currency: 'BRL',
                }),
            ).toThrow();
        });

        it('should reject invalid currency codes', () => {
            expect(() =>
                Money.from({
                    amount: '10.00',
                    currency: 'INVALID',
                }),
            ).toThrow();
        });

        it('should create a zero value', () => {
            const money = Money.zero('BRL');

            expect(money.toString()).toBe('0.00');
            expect(money.isZero()).toBe(true);
        });
    });

    describe('arithmetic operations', () => {
        it('should add monetary values correctly', () => {
            const a = Money.from({ amount: '10.50', currency: 'BRL' });
            const b = Money.from({ amount: '5.25', currency: 'BRL' });

            expect(a.add(b).toString()).toBe('15.75');
        });

        it('should preserve decimal precision', () => {
            const a = Money.from({ amount: '0.10', currency: 'BRL' });
            const b = Money.from({ amount: '0.20', currency: 'BRL' });

            expect(a.add(b).toString()).toBe('0.30');
        });

        it('should subtract monetary values correctly', () => {
            const a = Money.from({ amount: '20.00', currency: 'BRL' });
            const b = Money.from({ amount: '5.50', currency: 'BRL' });

            expect(a.subtract(b).toString()).toBe('14.50');
        });

        it('should allow negative results from subtraction', () => {
            const a = Money.from({ amount: '5.00', currency: 'BRL' });
            const b = Money.from({ amount: '10.00', currency: 'BRL' });

            const result = a.subtract(b);

            expect(result.toString()).toBe('-5.00');
            expect(result.isNegative()).toBe(true);
        });

        it('should negate a monetary value', () => {
            const money = Money.from({
                amount: '10.00',
                currency: 'BRL',
            });

            expect(money.negate().toString()).toBe('-10.00');
        });

        it('should reject operations between different currencies', () => {
            const brl = Money.from({ amount: '10.00', currency: 'BRL' });
            const usd = Money.from({ amount: '10.00', currency: 'USD' });

            expect(() => brl.add(usd)).toThrow();
            expect(() => brl.subtract(usd)).toThrow();
        });
    });

    describe('comparisons', () => {
        it('should compare monetary values', () => {
            const a = Money.from({ amount: '10.00', currency: 'BRL' });
            const b = Money.from({ amount: '20.00', currency: 'BRL' });

            expect(a.isLessThan(b)).toBe(true);
            expect(a.equals(b)).toBe(false);
        });

        it('should identify equal monetary values', () => {
            const a = Money.from({ amount: '10.00', currency: 'BRL' });
            const b = Money.from({ amount: '10.00', currency: 'BRL' });

            expect(a.equals(b)).toBe(true);
        });

        it('should reject comparisons between different currencies', () => {
            const brl = Money.from({ amount: '10.00', currency: 'BRL' });
            const usd = Money.from({ amount: '10.00', currency: 'USD' });

            expect(() => brl.equals(usd)).toThrow();
            expect(() => brl.isLessThan(usd)).toThrow();
        });
    });

    describe('immutability', () => {
        it('should not modify the original value after addition', () => {
            const original = Money.from({
                amount: '10.00',
                currency: 'BRL',
            });

            original.add(
                Money.from({ amount: '5.00', currency: 'BRL' }),
            );

            expect(original.toString()).toBe('10.00');
        });

        it('should be frozen', () => {
            const money = Money.from({
                amount: '10.00',
                currency: 'BRL',
            });

            expect(Object.isFrozen(money)).toBe(true);
        });
    });

    describe('serialization', () => {
        it('should serialize money as strings', () => {
            const money = Money.from({
                amount: '25.50',
                currency: 'BRL',
            });

            expect(money.toJSON()).toEqual({
                amount: '25.50',
                currency: 'BRL',
            });
        });
    });
});
