import { defineConfig } from 'vitest/config';

// No `environment` key: there is no DOM in this package, and no happy-dom
// dependency to provide one. That absence is a result of the extraction, not an
// oversight — the engine and its GPX reader run in Node and in a browser
// unchanged, which is what tsconfig.engine.json asserts at the type level.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
