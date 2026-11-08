
import { Money } from '../../wallet/domain/money';
import { LedgerDirection } from '../../wallet/domain/ledger-direction';
export enum WagerTransactionKind {
    OPENING = 'OPENING',
    BET = 'BET',
    WIN = 'WIN',
    LOSS = 'LOSS',
    REFUND = 'REFUND',
    ROLLBACK = 'ROLLBACK',
}

export enum WagerTransactionStatus {
    PENDING = 'PENDING',
    PENDING_REFERENCE = 'PENDING_REFERENCE',
    PROCESSED = 'PROCESSED',
    REJECTED = 'REJECTED',
    FAILED = 'FAILED',
}

export interface CreateWagerTransactionProps {
    id: string;
    providerId?: string;
    externalTransactionId?: string;
    idempotencyKey?: string;
    payloadHash?: string;
    walletId: string;
    playerId: string;
    roundId?: string;
    gameId?: string;
    kind: WagerTransactionKind;
    money: Money;
    referenceExternalTransactionId?: string;
    createdAt: Date;
}

export interface WagerTransactionState
    extends CreateWagerTransactionProps {
    status: WagerTransactionStatus;
    referenceTransactionId?: string;
    failureCode?: string;
    processedAt?: Date;
    balanceAfter?: Money;
}

export class WagerTransaction {
    private constructor(
        private readonly state: WagerTransactionState,
    ) {
        this.state = {
            ...state,
            balanceAfter: state.balanceAfter
                ? Money.from({
                    amount: state.balanceAfter.toString(),
                    currency: state.balanceAfter.currency,
                })
                : undefined,
            createdAt: new Date(state.createdAt),
            processedAt: state.processedAt
                ? new Date(state.processedAt)
                : undefined,
        };

        Object.freeze(this);
    }

    static create(
        props: CreateWagerTransactionProps,
    ): WagerTransaction {
        this.validateBaseProps(props);
        this.validateReferenceRequirement(
            props.kind,
            props.referenceExternalTransactionId,
        );

        return new WagerTransaction({
            ...props,
            status: WagerTransactionStatus.PENDING,
        });
    }

    static rehydrate(
        state: WagerTransactionState,
    ): WagerTransaction {
        this.validateBaseProps(state);
        this.validateReferenceRequirement(
            state.kind,
            state.referenceExternalTransactionId,
        );

        if (
            !Object.values(WagerTransactionStatus).includes(state.status)
        ) {
            throw new Error('Invalid transaction status');
        }

        if (
            state.processedAt !== undefined &&
            !this.isValidDate(state.processedAt)
        ) {
            throw new Error('Invalid processedAt date');
        }

        return new WagerTransaction(state);
    }

    private static validateBaseProps(
        props: CreateWagerTransactionProps,
    ): void {
        const requiredStrings = [
            props.id,
            props.walletId,
            props.playerId,
        ];

        if (
            requiredStrings.some(
                (value) => typeof value !== 'string' || value.trim() === '',
            )
        ) {
            throw new Error('Transaction contains invalid identifiers');
        }

        const externalMetadata = [
            props.providerId,
            props.externalTransactionId,
            props.idempotencyKey,
            props.payloadHash,
            props.roundId,
            props.gameId,
        ];

        if (props.kind === WagerTransactionKind.OPENING) {
            if (externalMetadata.some((value) => value !== undefined)) {
                throw new Error(
                    'Opening transaction cannot contain provider metadata',
                );
            }
        } else if (
            externalMetadata.some(
                (value) => typeof value !== 'string' || value.trim() === '',
            )
        ) {
            throw new Error('Transaction contains invalid identifiers');
        }

        if (!Object.values(WagerTransactionKind).includes(props.kind)) {
            throw new Error('Invalid transaction kind');
        }

        if (!(props.money instanceof Money)) {
            throw new Error('Transaction money must be a Money instance');
        }

        if (!this.isValidDate(props.createdAt)) {
            throw new Error('Invalid transaction creation date');
        }

        if (
            props.referenceExternalTransactionId !== undefined &&
            (typeof props.referenceExternalTransactionId !== 'string' ||
                props.referenceExternalTransactionId.trim() === '')
        ) {
            throw new Error('Invalid reference external transaction ID');
        }
    }

    private static validateReferenceRequirement(
        kind: WagerTransactionKind,
        referenceExternalTransactionId?: string,
    ): void {
        const requiresReference =
            kind === WagerTransactionKind.REFUND ||
            kind === WagerTransactionKind.ROLLBACK;

        if (requiresReference && !referenceExternalTransactionId) {
            throw new Error(
                `${kind} transaction requires a reference external transaction ID`,
            );
        }
    }

    private static isValidDate(value: Date): boolean {
        return value instanceof Date && !Number.isNaN(value.getTime());
    }

    get id(): string {
        return this.state.id;
    }

    get providerId(): string | undefined {
        return this.state.providerId;
    }

    get balanceAfter(): Money | undefined {
        return this.state.balanceAfter;
    }

    get externalTransactionId(): string | undefined {
        return this.state.externalTransactionId;
    }

    get idempotencyKey(): string | undefined {
        return this.state.idempotencyKey;
    }

    get payloadHash(): string | undefined {
        return this.state.payloadHash;
    }

    get walletId(): string {
        return this.state.walletId;
    }

    get playerId(): string {
        return this.state.playerId;
    }

    get roundId(): string | undefined {
        return this.state.roundId;
    }

    get gameId(): string | undefined {
        return this.state.gameId;
    }

