import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    // Default to Node — every test in this suite is pure logic and works
    // in the Node runtime (Web Crypto, btoa, Request, TextEncoder are all
    // global in Node 18+). Individual files can opt into jsdom via a
    // `// @vitest-environment jsdom` pragma at the top.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // Each test file is independent and mocks Prisma in isolation, so module
    // state (e.g. pricing cache) needs to start clean per file.
    isolate: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
