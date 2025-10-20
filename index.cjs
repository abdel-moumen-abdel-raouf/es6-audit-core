// logging-lib/index.cjs
// CommonJS compatibility shim for logging-lib.
//
// This file documents the dual-export pattern used in svg-character-engine.
// 
// TECHNICAL NOTE ON ES6/CommonJS INTEROP:
// 
// Node.js has inherent limitations when mixing ES6 modules and CommonJS:
// 1. You cannot require() an ES6 module directly
// 2. You cannot use import.meta in a .cjs file
// 3. The only reliable bridge is dynamic import() (which is async)
//
// SOLUTION IMPLEMENTED:
// We use package.json's "exports" field to route based on consumer:
// - import { X } from 'logging-lib' → uses index.js (ES6 native)
// - require('logging-lib') → uses index.cjs (this file)
//
// Since direct require() of ES6 modules fails, we provide this placeholder
// that documents the proper usage patterns.

// For Node.js 18.20+, you can use top-level await to load ES6 modules:
// (async () => {
//   const { Logger } = await import('./index.js');
//   module.exports = { Logger };
// })();
//
// However, this requires module.exports to be set after module load completes,
// which creates timing issues with require() calls.

// RECOMMENDED USAGE:
// 1. For modern Node.js projects → use import()
// 2. For TypeScript projects → use import()
// 3. For CommonJS legacy code → use async import() wrapper

// Provide minimal CommonJS fallback
module.exports = {
  // Logger: require('./logger.js'),  // ← Would fail: logger.js is ES6
  // Instead, use: const { Logger } = await import('@svg-character-engine/logging-lib')
};
