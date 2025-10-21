/**
 * Context Leak Prevention System
 *
 */

export class ContextManager {
  constructor(options = {}) {
    this.contexts = new WeakMap();
    this.contextMetadata = new Map();

    this.referenceGraph = new Map();
    this.activeContexts = new Set();

    this.maxContextAge = options.maxContextAge ?? 3600000;
    this.maxContextSize = options.maxContextSize ?? 1000;
    this.cleanupInterval = options.cleanupInterval ?? 300000;

    this.stats = {
      totalContextsCreated: 0,
      totalContextsDestroyed: 0,
      totalLeaksDetected: 0,
      totalReferencesTracked: 0,
      lastCleanupTime: Date.now(),
      cleanupEvents: [],
    };

    this._startPeriodicCleanup();
  }

  /**
   *
   */
  createContext(id, data = {}) {
    const context = {
      id,
      data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      size: 0,
      references: new Set(),
      children: new WeakSet(),
      parent: null,
      isActive: true,
    };

    this.contexts.set(context, {
      lastAccess: Date.now(),
      accessCount: 0,
      dataSize: JSON.stringify(data).length,
    });

    this.contextMetadata.set(id, {
      createdAt: context.createdAt,
      size: context.size,
      refs: [],
    });

    this.activeContexts.add(id);
    this.stats.totalContextsCreated++;

    return context;
  }

  /**
   *
   */
  addReference(fromContextId, toContextId, type = 'default') {
    if (!this.referenceGraph.has(fromContextId)) {
      this.referenceGraph.set(fromContextId, []);
    }

    const ref = {
      from: fromContextId,
      to: toContextId,
      type,
      createdAt: Date.now(),
      isValid: true,
    };

    this.referenceGraph.get(fromContextId).push(ref);

    if (this.contextMetadata.has(fromContextId)) {
      this.contextMetadata.get(fromContextId).refs.push(ref);
    }

    this.stats.totalReferencesTracked++;
  }

  /**
   *
   */
  detectDanglingReferences() {
    const danglingRefs = [];

    for (const [contextId, references] of this.referenceGraph.entries()) {
      if (!this.activeContexts.has(contextId)) {
        for (const ref of references) {
          if (this.activeContexts.has(ref.to)) {
            danglingRefs.push({
              ...ref,
              reason: 'source_deleted',
              severity: 'high',
            });
          }
        }
      } else {
        for (const ref of references) {
          if (!this.activeContexts.has(ref.to)) {
            danglingRefs.push({
              ...ref,
              reason: 'target_deleted',
              severity: 'critical',
            });
          }
        }
      }
    }

    return danglingRefs;
  }

  /**
   *
   */
  detectReferenceCycles() {
    const cycles = [];

    for (const [contextId] of this.referenceGraph.entries()) {
      const visited = new Set();
      const recursionStack = new Set();

      if (this._hasCycle(contextId, visited, recursionStack)) {
        cycles.push({
          contextId,
          detectedAt: Date.now(),
          severity: 'high',
        });
      }
    }

    return cycles;
  }

  /**
   *
   */
  _hasCycle(contextId, visited, recursionStack) {
    visited.add(contextId);
    recursionStack.add(contextId);

    const references = this.referenceGraph.get(contextId) || [];

    for (const ref of references) {
      if (!visited.has(ref.to)) {
        if (this._hasCycle(ref.to, visited, recursionStack)) {
          return true;
        }
      } else if (recursionStack.has(ref.to)) {
        return true;
      }
    }

    recursionStack.delete(contextId);
    return false;
  }

  /**
   *
   */
  safeCleanupContext(contextId) {
    const metadata = this.contextMetadata.get(contextId);

    if (!metadata) {
      return { success: false, reason: 'context_not_found' };
    }

    const refs = metadata.refs || [];
    for (const ref of refs) {
      ref.isValid = false;
    }

    this.referenceGraph.delete(contextId);
    this.contextMetadata.delete(contextId);
    this.activeContexts.delete(contextId);

    this.stats.totalContextsDestroyed++;

    return {
      success: true,
      contextId,
      brokenReferences: refs.length,
      cleanedAt: Date.now(),
    };
  }

