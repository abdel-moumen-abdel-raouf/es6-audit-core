import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const indexPath = path.join(root, 'index.js');
const manifestPath = path.join(root, 'api-manifest.json');

function parseExports(src) {
  const re = /export\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'\"]+)['"];?/g;
  const result = [];
  let m;
  while ((m = re.exec(src))) {
    const list = m[1];
    const from = m[2];
    for (const part of list.split(',')) {
      const spec = part.trim();
      if (!spec) continue;
      if (/^default\s+as\s+/i.test(spec)) {
        const name = spec.replace(/^default\s+as\s+/i, '').trim();
        result.push({ name, sourcePath: from });
      } else if (/\s+as\s+/i.test(spec)) {
        const parts = spec.split(/\s+as\s+/i);
        const name = (parts[1] || '').trim();
        result.push({ name, sourcePath: from });
      } else {
        const name = spec;
        result.push({ name, sourcePath: from });
      }
    }
  }
  return result;
}

async function main() {
  const [src, manifestRaw] = await Promise.all([
    fs.readFile(indexPath, 'utf8'),
    fs.readFile(manifestPath, 'utf8'),
  ]);
  const current = parseExports(src).map((e) => e.name).sort();
  const manifest = JSON.parse(manifestRaw).map((e) => e.name).sort();

  const setCurrent = new Set(current);
  const setManifest = new Set(manifest);

  const added = current.filter((n) => !setManifest.has(n));
  const removed = manifest.filter((n) => !setCurrent.has(n));

  if (added.length || removed.length) {
    console.error('API manifest mismatch:');
    if (added.length) console.error('  Added exports not in manifest:', added.join(', '));
    if (removed.length) console.error('  Removed exports present in manifest:', removed.join(', '));
    console.error('If intentional, update api-manifest.json via scripts/generate-api-manifest.js and commit the change.');
    process.exit(1);
  }
  console.log('API is consistent with manifest.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
