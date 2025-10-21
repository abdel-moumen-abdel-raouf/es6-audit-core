/**
 * Abstract base class for all logging transports.
 * Implements the Strategy Pattern for different logging outputs.
 *
 * All transport implementations must return a Promise from their log() method,
 * even if the operation is synchronous. This allows the Logger to properly
 * await all transports and ensure messages are written before process exit.
 */
export class BaseTransport {
  /**
   * Handles transport-level errors gracefully.
   * @param error - The error that occurred during logging.
   * @param entry - The log entry that was being processed when the error occurred.
   */
  handleError(error, entry) {
    // Last resort error handling - log to console without causing crashes
    try {
      console.error(`[LoggingError] Failed to write log entry in ${this.constructor.name}:`, {
        error: error instanceof Error ? error.message : String(error),
        originalEntry: entry.toString(),
      });
    } catch (e) {
      // Prevent error handler from crashing
      console.error('[LoggerCriticalError] Error handler itself failed', e);
    }
  }
}
