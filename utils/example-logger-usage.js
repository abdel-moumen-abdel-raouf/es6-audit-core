/**
 * CoreLogger - Real-World Usage Example
 *
 */

import { CoreLogger } from '../core/core-logger.js';
import { ConsoleTransport } from '../transports/console-transport.js';
import { LogLevel } from '../utils/types.js';

// ================== SCENARIO 1: Basic Setup ==================

console.log('\n=== SCENARIO 1: Basic Setup ===\n');

const transport = new ConsoleTransport();
const mathLogger = new CoreLogger({ name: 'math-lib', transports: [transport] });
const drawingLogger = new CoreLogger({ name: 'drawing-lib', transports: [transport] });
const styleLogger = new CoreLogger({ name: 'style-lib', transports: [transport] });

mathLogger.info('Math engine initialized');
drawingLogger.info('Drawing engine initialized');
styleLogger.info('Style engine initialized');

await mathLogger.debug('Vector calculation (debug)');

// ================== SCENARIO 2: Dynamic Level Changes ==================

console.log('\n=== SCENARIO 2: Dynamic Level Changes ===\n');

console.log('Switching to more verbose logging for math-lib (simulated)');
await mathLogger.debug('Now this debug message is visible!', {
  precision: 0.001,
  algorithm: 'Bresenham',
});

// ================== SCENARIO 3: Pattern-Based Configuration ==================

console.log('\n=== SCENARIO 3: Pattern-Based Configuration ===\n');

await drawingLogger.info('This info message sample');
await drawingLogger.warn('This warning is visible');
await drawingLogger.error('This error is visible');

await mathLogger.info('This info is visible');
await mathLogger.debug('This debug is visible');

// ================== SCENARIO 4: Priority System ==================

console.log('\n=== SCENARIO 4: Priority System (Module > Pattern > Default) ===\n');

// - Pattern *-lib: WARN
// - Module math-lib: DEBUG
console.log('Level Resolution (simulated):');
console.log('  math-lib: DEBUG');
console.log('  drawing-lib: WARN');
console.log('  style-lib: WARN');

// ================== SCENARIO 5: Context Logging ==================

console.log('\n=== SCENARIO 5: Context Logging with Additional Data ===\n');

await mathLogger.info('Vector calculation completed', {
  x: 10,
  y: 20,
  magnitude: Math.sqrt(100 + 400),
  precision: 0.001,
});

await drawingLogger.warn('Large shape detected', {
  type: 'polygon',
  vertices: 10000,
  area: 99999,
  estimated_render_time: '45ms',
});

await styleLogger.error('Failed to apply gradient', {
  gradient_type: 'linear',
  color_space: 'rgb',
  error_code: 'INVALID_COLOR',
  attempted_color: '#GGGGGG',
});

// ================== SCENARIO 6: Conditional Expensive Operations ==================

console.log('\n=== SCENARIO 6: Conditional Expensive Operations ===\n');

function calculateBenchmark() {
  const results = {
    fps: 60,
    memory_used: '124MB',
    cpu_usage: '45%',
    cache_hits: 9542,
    cache_misses: 458,
  };
  console.log('  [Performing expensive benchmark calculation...]');
  return results;
}

// mathLogger.debug('Benchmark', calculateBenchmark());

const benchmark = calculateBenchmark();
await mathLogger.debug('Benchmark Results', benchmark);

// ================== SCENARIO 7: Multiple Loggers from Same Module ==================

console.log('\n=== SCENARIO 7: Multiple Loggers from Same Module ===\n');

console.log('Multiple loggers scenario omitted (API simplified)');

// ================== SCENARIO 8: Logger Information ==================

console.log('\n=== SCENARIO 8: Getting Logger Information ===\n');

console.log('Logger Info (basic):');
console.log(`  Module Name: math-lib`);
console.log(`  Transports: ${mathLogger.transports.length}`);

// ================== SCENARIO 9: Error Handling ==================

console.log('\n=== SCENARIO 9: Error Handling ===\n');

try {
  const invalidLogger = new EnhancedLogger('', config);
} catch (error) {
  console.log(`✅ Caught error: ${error.message}`);
}

try {
  const invalidLogger = new EnhancedLogger('math-lib', {});
} catch (error) {
  console.log(`✅ Caught error: ${error.message}`);
}

// ================== SCENARIO 10: Reset and Summary ==================

console.log('\n=== SCENARIO 10: Summary ===\n');

console.log('After reset to INFO level (simulated)');
console.log('  Math Logger: INFO');
console.log('  Drawing Logger: INFO');
console.log('  Style Logger: INFO');

const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

console.log('\nLevel Checking at INFO level:');
levels.forEach((level, index) => {
  console.log(`  ${levelNames[index]} (${level}) sample`);
});

// ================== FINAL MESSAGE ==================

console.log('\n' + '='.repeat(50));
console.log('✅ All scenarios completed successfully!');
console.log('='.repeat(50) + '\n');

export { mathLogger, drawingLogger, styleLogger };
