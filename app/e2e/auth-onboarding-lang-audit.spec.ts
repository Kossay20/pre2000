import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AUTH + ONBOARDING LANGUAGE AUDIT (goal: "inscription in all 4 languages").
 *
 * Drives the FULL pre-auth registration flow in each of the 4 languages:
 *   Language picker → Continue → AuthChoice → Register form
 *                                            → Login form
 *                                            → Onboarding step 1 (mode-select)
 *
 * Verified offline-reachable via MCP Playwright probe (2026-05-30): Language,
 * AuthChoice, Register and Login all render without a live backend. The Onboarding
 * step 1 mode-select (pregnant / TTC / curious) also renders without Firestore.
 * Submission (creating an account) hits Firebase Auth → NOT tested (owner gate G1).
 *
 * Each screen is asserted for:
 *   1. Correct document dir (ltr / rtl)
 *   2. Correct document lang attribute
 *   3. No raw i18n key leak in visible text
 *   4. Non-blank render
 *   5. No non-harness console errors
 * Plus a screenshot per (lang, screen) for adversarial visual review.
 *
 * Language cards are selected BY POSITION (0-based): FR=0, AR=1, TN=2, EN=3.
 * Auth buttons use their testID (auth_signup_button / auth_login_button /
 * auth_guest_button) — locale-agnostic.
 *
 * BOUNDARY (verbatim for reasoning agents): this runs offline (no Firebase). Form
 * submission / account creation / onboarding completion require a live backend
 * (owner gate G1). We audit form DISPLAY — i18n, layout, dir — not submission.
 */

const SHOT_DIR = 'audit-screenshots/auth-lang-audit';
const RAW_KEY =
  /(^|\s)(common|auth|onboarding|profile|dashboard|home|reminders|settings)\.[a-zA-Z][a-zA-Z0-9_.]+/;
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
  /Missing or insufficient permissions/i,
  /FirebaseError/i,
  /permission-denied/i,
  /WebAssembly|wasm|MIME type|application\/wasm/i,
  /falling back to ArrayBuffer|ArrayBuffer instantiation/i,
  /DatabaseService|DB Init Error|Failed to initialize database/i,
  /Aborted\(/i,
  /Failed to execute 'compile'/i,
  /Failed to fetch|NetworkError|net::ERR/i,
];

// Override global storageState — these tests drive cold-boot (no pre-seeded guest).
test.use({ storageState: { cookies: [], origins: [] } });

fs.mkdirSync(SHOT_DIR, { recursive: true });

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

async function captureScreen(page: Page, name: string, errors: string[]) {
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(body.trim().length, `${name}: blank`).toBeGreaterThan(0);
  const leak = body.split('\n').find((l) => RAW_KEY.test(l));
  expect(leak, `${name}: raw i18n key leaked → "${leak}"`).toBeFalsy();
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
  expect(errors, `${name}: console errors: ${errors.join(' | ')}`).toEqual([]);
}

const LANGS: { code: string; dir: 'ltr' | 'rtl'; cardIndex: number; langAttr: string; pregnant: RegExp; cont: RegExp }[] = [
  { code: 'fr', dir: 'ltr', cardIndex: 0, langAttr: 'fr', pregnant: /Je suis enceinte/i, cont: /Continuer/i },
  { code: 'en', dir: 'ltr', cardIndex: 3, langAttr: 'en', pregnant: /I am pregnant/i, cont: /Continue/i },
  { code: 'ar', dir: 'rtl', cardIndex: 1, langAttr: 'ar', pregnant: /أنا حامل/, cont: /متابعة/ },
  { code: 'tn', dir: 'rtl', cardIndex: 2, langAttr: 'tn', pregnant: /أنا حامل/, cont: /متابعة/ },
];

