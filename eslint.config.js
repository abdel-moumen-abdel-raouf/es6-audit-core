// ESLint flat config for ESLint v9+
import globals from 'globals';

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
    ],
    linterOptions: {
      // Prevent noise from legacy inline disables on rules we no longer enforce
      reportUnusedDisableDirectives: 'off',
    },
  },

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
      'scripts/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.es2024,
        ...globals.node,
      },
    },
    rules: {
      // Pragmatic noise reduction for legacy code
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
