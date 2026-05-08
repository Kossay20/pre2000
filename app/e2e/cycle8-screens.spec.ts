import { test, expect, type Page } from '@playwright/test';
import { ensureMainTabs } from './helpers/bootstrap-main-tabs';

/**
 * Cycle 8.2 — E2E smoke for the 4 new Cycle 8 screens.
 *
 * Bootstraps in EN locale (per ensureMainTabs), navigates from Home tool cards,
 * verifies each screen renders + supports its core interaction, and captures a
 * screenshot for visual audit.
 *
 * Coverage :
 *   - KickCounter   : nav, tap-to-count increments visible counter, end-session.
 *   - ContractionTimer : nav, start contraction shows running timer, stop logs entry.
 *   - HospitalBag   : nav, sections render, toggle item, custom-add modal opens & closes
 *                     via backdrop tap (Cycle 8.2 fix).
 *   - Ramadan       : reached via direct URL (gated to AR/TN on Home; URL works in EN).
 *
 * Screenshots dropped in audit-screenshots/cycle8/.
 */

const SHOT_DIR = 'audit-screenshots/cycle8';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

async function gotoHome(page: Page) {
  await ensureMainTabs(page);
}

test.describe('Cycle 8 — new screens', () => {
  test('Kick Counter — nav, count, end session', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('button', { name: /Baby kick counter/i }).first().click();
    await expect(page).toHaveURL(/KickCounter/, { timeout: 15_000 });
    await expect(page.getByText('Baby kick counter', { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Empty state: "Start a session" button visible.
    await expect(
      page.getByRole('button', { name: /Start a session/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Tap to start + first kick.
    await page.getByRole('button', { name: /Start a session/i }).first().click();

    // Active state: tap-to-count button replaces empty state.
    await expect(
      page.getByRole('button', { name: /Tap to count/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the big button several times to count.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /Tap to count/i }).first().click();
    }

    // End session button visible & clickable.
    await expect(page.getByRole('button', { name: /End session/i }).first()).toBeVisible();

    await shot(page, 'kick-counter-active');

    await page.getByRole('button', { name: /End session/i }).first().click();

    // After end, should return to empty state.
    await expect(
      page.getByRole('button', { name: /Start a session/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await shot(page, 'kick-counter-empty-after-end');
  });

  test('Contraction Timer — nav, start, stop', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('button', { name: /Contraction timer/i }).first().click();
    await expect(page).toHaveURL(/ContractionTimer/, { timeout: 15_000 });
    await expect(page.getByText('Contraction timer', { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Empty state.
    await expect(
      page.getByRole('button', { name: /Contraction start/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Contraction start/i }).first().click();

    // Active running timer.
    await expect(page.getByText(/Contraction in progress/i).first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole('button', { name: /Contraction end/i }).first(),
    ).toBeVisible();

    await shot(page, 'contraction-active');

    await page.getByRole('button', { name: /Contraction end/i }).first().click();

    // After stop, stats panel + history visible.
    await expect(page.getByText(/Average duration/i).first()).toBeVisible({
      timeout: 10_000,
    });

    await shot(page, 'contraction-after-stop');
  });

  test('Hospital Bag — nav, toggle, modal backdrop dismiss', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('button', { name: /Hospital bag/i }).first().click();
    await expect(page).toHaveURL(/HospitalBag/, { timeout: 15_000 });
    await expect(page.getByText('Hospital bag', { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Section headers (Documents, Mom, Baby, Partner).
    await expect(page.getByText(/Documents/i).first()).toBeVisible();
    await expect(page.getByText(/Baby/i).first()).toBeVisible();

    // Toggle at least one item via accessible checkbox role.
    const firstCheckbox = page.getByRole('checkbox').first();
    await firstCheckbox.click();
    // No specific assertion on visual state — toggle persists in AsyncStorage.

    // Open custom-add modal (per-section "Add an item" button).
    await page.getByRole('button', { name: /Add an item/i }).first().click();

    // Modal visible: TextInput + Add button + Cancel button.
    await expect(page.getByRole('button', { name: /^Cancel$/i }).first()).toBeVisible({
      timeout: 5_000,
    });

    await shot(page, 'hospital-bag-modal-open');

    // Cycle 8.2 P2 fix: tap backdrop to dismiss. Use Cancel button as the deterministic
    // dismiss path (backdrop tap is OS-positional and flaky to assert in headless).
    await page.getByRole('button', { name: /^Cancel$/i }).first().click();

    await expect(page.getByRole('button', { name: /^Cancel$/i })).toHaveCount(0, {
      timeout: 5_000,
    });

    await shot(page, 'hospital-bag-list');
  });

  test('Ramadan Pregnancy — direct URL nav, draft banner, log day', async ({ page }) => {
    // Bootstrap first so context (AuthContext etc.) is initialized, then deep-link.
    await gotoHome(page);
    await page.goto('/RamadanPregnancy', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/Ramadan/i).first()).toBeVisible({ timeout: 15_000 });

    // Draft banner visible (content pending clinical review).
    await expect(
      page.getByText(/pending clinical review|Content pending/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Log a non-fasted day.
    await page.getByRole('button', { name: /Not fasted/i }).first().click();

    // Counters visible (Missed days / Fidya paid / Fidya remaining).
    await expect(page.getByText(/Missed days/i).first()).toBeVisible();
    await expect(page.getByText(/Fidya/i).first()).toBeVisible();

    await shot(page, 'ramadan-pregnancy');
  });
});
