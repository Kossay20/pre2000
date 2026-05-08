/**
 * Cycle 9 fixes verification — runs against `expo export --platform web`
 * served via `npx serve dist -l 8082 --single`. Set E2E_BASE_URL accordingly.
 *
 * Each test asserts a specific fix from VERDICT_v9.md so the suite acts as
 * regression net for the YC GSTACK sprint.
 */
import { test, expect } from '@playwright/test';

// Bypass globalSetup's localStorage state for this suite — we want to test
// the cold-boot Language screen path.
test.use({ storageState: { cookies: [], origins: [] } });

// Static export bundle (~9MB) + AsyncStorage IndexedDB cold-init + i18n
// resolver + React Navigation initial route resolution = ~10-15s cold start
// in headless Chromium. We need a longer hydration anchor than the default.
async function gotoLanguageHydrated(page: import('@playwright/test').Page) {
    await page.goto('/Language', { waitUntil: 'load' });
    await page.waitForFunction(
        () => document.body.innerText.length > 100,
        null,
        { timeout: 60_000, polling: 250 }
    );
}

test.describe('Cycle 9 — fix regression net', () => {
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

    test('Phase 1.1 — wa-sqlite.wasm resolution stub on web (no bundle error in console)', async ({ page }) => {
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
});
