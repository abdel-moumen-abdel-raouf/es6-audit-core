# AuditCore — Enterprise-Grade ES6 Logging & Audit System

![Build](https://github.com/abdel-moumen-abdel-raouf/es6-audit-core/actions/workflows/ci.yml/badge.svg)
![Coverage](https://img.shields.io/badge/coverage-c8-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)

A high-performance, security-conscious logging and audit core for modern Node.js applications. Built as native ES Modules with production features including adaptive buffering with backpressure, rate limiting, sanitization/redaction, resilient transport chains, dynamic configuration, health checks, metrics, and distributed tracing.

Current version: 1.0.0

## Overview / Introduction

AuditCore provides a modular, enterprise-ready logging and audit foundation designed for services that need reliable, scalable, and secure log delivery. It supports multiple transports (console, file, HTTP, custom), protects sensitive data through robust sanitization, and maintains performance via adaptive buffering and rate limiting. It also includes health checks, metrics, and tracing utilities for operational visibility.

Target users:

- Backend services and microservices with high-volume logging needs
- Platforms that require consistent sanitization and governance for logs
- Teams operating in production with SLOs who need resilience and observability

## Key Features

- Adaptive buffering and backpressure handling to survive high burst rates
- Token-bucket rate limiting per module to prevent log floods
- Sensitive data sanitization (keys and pattern-based, including encoded contents)
- Multiple transports: console, rotating file (Node only), advanced HTTP with retry/backoff and dead-letter queue
- Resilient transport chains with circuit breakers and fallbacks
- Dynamic configuration (runtime updates, rollback, audit log)
- Per-module and pattern-based log level configuration
- Context management: correlation IDs and request context propagation
- Transform/context-aware logging for object hierarchies and state tracking
- Health checks (liveness/readiness/startup) with statistics
- Metrics collection (counter/gauge/histogram) with Prometheus export format
- Synchronization utilities (Mutex) for safe concurrency
- Worker thread integration scaffolding (pool and integrations)
- ES Modules-first; Node.js >= 14

## Architecture & Design Overview

- Technologies:
  - Node.js (>= 14), native ES Modules (`"type": "module"`)
  - Uses Node core modules (fs, path, crypto, async_hooks) where needed
  - No external runtime dependencies in the core

- Design:
  - Modular packages by domain:
    - Core logging (`core/`), configuration (`config/`), context (`context/`), transports (`transports/`)
    - Rate limiting, sanitization, resilience, tracing, health, metrics, sync (mutex), workers, utilities
  - Strategy pattern for transports (base class and implementations)
  - Token Bucket algorithm for rate limiting
  - Adaptive buffer with high/low watermarks, memory usage estimation, and drain callbacks
  - Circuit Breaker and transport chaining for resilience (avoid cascading failures)
  - AsyncLocalStorage for context/correlation in `LogContext`
  - Security-by-default sanitization/redaction before persistence/egress

- Data flow (CoreLogger):
  - App calls logger.debug/info/warn/error or log(LogLevel, message, context)
  - RateLimiter checks token bucket per module; rejects when exceeding budget
  - LogEntry created and sanitized
  - Entry is pushed into AdaptiveLogBuffer
  - On flush, batched entries are sent to configured transports (requires a batch-capable transport interface; see “Transports” note below)
  - Statistics updated; backpressure and drain events managed

## Folder Structure & File Summary

- `index.js` — Public ES Module exports (preferred entry)
- `index.cjs` — CommonJS compatibility note (prefer ESM or dynamic import in CJS)
- `jsconfig.json` — Editor/TS tooling options

Key directories:

- `core/`
  - `core-logger.js` — Main production logger (buffer + rate limiter + transform/context tracking)
  - `core-logger-config.js` — Validated config for transports and per-module levels (via `ModuleConfig`)
  - `adaptive-logger.js` — Adaptive logger utilities (memory monitor, flush strategy, batcher)
  - `resilient-logger.js` — Circuit breaker transport chain, local fallback queue
  - `structured-logging-schema.js` — Structured logging schema helpers

- `config/`
  - `logger-config.js` — Immutable basic logger config validation
  - `module-config.js` — Module/pattern-based levels, listeners, JSON import/export
  - `dynamic-config.js` — DynamicConfigurationManager (safe runtime updates, rollback, audit)
  - `dynamic-config-integration.js` — Integration facade for dynamic config operations
  - `log-presets.js` — Preset management (development/production/testing/debugging)
  - `color-config.js` — Color themes for console

- `context/`
  - `log-context.js` — Correlation IDs with AsyncLocalStorage
  - `request-context.js` — HTTP request context factory and storage

- `transports/`
  - `base-transport.js` — Strategy base (error-safe)
  - `console-transport.js` — Colored console output
  - `file-transport.js` — Async, batched file writer (Node only)
  - `http-transport.js` — Advanced HTTP transport with permanent/temporary error classification and DLQ
  - `log-buffer.js` — Simple buffer
  - `adaptive-log-buffer.js` — Backpressure-aware buffer used by CoreLogger
  - `batch-queue.js`, `batch-sequencer.js`, `log-rotator.js`, `payload-rotation.js`, `log-archiver.js`, etc. — Batch/rotation utilities

- `rate-limiting/`
  - `rate-limiter.js` — Token bucket with stats/cleanup
  - `rate-limiter-advanced.js`, `rate-limiter-strict.js` — Additional strategies

- `sanitizer/`
  - `data-sanitizer.js` — Redaction by keys and patterns (CC, SSN, JWT, keys, etc.), encoding detection
  - `encoding-detector.js` — Base64/URL/Hex detection
  - `sanitizer-advanced.js` — Extensions

- `error-handling/`
  - `errors.js` — `LoggingError` with codes/context
  - `contextual-log-entry.js`, `error-handler.js` — Contextual error utilities

- `tracing/`
  - `distributed-tracing.js` — Trace context, OpenTelemetry/W3C/Jaeger formats, propagation helpers

- `health/`
  - `health-check-manager.js` — Liveness/readiness/startup checks with timeouts, retries, stats

- `metrics/`
  - `metrics-collector.js` — Counter/gauge/hist/summary; aggregations; Prometheus export

- `sync/`
  - `mutex.js` — Simple mutex for exclusive sections

- `utils/`
  - `log-entry.js` — Sanitizing `LogEntry` model
  - `log-formatter.js`, `output-customizer.js` — Formatting/presentation
  - `types.js` — `LogLevel`, `TransportType`
  - Plus helpers: circular refs, stack traces, etc.

- `workers/`
  - Worker thread integration stubs/pool

## Installation & Setup

This package is ESM-only and requires Node.js 18+.

Requirements:

- Node.js >= 14
- Native ES Modules environment (package.json uses `"type": "module"`)

Install (from a local clone or workspace):

```powershell
# From your project folder
npm install
```

Use as a package (when published or via Git URL/local path):

```powershell
# Example when published under @svg-character-engine scope
npm install @svg-character-engine/audit-core
```

ESM import (recommended):

```js
import { CoreLogger, LogLevel } from '@svg-character-engine/audit-core';
```

CommonJS usage:

- Node cannot require() native ES Modules directly.
- Prefer dynamic import() in CJS:

```js
(async () => {
  const { CoreLogger } = await import('@svg-character-engine/audit-core');
  const logger = new CoreLogger({ name: 'app' });
  logger.info('Hello from CJS via dynamic import');
})();
```

## Quick Start Guide

Important async note:

- `logger.log/debug/info/warn/error` are async and resolve to a boolean. Prefer `await` to handle backpressure outcomes properly.
- `flush()` and `drain()` are async and should be awaited before shutdown.

Transports and batching: CoreLogger flushes a batch of entries. Built-in `ConsoleTransport` and `HttpTransport` already provide `write(entries)` for batched delivery. If you use a custom transport that only implements per-entry `log(entry)`, either add a `write(entries)` method or wrap it in a small adapter.

```js
import { CoreLogger, LogLevel, ConsoleTransport } from '@svg-character-engine/audit-core';

const logger = new CoreLogger({
  name: 'app',
  transports: [new ConsoleTransport()],
  buffer: {
    maxSize: 1000,
    flushInterval: 1000,
    highWaterMark: 0.8,
    lowWaterMark: 0.5,
  },
  rateLimiter: { tokensPerSecond: 1000, burstCapacity: 2000 },
  // Optional unified error hook for internal logging errors
  onError: (err) => {
    // You can forward to your monitoring here
    // console.warn('Logger internal error:', err);
  },
});

await logger.info('Application started', { env: process.env.NODE_ENV });
await logger.debug('Debug details will be buffered/sanitized');
await logger.drain(); // optional: wait for backpressure to clear (e.g., before shutdown)
```

To try locally, save the snippet as `quick-start.mjs` and run:

```powershell
node .\quick-start.mjs
```

## Configuration

- CoreLogger (constructor options in `core/core-logger.js`):
  - `name` string (default: 'Logger')
  - `buffer` object for `AdaptiveLogBuffer`:
    - `maxSize`, `maxMemory`, `flushInterval`, `highWaterMark`, `lowWaterMark`
  - `rateLimiter` object for `RateLimiter`:
    - `tokensPerSecond`, `burstCapacity`
  - `transports` array (each should implement `write(entries)`; see adapter note)
  - `enableTransformLogging` boolean (default true)
  - `transformContext` Map (optional, to reuse an existing context)

- CoreLoggerConfig (`core/core-logger-config.js`):
  - Validates transports (must extend `BaseTransport` if using `CoreLoggerConfig` instance)
  - Manages module-level log configuration via `ModuleConfig`
  - Methods: `getLogLevelForModule`, `setModuleLevel`, `setPatternLevel`, `onChange`, `getInfo`

- ModuleConfig (`config/module-config.js`):
  - Per-module and pattern-based levels with listeners and JSON import/export
  - `setModuleLevel('math-lib', LogLevel.DEBUG)`, `setPatternLevel('*-lib', LogLevel.WARN)`

- DynamicConfigurationManager (`config/dynamic-config.js`):
  - Safe runtime updates with validators, audit log, rollback
  - `updateConfig(key, value)`, `updateMultiple(updates)`, `rollback(stepsBack)`, `getConfig()`

- DynamicConfigIntegration (`config/dynamic-config-integration.js`):
  - Facade to enable dynamic config and set global/module levels and rate limits during runtime

- Log Presets (`config/log-presets.js`):
  - Built-in: development, production, testing, debugging
  - `LogPresets.setPreset('production')`

- Sanitizer (`sanitizer/data-sanitizer.js`):
  - Redacts sensitive keys and patterns; supports encoding detection
  - Config options: `sensitiveKeys`, `patterns`, `maskEmails`, `maskIPs`, `maskPhones`, etc.

- Context (`context/log-context.js`, `context/request-context.js`):
  - `LogContext.initialize()`, `.setCorrelationId()`, `.getContext()`
  - `RequestContextFactory.fromExpressRequest(req)` and similar factories

- Transports:
  - `ConsoleTransport` — supports single-entry `log(entry)` and batch `write(entries)`
  - `FileTransport` — Node-only; directory required; batched write queue
  - `HttpTransport` — advanced HTTP transport (alias of `AdvancedHttpTransport`) with retry/backoff and DLQ; supports `log(entry)` and `write(entries)`
  - For custom transports that lack `write(entries)`, add it or wrap them with a simple adapter

## Usage Examples

- File transport (Node-only) with adapter:

```js
import { CoreLogger, FileTransport, LogLevel } from '@svg-character-engine/audit-core';

class FileBatchAdapter {
  constructor(logDirectory) {
    this.file = new FileTransport({ logDirectory, maxQueueSize: 100, flushInterval: 1000 });
  }
  async write(entries) {
    for (const e of entries) {
      await this.file.log(e);
    }
  }
}

const logger = new CoreLogger({
  name: 'billing',
  transports: [new FileBatchAdapter('./logs')],
});

logger.warn('High latency on payment gateway', { provider: 'stripe', latencyMs: 450 });
```

- HTTP transport with exponential backoff and dead-letter queue:

```js
import { CoreLogger, HttpTransport } from '@svg-character-engine/audit-core';

class HttpBatchAdapter {
  constructor(url, options) {
    this.http = new HttpTransport(url, options);
  }
  async write(entries) {
    for (const e of entries) {
      await this.http.send(e);
    }
  }
}

const logger = new CoreLogger({
  name: 'api',
  transports: [new HttpBatchAdapter('https://logs.example.com/ingest', { maxRetries: 5 })],
});

logger.error('Upstream service returned 503', { service: 'inventory', attempt: 3 });
```

- Context and correlation:

```js
import { LogContext } from '@svg-character-engine/audit-core';

const correlationId = LogContext.initialize();
logger.info('Start request', { correlationId });

LogContext.runWithContext(() => {
  logger.info('Processing within async context', LogContext.getContext());
});
```

- Dynamic configuration at runtime:

```js
import { DynamicConfigIntegration } from '@svg-character-engine/audit-core';

DynamicConfigIntegration.enable({ defaultLogLevel: 'INFO' });
DynamicConfigIntegration.setModuleLogLevel('api', 'WARN');
```

- Health checks (internal module):

```js
// When using the source directly:
import { HealthCheckManager } from './health/health-check-manager.js';

const health = new HealthCheckManager({ serviceName: 'user-service' });
health.registerCheck('db', async () => true, { type: health.CheckTypes.READINESS });
console.log(await health.getFullStatus());
```

- Metrics (internal module):

```js
// When using the source directly:
import { MetricsCollector } from './metrics/metrics-collector.js';

const metrics = new MetricsCollector({ serviceName: 'api', environment: 'prod' });
const requests = metrics.createCounter('http_requests_total');
requests.increment();
console.log(metrics.exportAsPrometheus());
```

Note: Health and Metrics are present in the repository but are not exported via the root `index.js`. If you consume this as a published package, these modules are not part of the public API unless exported.

## API Reference

This library is primarily a set of ES classes. Highlights only:

- `CoreLogger` (core/core-logger.js)
  - `new CoreLogger({ name, buffer, rateLimiter, transports, onError, enableTransformLogging, transformContext })`
  - `log(level, message, metadata?)`, `debug/info/warn/error(message, metadata?)` — all async, resolve to `boolean`
  - `logWithContext(level, objectId, message, additionalData?)`, `debugWithContext/infoWithContext/warnWithContext/errorWithContext`
  - Transform/context management: `registerObject`, `updateTransform`, `setObjectParent`, `getTransform`, `getHierarchyInfo`
  - State mgmt: `setObjectState`, `getObjectState`, `snapshotContext`, `restoreFromSnapshot`, `cleanupOldSnapshots`, `clearAll`
  - Transports/flow: `addTransport`, `removeTransport`, `flush()`, `drain()` — both async
  - Observability: `getStatistics`, `getReport`, `resetStats`, `destroy`

- `AdaptiveLogBuffer` (transports/adaptive-log-buffer.js)
  - `push(entry)` -> boolean; `onFlush(cb)`, `flush()`, `onDrain(cb)`, `getStatistics()`

- `RateLimiter` (rate-limiting/rate-limiter.js)
  - `canLog(key?)`, `waitAndLog(key, fn)`, `getStatus(key)`, `getStatistics()`, `cleanup(maxAge)`

- `ConsoleTransport` (transports/console-transport.js)
  - `log(entry)` — prints with colors

- `FileTransport` (transports/file-transport.js)
  - Node-only; `new FileTransport({ logDirectory, maxQueueSize?, flushInterval? })`
  - `log(entry)`, `shutdown()`

- `HttpTransport` (transports/http-transport.js)
  - `new HttpTransport(url, options)` — retry/backoff, dead-letter queue
  - `send(entry)`, `getDeadLetterEntries()`, `getStats()`, `clearDeadLetterQueue()`

- `LoggerConfig` (config/logger-config.js), `CoreLoggerConfig` (core/core-logger-config.js)
  - Validates/holds transports; integrates with `ModuleConfig`

- `ModuleConfig` (config/module-config.js)
  - `setModuleLevel()`, `setPatternLevel()`, `getLogLevelForModule()`, `onChange()`, `getAll()`, `fromJSON()`

- `LogContext` (context/log-context.js), `RequestContext` (context/request-context.js)
  - Correlation and request context utilities

- `DataSanitizer` (sanitizer/data-sanitizer.js)
  - `sanitize()`, `sanitizeWithEncoding()`, `addSensitiveKey()`, `addCustomPattern()`, `getStatistics()`

- `MetricsCollector` (metrics/metrics-collector.js) — internal module
- `HealthCheckManager` (health/health-check-manager.js) — internal module

### API stability status

The following summarizes the public exports and their stability. Items marked Experimental may change without notice in a minor release; prefer Stable APIs for production.

- Stable
  - Core: `CoreLogger`
  - Transports: `ConsoleTransport`, `FileTransport`, `HttpTransport`, `AdaptiveLogBuffer`, `LogBuffer`
  - Config: `LoggerConfig`, `ModuleConfig`, `LogPresets`, `CoreLoggerConfig`, `DynamicConfigIntegration`
  - Context & Error: `LogContext`, `RequestContext`, `LoggingError`
  - Rate limiting: `RateLimiter`
  - Utilities: `LogLevel`, `LogEntry`

- Experimental
  - Aliases: `EnhancedLogger`, `EnhancedLoggerV2`, `EnhancedLoggerV3`
  - Specialized loggers: `AdaptiveLogger`, `ResilientLogger`
  - Transport helpers: `BatchQueue`, `BatchSequencer`, `LogArchiver`, `LogRotator`, `LogCleanupPolicy`, `PayloadOptimizer`
  - Rate limiting: `RateLimiterAdvanced`, `StrictBurstLimiter`, `MultiLayerRateLimiter`
  - Sanitizer: `AdvancedSanitizer`, `EncodingDetector`
  - Workers & Tracing: `WorkerThreadPool`, `WorkerThreadIntegration`, `LoggerWorkerIntegration`, `DistributedTracing`, `DistributedTracingIntegration`
  - Utilities: `StackTrace`, `LogFormatter`, `ModulePatternMatcher`, `OutputCustomizer`, `MemorySafeContext`, `SupportSystems`

Testing & Development

- Tests: see `tests/basic.test.js`. Run them with `npm test` (package.json defines the script).
- CI: GitHub Actions workflow is included at `.github/workflows/ci.yml` to run tests on push/PR.
- Build: source is plain ES Modules JavaScript; no build step is required for Node.
- Editor/Tooling: see `jsconfig.json` for ES2020 target and module resolution.
- Local verification:
  - Create a small script using the Quick Start example and run with Node.
  - Validate transports by checking console output and/or created log files.
- Lint/Typecheck: not configured; you can add ESLint/TypeScript as needed for your environment.

## Deployment

Run tests and coverage:

- Run all tests: npm test
- Run only basic tests: npm run test:basic
- Run only core tests: npm run test:core
- Generate coverage: npm run coverage
  - For file transport, call `await fileTransport.shutdown()`
- Docker (example):
  - Mount persistent volume for file logs
  - Set environment variables like `NODE_ENV=production`
- Production tips:
  - Consider setting log levels via `ModuleConfig` or dynamic config at runtime
  - Route logs to HTTP/centralized sinks using `HttpTransport` with backoff
  - Keep sanitization enabled on untrusted inputs
  - Monitor health and metrics by exposing outputs from `HealthCheckManager` and `MetricsCollector` where applicable

## Contributing

- Use ES Modules and keep modules cohesive within their domain folder
- Add unit tests under `tests/` for new features and bug fixes
- Follow existing naming and code style conventions
- For public APIs, update this README and add inline JSDoc
- Submit pull requests with a clear description and reproduction steps when fixing bugs

## CommonJS Compatibility

This package is **ESM-only** and requires **Node.js 18+**.
The previous CommonJS compatibility shim (`index.cjs`) has been removed.
If you need to use this library from a CommonJS project, load it via:

```js
(async () => {
  const mod = await import('@svg-character-engine/audit-core');
})();
```

## License

MIT License. See the `LICENSE` file for details.

## Contact & Support

For issues and feature requests, please open a GitHub issue in this repository. Include:

- Node.js version and environment
- Minimal reproduction (code snippets)
- Logs or error messages (sanitized)

## Changelog / Version Info

- 1.0.0 — Initial public version (as per `package.json`)

Notes:

- ESM-first design documented in `index.cjs` (CommonJS consumers should use dynamic import).
- Public exports are defined in `index.js` and `package.json#exports`.

## API Manifest (v1.0 Freeze)

The following table freezes the stable public API surface at version 1.0. Any additions must be explicitly approved and reflected in `api-manifest.json`.

| Name              | Kind  | Stability | Source Path                         |
| ----------------- | ----- | --------- | ----------------------------------- |
| CoreLogger        | class | stable    | ./core/core-logger.js               |
| Logger            | class | stable    | ./core/core-logger.js               |
| CoreLoggerConfig  | class | stable    | ./core/core-logger-config.js        |
| LoggerConfig      | class | stable    | ./config/logger-config.js           |
| ModuleConfig      | class | stable    | ./config/module-config.js           |
| DynamicConfig     | class | stable    | ./config/dynamic-config.js          |
| LogContext        | class | stable    | ./context/log-context.js            |
| RequestContext    | class | stable    | ./context/request-context.js        |
| ConsoleTransport  | class | stable    | ./transports/console-transport.js   |
| FileTransport     | class | stable    | ./transports/file-transport.js      |
| HttpTransport     | class | stable    | ./transports/http-transport.js      |
| LogBuffer         | class | stable    | ./transports/log-buffer.js          |
| AdaptiveLogBuffer | class | stable    | ./transports/adaptive-log-buffer.js |
| RateLimiter       | class | stable    | ./rate-limiting/rate-limiter.js     |
| LoggingError      | class | stable    | ./error-handling/errors.js          |
| DataSanitizer     | class | stable    | ./sanitizer/data-sanitizer.js       |
| EncodingDetector  | class | stable    | ./sanitizer/encoding-detector.js    |
| Mutex             | class | stable    | ./sync/mutex.js                     |
| LogLevel          | const | stable    | ./utils/types.js                    |
| LogEntry          | class | stable    | ./utils/log-entry.js                |
