import { defineConfig } from 'vitest/config';

// One Vitest run covers every package. Package tests sit next to the code
// they test; repo-wide tests (such as .gitignore rules) live in test/.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
