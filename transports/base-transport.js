/**
 * Abstract base class for all logging transports.
 * Implements the Strategy Pattern for different logging outputs.
 *
 * All transport implementations must return a Promise from their log() method,
 * even if the operation is synchronous. This allows the Logger to properly
 * await all transports and ensure messages are written before process exit.
 */
export class BaseTransport {
  constructor(options = {}) {
    /**
     * Optional error handler shared from the logger. Signature: (error, context?) => void
     */
    this._errorHandler = typeof options.errorHandler === 'function' ? options.errorHandler : null;
  }

  /**
   * Inject or update a process-wide error handler coming from the logger.
   * @param {(error: any, context?: any) => void} handler
   */
  setErrorHandler(handler) {
    this._errorHandler = typeof handler === 'function' ? handler : null;
  }
  /**
   * Handles transport-level errors gracefully.
   * @param error - The error that occurred during logging.
   * @param entry - The log entry that was being processed when the error occurred.
   */
  handleError(error, entry) {
    const payload = {
      transport: this.constructor?.name || 'UnknownTransport',
      error: error instanceof Error ? error : new Error(String(error)),
      entry: entry && typeof entry.toString === 'function' ? entry.toString() : String(entry),
    };
    // Prefer injected error handler from logger
    if (this._errorHandler) {
      try {
        this._errorHandler(payload.error, { source: 'transport', transport: payload.transport, entry: payload.entry });
        return;
      } catch (eh) {
        // fall through to console fallback
      }
    }
    // Last resort error handling - log to console without causing crashes
    try {
      // eslint-disable-next-line no-console
      console.error(`[LoggingError] Failed in ${payload.transport}:`, payload.error?.message || payload.error);
    } catch {}
  }
}
