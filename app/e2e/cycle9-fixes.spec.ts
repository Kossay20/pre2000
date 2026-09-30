/**
 * Cycle 9 fixes verification — runs against `expo export --platform web`
 * served via `npx serve dist -l 8082 --single`. Set E2E_BASE_URL accordingly.
 *
 * Each test asserts a specific fix from VERDICT_v9.md so the suite acts as
 * regression net for the YC GSTACK sprint.
 *
 * Reproduction:
 *   cd app
 *   npx expo export --platform web --output-dir dist
 *   npx serve dist -l 8082 --single &
 *   E2E_BASE_URL=http://localhost:8082 ./node_modules/.bin/playwright test \
 *     e2e/cycle9-fixes.spec.ts --project=chromium --workers=1 --timeout=120000
 */
import { test, expect, type Page } from '@playwright/test';

// Bypass globalSetup's localStorage state for this suite — we want to test
// the cold-boot Language screen path. Authenticated suite below uses a fresh
// guest profile.
test.use({ storageState: { cookies: [], origins: [] } });

// Static export bundle (~9MB) + AsyncStorage IndexedDB cold-init + i18n
// resolver + React Navigation initial route resolution = ~10-15s cold start
// in headless Chromium. Hydration anchor = body text length > 100.
async function gotoLanguageHydrated(page: Page) {
    await page.goto('/Language', { waitUntil: 'load' });
    await page.waitForFunction(
        () => document.body.innerText.length > 100,
        null,
        { timeout: 60_000, polling: 250 }
    );
}

test.describe('Cycle 9 — fix regression net (cold-boot Language)', () => {
    test('Bundle health — main bundle loads, React mounts, body populated', async ({ page }) => {
        await gotoLanguageHydrated(page);
        const childCount = await page.evaluate(() =>
            document.getElementById('root')?.children.length ?? 0
        );
        expect(childCount).toBeGreaterThan(0);
        const text = await page.evaluate(() => document.body.innerText);
        expect(text.length).toBeGreaterThan(100);
    });

    test('P1-2 — html lang/dir synced with i18n on web', async ({ page }) => {
        await gotoLanguageHydrated(page);
        await expect.poll(
            () => page.evaluate(() => document.documentElement.lang),
            { timeout: 10_000, intervals: [250] }
        ).toBe('fr');
        const dir = await page.evaluate(() => document.documentElement.dir);
        expect(['ltr', '']).toContain(dir);
    });

    test('P1-1 — document title localized (Language screen)', async ({ page }) => {
        await gotoLanguageHydrated(page);
        await expect.poll(
            async () => page.title(),
            { timeout: 30_000, intervals: [500] }
        ).toMatch(/Choisir la langue · Mama & Bébé/i);
    });

    test('P0-2 — i18n keys are translated (no raw key leakage)', async ({ page }) => {
        await gotoLanguageHydrated(page);
        const text = await page.evaluate(() => document.body.innerText);
        expect(text).not.toMatch(/errors\.[a-z]+[A-Z]/);
        expect(text).not.toMatch(/auth\.errors\./);
        expect(text).not.toContain('emailRequired');
        expect(text).not.toContain('passwordRequired');
        expect(text).not.toContain('passwordLength');
    });

    test('P0-4 — obsolete password rule strings absent from bundle visible UI', async ({ page }) => {
        await gotoLanguageHydrated(page);
        const text = await page.evaluate(() => document.body.innerText);
        expect(text).not.toContain('min. 6 caractères');
        expect(text).not.toContain('8 car. min');
    });

    test('P0-5 — no CodedError "Updates module" leaks to console', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error' && msg.text().includes('Updates module')) {
                consoleErrors.push(msg.text());
            }
        });
        await gotoLanguageHydrated(page);
        expect(consoleErrors).toHaveLength(0);
    });

    test('Phase 1.2 — no "isInitialized undefined" warning spam', async ({ page }) => {
        const isInitWarnings: string[] = [];
        page.on('console', (msg) => {
            if (msg.text().includes("isInitialized") && msg.text().includes('undefined')) {
                isInitWarnings.push(msg.text());
            }
        });
        await gotoLanguageHydrated(page);
        expect(isInitWarnings).toHaveLength(0);
    });

    test('Phase 1.1 — wa-sqlite.wasm resolution stub on web (no bundle resolution error)', async ({ page }) => {
        const bundleErrors: string[] = [];
        page.on('console', (msg) => {
            const t = msg.text();
            if (t.includes('Unable to resolve') && t.includes('wa-sqlite')) {
                bundleErrors.push(t);
            }
        });
        await gotoLanguageHydrated(page);
        expect(bundleErrors).toHaveLength(0);
    });

    test('LanguageSelectScreen — 4 languages rendered + active checkmark', async ({ page }) => {
        await gotoLanguageHydrated(page);
        // Assert on the four cards themselves, not on their subtitles. The subtitle
        // used to be a frozen English/French string ("Arabic"), but it is now
        // localized via t(descKey), so asserting "Arabic" tested a bug that has since
        // been fixed and failed once the UI language was French.
        for (const code of ['fr', 'ar', 'tn', 'en']) {
            await expect(page.locator(`[data-testid="lang_card_${code}"]`)).toBeVisible();
        }
        const text = await page.evaluate(() => document.body.innerText);
        // Native names are language-independent, so they are safe to assert on.
        expect(text).toContain('Français');
        expect(text).toContain('English');
        expect(text).toContain('العربية');
        expect(text).toContain('العربية + الدارجة');
        expect(text).not.toMatch(/\bbeta\b/i);
        // Active language has ✓ checkmark.
        expect(text).toContain('✓');
        // No raw i18n keys leaked.
        expect(text).not.toContain('common.');
    });

    test('Continue button visible on Language screen', async ({ page }) => {
        await gotoLanguageHydrated(page);
        const text = await page.evaluate(() => document.body.innerText);
        // FR: "Continuer →" with newline between.
        expect(text).toMatch(/Continuer/);
    });
});

