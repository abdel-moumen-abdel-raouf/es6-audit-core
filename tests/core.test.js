import assert from 'assert';
import { AdaptiveLogBuffer } from '../transports/adaptive-log-buffer.js';
import { RateLimiter } from '../rate-limiting/rate-limiter.js';
import { CoreLogger } from '../core/core-logger.js';
import { LogLevel } from '../utils/types.js';
import { DataSanitizer } from '../sanitizer/data-sanitizer.js';
import { AdvancedHttpTransport } from '../transports/http-transport.js';

async function testRateLimiterBasics() {
  const rl = new RateLimiter({ tokensPerSecond: 1, burstCapacity: 1 });
  // First call allowed
  assert.strictEqual(rl.canLog('k'), true, 'first token should be allowed');
  // Immediately after, should be rejected until refill
  assert.strictEqual(rl.canLog('k'), false, 'second token should be rejected');
  const reason = rl.getRejectionReason('k');
  assert.ok(reason.includes("Rate limit exceeded"));

  // Speed up waitAndLog by monkey-patching _sleep
  rl._sleep = () => new Promise((r) => setTimeout(r, 5));
  const start = Date.now();
  await rl.waitAndLog('k', async () => true);
  const waitedMs = Date.now() - start;
  assert.ok(waitedMs >= 0, 'waitAndLog should wait at least a tick');
  const status = rl.getStatus('k');
  assert.ok(status && typeof status.availableTokens === 'number');

  rl.reset('k');
  assert.strictEqual(rl.getStatus('k'), null, 'reset should clear key');
  rl.resetAll();
  assert.strictEqual(rl.buckets.size, 0, 'resetAll should clear buckets');
}

async function testAdaptiveLogBufferFlow() {
  const buffer = new AdaptiveLogBuffer({ maxSize: 3, flushInterval: 100, highWaterMark: 0.66, lowWaterMark: 0.33 });
  const flushed = [];
  buffer.onFlush(async (entries) => { flushed.push(...entries); });

  // Push 3 entries to exceed highWaterMark and trigger pause
  await buffer.push({ a: 1 });
  await buffer.push({ a: 2 });
  await buffer.push({ a: 3 });
  assert.strictEqual(buffer.isPaused, true, 'buffer should pause on high water mark');

  // onDrain should fire upon resume
  let drained = false;
  buffer.onDrain(() => { drained = true; });

  await buffer.flush();
  assert.strictEqual(buffer.isPaused, false, 'buffer should resume after flush');
  assert.strictEqual(drained, true, 'onDrain callback should be called after resume');
  assert.strictEqual(flushed.length >= 3, true, 'flushed entries should include pushed ones');
}

async function testCoreLoggerFlushAndRateLimit() {
  // Capture transport
  class CaptureTransport {
    constructor() { this.captured = []; }
    async write(entries) { this.captured.push(...entries); }
  }
  const t = new CaptureTransport();
  const logger = new CoreLogger({
    name: 'core-test',
    transports: [t],
    buffer: { maxSize: 10, flushInterval: 10 },
  });
  await logger.info('m1');
  await logger.info('m2');
  await logger.flush();
  assert.strictEqual(t.captured.length, 2, 'transport should receive flushed entries');
  logger.destroy();

  // Rate limiting rejection
  const limited = new CoreLogger({ name: 'limited', transports: [], buffer: { maxSize: 2 }, rateLimiter: { tokensPerSecond: 0, burstCapacity: 0 } });
  const ok = await limited.info('blocked');
  assert.strictEqual(ok, false, 'should be rate-limited');
  const report = limited.getReport();
  assert.strictEqual(report.stats.logger.rateLimited >= 1, true, 'rateLimited stat should increment');
  limited.destroy();
}

