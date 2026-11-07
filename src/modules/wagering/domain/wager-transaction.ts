
import { Money } from '../../wallet/domain/money';

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
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
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
}

export class WagerTransaction {
    private constructor(
        private readonly state: WagerTransactionState,
    ) {
        this.state = {
            ...state,
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
            props.providerId,
            props.externalTransactionId,
            props.idempotencyKey,
            props.payloadHash,
            props.walletId,
            props.playerId,
            props.roundId,
            props.gameId,
        ];

        if (
            requiredStrings.some(
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

    get providerId(): string {
        return this.state.providerId;
    }

    get externalTransactionId(): string {
        return this.state.externalTransactionId;
    }

    get idempotencyKey(): string {
        return this.state.idempotencyKey;
    }

    get payloadHash(): string {
        return this.state.payloadHash;
    }

    get walletId(): string {
        return this.state.walletId;
    }

    get playerId(): string {
        return this.state.playerId;
    }

    get roundId(): string {
        return this.state.roundId;
    }

    get gameId(): string {
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
    ): void {
        this.ensureNonTerminal();
        this.ensurePending();

        if (!WagerTransaction.isValidDate(at)) {
            throw new Error('Invalid processedAt date');
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
    }

    markPendingReference(): void {
        this.ensureNonTerminal();

        if (this.state.status !== WagerTransactionStatus.PENDING) {
            throw new Error('Invalid transaction state transition');
        }

        if (!this.requiresReference()) {
            throw new Error('Transaction does not require a reference');
        }

        this.state.status = WagerTransactionStatus.PENDING_REFERENCE;
    }

    reject(code: string): void {
        this.ensureNonTerminal();
        this.ensurePending();

        if (typeof code !== 'string' || code.trim() === '') {
            throw new Error('Invalid failure code');
        }

        this.state.status = WagerTransactionStatus.REJECTED;
        this.state.failureCode = code;
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

    requiresReference(): boolean {
        return (
            this.state.kind === WagerTransactionKind.REFUND ||
            this.state.kind === WagerTransactionKind.ROLLBACK
        );
    }

    matchesPayload(payloadHash: string): boolean {
        return this.state.payloadHash === payloadHash;
    }

}
