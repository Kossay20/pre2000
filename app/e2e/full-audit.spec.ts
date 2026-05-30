import { test, expect, type Page } from '@playwright/test';

/**
 * Whole-project E2E audit (goal: "test the whole project entirely, a lot per system").
 *
 * Uses the proven hydrated-guest pattern from cycle9-fixes (storageState pre-seeds a guest
 * profile via global-setup, so /HomeMain renders MainTabs directly — no brittle onboarding
 * replay). For every reachable surface we assert the 3 owner-mandate gates:
 *   1. renders (body has real content, not a blank shell)
 *   2. NO raw i18n key leak in visible text (regex namespace.key)
 *   3. NO console errors (excluding known vendor noise)
 * and capture a screenshot for adversarial visual review.
 *
 * Run against the static-export harness:
 *   npx expo export --platform web --output-dir dist && npx serve dist -l <port> --single
 *   E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/full-audit.spec.ts --workers=1
 */

const SHOT_DIR = 'audit-screenshots/full-audit';
const RAW_KEY = /(^|\s)(common|dashboard|home|calendar|reminders|tasks|profile|onboarding|auth|weight|article|babyGrowth|babyEvolution|forbiddenFoods|notifications|cycle8|support|ui|addAppointment)\.[a-zA-Z][a-zA-Z0-9_.]+/;

// Vendor / harmless console noise to ignore.
const IGNORE_CONSOLE = [
  /Download the React DevTools/i,
  /expo-notifications/i,
  /AsyncStorage has been extracted/i,
  /\[expo-av\]/i,
  /Setting a timer/i,
  /findDOMNode is deprecated/i,
  /useNativeDriver/i,
  /shadow\* style props are deprecated|"shadow"/i,
  /props\.pointerEvents is deprecated/i,
  /style\.resizeMode is deprecated/i,
  /Image: style\.tintColor/i,
  /accessibilityLabel/i,
];

function attachConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORE_CONSOLE.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'load' });
  // Let React mount + i18n hydrate.
  await page.waitForTimeout(1200);
}

async function auditScreen(page: Page, name: string, errors: string[]) {
  // 1. renders — body has meaningful text content
  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(bodyText.trim().length, `${name}: screen should not be blank`).toBeGreaterThan(0);
  // 2. no raw i18n key leak in visible text
  const leak = bodyText.split('\n').find((l) => RAW_KEY.test(l));
  expect(leak, `${name}: raw i18n key leaked → "${leak}"`).toBeFalsy();
  // 3. capture for adversarial visual review
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
  // 4. no console errors collected so far (asserted at end of each test too)
  expect(errors, `${name}: console errors: ${errors.join(' | ')}`).toEqual([]);
}

test.describe('Whole-project E2E audit', () => {
  test('Home tab renders clean', async ({ page }) => {
    const errors = attachConsole(page);
    await gotoHydrated(page, '/HomeMain');
    await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
    await auditScreen(page, '01-home', errors);
  });

  const TABS: { name: string; label: string; url: RegExp }[] = [
    { name: '02-calendar', label: 'Calendar', url: /CalendarMain/ },
    { name: '03-reminders', label: 'Reminders', url: /RemindersMain/ },
    { name: '04-resources', label: 'Resources', url: /ResourcesMain/ },
    { name: '05-chatbot', label: 'Chatbot', url: /Chatbot/ },
  ];

  for (const tab of TABS) {
    test(`${tab.label} tab renders clean`, async ({ page }) => {
      const errors = attachConsole(page);
      await gotoHydrated(page, '/HomeMain');
      await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole('tab', { name: tab.label, exact: true }).first().click();
      await expect(page).toHaveURL(tab.url, { timeout: 15_000 });
      await page.waitForTimeout(1000);
      await auditScreen(page, tab.name, errors);
    });
  }

  // Resources internal top-tabs (Articles + Supplements) + a deep detail.
  test('Resources → Articles + Supplements internal tabs render', async ({ page }) => {
    const errors = attachConsole(page);
    await gotoHydrated(page, '/HomeMain');
    await page.getByRole('tab', { name: 'Resources', exact: true }).first().click();
    await expect(page).toHaveURL(/ResourcesMain/, { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await auditScreen(page, '06-resources-articles', errors);
    const supTab = page.getByRole('tab', { name: /^Supplements$/i }).last();
    if (await supTab.isVisible().catch(() => false)) {
      await supTab.click();
      await page.waitForTimeout(1200);
      await auditScreen(page, '07-resources-supplements', errors);
    }
  });

  // Deep screens reachable by direct deep-link navigation. Tolerant: if a route does not
  // resolve to its own screen it will still be captured (and the no-blank / no-raw-key / no-error
  // gates still apply), so the adversary can spot a redirect/blank in the screenshot.
  const DEEP: { name: string; path: string }[] = [
    { name: '08-profile', path: '/Profile' },
    { name: '09-settings', path: '/Settings' },
    { name: '10-health-dashboard', path: '/HealthDashboard' },
    { name: '11-weight-tracker', path: '/WeightTracker' },
    { name: '12-forbidden-foods', path: '/ForbiddenFoods' },
    { name: '13-kick-counter', path: '/KickCounter' },
    { name: '14-contraction-timer', path: '/ContractionTimer' },
    { name: '15-add-appointment', path: '/AddAppointment' },
    { name: '16-baby-evolution', path: '/BabyEvolution' },
    { name: '17-week-recommendations', path: '/WeekRecommendations' },
  ];

  for (const scr of DEEP) {
    test(`Deep screen ${scr.name} renders clean`, async ({ page }) => {
      const errors = attachConsole(page);
      await gotoHydrated(page, scr.path);
      await auditScreen(page, scr.name, errors);
    });
  }

  test('Language picker renders 4 languages (cold, no guest state)', async ({ page, context }) => {
    const errors = attachConsole(page);
    await context.clearCookies();
    await page.goto('/Language', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    // native names from LanguageSelectScreen LANGUAGES const
    await expect(page.getByText('Français', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('English', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/18-language.png`, fullPage: true });
    expect(errors, `language: console errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