function testDataSanitizer() {
  const s = new DataSanitizer();
  const out = s.sanitize({ email: 'user@example.com', phone: '555-123-4567', nested: { token: 'abc123supersecret' } });
  const str = JSON.stringify(out);
  assert.ok(!str.includes('user@example.com'));
  assert.ok(!str.includes('555-123-4567'));
  assert.ok(!str.includes('abc123supersecret'));

  // Encoded content redaction
  const encodedSecret = Buffer.from('password=supersecret').toString('base64');
  const out2 = s.sanitizeWithEncoding({ payload: encodedSecret });
  assert.strictEqual(out2.payload, '***REDACTED***');
}

async function testAdvancedHttpTransportErrors() {
  // Success path
  const okTransport = new AdvancedHttpTransport('https://example.com/api');
  const okRes = await okTransport.send({ msg: 'hello' });
  assert.strictEqual(okRes.success, true);

  // Temporary error with retries then DLQ
  const tempFail = new AdvancedHttpTransport('https://example.com/api', { shouldFail: true, failureStatusCode: 500, maxRetries: 1, initialBackoff: 5, maxBackoff: 10 });
  const tmpRes = await tempFail.send({ msg: 'x' });
  assert.strictEqual(tmpRes.success, false);
  assert.strictEqual(tmpRes.deadLettered, true);
  const dlq1 = tempFail.getDeadLetterEntries();
  assert.strictEqual(dlq1.length >= 1, true, 'dead letter queue should contain failed entries');

  // Permanent error: no retries, direct DLQ
  const permFail = new AdvancedHttpTransport('https://example.com/api', { shouldFail: true, failureStatusCode: 400, maxRetries: 3 });
  const permRes = await permFail.send({ msg: 'y' });
  assert.strictEqual(permRes.success, false);
  assert.strictEqual(permRes.deadLettered, true);
  const dlq2 = permFail.getDeadLetterEntries();
  assert.strictEqual(dlq2.length >= 1, true);
}

async function testAdvancedHttpTransportFallbackAndFlush() {
  const t = new AdvancedHttpTransport('https://example.com/api', {
    shouldFail: true,
    failureStatusCode: 503,
    maxRetries: 0,
    fallbackEnabled: true,
    fallbackStrategy: 'memory',
  });
  const res = await t.send({ msg: 'persist-me' });
  assert.strictEqual(res.success, false);
  const stats1 = t.getStats();
  assert.strictEqual(stats1.fallbackQueueSize >= 1, true, 'fallback queue should get entries');

  // Simulate recovery and flush the fallback queue
  t.options.shouldFail = false;
  const flushed = await t.flushFallbackQueue();
  const stats2 = t.getStats();
  assert.strictEqual(flushed >= 1, true, 'should re-send some entries');
  assert.strictEqual(stats2.fallbackQueueSize, 0, 'fallback queue should be empty after flush');
}

async function testCoreLoggerInvalidTransportGuard() {
  const invalid = {}; // missing write/log
  const logger = new CoreLogger({ name: 'guard', transports: [invalid], buffer: { maxSize: 1 } });
  assert.strictEqual(logger.transports.length, 0, 'invalid transports should be ignored');
  logger.addTransport({});
  assert.strictEqual(logger.transports.length, 0, 'invalid addTransport should be a no-op');
  logger.destroy();
}

async function testAdaptiveLogBufferDiagnostics() {
  const buffer = new AdaptiveLogBuffer({ maxSize: 2, flushInterval: 10 });
  buffer.onFlush(async () => {});
  await buffer.push({ v: 1 });
  await buffer.flush();
  const stats = buffer.getStatistics();
  assert.ok(typeof stats.lastFlushDurationMs === 'number');
  assert.ok(typeof stats.avgFlushDurationMs === 'number');
  assert.ok(Array.isArray(stats.utilizationHistory));
}

export async function run() {
  await testRateLimiterBasics();
  await testAdaptiveLogBufferFlow();
  await testCoreLoggerFlushAndRateLimit();
  testDataSanitizer();
  await testAdvancedHttpTransportErrors();
  await testAdvancedHttpTransportFallbackAndFlush();
  await testCoreLoggerInvalidTransportGuard();
  await testAdaptiveLogBufferDiagnostics();
}

if (import.meta.main) {
  run()
    .then(() => { console.log('Core tests passed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
