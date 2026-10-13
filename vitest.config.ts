import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// One Vitest run covers every package. Package tests sit next to the code
// they test; repo-wide tests (such as .gitignore rules) live in test/.
export default defineConfig({
  // Tests use @relay/core's source, so they never run against a stale build.
  resolve: {
    alias: { '@relay/core': fileURLToPath(new URL('packages/core/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
