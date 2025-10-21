import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const indexPath = path.join(root, 'index.js');

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
      // Patterns: default as Name | Foo as Bar | Foo
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

function inferKind(name) {
  const constNames = new Set(['LogLevel']);
  if (constNames.has(name)) return 'const';
  // Heuristic: treat the public surface as classes unless obviously const
  return 'class';
}

async function main() {
  const src = await fs.readFile(indexPath, 'utf8');
  const exportsList = parseExports(src);
  const manifest = exportsList.map((e) => ({
    name: e.name,
    kind: inferKind(e.name),
    stability: 'stable',
    sourcePath: e.sourcePath,
  }));
  const outPath = path.join(root, 'api-manifest.json');
  await fs.writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${outPath} with ${manifest.length} exports.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
