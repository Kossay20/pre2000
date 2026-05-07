import { defineConfig, devices } from '@playwright/test';

/**
 * E2E web — `npm run e2e:web` lance Playwright qui démarre Expo via webServer.
 * Override avec `E2E_BASE_URL` pour cibler un preview déployé (skip webServer).
 */
const usingExternalServer = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: usingExternalServer
    ? undefined
    : {
        command: 'npx expo start --web --port 8081 --clear',
        url: 'http://localhost:8081',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
