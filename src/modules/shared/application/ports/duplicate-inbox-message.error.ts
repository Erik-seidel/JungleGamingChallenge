export class DuplicateInboxMessageError extends Error {
    constructor() {
        super('Inbox message already processed');
        this.name = 'DuplicateInboxMessageError';
    }
}