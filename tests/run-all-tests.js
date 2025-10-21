// Simple sequential test runner for Node ESM
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tests = [
  pathToFileURL(path.join(__dirname, 'basic.test.js')).href,
  pathToFileURL(path.join(__dirname, 'core.test.js')).href,
];

let failures = 0;

for (const t of tests) {
  try {
    const mod = await import(t);
    if (typeof mod.run === 'function') {
      await mod.run();
    }
    console.log(`[ok] ${t}`);
  } catch (e) {
    failures += 1;
    console.error(`[fail] ${t}`);
    console.error(e);
  }
}

if (failures > 0) {
  console.error(`Test failures: ${failures}`);
  process.exit(1);
} else {
  console.log('All tests passed');
}
