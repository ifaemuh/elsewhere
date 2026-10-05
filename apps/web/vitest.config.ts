import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      { find: 'server-only', replacement: `${root}/test/setup/server-only.ts` },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/**/*.integration.test.ts', 'e2e/**', 'node_modules/**'],
  },
});
