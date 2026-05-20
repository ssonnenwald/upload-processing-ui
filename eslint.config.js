// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const eslintConfigPrettier = require('eslint-config-prettier');
// SignalStore-specific lint rules. The /v9 entry point is the ESLint v9
// (flat config) build. We use `configs.signals` only — not `configs.all` —
// because this project uses @ngrx/signals but not @ngrx/store, @ngrx/effects,
// or @ngrx/component-store; pulling in `all` would register rules for those
// packages and produce "rule definition not found" errors.
const ngrx = require('@ngrx/eslint-plugin/v9');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      // NgRx SignalStore best-practice rules (e.g. no arrays at the root of
      // withState, signalStoreFeature generic-type checks).
      ngrx.configs.signals,
      eslintConfigPrettier,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@typescript-eslint/array-type': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {},
  },
]);
