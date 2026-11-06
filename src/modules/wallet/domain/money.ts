
import Decimal from 'decimal.js';

export interface MoneyProps {
    amount: string;
    currency: string;
}

export class Money {
    private constructor(
        private readonly value: Decimal,
        public readonly currency: string,
    ) {
        Object.freeze(this);
    }

    static from(props: MoneyProps): Money {
        const { amount, currency } = props;

        if (
            typeof amount !== 'string' ||
            !/^\d+(\.\d{1,2})?$/.test(amount)
        ) {
            throw new Error('Invalid monetary amount');
        }

        this.validateCurrency(currency);

        return new Money(new Decimal(amount), currency);
    }

    static zero(currency: string): Money {
        this.validateCurrency(currency);

        return new Money(new Decimal(0), currency);
    }

    private static validateCurrency(currency: string): void {
        if (
            typeof currency !== 'string' ||
            !/^[A-Z]{3}$/.test(currency) ||
            !Intl.supportedValuesOf('currency').includes(currency)
        ) {
            throw new Error('Invalid currency code');
        }
    }

    private static fromDecimal(
        value: Decimal,
        currency: string,
    ): Money {
        if (!value.isFinite() || value.decimalPlaces() > 2) {
            throw new Error('Invalid monetary precision');
        }

        return new Money(value, currency);
    }

    private assertSameCurrency(other: Money): void {
        if (this.currency !== other.currency) {
            throw new Error(
                `Currency mismatch: ${this.currency} and ${other.currency}`,
            );
        }
    }

    add(other: Money): Money {
        this.assertSameCurrency(other);

        return Money.fromDecimal(
            this.value.plus(other.value),
            this.currency,
        );
    }

    subtract(other: Money): Money {
        this.assertSameCurrency(other);

        return Money.fromDecimal(
            this.value.minus(other.value),
            this.currency,
        );
    }

    negate(): Money {
        return Money.fromDecimal(
            this.value.negated(),
            this.currency,
        );
    }

    isZero(): boolean {
        return this.value.isZero();
    }

    isPositive(): boolean {
        return this.value.isPositive();
    }

    isNegative(): boolean {
        return this.value.isNegative();
    }

    isLessThan(other: Money): boolean {
        this.assertSameCurrency(other);

        return this.value.lessThan(other.value);
    }

    equals(other: Money): boolean {
        this.assertSameCurrency(other);

        return this.value.equals(other.value);
    }

    toString(): string {
        return this.value.toFixed(2);
    }

    toJSON(): MoneyProps {
        return {
            amount: this.toString(),
            currency: this.currency,
        };
    }
}
