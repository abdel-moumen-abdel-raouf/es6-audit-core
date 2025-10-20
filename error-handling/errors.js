/**
 * Custom error class for logging-related errors.
 * Provides better error tracking and handling specific to the logging system.
 */
export class LoggingError extends Error {
    /**
     * Flexible constructor supporting both (message) and (code, message, context).
     * @param {string} codeOrMessage - Either an error code or the error message
     * @param {string} [message] - The error message when first arg is a code
     * @param {Object} [context={}] - Additional context information
     */
    constructor(codeOrMessage, message, context = {}) {
        // Support signature: new LoggingError('Some message')
        // and: new LoggingError('ERROR_CODE', 'Some message', { ... })
        const isSingleArg = message === undefined && (typeof codeOrMessage === 'string');
        const finalMessage = isSingleArg ? codeOrMessage : (message ?? String(codeOrMessage));
        super(finalMessage);

        this.name = 'LoggingError';
        this.code = isSingleArg ? 'UNKNOWN' : String(codeOrMessage);
        this.context = context || {};

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LoggingError);
        }
    }
}
