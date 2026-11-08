export interface InboxMessage {
    readonly messageId: string;
    readonly payloadHash: string;
    readonly processedAt: Date;
}

export interface InboxRepository {
    findByMessageId(messageId: string): Promise<InboxMessage | null>;
    create(message: InboxMessage): Promise<void>;
}