test.describe('Cycle 9 — authenticated guest flow (with localStorage state)', () => {
    test.use({ storageState: 'e2e/.auth/state.json' });

    async function gotoHomeHydrated(page: Page) {
        await page.goto('/HomeMain', { waitUntil: 'load' });
        await page.waitForFunction(
            () => document.querySelectorAll('[role="tab"]').length >= 5,
            null,
            { timeout: 60_000, polling: 250 }
        );
    }

    test('P0-3 + P2.3 — bottom tabs render with clean labels (no emoji duplication)', async ({ page }) => {
        await gotoHomeHydrated(page);
        // Use Playwright's accessible name resolver (matches what screen readers
        // announce, not raw innerText). Whitespace and aria-hidden descendants
        // are properly excluded.
        const tablist = page.getByRole('tablist').first();
        await expect(tablist).toBeVisible();
        const tabNames = ['Home', 'Calendar', 'Reminders', 'Resources', 'Chatbot'];
        for (const name of tabNames) {
            await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
        }
        // Snapshot a11y tree to assert NO emoji-duplicated tab labels remain.
        const labelText = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[role="tab"]'))
                .map((t) => t.getAttribute('aria-label') || '')
                .filter(Boolean)
                .join(' | ')
        );
        expect(labelText).not.toMatch(/🏠.*🏠|📅.*📅|🔔.*🔔|📚.*📚|💬.*💬/);
    });

    test('P1-1 — document title localized on Home', async ({ page }) => {
        await gotoHomeHydrated(page);
        await expect.poll(
            async () => page.title(),
            { timeout: 15_000, intervals: [500] }
        ).toMatch(/Home · Mama & Bébé|Accueil · Mama & Bébé/i);
    });

    test('Tab navigation — click Calendar updates URL', async ({ page }) => {
        await gotoHomeHydrated(page);
        await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
        // Linking config maps Calendrier.CalendarMain to /calendar.
        await expect(page).toHaveURL(/\/calendar/);
    });

    test('P0-3 — only 1 H1 on screen at a time (no DOM stacking)', async ({ page }) => {
        await gotoHomeHydrated(page);
        await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
        await page.waitForURL(/\/calendar/);
        // Wait a beat for the Calendar screen to fully mount.
        await page.waitForTimeout(1000);
        const h1Count = await page.evaluate(() =>
            document.querySelectorAll('h1, [role="heading"][aria-level="1"]').length
        );
        // Before fix: 3+ stacked. After fix: 1 active screen only (or 0 if no H1).
        expect(h1Count).toBeLessThanOrEqual(1);
    });

    test('Chatbot tab navigation — URL updates', async ({ page }) => {
        await gotoHomeHydrated(page);
        await page.getByRole('tab', { name: 'Chatbot', exact: true }).click();
        // Linking is not configured for Chatbot path explicitly; URL pattern is /Chatbot.
        await expect.poll(
            () => page.url(),
            { timeout: 10_000, intervals: [500] }
        ).toMatch(/Chatbot/i);
    });
});
