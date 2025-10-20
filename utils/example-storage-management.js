/**
 * Phase 5 - Real-World Usage Examples
 * 
 * Demonstrates practical usage of:
 * - RotatingFileTransport
 * - LogArchiver
 * - LogCleanupPolicy
 * - LogBuffer
 * 
 * @author audit-core
 * @version 1.0.0
 */

import RotatingFileTransport from '../transports/rotating-file-transport.js';
import LogArchiver from '../transports/log-archiver.js';
import LogCleanupPolicy from '../transports/log-cleanup-policy.js';
import LogBuffer from '../transports/log-buffer.js';
import { LogEntry } from './log-entry.js';
import path from 'path';
import fs from 'fs';

const examplesDir = path.join(process.cwd(), 'phase-5-examples');

// ============================================================================
// Example 1: Basic Log Rotation Setup
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('Example 1: Basic Log Rotation Setup');
console.log('='.repeat(80));

async function example1_BasicRotation() {
  // Create rotating transport with 1MB limit (for demo)
  const rotatingTransport = new RotatingFileTransport({
    filePath: path.join(examplesDir, 'example-1', 'app.log'),
    maxFileSize: 1024 * 1024,  // 1MB
    maxFiles: 5,
    rotationStrategy: 'size'
  });

  console.log('â„¹ RotatingFileTransport created:');
  console.log(`  - Max file size: 1MB`);
  console.log(`  - Max files to keep: 5`);
  console.log(`  - Strategy: size-based rotation`);

  // Log some entries
  for (let i = 0; i < 5; i++) {
    const entry = new LogEntry('INFO', 'app', `Log message ${i}`, { index: i });
    await rotatingTransport.log(entry);
  }

  const info = rotatingTransport.getInfo();
  console.log('\nâœ“ Transport info:', info);
}

// ============================================================================
// Example 2: Log Archiving with Compression
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('Example 2: Log Archiving with Compression');
console.log('='.repeat(80));

