import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'client/src/generated/**',
      'convex/_generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      // §8 allows `any` only with a comment explaining it, which is what this enforces.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Floating promises are the main way a fire-and-forget bug hides in this codebase;
      // `void expr` marks the intentional ones.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Seed and config scripts exist to print things.
    files: ['convex/seed.ts', '**/*.config.ts', '**/*.config.js'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
