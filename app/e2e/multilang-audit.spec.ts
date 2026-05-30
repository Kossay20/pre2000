import { test, expect, type Page } from '@playwright/test';

/**
 * MULTILANGUAGE audit (goal: "multilanguage audit"). Drives every reachable page in ALL
 * FOUR languages (FR / EN / AR / TN) and asserts, per language:
 *   - the document direction is correct (ltr for fr/en, rtl for ar/tn),
 *   - NO raw i18n key leaks in visible text (catches missing translations / namespace.key),
 *   - the screen renders,
 * and captures a screenshot per (lang, screen) for visual inspection of FR-fallback leaks
 * an automated regex can't see.
 *
 * Tabs are navigated BY POSITION (nth) because their labels are themselves localized
 * (Calendar→Calendrier→التقويم…), so an English label can't locate them across languages.
 * Language is forced via localStorage('app_locale') before load (read by the i18n
 * LANGUAGE_DETECTOR), overriding the seeded guest state's 'en'.
 */
const SHOT = 'audit-screenshots/multilang';
const RAW_KEY = /(^|\s)(common|dashboard|home|calendar|reminders|tasks|profile|onboarding|auth|weight|article|babyGrowth|babyEvolution|forbiddenFoods|notifications|cycle8|support|ui|addAppointment)\.[a-zA-Z][a-zA-Z0-9_.]+/;

const IGNORE_CONSOLE = [
  /Download the React DevTools/i, /expo-notifications/i, /AsyncStorage has been extracted/i,
  /\[expo-av\]/i, /Setting a timer/i, /findDOMNode is deprecated/i, /useNativeDriver/i,
  /shadow\* style props are deprecated|"shadow"/i, /props\.pointerEvents is deprecated/i,
  /style\.resizeMode is deprecated/i, /Image: style\.tintColor/i, /accessibilityLabel/i,
  // offline-harness artifacts (no real backend / wasm under serve):
  /Missing or insufficient permissions/i, /FirebaseError/i, /permission-denied/i,
  /WebAssembly|wasm|MIME type|application\/wasm/i, /falling back to ArrayBuffer|ArrayBuffer instantiation/i,
  /DatabaseService|DB Init Error|Failed to initialize database/i, /Aborted\(/i,
  /Failed to execute 'compile'/i, /Failed to fetch|NetworkError|net::ERR/i,
];

function attachConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORE_CONSOLE.some((re) => re.test(t))) return;
    errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function auditLangScreen(page: Page, name: string, errors: string[]) {
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(body.trim().length, `${name}: blank`).toBeGreaterThan(0);
  const leak = body.split('\n').find((l) => RAW_KEY.test(l));
  expect(leak, `${name}: raw i18n key leaked → "${leak}"`).toBeFalsy();
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true });
  expect(errors, `${name}: console errors: ${errors.join(' | ')}`).toEqual([]);
}

const LANGS: { code: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'fr', dir: 'ltr' },
  { code: 'en', dir: 'ltr' },
  { code: 'ar', dir: 'rtl' },
  { code: 'tn', dir: 'rtl' },
];

for (const L of LANGS) {
  test.describe(`i18n audit — ${L.code}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((l) => {
        try { localStorage.setItem('app_locale', l as string); } catch { /* noop */ }
      }, L.code);
    });

    test(`${L.code}: all 5 tabs render with dir=${L.dir} and no raw keys`, async ({ page }) => {
      const errors = attachConsole(page);
      await page.goto('/HomeMain', { waitUntil: 'load' });
      await page.waitForTimeout(1800);

      // document direction must match the language (RTL audit for ar/tn)
      await expect(page.locator('html')).toHaveAttribute('dir', L.dir, { timeout: 10_000 });

      const tablist = page.getByRole('tablist').first();
      await expect(tablist).toBeVisible({ timeout: 30_000 });

      // Click each tab BY POSITION (labels are localized) and audit it in this language.
      const tabs = page.getByRole('tab');
      const count = await tabs.count();
      expect(count, `${L.code}: expected 5 bottom tabs`).toBeGreaterThanOrEqual(5);
      for (let i = 0; i < 5; i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(1000);
        await auditLangScreen(page, `${L.code}-tab${i}`, errors);
      }
    });
  });
}
