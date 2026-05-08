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
  // handleLanguageSelect est async (changeLanguage + AsyncStorage + setLoading + setState
  // + toast + setLoading(false)). Ces re-renders successifs détachaient le DOM node
  // "Continue" mi-click → TimeoutError "element was detached from the DOM".
  //
  // Anchor stable : le checkmark ✓ rendu dans LanguageSelectScreen.tsx:121-125 SI
  // selectedLanguage === 'en'. Sa visibilité confirme que `setSelectedLanguage` a
  // commit. Le `dispatchEvent('click')` ensuite bypass l'actionability check de
  // Playwright (qui retry le click pendant que React reconcile) — la TouchableOpacity
  // RN Web reçoit l'onPress directement via le synthetic event handler.
  await page.locator('text="✓"').first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByText('Continue', { exact: true }).first().dispatchEvent('click');
  await page.getByTestId('auth_guest_button').click({ timeout: 20_000 });

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
