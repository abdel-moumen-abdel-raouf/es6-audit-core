import assert from 'assert';
import { CoreLogger } from '../core/core-logger.js';
import { ConsoleTransport } from '../transports/console-transport.js';
import { LogLevel } from '../utils/types.js';
import { DataSanitizer } from '../sanitizer/data-sanitizer.js';

async function testAsyncLoggingAndBatch() {
  const transport = new ConsoleTransport();
  const logger = new CoreLogger({ name: 'test', transports: [transport], buffer: { maxSize: 10 } });
  const ok = await logger.info('hello', { email: 'user@example.com', ip: '127.0.0.1' });
  assert.strictEqual(ok, true);
  await logger.flush();
}

function testSanitizerDefaults() {
  const s = new DataSanitizer();
  const out = s.sanitize({ email: 'user@example.com', phone: '555-123-4567' });
  const str = JSON.stringify(out);
  assert(!str.includes('user@example.com'));
  assert(!str.includes('555-123-4567'));
}

export async function run() {
  await testAsyncLoggingAndBatch();
  testSanitizerDefaults();
  // Batch fallback: ensure logger handles transports without write() by using log()
  class LogOnlyTransport {
    async log() { /* no-op */ }
  }
  const t = new LogOnlyTransport();
  const logger = new CoreLogger({ name: 'batch', transports: [t], buffer: { maxSize: 2, flushInterval: 10 } });
  await logger.info('a');
  await logger.info('b');
  await logger.flush();
}

if (import.meta.main) {
  run().then(() => {
    console.log('All tests passed');
    process.exit(0);
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
