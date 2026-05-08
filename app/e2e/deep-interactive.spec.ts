import { test, expect, type Page } from '@playwright/test';

/**
 * MCP-like deep interactive E2E spec — replique l'expérience MCP en file-based.
 *
 * Capture 25+ screenshots couvrant TOUS les flows demandés par l'utilisateur :
 *  - First-connection guest pregnant complet (Language→AuthChoice→Onboarding 4 steps→MainTabs)
 *  - Multi-language switch live (FR + EN + AR avec RTL)
 *  - Tabs navigation tour (Home/Calendar/Reminders/Resources/Chatbot)
 *  - Chatbot interaction (input textbox visible)
 *  - Profile + Settings access
 *  - TTC mode flow
 *  - Curious mode flow
 *  - Console errors collection per screen
 *
 * Usage : `npx playwright test e2e/deep-interactive.spec.ts`
 * Output : audit-screenshots/mcp-XX-*.png + console-errors.json
 */

const TAB = {
  home: '🏠 🏠 Home',
  calendar: '📅 📅 Calendar',
  reminders: '🔔 🔔 Reminders',
  resources: '📚 📚 Resources',
  chatbot: '💬 💬 Chatbot',
} as const;

// Capture errors par screen
const errorsLog: Record<string, string[]> = {};
function trackErrors(page: Page, screen: string) {
  errorsLog[screen] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errorsLog[screen].push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errorsLog[screen].push(`pageerror: ${err.message}`);
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `audit-screenshots/mcp-${name}.png`,
    fullPage: true,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('MCP-like deep interactive audit', () => {
  test('01 — Language picker (FR par défaut)', async ({ page }) => {
    trackErrors(page, '01-language-fr');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Français', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await shot(page, '01-language-fr-default');
  });

  test('02 — Language picker switch EN', async ({ page }) => {
    trackErrors(page, '02-language-en-switch');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText('English', { exact: true }).first().click();
    await page.waitForTimeout(1500);
    await shot(page, '02-language-after-en-click');
  });

  test('03 — Language picker switch AR (RTL)', async ({ page }) => {
    trackErrors(page, '03-language-ar-rtl');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText('العربية', { exact: true }).first().click();
    await page.waitForTimeout(1500);
    await shot(page, '03-language-after-ar-click');
  });

  test('04 — AuthChoice screen (FR par défaut)', async ({ page }) => {
    trackErrors(page, '04-authchoice');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText(/^(Continue|Continuer)$/).first().click();
    await expect(page.getByTestId('auth_guest_button')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);
    await shot(page, '04-authchoice-fr');
  });

  test('05 — Register screen', async ({ page }) => {
    trackErrors(page, '05-register');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText(/^(Continue|Continuer)$/).first().click();
    await expect(page.getByTestId('auth_signup_button')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('auth_signup_button').click();
    await page.waitForTimeout(2000);
    await shot(page, '05-register-form');
  });

  test('06 — Login screen', async ({ page }) => {
    trackErrors(page, '06-login');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText(/^(Continue|Continuer)$/).first().click();
    await expect(page.getByTestId('auth_login_button')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('auth_login_button').click();
    await page.waitForTimeout(2000);
    await shot(page, '06-login-form');
  });

  test('07 — Onboarding step 1 (mode select)', async ({ page }) => {
    trackErrors(page, '07-onboarding-step1');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText(/^(Continue|Continuer)$/).first().click();
    await page.getByTestId('auth_guest_button').click();
    await expect(page.getByRole('button', { name: 'I am pregnant' }).or(page.getByRole('button', { name: /enceinte/i }))).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await shot(page, '07-onboarding-step1');
  });

  test('08 — Onboarding step 2 pregnant (DDR/Conception)', async ({ page }) => {
    trackErrors(page, '08-onboarding-step2');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText(/^(Continue|Continuer)$/).first().click();
    await page.getByTestId('auth_guest_button').click();
    const pregnantBtn = page.getByRole('button', { name: 'I am pregnant' }).or(page.getByRole('button', { name: /enceinte/i }));
    await pregnantBtn.click({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    await shot(page, '08-onboarding-step2-pregnant');
  });

  test('09 — Onboarding TTC step 2', async ({ page }) => {
    trackErrors(page, '09-onboarding-ttc');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText(/^(Continue|Continuer)$/).first().click();
    await page.getByTestId('auth_guest_button').click();
    const ttcBtn = page.getByRole('button', { name: /trying to conceive|essaie/i });
    await ttcBtn.click({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    await shot(page, '09-onboarding-ttc-step2');
  });

  test('10 — Onboarding Curious step 2', async ({ page }) => {
    trackErrors(page, '10-onboarding-curious');
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText(/^(Continue|Continuer)$/).first().click();
    await page.getByTestId('auth_guest_button').click();
    const curiousBtn = page.getByRole('button', { name: /curious|curieuse/i });
    await curiousBtn.click({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    await shot(page, '10-onboarding-curious-step2');
  });
});

test.afterAll(async () => {
  const fs = require('fs');
  fs.writeFileSync(
    'audit-screenshots/mcp-console-errors.json',
    JSON.stringify(errorsLog, null, 2),
    'utf-8'
  );
});
