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
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
          exclude: ['test/**/*.integration.test.ts', 'test/rules-api/**', 'test/mcp/**', 'e2e/**', 'node_modules/**'],
        },
      },
      {
        // Track D (public Rules API + MCP): global mocks live in its own setup file so they
        // never change what the app project's tests run against.
        extends: true,
        test: {
          name: 'rules-api',
          include: ['test/rules-api/**/*.test.ts', 'test/mcp/**/*.test.ts'],
          setupFiles: ['./test/rules-api/setup.ts'],
          clearMocks: true,
        },
      },
    ],
  },
});
