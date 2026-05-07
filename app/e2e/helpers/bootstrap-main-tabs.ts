import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Session Playwright vierge → flux langue EN + invité + onboarding minimal → MainTabs.
 * Idempotent si les tabs sont déjà visibles.
 *
 * Pas de waitForTimeout arbitraire : chaque action attend la condition explicite
 * via les auto-waits de Playwright (click attend actionnable) + waitForSelector quand
 * deux états sont possibles (tablist déjà là OU écran Language à afficher).
 */
export async function ensureMainTabs(page: Page): Promise<void> {
  await page.goto('/HomeMain', { waitUntil: 'domcontentloaded' });

  // Soit tabs déjà rendues (utilisateur déjà onboardé), soit l'app a redirigé vers /Language.
  // Locator.or() pour attendre l'un OU l'autre sans CSS comma (qui ne supporte pas text=).
  const tabsOrLanguagePicker = page
    .locator('[role="tablist"]')
    .or(page.getByText('English', { exact: true }));
  await tabsOrLanguagePicker.first().waitFor({ state: 'visible', timeout: 30_000 });

  if ((await page.locator('[role="tablist"]').count()) > 0) {
    return;
  }

  await page.goto('/Language', { waitUntil: 'domcontentloaded' });
  await page.getByText('English', { exact: true }).first().click();
  await page.getByText('Continue', { exact: true }).first().click();
  await page.getByTestId('auth_guest_button').click();

  await page.getByRole('button', { name: 'I am pregnant' }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: /Last Period/i }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: '25-29' }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'France' }).click();
  await page.getByRole('button', { name: /Yes, it.*all new/i }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByText('Continue as Guest', { exact: true }).click({ timeout: 20_000 });

  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 45_000 });
}