async function example2_Archiving() {
  const logsDir = path.join(examplesDir, 'example-2', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  // Create a test log file
  const logFile = path.join(logsDir, 'old-logs.log');
  const content = 'Log entry line\n'.repeat(1000);
  fs.writeFileSync(logFile, content);

  console.log('â„¹ Test log file created:');
  console.log(`  - File: ${logFile}`);
  console.log(`  - Size: ${(fs.statSync(logFile).size / 1024).toFixed(2)} KB`);

  // Compress the file
  const result = await LogArchiver.compressFile(logFile, { removeOriginal: false });

  console.log('\nâœ“ File compressed:');
  console.log(`  - Original size: ${(result.originalSize / 1024).toFixed(2)} KB`);
  console.log(`  - Compressed size: ${(result.compressedSize / 1024).toFixed(2)} KB`);
  console.log(`  - Compression ratio: ${result.compressionRatio.toFixed(2)}%`);
  console.log(`  - Archive: ${result.archiveFile}`);

  // Get archive statistics
  const stats = LogArchiver.getArchiveStats(logsDir);
  console.log('\nâœ“ Archive statistics:');
  console.log(`  - Total files: ${stats.totalFiles}`);
  console.log(`  - Total size: ${(stats.totalSize / 1024).toFixed(2)} KB`);
  console.log(`  - Compressed size: ${(stats.compressedSize / 1024).toFixed(2)} KB`);
  console.log(`  - Compression ratio: ${stats.compressionRatio.toFixed(2)}%`);
}

// ============================================================================
// Example 3: Automatic Cleanup Policy
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('Example 3: Automatic Cleanup Policy');
console.log('='.repeat(80));

async function example3_Cleanup() {
  const logsDir = path.join(examplesDir, 'example-3', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  // Create multiple test files with different ages
  console.log('â„¹ Creating test files with different ages...');
  
  for (let i = 0; i < 5; i++) {
    const file = path.join(logsDir, `log-${i}.log`);
    fs.writeFileSync(file, `Log content ${i}\n`.repeat(100));
    
    // Set mtime to various ages
    const ageMs = (i + 1) * 31 * 24 * 60 * 60 * 1000; // 31, 62, 93, 124, 155 days ago
    const oldTime = (Date.now() - ageMs) / 1000;
    fs.utimesSync(file, oldTime, oldTime);
  }

  console.log(`  - Created 5 files with ages: 31, 62, 93, 124, 155 days`);

  // Get initial stats
  const policy = new LogCleanupPolicy({
    maxAge: 90 * 24 * 60 * 60 * 1000  // 90 days
  });

  const initialStats = await policy.getDirectoryStats(logsDir);
  console.log('\nâœ“ Initial directory stats:');
  console.log(`  - Files: ${initialStats.fileCount}`);
  console.log(`  - Total size: ${(initialStats.totalSize / 1024).toFixed(2)} KB`);
  console.log(`  - Oldest file: ${initialStats.oldestFile?.name} (${(initialStats.oldestFile?.age / 1000 / 60 / 60 / 24).toFixed(0)} days)`);

  // Run cleanup
  const result = await policy.cleanup(logsDir);

  console.log('\nâœ“ Cleanup results:');
  console.log(`  - Files deleted: ${result.stats.filesDeleted}`);
  console.log(`  - Deleted size: ${(result.stats.deletedSize / 1024).toFixed(2)} KB`);
  console.log(`  - Files remaining: ${result.stats.filesRemaining}`);
}

// ============================================================================
// Example 4: Log Buffering and Batch Processing
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('Example 4: Log Buffering and Batch Processing');
console.log('='.repeat(80));

async function example4_Buffering() {
  let flushCount = 0;
  let batchSize = 0;

  // Create buffer with callback
  const buffer = new LogBuffer({
    maxSize: 50,
    flushInterval: 2000,
    onFlush: (entries, meta) => {
      flushCount++;
      batchSize = entries.length;
      console.log(`  [Flush #${flushCount}] Processed ${entries.length} entries (auto: ${meta.isAutoFlush})`);
    }
  });

  console.log('â„¹ Buffer created:');
  console.log(`  - Max size: 50 entries`);
  console.log(`  - Flush interval: 2000ms`);

  // Add entries
  console.log('\nâœ“ Adding 150 entries...');
  for (let i = 0; i < 150; i++) {
    const entry = new LogEntry('INFO', 'app', `Message ${i}`, { index: i });
    buffer.add(entry);
  }

  // Get statistics
  const stats = buffer.getStats();
  console.log('\nâœ“ Buffer statistics:');
  console.log(`  - Total entries added: ${stats.entriesAdded}`);
  console.log(`  - Total entries flushed: ${stats.entriesFlushed}`);
  console.log(`  - Flush count: ${stats.flushCount}`);
  console.log(`  - Average flush size: ${stats.averageFlushSize.toFixed(0)}`);
  console.log(`  - Efficiency: ${stats.efficiency}`);
}

// ============================================================================
// Example 5: Combined Production Setup
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('Example 5: Combined Production Setup');
console.log('='.repeat(80));

async function example5_ProductionSetup() {
  const logsDir = path.join(examplesDir, 'example-5', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  console.log('â„¹ Setting up production logging system...\n');

  // 1. Setup rotating transport
  console.log('1. Rotating File Transport:');
  const rotatingTransport = new RotatingFileTransport({
    filePath: path.join(logsDir, 'app.log'),
    maxFileSize: 5 * 1024 * 1024,  // 5MB
    maxFiles: 10,
    rotationStrategy: 'both'
  });
  await rotatingTransport.initialize();
  console.log('   âœ“ Configured for 5MB files, keeping 10 rotated files\n');

  // 2. Setup buffer
  console.log('2. Log Buffer:');
  const buffer = new LogBuffer({
    maxSize: 100,
    flushInterval: 5000,
    onFlush: (entries) => {
      console.log(`   âœ“ Buffer flushed: ${entries.length} entries`);
    }
  });
  buffer.start();
  console.log('   âœ“ Enabled with 100-entry buffer, 5s flush interval\n');

  // 3. Setup cleanup policy
  console.log('3. Cleanup Policy:');
  const cleanupPolicy = new LogCleanupPolicy({
    maxAge: 30 * 24 * 60 * 60 * 1000,      // 30 days
    maxTotalSize: 1024 * 1024 * 1024,      // 1GB
    checkInterval: 1 * 60 * 60 * 1000,     // Every hour
    priority: 'age'
  });
  console.log('   âœ“ Deletes files > 30 days or when size > 1GB\n');

  // 4. Generate some logs
  console.log('4. Generating sample logs...');
  for (let i = 0; i < 20; i++) {
    const entry = new LogEntry(
      i % 3 === 0 ? 'ERROR' : i % 2 === 0 ? 'WARN' : 'INFO',
      'production-app',
      `Production log entry ${i}`,
      { timestamp: new Date(), id: i }
    );
    buffer.add(entry);
  }
  console.log('   âœ“ 20 entries added to buffer\n');

  // 5. Show final stats
  console.log('5. System Statistics:');
  const bufferStats = buffer.getStats();
  console.log(`   - Buffer efficiency: ${bufferStats.efficiency}`);
  console.log(`   - Entries pending: ${bufferStats.entriesPending}`);
  console.log(`   - Auto-flushes: ${bufferStats.autoFlushCount}\n`);

  buffer.stop();
  console.log('âœ“ Production setup complete and verified\n');
}

// ============================================================================
// Example 6: Performance Monitoring
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('Example 6: Performance Monitoring');
console.log('='.repeat(80));

async function example6_Performance() {
  const logsDir = path.join(examplesDir, 'example-6', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  console.log('â„¹ Measuring system performance...\n');

  // 1. Buffer throughput
  console.log('1. Buffer Throughput Test:');
  const buffer = new LogBuffer({ maxSize: 1000 });
  const startTime = Date.now();
  
  for (let i = 0; i < 10000; i++) {
    buffer.add(new LogEntry('INFO', 'perf-test', `Message ${i}`, {}));
  }
  
  const duration = Date.now() - startTime;
  const throughput = (10000 / duration * 1000).toFixed(0);
  console.log(`   âœ“ Processed 10,000 entries in ${duration}ms`);
  console.log(`   âœ“ Throughput: ${throughput} entries/sec\n`);

  // 2. File rotation performance
  console.log('2. Rotation Performance Test:');
  const rotateStart = Date.now();
  
  const transport = new RotatingFileTransport({
    filePath: path.join(logsDir, 'perf.log'),
    maxFileSize: 512 * 1024  // 512KB
  });

  for (let i = 0; i < 100; i++) {
    await transport.log(
      new LogEntry('INFO', 'perf', `Long message ${i}`.padEnd(100), {})
    );
  }

  const rotateDuration = Date.now() - rotateStart;
  console.log(`   âœ“ 100 logs with rotation in ${rotateDuration}ms\n`);

  // 3. Archiving performance
  console.log('3. Archiving Performance Test:');
  const archiveFile = path.join(logsDir, 'large.log');
  const largeContent = 'Log line content\n'.repeat(100000);
  fs.writeFileSync(archiveFile, largeContent);

  const archiveStart = Date.now();
  const archiveResult = await LogArchiver.compressFile(archiveFile);
  const archiveDuration = Date.now() - archiveStart;

  console.log(`   âœ“ Compressed 1.7MB file in ${archiveDuration}ms`);
  console.log(`   âœ“ Compression ratio: ${archiveResult.compressionRatio.toFixed(2)}%\n`);

  console.log('âœ“ Performance testing complete\n');
}

// ============================================================================
// Main Execution
// ============================================================================

async function runAllExamples() {
  try {
    // Create examples directory
    if (!fs.existsSync(examplesDir)) {
      fs.mkdirSync(examplesDir, { recursive: true });
    }

    await example1_BasicRotation();
    await example2_Archiving();
    await example3_Cleanup();
    await example4_Buffering();
    await example5_ProductionSetup();
    await example6_Performance();

    console.log('\n' + '='.repeat(80));
    console.log('âœ“ All Examples Completed Successfully');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\nâœ— Error running examples:', error.message);
    process.exit(1);
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  example1_BasicRotation,
  example2_Archiving,
  example3_Cleanup,
  example4_Buffering,
  example5_ProductionSetup,
  example6_Performance
};