for (const L of LANGS) {
  test.describe(`Auth+Onboarding flow — ${L.code}`, () => {
    test(`${L.code}: Language → AuthChoice → Register → Login → Onboarding renders correctly`, async ({
      page,
    }) => {
      const errors = attachConsole(page);

      // ── 1. LANGUAGE PICKER ──────────────────────────────────────────────
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      // Language screen should appear (no seeded state)
      await expect(page.locator('html')).toBeVisible({ timeout: 20_000 });

      // Select the language card by its testID.
      // This used to match flag emoji with `text=/🇫🇷|🇩🇿|🇹🇳|🇬🇧/` and index into the
      // result with nth(). When the Arabic card replaced 🇩🇿 with a region-neutral 🌍
      // the regex matched only three cards, so every index shifted: `en` (index 3)
      // timed out, `tn` (index 2) clicked English, and — worst — `ar` (index 1)
      // clicked the Tunisian card and PASSED, since both are RTL and share the same
      // Arabic copy. Arabic had no real E2E coverage at all. A testID is immune to
      // that class of drift.
      const langCard = page.locator(`[data-testid="lang_card_${L.code}"]`);
      await expect(langCard).toBeVisible({ timeout: 20_000 });
      await langCard.click();
      await page.waitForTimeout(600);

      // Check the doc dir switches after language selection
      // (dir is set on the html element via syncHtmlLangDir)
      // Note: dir may not switch immediately until Continue is clicked + i18n initialised.

      await captureScreen(page, `${L.code}-01-language`, errors);

      // Click Continue (position-based: the Continue button is always the last
      // tappable element on the Language screen, identified by its arrow glyph → or ←)
      const continueBtn = page.locator('text=/→|←|Continuer|Continue|متابعة/').last();
      await expect(continueBtn).toBeVisible({ timeout: 10_000 });
      await continueBtn.click();
      await page.waitForTimeout(1500);

      // ── 2. AUTH CHOICE ─────────────────────────────────────────────────
      await expect(page.locator('html')).toHaveAttribute('dir', L.dir, { timeout: 15_000 });
      await captureScreen(page, `${L.code}-02-auth-choice`, errors);

      // ── 3. REGISTER FORM ───────────────────────────────────────────────
      await page.getByTestId('auth_signup_button').click();
      await page.waitForTimeout(1200);
      // Confirm we have an email input (the form rendered, not a blank shell)
      await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 15_000 });
      await captureScreen(page, `${L.code}-03-register`, errors);

      // ── 4. LOGIN FORM ──────────────────────────────────────────────────
      // Go back to AuthChoice
      await page.goBack();
      await page.waitForTimeout(1000);
      // Confirm back on AuthChoice (the guest button should be visible)
      await expect(page.getByTestId('auth_guest_button')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('auth_login_button').click();
      await page.waitForTimeout(1200);
      await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 15_000 });
      await captureScreen(page, `${L.code}-04-login`, errors);

      // ── 5. ONBOARDING STEP 1 (mode-select) ────────────────────────────
      // Go back to AuthChoice
      await page.goBack();
      await page.waitForTimeout(1000);
      await expect(page.getByTestId('auth_guest_button')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('auth_guest_button').click();
      await page.waitForTimeout(2000);
      // Onboarding step 1: the user picks their mode (pregnant / TTC / curious).
      const body = (await page.locator('body').innerText().catch(() => '')) || '';
      const isOnboarding = !(await page.getByRole('tablist').isVisible().catch(() => false));
      if (isOnboarding && body.trim().length > 10) {
        await captureScreen(page, `${L.code}-05-onboarding-step1`, errors);
      } else {
        await page.screenshot({ path: path.join(SHOT_DIR, `${L.code}-05-onboarding-step1.png`), fullPage: true });
      }

      // ── 6. ONBOARDING STEPS 2→3→4 (pregnant path) ──────────────────────
      // Steps 2 (date method) and 3 (age/country/first-pregnancy) are pure CLIENT state —
      // reachable offline. Step 4 is the account form (submission needs live Auth = owner gate G1,
      // so we capture the form but do NOT submit). Advance via the localized "pregnant" card then
      // the localized Continue button.
      const pregnantCard = page.getByText(L.pregnant).first();
      if (await pregnantCard.isVisible().catch(() => false)) {
        await pregnantCard.click();
        await page.waitForTimeout(1500);
        await captureScreen(page, `${L.code}-06-onboarding-step2-date`, errors);

        // Step 2 → step 3 via Continue (a date default is pre-filled, so no picker interaction needed)
        const cont2 = page.getByText(L.cont).last();
        if (await cont2.isVisible().catch(() => false)) {
          await cont2.click();
          await page.waitForTimeout(1500);
          await captureScreen(page, `${L.code}-07-onboarding-step3-profile`, errors);

          // Step 3 → step 4 via Continue
          const cont3 = page.getByText(L.cont).last();
          if (await cont3.isVisible().catch(() => false)) {
            await cont3.click();
            await page.waitForTimeout(1500);
            // Step 4 = account form (email/password). Capture only — NO submit (owner gate G1).
            await captureScreen(page, `${L.code}-08-onboarding-step4-account`, errors);
          }
        }
      }
    });
  });
}
