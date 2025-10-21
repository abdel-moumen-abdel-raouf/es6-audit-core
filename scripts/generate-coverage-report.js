import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const lcovPath = path.join(root, 'coverage', 'lcov.info');
const outPath = path.join(root, 'COVERAGE_REPORT.md');

function rel(p) {
  const np = p.replace(/\\/g, '/');
  const rr = root.replace(/\\/g, '/');
  return np.startsWith(rr) ? np.slice(rr.length + 1) : np;
}

async function parseLCOV(file) {
  const text = await fs.readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const files = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('SF:')) {
      if (current) files.push(current);
      current = {
        file: rel(line.slice(3).trim()),
        linesFound: 0,
        linesHit: 0,
        branchesFound: 0,
        branchesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
      };
    } else if (line.startsWith('LF:')) {
      current && (current.linesFound = parseInt(line.slice(3), 10) || 0);
    } else if (line.startsWith('LH:')) {
      current && (current.linesHit = parseInt(line.slice(3), 10) || 0);
    } else if (line.startsWith('BRF:')) {
      current && (current.branchesFound = parseInt(line.slice(4), 10) || 0);
    } else if (line.startsWith('BRH:')) {
      current && (current.branchesHit = parseInt(line.slice(4), 10) || 0);
    } else if (line.startsWith('FNF:')) {
      current && (current.functionsFound = parseInt(line.slice(4), 10) || 0);
    } else if (line.startsWith('FNH:')) {
      current && (current.functionsHit = parseInt(line.slice(4), 10) || 0);
    } else if (line === 'end_of_record') {
      if (current) {
        files.push(current);
        current = null;
      }
    }
  }
  if (current) files.push(current);
  return files;
}

function pct(hit, found) {
  if (!found) return 100;
  return Math.round((hit / found) * 10000) / 100;
}

function rowFor(f) {
  const linesP = pct(f.linesHit, f.linesFound);
  const funcsP = pct(f.functionsHit, f.functionsFound);
  const branchesP = pct(f.branchesHit, f.branchesFound);
  // Approximate statements using lines (lcov has no statements metric)
  const stmtsP = linesP;
  const below = [linesP, funcsP, branchesP, stmtsP].some((p) => p < 50);
  const flag = below ? '❌' : '✅';
  return {
    line: `| ${flag} | ${f.file} | ${stmtsP.toFixed(2)}% | ${branchesP.toFixed(2)}% | ${funcsP.toFixed(2)}% | ${linesP.toFixed(2)}% |`,
    linesP,
    funcsP,
    branchesP,
    stmtsP,
  };
}

function sum(a, b) {
  return a + b;
}

async function main() {
  const files = await parseLCOV(lcovPath);
  // Filter only project files (exclude node_modules or coverage paths if present)
  const projFiles = files.filter((f) => !/node_modules|\bcoverage\b/.test(f.file));
  const rows = projFiles.map(rowFor);

  const totals = projFiles.reduce(
    (acc, f) => ({
      linesFound: acc.linesFound + f.linesFound,
      linesHit: acc.linesHit + f.linesHit,
      branchesFound: acc.branchesFound + f.branchesFound,
      branchesHit: acc.branchesHit + f.branchesHit,
      functionsFound: acc.functionsFound + f.functionsFound,
      functionsHit: acc.functionsHit + f.functionsHit,
    }),
    {
      linesFound: 0,
      linesHit: 0,
      branchesFound: 0,
      branchesHit: 0,
      functionsFound: 0,
      functionsHit: 0,
    }
  );

  const overall = {
    stmts: pct(totals.linesHit, totals.linesFound), // approximation
    branches: pct(totals.branchesHit, totals.branchesFound),
    funcs: pct(totals.functionsHit, totals.functionsFound),
    lines: pct(totals.linesHit, totals.linesFound),
  };

  // Recommend top 5 critical modules (prefer core logging and buffering)
  const priorityDirs = ['core/', 'transports/', 'sanitizer/', 'rate-limiting/'];
  const scored = projFiles
    .map((f) => {
      const baseScore = 100 - pct(f.linesHit, f.linesFound);
      const weight = priorityDirs.some((d) => f.file.startsWith(d)) ? 1.5 : 1.0;
      return { file: f.file, score: baseScore * weight, linesFound: f.linesFound };
    })
    .sort((a, b) => b.score - a.score);
  const top5 = scored
    .filter((s) => s.linesFound > 0)
    .slice(0, 5)
    .map((s) => s.file);

  const header = `# Coverage Report\n\nGenerated from coverage/lcov.info. Files below 50% in any category are marked with ❌. Statements are approximated by line coverage due to LCOV limitations.\n`;
  const summary = `\n## Overall Summary\n\n- Statements: ${overall.stmts.toFixed(2)}%\n- Branches: ${overall.branches.toFixed(2)}%\n- Functions: ${overall.funcs.toFixed(2)}%\n- Lines: ${overall.lines.toFixed(2)}%\n`;
  const tableHeader = `\n## File Coverage\n\n| Status | File | Statements | Branches | Functions | Lines |\n| --- | --- | ---: | ---: | ---: | ---: |\n`;
  const table = rows.map((r) => r.line).join('\n');
  const recs = `\n## Top 5 modules to prioritize\n\n${top5.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;

  const out = header + summary + tableHeader + table + '\n' + recs;
  await fs.writeFile(outPath, out, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
