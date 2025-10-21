// ESLint flat config for ESLint v9+
import globals from 'globals';
import pluginPrettier from 'eslint-plugin-prettier';

export default [
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'coverage/lcov-report/**',
      '.nyc_output/**',
      'dist/**',
      'build/**',
      '**/*.cjs',
      // Keep experimental/legacy areas ignored for now
      'workers/**',
      'tracing/**',
      'metrics/**',
      'performance/**',
      'health/**',
      'features/**',
      'resilience/**',
      'buffers/**',
      'transports/cloudwatch-transport.js',
      'transports/database-transport.js',
      'transports/http-transport-queue.js',
      'transports/http-transport-persistent.js',
      'internal/**',
    ],
    linterOptions: {
      // Prevent noise from legacy inline disables on rules we no longer enforce
      reportUnusedDisableDirectives: 'off',
    },
  },

  // Note: We register the Prettier plugin and enforce formatting via the rule below.

  // Project rules
  {
    files: [
      'index.js',
      'core/**/*.js',
      'config/**/*.js',
      'context/**/*.js',
      'error-handling/**/*.js',
      'rate-limiting/**/*.js',
      'sanitizer/**/*.js',
      'sync/**/*.js',
      'transports/**/*.js',
      'utils/**/*.js',
      'tests/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.es2024,
        ...globals.node,
      },
    },
    plugins: {
      prettier: pluginPrettier,
    },
    rules: {
      // Formatting by Prettier (already enabled via recommended config)
      'prettier/prettier': 'error',

      // Pragmatic noise reduction for legacy code
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
