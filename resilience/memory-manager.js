/**
 * Memory Pressure Management System
 *
 */

export class MemoryManager {
  constructor(options = {}) {
    this.thresholds = {
      low: options.lowThreshold ?? 0.5,
      medium: options.mediumThreshold ?? 0.75,
      high: options.highThreshold ?? 0.85,
      critical: options.criticalThreshold ?? 0.95,
    };

    this.limits = {
      logBuffer: options.logBufferLimit ?? 10000,
      cacheSize: options.cacheSizeLimit ?? 100000,
      contextStack: options.contextStackLimit ?? 1000,
    };

    this.adaptiveLimits = { ...this.limits };
    this.metrics = {
      measurements: [],
      currentPressure: 0,
      peakPressure: 0,
      avgPressure: 0,
      lastMeasurement: null,
      pressureHistory: [],
      cleanupEvents: [],
    };

    this.gcHints = {
      lastGCTime: Date.now(),
      gcInterval: options.gcInterval ?? 5000, // 5 segundos
      forceGCThreshold: options.forceGCThreshold ?? 0.9,
    };

    // Arreglo de listeners para cambios de presión
    this.listeners = [];
  }

  /**
   * Medir presión de memoria actual
   */
  measurePressure() {
    const usage = process.memoryUsage();

    // Presión basada en heap utilizado vs heap total
    const heapUsedPercent = usage.heapUsed / usage.heapTotal;

    this.metrics.currentPressure = heapUsedPercent;
    this.metrics.lastMeasurement = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      pressure: heapUsedPercent,
    };

    this.metrics.measurements.push(this.metrics.lastMeasurement);

    // Mantener solo últimas 100 mediciones
    if (this.metrics.measurements.length > 100) {
      this.metrics.measurements.shift();
    }

    // Actualizar estadísticas
    this._updateMetrics();

    // Registrar en historial
    this.metrics.pressureHistory.push({
      timestamp: Date.now(),
      pressure: heapUsedPercent,
      level: this._getPressureLevel(heapUsedPercent),
    });

    if (this.metrics.pressureHistory.length > 1000) {
      this.metrics.pressureHistory.shift();
    }

