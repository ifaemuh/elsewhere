import { fileURLToPath } from 'node:url';
import { workflow } from '@workflow/vitest';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

export default defineConfig({
  plugins: [workflow()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      { find: 'server-only', replacement: `${root}/test/setup/server-only.ts` },
    ],
  },
  test: {
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 60_000,
    // The generated step bundles import @elsewhere/rules as TypeScript source with extensionless specifiers
    // (live-ports.ts reaches it through the document checks), which plain Node cannot load. tsx can.
    execArgv: ['--import', 'tsx'],
    env: { ELSEWHERE_PORTS: 'memory' },
  },
});
