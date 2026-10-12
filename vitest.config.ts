import { defineConfig } from 'vitest/config';

// One Vitest run covers every package. Test files sit next to the code
// they test and end in .test.ts.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
});