  /**
   *
   */
  performAutomaticCleanup() {
    const now = Date.now();
    const cleanupResult = {
      timestamp: now,
      contextsCleaned: 0,
      leaksDetected: 0,
      cyclesDetected: 0,
      actions: [],
    };

    for (const [contextId, metadata] of this.contextMetadata.entries()) {
      const age = now - metadata.createdAt;
      if (age > this.maxContextAge && this.activeContexts.has(contextId)) {
        this.safeCleanupContext(contextId);
        cleanupResult.contextsCleaned++;
        cleanupResult.actions.push({
          type: 'cleanup',
          contextId,
          reason: 'max_age_exceeded',
          age,
        });
      }
    }

    const danglingRefs = this.detectDanglingReferences();
    if (danglingRefs.length > 0) {
      cleanupResult.leaksDetected = danglingRefs.length;
      this.stats.totalLeaksDetected += danglingRefs.length;
      cleanupResult.actions.push({
        type: 'dangling_references_detected',
        count: danglingRefs.length,
        details: danglingRefs.slice(0, 5),
      });
    }

    const cycles = this.detectReferenceCycles();
    if (cycles.length > 0) {
      cleanupResult.cyclesDetected = cycles.length;
      cleanupResult.actions.push({
        type: 'reference_cycles_detected',
        count: cycles.length,
        details: cycles.slice(0, 5),
      });
    }

    this.stats.lastCleanupTime = now;
    this.stats.cleanupEvents.push(cleanupResult);
    if (this.stats.cleanupEvents.length > 100) {
      this.stats.cleanupEvents.shift();
    }

    return cleanupResult;
  }

  /**
   *
   */
  _startPeriodicCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.performAutomaticCleanup();
    }, this.cleanupInterval);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   *
   */
  stopPeriodicCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   *
   */
  getContextReport(contextId) {
    const metadata = this.contextMetadata.get(contextId);
    const isActive = this.activeContexts.has(contextId);

    if (!metadata) {
      return null;
    }

    return {
      contextId,
      isActive,
      createdAt: metadata.createdAt,
      age: Date.now() - metadata.createdAt,
      size: metadata.size,
      referencesCount: metadata.refs ? metadata.refs.length : 0,
      validReferences: metadata.refs ? metadata.refs.filter((r) => r.isValid).length : 0,
      invalidReferences: metadata.refs ? metadata.refs.filter((r) => !r.isValid).length : 0,
    };
  }

  /**
   *
   */
  getStatistics() {
    return {
      ...this.stats,
      activeContextCount: this.activeContexts.size,
      trackedReferences: this.referenceGraph.size,
      metadataCount: this.contextMetadata.size,
      averageContextAge: this._calculateAverageAge(),
      memoryEfficiency: this._calculateMemoryEfficiency(),
    };
  }

  /**
   *
   */
  _calculateAverageAge() {
    if (this.contextMetadata.size === 0) return 0;

    const now = Date.now();
    let totalAge = 0;

    for (const [, metadata] of this.contextMetadata.entries()) {
      totalAge += now - metadata.createdAt;
    }

    return Math.floor(totalAge / this.contextMetadata.size);
  }

  /**
   *
   */
  _calculateMemoryEfficiency() {
    const totalContexts = this.stats.totalContextsCreated;
    const destroyedContexts = this.stats.totalContextsDestroyed;
    const leakedContexts = totalContexts - destroyedContexts;

    if (totalContexts === 0) return 100;

    const leakRate = (leakedContexts / totalContexts) * 100;
    return Math.max(0, 100 - leakRate);
  }

  /**
   *
   */
  reset() {
    this.contexts = new WeakMap();
    this.contextMetadata.clear();
    this.referenceGraph.clear();
    this.activeContexts.clear();

    this.stats = {
      totalContextsCreated: 0,
      totalContextsDestroyed: 0,
      totalLeaksDetected: 0,
      totalReferencesTracked: 0,
      lastCleanupTime: Date.now(),
      cleanupEvents: [],
    };
  }
}
