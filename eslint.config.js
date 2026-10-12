// ESLint "flat config". ESLint reads this file to know which rules to apply.
// Docs: https://eslint.org/docs/latest/use/configure/configuration-files
import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Never lint generated or installed code.
  { ignores: ['**/dist/', '**/coverage/', '**/node_modules/', 'spikes/'] },

  // ESLint's own recommended rules for all JavaScript.
  eslint.configs.recommended,

  // TypeScript rules that use type information. These catch real bugs,
  // for example a Promise that is never awaited.
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Find the right tsconfig.json for each file automatically.
        projectService: {
          // Root-level config files are not part of any package tsconfig.
          allowDefaultProject: ['vitest.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Plain .js files (like this one) have no type information to use.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Turn off style rules that would fight with Prettier. Must be last.
  prettierConfig,
);
