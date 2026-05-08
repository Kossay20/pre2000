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
  // Cold-boot Expo + traversal `/HomeMain → /Language → English → Continue → AuthChoice
  // → Onboarding (5 écrans) → MainTabs` peut dépasser 60s sur un Chromium fresh.
  // Le helper `ensureMainTabs` cumule des waits explicites (30s tabs/English + 20s
  // I am pregnant + 15s Last Period + 15s 25-29 + 20s Continue as Guest + 45s tablist),
  // donc on aligne le test timeout sur ce budget réaliste.
  timeout: 120_000,
  // Pré-populer `localStorage` avec un profil guest valide (e2e/global-setup.ts)
  // évite le bootstrap onboarding 7× → /HomeMain charge MainTabs directement.
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8081',
    storageState: 'e2e/.auth/state.json',
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
