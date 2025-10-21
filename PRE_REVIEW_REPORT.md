# Pre-Review Report — Packaging & Publication Readiness

Date: 2025-10-21

Scope: Structural/package audit for npm publication of `@svg-character-engine/audit-core`.

## TL;DR Summary

✅ Core codebase is ESM-first and runs green locally (tests and coverage tasks pass). README is comprehensive, and LICENSE is present.

⚠️ Not publication-ready yet. Current npm pack includes internal modules, tests, and CI/config files. The CommonJS export path doesn’t provide a usable API. Package metadata is missing several production fields (license in package.json, repository, author, bugs, homepage). No explicit file whitelist is defined, which bloats the package.

🧩 Recommendations: Publish as ESM-only (unless CJS is a hard requirement), add a strict `files` whitelist, remove the `./internal` export, fix README’s license section, complete package.json metadata, and optionally add a `prepublishOnly` guard.

---

## What was reviewed

- Folder structure and repo layout (source, configs, CI, docs)
- `package.json` metadata: entry points, exports, engines, scripts
- Presence of build outputs (`dist/`), TypeScript types (`.d.ts`), and mapping
- Contents of an npm dry-run (`npm pack --dry-run`)
- Publication hygiene (excluded/ignored files, internal APIs exposure)

## Observations & Findings

### 1) Project layout suitability

- Source is organized by feature/domain (core, transports, config, context, etc.).
- No `dist/` folder (no build step needed for plain ESM JS). That’s fine if shipping ESM source directly.
- Many internal/experimental areas coexist in-repo (`internal/`, `health/`, `metrics/`, `performance/`, `features/`, `resilience/`, `workers/`, `tracing/`). These should likely not ship in the npm tarball unless part of the public API.

Conclusion: Layout is good for development, but needs an explicit publish whitelist to avoid shipping internal modules and auxiliary files.

### 2) TypeScript/`dist` outputs

- No TypeScript is used; no `.d.ts` files present; no `dist/` exists.
- `package.json` has no `types` field (correct given no type definitions).

Conclusion: Not applicable; acceptable to publish ESM JS without TS artifacts. If type definitions are desired, plan to add `.d.ts` or JSDoc types later.

### 3) Entry points and exports

- `type: "module"` and `main: "./index.js"` are consistent for ESM.
- `exports` has dual path:
  - `"."` → `import: ./index.js`, `require: ./index.cjs`, `default: ./index.js`
  - `"./internal"` → exposes `./internal/index.js`
- `index.cjs` is a documentation shim and does not actually export the public API. A `require()` will resolve to an empty object (non-functional for CJS consumers).

Conclusion:

- If ESM-only publishing is acceptable, remove the `require` subpath in `exports` and clearly document ESM-only support in README.
- If CJS support is required, implement a real CJS wrapper (or transpile to CJS for `require`) that re-exports the public API.
- Remove `"./internal"` export to avoid exposing non-stable APIs by accident.

### 4) npm dry-run (what will be published today)

Command executed: `npm pack --dry-run`

- Result: 124 files (approx. 197 KB compressed, 871 KB unpacked) including:
  - `.github/**` (CI and security configs)
  - `tests/**` (unit tests)
  - `internal/**` (non-public modules)
  - Multiple auxiliary areas: `features/`, `health/`, `metrics/`, `performance/`, `resilience/`, `workers/`, `tracing/`, scripts, markdown configs

Conclusion: Current tarball is bloated and includes CI/test/config/internal content. This should be pruned before publish via `files` whitelist or `.npmignore`.

### 5) Publication hygiene: ignore/unwanted files

- There is no `.npmignore` and no `files` whitelist in `package.json`.
- npm’s default ignore rules do not exclude `.github/`, tests, or internal folders by default (as shown in dry-run).

Conclusion: Add a `files` whitelist (preferred) to keep the package small and focused.

### 6) Documentation & licensing

- `LICENSE` exists and is MIT.
- README currently says: “No license is declared in the repository.” That’s outdated/incorrect and must be fixed.

Conclusion: Update README to reflect MIT license.

### 7) Package metadata

- Present: `name`, `version`, `description`, `keywords`, `engines` (Node >=18), `scripts` (test/lint/coverage).
- Missing/Recommended:
  - `license` (e.g., `MIT`) — should mirror `LICENSE` file.
  - `repository` (type/url), `bugs` (issues URL), `homepage` (README URL)
  - `author`/`contributors` (optional but recommended)
  - `sideEffects` (consider `false` for better tree-shaking if safe)