    return heapUsedPercent;
  }

  /**
   * Estimar presión sin acceso a gc real
   */
  _estimatePressure() {
    const usage = process.memoryUsage();
    return usage.heapUsed / usage.heapTotal;
  }

  /**
   * Actualizar estadísticas de presión
   */
  _updateMetrics() {
    if (this.metrics.measurements.length === 0) return;

    // Calcular promedio
    const sum = this.metrics.measurements.reduce((acc, m) => acc + m.pressure, 0);
    this.metrics.avgPressure = sum / this.metrics.measurements.length;

    // Actualizar pico
    if (this.metrics.currentPressure > this.metrics.peakPressure) {
      this.metrics.peakPressure = this.metrics.currentPressure;
    }
  }

  /**
   * Obtener nivel de presión
   */
  _getPressureLevel(pressure) {
    if (pressure >= this.thresholds.critical) return 'critical';
    if (pressure >= this.thresholds.high) return 'high';
    if (pressure >= this.thresholds.medium) return 'medium';
    if (pressure >= this.thresholds.low) return 'low';
    return 'low'; // por defecto low
  }

  /**
   * Solicitar limpieza adaptativa basada en presión
   */
  performAdaptiveCleanup(availableLimits) {
    const pressure =
      this.metrics.currentPressure > 0 ? this.metrics.currentPressure : this.measurePressure();
    const level = this._getPressureLevel(pressure);

    const cleanup = {
      timestamp: Date.now(),
      pressureLevel: level,
      pressure,
      actions: [],
    };

    // Realizar acciones según nivel de presión
    switch (level) {
      case 'critical':
        cleanup.actions.push({
          type: 'reduce',
          target: 'logBuffer',
          reduction: 0.5,
          newLimit: Math.floor(availableLimits.logBuffer * 0.5),
        });
        cleanup.actions.push({
          type: 'reduce',
          target: 'cache',
          reduction: 0.3,
          newLimit: Math.floor(availableLimits.cacheSize * 0.7),
        });
        cleanup.actions.push({
          type: 'flush',
          target: 'immediate',
        });
        // Sugerir GC explícito
        cleanup.actions.push({
          type: 'gc',
          priority: 'high',
        });
        break;

      case 'high':
        cleanup.actions.push({
          type: 'reduce',
          target: 'logBuffer',
          reduction: 0.3,
          newLimit: Math.floor(availableLimits.logBuffer * 0.7),
        });
        cleanup.actions.push({
          type: 'reduce',
          target: 'cache',
          reduction: 0.2,
          newLimit: Math.floor(availableLimits.cacheSize * 0.8),
        });
        cleanup.actions.push({
          type: 'flush',
          target: 'old_entries',
        });
        break;

      case 'medium':
        cleanup.actions.push({
          type: 'reduce',
          target: 'logBuffer',
          reduction: 0.1,
          newLimit: Math.floor(availableLimits.logBuffer * 0.9),
        });
        cleanup.actions.push({
          type: 'flush',
          target: 'expired_entries',
        });
        break;

      case 'low':
        // Sin cambios necesarios, potencialmente recuperar límites
        cleanup.actions.push({
          type: 'maintain',
          target: 'current_limits',
        });
        break;
    }

    // Registrar evento
    this.metrics.cleanupEvents.push(cleanup);
    if (this.metrics.cleanupEvents.length > 500) {
      this.metrics.cleanupEvents.shift();
    }

    // Notificar listeners
    this._notifyListeners({
      type: 'cleanup',
      level,
      pressure,
      actions: cleanup.actions,
    });

    return cleanup;
  }

  /**
   * Obtener sugerencia de límites adaptativos
   */
  getAdaptiveLimits() {
    const pressure = this.measurePressure();

    if (pressure >= this.thresholds.critical) {
      return {
        logBuffer: Math.floor(this.limits.logBuffer * 0.3),
        cacheSize: Math.floor(this.limits.cacheSize * 0.5),
        contextStack: Math.floor(this.limits.contextStack * 0.4),
      };
    }

    if (pressure >= this.thresholds.high) {
      return {
        logBuffer: Math.floor(this.limits.logBuffer * 0.6),
        cacheSize: Math.floor(this.limits.cacheSize * 0.7),
        contextStack: Math.floor(this.limits.contextStack * 0.8),
      };
    }

    if (pressure >= this.thresholds.medium) {
      return {
        logBuffer: Math.floor(this.limits.logBuffer * 0.8),
        cacheSize: Math.floor(this.limits.cacheSize * 0.9),
        contextStack: Math.floor(this.limits.contextStack * 0.9),
      };
    }

    // Recuperar gradualmente a límites normales
    return this.limits;
  }

  /**
   * Obtener sugerencia de intervalo de GC
   */
  getGCHint() {
    const pressure = this.measurePressure();
    const now = Date.now();

    if (pressure >= this.gcHints.forceGCThreshold) {
      return {
        shouldForceGC: true,
        priority: 'critical',
        reason: 'Presión crítica de memoria',
      };
    }

    if (pressure >= this.thresholds.high) {
      return {
        shouldForceGC: true,
        priority: 'high',
        reason: 'Presión alta de memoria',
      };
    }

    // Sugerir GC periódico
    const timeSinceLastGC = now - this.gcHints.lastGCTime;
    if (timeSinceLastGC > this.gcHints.gcInterval) {
      return {
        shouldForceGC: true,
        priority: 'normal',
        reason: 'Mantenimiento periódico',
      };
    }

    return {
      shouldForceGC: false,
      priority: 'none',
    };
  }

  /**
   * Registrar listener para eventos de presión
   */
  onPressureChange(callback) {
    this.listeners.push(callback);
  }

  /**
   * Remover listener
   */
  offPressureChange(callback) {
    this.listeners = this.listeners.filter((l) => l !== callback);
  }

  /**
   * Notificar a todos los listeners
   */
  _notifyListeners(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('[MemoryManager] Listener error:', e);
      }
    }
  }

  /**
   * Obtener reporte de memoria
   */
  getMemoryReport() {
    const usage = process.memoryUsage();

    return {
      currentPressure: this.metrics.currentPressure,
      peakPressure: this.metrics.peakPressure,
      averagePressure: this.metrics.avgPressure,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      pressureLevel: this._getPressureLevel(this.metrics.currentPressure),
      thresholds: this.thresholds,
      adaptiveLimits: this.getAdaptiveLimits(),
      recentHistory: this.metrics.pressureHistory.slice(-10),
      cleanupEventCount: this.metrics.cleanupEvents.length,
    };
  }

  /**
   * Resetear métricas
   */
  reset() {
    this.metrics = {
      measurements: [],
      currentPressure: 0,
      peakPressure: 0,
      avgPressure: 0,
      lastMeasurement: null,
      pressureHistory: [],
      cleanupEvents: [],
    };
    this.gcHints.lastGCTime = Date.now();
  }
}
