/**
 * Worker Threads Pool Manager
 *
 * 1. CPU-Intensive Task Distribution
 * 2. Load Balancing
 * 3. Task Queueing
 * 4. Performance Monitoring
 */

import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';

export class WorkerThreadsPool extends EventEmitter {
  /**
   * Initialize Worker Threads Pool
   * @param {Object} options - Pool configuration
   */
  constructor(options = {}) {
    super();

    this.poolSize = options.poolSize || require('os').cpus().length;
    this.workers = [];
    this.taskQueue = [];
    this.activeWorkers = new Map();
    this.taskCounter = 0;

    this.stats = {
      tasksSubmitted: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      poolUtilization: 0,
      peakQueueLength: 0,
      currentQueueLength: 0,
    };

    this.history = [];
    this.maxHistory = options.maxHistory || 500;
    this.taskTimeout = options.taskTimeout || 30000; // 30 seconds

    this._initializeWorkers();
  }

  /**
   * Initialize worker threads pool
   * @private
   */
  _initializeWorkers() {
    for (let i = 0; i < this.poolSize; i++) {
      this._createWorker(i);
    }
  }

  /**
   * Create a single worker thread
   * @private
   */
  _createWorker(workerId) {
    const worker = new Worker(this._getWorkerScript(), {
      eval: true,
    });

    const workerData = {
      id: workerId,
      worker,
      busy: false,
      tasksCompleted: 0,
      totalTime: 0,
      averageTime: 0,
    };

    worker.on('message', (result) => {
      this._handleWorkerMessage(workerData, result);
    });

    worker.on('error', (error) => {
      this._handleWorkerError(workerData, error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${workerId} exited with code ${code}`);
        this._createWorker(workerId);
      }
    });

    this.workers.push(workerData);
    this._recordHistory('WORKER_CREATED', { workerId });
  }

  /**
   * Get worker script for evaluation
   * @private
   */
  _getWorkerScript() {
    return `
            const { parentPort } = require('worker_threads');

            parentPort.on('message', (message) => {
                const { taskId, taskData } = message;
                try {
                    // Reconstruct function from string
                    const fn = new Function('return ' + taskData.fnString)();
                    const result = fn(...taskData.args);
                    
                    parentPort.postMessage({
                        taskId,
                        success: true,
                        result,
                        error: null
                    });
                } catch (error) {
                    parentPort.postMessage({
                        taskId,
                        success: false,
                        result: null,
                        error: error.message
                    });
                }
            });
        `;
  }

  /**
   * Submit a task to the pool
   * @param {Function|Object} task - Task to execute
   * @param {Array} args - Task arguments
   * @param {Object} options - Task options
   * @returns {Promise} Task result
   */
  submitTask(task, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const taskId = ++this.taskCounter;
      const taskData = {
        id: taskId,
        task,
        args,
        priority: options.priority || 0,
        createdAt: Date.now(),
        timeout: options.timeout || this.taskTimeout,
        resolve,
        reject,
      };

      this.stats.tasksSubmitted++;
      this.taskQueue.push(taskData);
      this.stats.currentQueueLength = this.taskQueue.length;

      if (this.stats.currentQueueLength > this.stats.peakQueueLength) {
        this.stats.peakQueueLength = this.stats.currentQueueLength;
      }

      this._recordHistory('TASK_SUBMITTED', { taskId, priority: taskData.priority });

      // Defer queue processing to allow multiple tasks to be submitted in same tick
      setImmediate(() => this._processQueue());
    });
  }

  /**
   * Process task queue
   * @private
   */
  _processQueue() {
    if (this.taskQueue.length === 0) return;

    // Find available worker
    const availableWorker = this.workers.find((w) => !w.busy);
    if (!availableWorker) return;

    // Sort by priority (higher priority first) BEFORE taking a task
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    // Take the highest priority task
    const taskData = this.taskQueue.shift();
    this.stats.currentQueueLength = this.taskQueue.length;

    availableWorker.busy = true;
    this.activeWorkers.set(taskData.id, {
      worker: availableWorker,
      taskData,
      startTime: Date.now(),
    });

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      this._handleTaskTimeout(taskData.id);
    }, taskData.timeout);

    // Send task to worker
    const messageData = {
      taskId: taskData.id,
      taskData:
        typeof taskData.task === 'function'
          ? {
              fnString: taskData.task.toString(),
              args: taskData.args,
            }
          : taskData.task,
      taskType: taskData.task.type || 'function',
    };

    availableWorker.worker.postMessage(messageData);

    this._recordHistory('TASK_ASSIGNED', {
      taskId: taskData.id,
      workerId: availableWorker.id,
      priority: taskData.priority,
    });

    // Process more tasks if queue available
    if (this.taskQueue.length > 0) {
      setImmediate(() => this._processQueue());
    }
  }

  /**
   * Handle worker message (task completion)
   * @private
   */
  _handleWorkerMessage(workerData, result) {
    const activeTask = this.activeWorkers.get(result.taskId);
    if (!activeTask) return;

    const processingTime = Date.now() - activeTask.startTime;

    if (result.success) {
      this.stats.tasksCompleted++;
      workerData.tasksCompleted++;
      workerData.totalTime += processingTime;
      workerData.averageTime = workerData.totalTime / workerData.tasksCompleted;

      this.stats.totalProcessingTime += processingTime;
      this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.tasksCompleted;

      activeTask.taskData.resolve(result.result);

      this._recordHistory('TASK_COMPLETED', {
        taskId: result.taskId,
        processingTime,
        workerId: workerData.id,
      });
    } else if (activeTask && activeTask.taskData && activeTask.taskData.reject) {
      this.stats.tasksFailed++;
      activeTask.taskData.reject(new Error(result.error || 'Unknown worker error'));

      this._recordHistory('TASK_FAILED', {
        taskId: result.taskId,
        error: result.error,
        workerId: workerData.id,
      });
    }

    workerData.busy = false;
    this.activeWorkers.delete(result.taskId);

    this._updateUtilization();
    this._processQueue();
  }

  /**
   * Handle worker error
   * @private
   */
  _handleWorkerError(workerData, error) {
    console.error(`Worker ${workerData.id} error:`, error);
    this.stats.tasksFailed++;

    // Find and reject all tasks for this worker
    for (const [taskId, activeTask] of this.activeWorkers) {
      if (activeTask.worker === workerData) {
        activeTask.taskData.reject(error);
        this.activeWorkers.delete(taskId);
      }
    }

    workerData.busy = false;
    this._updateUtilization();
  }

  /**
   * Handle task timeout
   * @private
   */
  _handleTaskTimeout(taskId) {
    const activeTask = this.activeWorkers.get(taskId);
    if (!activeTask) return;

    this.stats.tasksFailed++;
    activeTask.taskData.reject(new Error('Task timeout'));
    this.activeWorkers.delete(taskId);

    const worker = activeTask.worker;
    worker.busy = false;

    this._recordHistory('TASK_TIMEOUT', { taskId, workerId: worker.id });
    this._updateUtilization();
  }

  /**
   * Update pool utilization
   * @private
   */
  _updateUtilization() {
    const busyWorkers = this.workers.filter((w) => w.busy).length;
    this.stats.poolUtilization = (busyWorkers / this.poolSize) * 100;
  }

  /**
   * Get pool statistics
   */
  getStatistics() {
    return {
      poolSize: this.poolSize,
      tasksSubmitted: this.stats.tasksSubmitted,
      tasksCompleted: this.stats.tasksCompleted,
      tasksFailed: this.stats.tasksFailed,
      totalProcessingTime: this.stats.totalProcessingTime,
      averageProcessingTime: Math.round(this.stats.averageProcessingTime * 100) / 100,
      poolUtilization: Math.round(this.stats.poolUtilization * 100) / 100 + '%',
      peakQueueLength: this.stats.peakQueueLength,
      currentQueueLength: this.stats.currentQueueLength,
      activeWorkers: this.workers.filter((w) => w.busy).length,
      idleWorkers: this.workers.filter((w) => !w.busy).length,
      workerStats: this.workers.map((w) => ({
        workerId: w.id,
        tasksCompleted: w.tasksCompleted,
        averageProcessingTime: Math.round(w.averageTime * 100) / 100,
        busy: w.busy,
      })),
    };
  }

  /**
   * Get history entries
   * @param {Object} filter - Filter criteria
   */
  getHistory(filter = {}) {
    return this.history.filter((entry) => {
      if (filter.action && entry.action !== filter.action) return false;
      if (filter.taskId && entry.details.taskId !== filter.taskId) return false;
      return true;
    });
  }

  /**
   * Record history entry
   * @private
   */
  _recordHistory(action, details) {
    this.history.push({
      timestamp: Date.now(),
      action,
      details,
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Terminate pool
   */
  async terminate() {
    const terminationPromises = this.workers.map((w) => w.worker.terminate());
    await Promise.all(terminationPromises);
    this.workers = [];
    this.activeWorkers.clear();
    this.taskQueue = [];
    this._recordHistory('POOL_TERMINATED', {});
  }

  /**
   * Reset pool statistics
   */
  reset() {
    this.stats = {
      tasksSubmitted: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      poolUtilization: 0,
      peakQueueLength: 0,
      currentQueueLength: 0,
    };
    this.history = [];
  }
}

export default WorkerThreadsPool;