Conclusion: Add standard metadata to improve discoverability and compliance.

### 8) Build & publish scripts

- No `build` script (fine for pure ESM).
- No `prepublishOnly` guard; consider gating publishes on lint/tests.

Conclusion: Add `prepublishOnly` to enforce a clean release (e.g., lint:ci + test).

## Ready & Compliant (✅)

- ESM-first package with `type: module` and `main: ./index.js`.
- Tests/coverage scripts run green locally.
- README is detailed and includes usage and API overview.
- LICENSE is present (MIT).
- Engines set to Node >=18 (clear runtime requirement).

## Needs Improvement Before Publish (⚠️)

1) Remove non-public/internal content from the tarball
   - Today’s `npm pack` includes `.github/**`, `tests/**`, `internal/**`, `scripts/**`, and more.
   - Solution: add a `files` whitelist to `package.json`.

2) Fix CommonJS export path
   - `require` target points to `index.cjs`, but that file doesn’t export the API.
   - Decide ESM-only vs CJS support:
     - ESM-only: drop the `require` subpath and document ESM-only support.
     - CJS support: add a real CJS entry that re-exports the public API (via transpilation or manual bridge).

3) Remove `"./internal"` export
   - Prevent accidental exposure of non-stable internals.

4) Add missing package metadata
   - `license`, `repository`, `bugs`, `homepage`, `author`.

5) README licensing statement
   - Update to reflect MIT license (present in repository).

6) Pre-publish quality gate
   - Add `prepublishOnly` to run `npm run lint:ci && npm test` to prevent publishing with warnings/errors.

## Recommendations (🧩) — Proposed concrete changes

1) Add a strict `files` whitelist in `package.json` (preferred over `.npmignore`):

```json
{
  "files": [
    "index.js",
    "index.cjs",
    "core/**",
    "config/**",
    "context/**",
    "error-handling/**",
    "rate-limiting/**",
    "sanitizer/**",
    "sync/**",
    "transports/**",
    "utils/**",
    "README.md",
    "LICENSE",
    "package.json"
  ]
}
```

Adjust the list if some folders should be excluded (e.g., keep `internal/**` out unless you decide to support it publicly).

1) Decide on CommonJS support:

- ESM-only (simplest):

```json
{
  "exports": {
    ".": { "import": "./index.js", "default": "./index.js" }
  }
}
```

- CJS-supporting (requires a real CJS build/bridge):
  - Provide a functional `index.cjs` that re-exports the public API.
  - Or add a build step that transpiles ESM to CJS for the `require` path.

1) Remove `"./internal"` export (unless this is intentionally public and semver-supported).

1) Add metadata to `package.json`:

```json
{
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/abdel-moumen-abdel-raouf/es6-audit-core.git" },
  "bugs": { "url": "https://github.com/abdel-moumen-abdel-raouf/es6-audit-core/issues" },
  "homepage": "https://github.com/abdel-moumen-abdel-raouf/es6-audit-core#readme",
  "author": "Abdel Moumen Abdel Raouf"
}
```

1) Update README to reflect MIT license and (optionally) clarify ESM-only support.

1) Add publish guard:

```json
{
  "scripts": {
    "prepublishOnly": "npm run lint:ci && npm test"
  }
}
```

1) Optional optimizations:

- Consider `sideEffects: false` if modules are safe for tree-shaking.
- If you want to provide TypeScript types later, add a lightweight `index.d.ts` and set `types`.

## Dry-Run Snapshot

Result from `npm pack --dry-run` (abridged):

- Files: 124
- Size (tarball): ~197 KB
- Includes `.github/**`, `tests/**`, `internal/**`, various utility/experimental folders

This confirms the need for a `files` whitelist before publish.

## Prioritized Next-Step Checklist

1) Add `files` whitelist to package.json to exclude CI/tests/internal content.
2) Decide ESM-only vs CJS; update `exports` accordingly and either remove or fix `index.cjs`.
3) Remove `"./internal"` export unless you intend to maintain it as public API.
4) Add `license`, `repository`, `bugs`, `homepage`, and `author` to `package.json`.
5) Update README license section to reflect MIT.
6) Add `prepublishOnly` script to block publishing on lint warnings/test failures.
7) Re-run `npm pack --dry-run` to validate final tarball contents.

---

If you’d like, I can apply the minimum changes now (files whitelist, metadata, ESM-only exports, README fix) and show the new `npm pack` result for your approval before proceeding to actual publishing steps.
