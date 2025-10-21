/**
 * Logger Worker Thread Integration
 *
 * Transparent worker thread integration for offloading logging operations:
 * - Worker thread pool management
 * - Transparent worker usage
 * - Performance monitoring
 *
 * @module LoggerWorkerIntegration
 * @version 1.0.0
 */

import { WorkerThreadPool } from './worker-thread-pool.js';

export class LoggerWorkerIntegration {
  static #workerPool = null;
  static #enabled = false;
  static #poolSize = 2;

  /**
   *
   */
  static enable(config = {}) {
    if (this.#enabled) {
      return this.#workerPool;
    }

    this.#poolSize = config.workerThreads ?? 2;
    this.#workerPool = new WorkerThreadPool({
      poolSize: this.#poolSize,
      timeout: config.workerTimeout ?? 5000,
      logger: config.logger || null,
    });

    this.#enabled = true;

    console.log(`[LoggerWorker] ✅ Worker thread pool initialized (size: ${this.#poolSize})`);

    return this.#workerPool;
  }

  /**
   *
   */
  static disable() {
    if (this.#enabled && this.#workerPool) {
      this.#workerPool?.terminate?.();
      this.#workerPool = null;
      this.#enabled = false;

      console.log('[LoggerWorker] ✅ Worker thread pool terminated');
    }
  }

  /**
   *
   */
  static getPool() {
    return this.#workerPool;
  }

  /**
   *
   */
  static async executeLoggingTask(task) {
    if (!this.#enabled || !this.#workerPool) {
      return task();
    }

    try {
      return await this.#workerPool.execute?.(task);
    } catch (error) {
      console.error('[LoggerWorker] Error executing task in worker:', error);
      // Fallback
      return task();
    }
  }

  /**
   *
   */
  static getStats() {
    if (!this.#workerPool) {
      return { enabled: false };
    }

    return {
      enabled: this.#enabled,
      poolSize: this.#poolSize,
      ...this.#workerPool.getStats?.(),
    };
  }

  /**
   *
   */
  static patchEnhancedLogger(EnhancedLoggerClass) {
    const originalConstructor = EnhancedLoggerClass.prototype.constructor;

    EnhancedLoggerClass.prototype.constructor = function (moduleName, config) {
      originalConstructor.call(this, moduleName, config);

      if (config.useWorkerThreads) {
        LoggerWorkerIntegration.enable({
          workerThreads: config.workerThreadCount ?? 2,
          logger: config.logger || null,
        });

        this.useWorkerThread = true;
      }
    };

    const originalLog = EnhancedLoggerClass.prototype.log;

    EnhancedLoggerClass.prototype.log = async function (...args) {
      if (this.useWorkerThread && LoggerWorkerIntegration.getPool()) {
        return LoggerWorkerIntegration.executeLoggingTask(() => originalLog.call(this, ...args));
      }

      return originalLog.call(this, ...args);
    };

    return EnhancedLoggerClass;
  }
}

export default LoggerWorkerIntegration;
