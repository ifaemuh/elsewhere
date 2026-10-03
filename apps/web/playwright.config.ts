import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, PORT, serverEnv } from './e2e/env';

export default defineConfig({
  testDir: './e2e',
  timeout: 360_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Builds with the fixture rules library, then serves the production build.
    command: `bash e2e/prepare.sh && npx next start --port ${PORT}`,
    url: `${BASE_URL}/`,
    reuseExistingServer: false,
    timeout: 600_000,
    env: serverEnv(),
  },
});
