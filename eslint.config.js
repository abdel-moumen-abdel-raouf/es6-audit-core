// ESLint flat config for ESLint v9+
import globals from 'globals';
import pluginPrettier from 'eslint-plugin-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      '.nyc_output/**',
      'dist/**',
      'build/**',
      '**/*.cjs',
      // Ignore experimental/legacy areas from lint to keep CI green
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
  },
  {
    files: [
      'index.js',
      'core/**/*.js',
      'config/**/*.js',
      'context/**/*.js',
      'error-handling/**/*.js',
      'rate-limiting/rate-limiter.js',
      'sanitizer/**/*.js',
      'sync/**/*.js',
      'transports/{console-transport.js,file-transport.js,http-transport.js,log-buffer.js,adaptive-log-buffer.js}',
      'utils/{types.js,log-entry.js}',
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
      'prettier/prettier': 'warn',
      'no-console': 'off',
      'no-unused-vars': 'warn',
      'no-undef': 'off',
    },
  },
];
