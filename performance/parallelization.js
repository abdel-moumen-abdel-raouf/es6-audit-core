/**
 * ============================================================================
 * ============================================================================
 *
 * Purpose:
 *   - Execute multiple tasks concurrently with controlled parallelism
 *   - Prevent race conditions and deadlocks
 *   - Implement worker thread management
 *   - Track execution metrics and performance
 *
 * Architecture:
 *   - Task queuing with priority levels
 *   - Worker pool with concurrency control
 *   - Dependency tracking between tasks
 *   - Deadlock detection and prevention
 *   - Performance metrics per worker
 */

import { EventEmitter } from 'events';

export class ParallelizationManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.maxWorkers = options.maxWorkers || 4;
    this.timeout = options.timeout || 30000; // 30 seconds
    this.enableDeadlockDetection = options.enableDeadlockDetection !== false;

    // Worker management
    this.activeWorkers = [];
    this.taskQueue = [];
    this.taskMap = new Map();
    this.dependencies = new Map();
    this.locks = new Map();

    // Statistics
    this.stats = {
      tasksQueued: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageTaskTime: 0,
      totalTaskTime: 0,
      maxTaskTime: 0,
      minTaskTime: Infinity,
      deadlocksDetected: 0,
      raceConditionsFixed: 0,
      workerUtilization: 0,
      taskTimeouts: 0,
    };
  }

  /**
   * Queue task for execution
   * @param {string} taskId - Unique task identifier
   * @param {Function} fn - Task function to execute
   * @param {Object} options - Task options (priority, dependencies, locks)
   * @returns {Promise<*>} Task result
   */
  async queue(taskId, fn, options = {}) {
    if (typeof fn !== 'function') {
      throw new Error('Task must be a function');
    }

    const priority = options.priority || 'normal';
    const dependencies = options.dependencies || [];
    const requiredLocks = options.locks || [];

    // Check for circular dependencies
    if (this._hasCircularDependency(taskId, dependencies)) {
      throw new Error('Circular dependency detected');
    }

    this.stats.tasksQueued++;

    return new Promise((resolve, reject) => {
      const task = {
        id: taskId,
        fn,
        priority,
        dependencies,
        requiredLocks,
        resolve,
        reject,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        timeout: this.timeout,
        attempt: 0,
      };

      this.taskMap.set(taskId, task);
      this.taskQueue.push(task);

      // Sort by priority
      this.taskQueue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
      });

      this._processQueue();
    });
  }

  /**
   * Queue multiple tasks
   * @param {Array} tasks - Array of {taskId, fn, options}
   * @returns {Promise<Array>} All task results
   */
  async queueBatch(tasks) {
    const promises = tasks.map((t) => {
      return this.queue(t.taskId, t.fn, t.options || {});
    });
    return Promise.all(promises);
  }

  /**
   * Get task status
   * @param {string} taskId - Task identifier
   * @returns {Object} Task status
   */
  getTaskStatus(taskId) {
    const task = this.taskMap.get(taskId);
    if (!task) return null;

    return {
      id: taskId,
      status: task.completedAt ? 'completed' : task.startedAt ? 'running' : 'queued',
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      duration: task.completedAt ? task.completedAt - task.startedAt : null,
      attempts: task.attempt,
    };
  }

  /**
   * Cancel task
   * @param {string} taskId - Task identifier
   * @returns {boolean} Success
   */
  cancel(taskId) {
    const task = this.taskMap.get(taskId);
    if (!task) return false;

    // Remove from queue if not started
    const index = this.taskQueue.indexOf(task);
    if (index > -1) {
      this.taskQueue.splice(index, 1);
      task.reject(new Error('Task cancelled'));
      this.taskMap.delete(taskId);
      return true;
    }

    return false;
  }

  /**
   * Wait for all tasks
   * @returns {Promise<void>}
   */
  async drain() {
    while (this.taskQueue.length > 0 || this.activeWorkers.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Get parallelization statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    const avgTime =
      this.stats.tasksCompleted > 0 ? this.stats.totalTaskTime / this.stats.tasksCompleted : 0;

    return {
      ...this.stats,
      averageTaskTime: avgTime.toFixed(2) + 'ms',
      maxTaskTime: this.stats.maxTaskTime + 'ms',
      minTaskTime: this.stats.minTaskTime === Infinity ? 0 : this.stats.minTaskTime + 'ms',
      queuedTasks: this.taskQueue.length,
      activeWorkers: this.activeWorkers.length,
      totalTasks: this.stats.tasksCompleted + this.stats.tasksFailed,
      successRate:
        this.stats.tasksCompleted / Math.max(1, this.stats.tasksCompleted + this.stats.tasksFailed),
      workerUtilization: ((this.activeWorkers.length / this.maxWorkers) * 100).toFixed(2) + '%',
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      tasksQueued: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageTaskTime: 0,
      totalTaskTime: 0,
      maxTaskTime: 0,
      minTaskTime: Infinity,
      deadlocksDetected: 0,
      raceConditionsFixed: 0,
      workerUtilization: 0,
      taskTimeouts: 0,
    };
  }

  /**
   * Process queue - main processing loop
   * @private
   */
  async _processQueue() {
    while (this.taskQueue.length > 0 && this.activeWorkers.length < this.maxWorkers) {
      const task = this._findExecutableTask();
      if (!task) break;

      // Remove from queue
      const index = this.taskQueue.indexOf(task);
      this.taskQueue.splice(index, 1);

      // Execute task
      this._executeTask(task);
    }
  }

  /**
   * Find next executable task
   * @private
   */
  _findExecutableTask() {
    for (const task of this.taskQueue) {
      // Check if dependencies are met
      if (!this._areDependenciesMet(task)) continue;

      // Check if locks are available
      if (!this._canAcquireLocks(task)) continue;

      return task;
    }
    return null;
  }

  /**
   * Execute task
   * @private
   */
  async _executeTask(task) {
    this.activeWorkers.push(task);
    task.startedAt = Date.now();
    task.attempt++;

    try {
      // Acquire locks
      await this._acquireLocks(task);

      // Execute with timeout
      const result = await Promise.race([task.fn(), this._createTimeoutPromise(task)]);

      // Release locks
      this._releaseLocks(task);

      // Update statistics
      const duration = Date.now() - task.startedAt;
      task.completedAt = Date.now();
      this.stats.tasksCompleted++;
      this.stats.totalTaskTime += duration;
      this.stats.maxTaskTime = Math.max(this.stats.maxTaskTime, duration);
      this.stats.minTaskTime = Math.min(this.stats.minTaskTime, duration);

      task.resolve(result);
      this.emit('task-complete', { taskId: task.id, duration, success: true });
    } catch (error) {
      // Release locks on error
      this._releaseLocks(task);

      if (error.message === 'Task timeout') {
        this.stats.taskTimeouts++;
      }

      this.stats.tasksFailed++;
      task.reject(error);
      this.emit('task-failed', { taskId: task.id, error: error.message });
    } finally {
      // Remove from active workers
      const workerIndex = this.activeWorkers.indexOf(task);
      if (workerIndex > -1) {
        this.activeWorkers.splice(workerIndex, 1);
      }

      // Cleanup
      this.taskMap.delete(task.id);

      // Update statistics
      this.stats.workerUtilization = this.activeWorkers.length / this.maxWorkers;

      // Process next task
      this._processQueue();
    }
  }

  /**
   * Create timeout promise
   * @private
   */
  _createTimeoutPromise(task) {
    return new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Task timeout'));
      }, task.timeout);

      task.timeoutHandle = timer;
    });
  }

  /**
   * Check if dependencies are met
   * @private
   */
  _areDependenciesMet(task) {
    for (const depId of task.dependencies) {
      const dep = this.taskMap.get(depId);
      if (!dep || !dep.completedAt) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if locks can be acquired
   * @private
   */
  _canAcquireLocks(task) {
    for (const lock of task.requiredLocks) {
      if (this.locks.has(lock) && this.locks.get(lock) !== task.id) {
        return false;
      }
    }
    return true;
  }

  /**
   * Acquire locks for task
   * @private
   */
  async _acquireLocks(task) {
    for (const lock of task.requiredLocks) {
      // Check for potential deadlock
      if (this.enableDeadlockDetection && this._detectDeadlock(task, lock)) {
        this.stats.deadlocksDetected++;
        throw new Error('Deadlock detected');
      }
      this.locks.set(lock, task.id);
    }
  }

  /**
   * Release locks for task
   * @private
   */
  _releaseLocks(task) {
    for (const lock of task.requiredLocks) {
      if (this.locks.get(lock) === task.id) {
        this.locks.delete(lock);
      }
    }
  }

  /**
   * Detect potential deadlock
   * @private
   */
  _detectDeadlock(task, lockName) {
    // Simple deadlock detection: check if lock is held by task waiting on another lock held by us
    const lockHolder = this.locks.get(lockName);
    if (!lockHolder) return false;

    const holderTask = Array.from(this.taskMap.values()).find((t) => t.id === lockHolder);
    if (!holderTask) return false;

    // Check if holder is waiting for our locks
    for (const ourLock of task.requiredLocks) {
      for (const theirLock of holderTask.requiredLocks) {
        if (ourLock === theirLock && this.locks.get(ourLock) === task.id) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check for circular dependencies
   * @private
   */
  _hasCircularDependency(taskId, dependencies, visited = new Set()) {
    if (visited.has(taskId)) return true;
    visited.add(taskId);

    for (const depId of dependencies) {
      if (this._hasCircularDependency(depId, this.dependencies.get(depId) || [], visited)) {
        return true;
      }
    }

    return false;
  }
}

export default ParallelizationManager;