    get kind(): WagerTransactionKind {
        return this.state.kind;
    }

    get money(): Money {
        return this.state.money;
    }

    get referenceExternalTransactionId(): string | undefined {
        return this.state.referenceExternalTransactionId;
    }

    get status(): WagerTransactionStatus {
        return this.state.status;
    }

    get referenceTransactionId(): string | undefined {
        return this.state.referenceTransactionId;
    }

    get failureCode(): string | undefined {
        return this.state.failureCode;
    }

    get createdAt(): Date {
        return new Date(this.state.createdAt);
    }

    get processedAt(): Date | undefined {
        return this.state.processedAt
            ? new Date(this.state.processedAt)
            : undefined;
    }

    private ensureNonTerminal(): void {
        if (this.isTerminal()) {
            throw new Error('Cannot change a terminal transaction');
        }
    }

    private ensurePending(): void {
        if (
            this.state.status !== WagerTransactionStatus.PENDING &&
            this.state.status !== WagerTransactionStatus.PENDING_REFERENCE
        ) {
            throw new Error('Invalid transaction state transition');
        }
    }

    markProcessed(
        referenceTransactionId: string | undefined,
        at: Date,
        balanceAfter: Money,
    ): void {
        this.ensureNonTerminal();
        this.ensurePending();

        if (!WagerTransaction.isValidDate(at)) {
            throw new Error('Invalid processedAt date');
        }
        if (
            !(balanceAfter instanceof Money) ||
            balanceAfter.currency !== this.state.money.currency
        ) {
            throw new Error('Invalid resulting balance');
        }
        if (
            referenceTransactionId !== undefined &&
            (typeof referenceTransactionId !== 'string' ||
                referenceTransactionId.trim() === '')
        ) {
            throw new Error('Invalid reference transaction ID');
        }

        this.state.status = WagerTransactionStatus.PROCESSED;
        this.state.referenceTransactionId = referenceTransactionId;
        this.state.processedAt = new Date(at);
        this.state.balanceAfter = balanceAfter;
    }

    markPendingReference(balanceAfter: Money): void {
        if (
            this.state.kind !== WagerTransactionKind.REFUND &&
            this.state.kind !== WagerTransactionKind.ROLLBACK
        ) {
            throw new Error(
                'Only REFUND and ROLLBACK can have pending references',
            );
        }

        if (this.state.status !== WagerTransactionStatus.PENDING) {
            throw new Error(
                'Only pending transactions can wait for a reference',
            );
        }

        if (balanceAfter.currency !== this.state.money.currency) {
            throw new Error('Balance currency mismatch');
        }

        this.state.status = WagerTransactionStatus.PENDING_REFERENCE;
        this.state.balanceAfter = balanceAfter;
    }

    reject(code: string, balanceAfter: Money): void {
        this.ensureNonTerminal();
        this.ensurePending();

        if (typeof code !== 'string' || code.trim() === '') {
            throw new Error('Invalid failure code');
        }

        if (
            !(balanceAfter instanceof Money) ||
            balanceAfter.currency !== this.state.money.currency
        ) {
            throw new Error('Balance currency mismatch');
        }

        this.state.status = WagerTransactionStatus.REJECTED;
        this.state.failureCode = code;
        this.state.balanceAfter = balanceAfter;
    }

    fail(code: string): void {
        this.ensureNonTerminal();
        this.ensurePending();

        if (typeof code !== 'string' || code.trim() === '') {
            throw new Error('Invalid failure code');
        }

        this.state.status = WagerTransactionStatus.FAILED;
        this.state.failureCode = code;
    }

    isTerminal(): boolean {
        return (
            this.state.status === WagerTransactionStatus.PROCESSED ||
            this.state.status === WagerTransactionStatus.REJECTED ||
            this.state.status === WagerTransactionStatus.FAILED
        );
    }

    affectsBalance(): boolean {
        return this.state.kind !== WagerTransactionKind.LOSS;
    }
    ledgerDirectionFor(
        reference?: WagerTransaction,
    ): LedgerDirection {
        switch (this.kind) {
            case WagerTransactionKind.OPENING:
            case WagerTransactionKind.WIN:
            case WagerTransactionKind.REFUND:
                return LedgerDirection.CREDIT;

            case WagerTransactionKind.BET:
                return LedgerDirection.DEBIT;

            case WagerTransactionKind.LOSS:
                throw new Error(
                    'LOSS transaction does not generate a ledger entry',
                );

            case WagerTransactionKind.ROLLBACK:
                if (!reference) {
                    throw new Error(
                        'ROLLBACK transaction requires a resolved reference',
                    );
                }

                switch (reference.kind) {
                    case WagerTransactionKind.BET:
                        return LedgerDirection.CREDIT;

                    case WagerTransactionKind.WIN:
                    case WagerTransactionKind.REFUND:
                        return LedgerDirection.DEBIT;

                    case WagerTransactionKind.LOSS:
                    case WagerTransactionKind.ROLLBACK:
                        throw new Error(
                            `Cannot rollback a ${reference.kind} transaction`,
                        );
                }
        }

        throw new Error('Unsupported transaction kind');
    }

    requiresReference(): boolean {
        return (
            this.state.kind === WagerTransactionKind.REFUND ||
            this.state.kind === WagerTransactionKind.ROLLBACK
        );
    }

    matchesPayload(payloadHash: string): boolean {
        return (
            this.state.payloadHash !== undefined &&
            this.state.payloadHash === payloadHash
        );
    }

}
