import { BaseTransport } from './base-transport.js';
import { LogLevel } from '../utils/types.js';
/**
 * Transport that outputs log entries to the console with colored formatting.
 */
export class ConsoleTransport extends BaseTransport {
    constructor() {
        super(...arguments);
        this.colors = {
            [LogLevel.ERROR]: '\x1b[31m', // Red
            [LogLevel.WARN]: '\x1b[33m', // Yellow
            [LogLevel.INFO]: '\x1b[36m', // Cyan
            [LogLevel.DEBUG]: '\x1b[90m' // Gray
        };
        this.resetColor = '\x1b[0m';
    }
/**
 * Outputs a log entry to the console with appropriate coloring.
 * @param entry - The log entry to output.
 * @returns Promise that resolves after console output is complete.
 */
    log(entry) {
        try {
            const color = this.colors[entry.level] || this.resetColor;
            const levelName = LogLevel[entry.level];
            const timestamp = entry.timestamp.toISOString();
            const message = `${color}[${timestamp}] [${entry.moduleName}] [${levelName}]: ${entry.message}${this.resetColor}`;
            console.log(message);
            if (entry.context && Object.keys(entry.context).length > 0) {
                console.log(`${color}Context:${this.resetColor}`, entry.context);
            }
            // Return resolved promise for consistency with async transports
            return Promise.resolve();
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.handleError(err, entry);
            return Promise.reject(err);
        }
    }

    /**
     * Optional batch write method to support batched flushes
     */
    async write(entries) {
        for (const entry of entries) {
            // eslint-disable-next-line no-await-in-loop
            await this.log(entry);
        }
    }
}
