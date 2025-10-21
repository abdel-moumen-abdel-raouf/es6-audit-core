import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const moves = {
  'transports/batch-queue.js': 'internal/transports/batch-queue.js',
  'transports/batch-sequencer.js': 'internal/transports/batch-sequencer.js',
  'transports/log-archiver.js': 'internal/transports/log-archiver.js',
  'transports/log-rotator.js': 'internal/transports/log-rotator.js',
  'transports/log-cleanup-policy.js': 'internal/transports/log-cleanup-policy.js',
  'transports/payload-rotation.js': 'internal/transports/payload-rotation.js',
  'core/resilient-logger.js': 'internal/experimental/resilient-logger.js',
  'core/adaptive-logger.js': 'internal/experimental/adaptive-logger.js',
  'sanitizer/sanitizer-advanced.js': 'internal/utils/sanitizer-advanced.js',
  'utils/stack-trace.js': 'internal/utils/stack-trace.js',
  'utils/log-formatter.js': 'internal/utils/log-formatter.js',
  'utils/module-pattern-matcher.js': 'internal/utils/module-pattern-matcher.js',
  'utils/output-customizer.js': 'internal/utils/output-customizer.js',
  'utils/memory-safe-context.js': 'internal/utils/memory-safe-context.js',
  'utils/support-systems.js': 'internal/utils/support-systems.js',
  'workers/worker-thread-pool.js': 'internal/workers/worker-thread-pool.js',
  'workers/worker-thread-integration.js': 'internal/workers/worker-thread-integration.js',
  'workers/worker-integration.js': 'internal/workers/worker-integration.js',
  'tracing/tracing-integration.js': 'internal/tracing/tracing-integration.js',
  'rate-limiting/rate-limiter-advanced.js': 'internal/experimental/rate-limiter-advanced.js',
  'rate-limiting/rate-limiter-strict.js': 'internal/experimental/rate-limiter-strict.js',
  'error-handling/error-handler.js': 'internal/utils/error-handler.js',
  'error-handling/contextual-log-entry.js': 'internal/utils/contextual-log-entry.js',
};

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (['node_modules', '.git', 'coverage', 'scripts'].includes(ent.name)) continue;
    if (ent.isDirectory()) {
      await walk(full);
    } else if (ent.isFile() && full.endsWith('.js')) {
      let content = await fs.readFile(full, 'utf8');
      let changed = false;
      for (const [oldRel, newRel] of Object.entries(moves)) {
        const oldPosix = toPosix(oldRel);
        const newAbs = path.join(root, newRel);
        const fromDir = path.dirname(full);
        let rel = toPosix(path.relative(fromDir, newAbs));
        if (!rel.startsWith('.')) rel = './' + rel;
        const oldPathEsc = escapeRe(oldPosix);
        // Replace relative ESM imports that end with old path
        const reFrom = new RegExp(`(from\\s+['"])((?:\\./|\.\./).*?)${oldPathEsc}(['"])`, 'g');
        // Replace relative CommonJS requires
        const reRequire = new RegExp(
          `(require\\(\\s*['"])((?:\\./|\.\./).*?)${oldPathEsc}(['"])`,
          'g'
        );
        let next = content.replace(reFrom, `$1${rel}$3`).replace(reRequire, `$1${rel}$3`);
        // Also fix accidental bare 'internal/...' specifiers produced earlier
        const bareOld = escapeRe('internal/' + oldPosix.split('/').slice(1).join('/'));
        const reBareFrom = new RegExp(`(from\\s+['"])${bareOld}(['"])`, 'g');
        const reBareReq = new RegExp(`(require\\(\\s*['"])${bareOld}(['"])`, 'g');
        next = next.replace(reBareFrom, `$1${rel}$2`).replace(reBareReq, `$1${rel}$2`);
        if (next !== content) {
          content = next;
          changed = true;
        }
      }
      if (changed) {
        await fs.writeFile(full, content, 'utf8');
        console.log('Updated imports in:', toPosix(path.relative(root, full)));
      }
    }
  }
}

walk(root).then(() => console.log('Import update script complete.'));
