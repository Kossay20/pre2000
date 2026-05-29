import { test, expect } from '@playwright/test';
import { ensureMainTabs } from './helpers/bootstrap-main-tabs';

/**
 * T6 — Audit massif visuel (V1_AUTONOMOUS_RUN).
 *
 * Pour CHAQUE écran critique v1.0 :
 *  1. Navigation jusqu'à l'écran (idempotent — réutilise l'onboarding helper).
 *  2. Wait UI rendered (un élément clé visible).
 *  3. Screenshot full page → adversary review visuelle (T6.4).
 *
 * Pas d'assertion fonctionnelle profonde (couvert par web-smoke.spec.ts).
 * Si un screen plante, le test échoue → finding T7.
 *
 * Couverture v1.0 (priorisée selon cartographie sub-agent T6.1) :
 *  P0 : Language, AuthChoice, Onboarding step1, HomeMain, Calendar, AddAppointment, Reminders, Tasks, Statistics, Resources Articles, Resources Supplements, Chatbot, Profile.
 *  P2 différé : Settings, BabyEvolution, ArticleDetail, SupplementDetail, WeightTracker.
 */

const TAB = {
  // Cycle 9 replaced emoji <Text> tab icons with Ionicons → tab accessible names are now clean.
  home: 'Home',
  calendar: 'Calendar',
  reminders: 'Reminders',
  resources: 'Resources',
  chatbot: 'Chatbot',
} as const;

const SHOT_DIR = 'audit-screenshots';

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({
    path: `${SHOT_DIR}/${name}.png`,
    fullPage: true,
  });
}

test.describe('Audit screens — captures visuelles v1.0', () => {
  test('01 — Language picker', async ({ page }) => {
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Français', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, '01-language-picker');
  });

  test('02 — AuthChoice (login vs register vs guest)', async ({ page }) => {
    // Skip click sur English card (qui déclenche un toast 3s qui overlap le
    // footer en screenshot). Click directement le bouton "Continue" en bas du
    // picker — qui navigue vers AuthChoice sans toast.
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    // Default lang = FR donc bouton est "Continuer" — regex pour matcher EN/FR.
    await page.getByText(/^(Continue|Continuer)$/).first().click();
    await expect(page.getByTestId('auth_guest_button')).toBeVisible({ timeout: 15_000 });
    await shot(page, '02-auth-choice');
  });

  test('03 — Onboarding step 1 (mode selection)', async ({ page }) => {
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    await page.getByText('English', { exact: true }).first().click();
    await page.getByText('Continue', { exact: true }).first().click();
    await page.getByTestId('auth_guest_button').click();
    await expect(page.getByRole('button', { name: 'I am pregnant' })).toBeVisible({
      timeout: 20_000,
    });
    await shot(page, '03-onboarding-mode-select');
  });

  test('04 — HomeMain dashboard (post-onboarding)', async ({ page }) => {
    await ensureMainTabs(page);
    await expect(page).toHaveURL(/HomeMain/);
    await shot(page, '04-home-dashboard');
  });

  test('05 — Calendar month view', async ({ page }) => {
    await ensureMainTabs(page);
    await page.getByRole('tab', { name: TAB.calendar }).click();
    await expect(page).toHaveURL(/CalendarMain/);
    await shot(page, '05-calendar');
  });

  test('06 — AddAppointment form', async ({ page }) => {
    await ensureMainTabs(page);
    await page.getByRole('tab', { name: TAB.calendar }).click();
    await page
      .getByRole('button', { name: /Add Appointment|Add an appointment/i })
      .first()
      .click();
    await expect(page).toHaveURL(/AddAppointment/);
    await shot(page, '06-add-appointment');
  });

  test('07 — Reminders tab content', async ({ page }) => {
    await ensureMainTabs(page);
    await page.getByRole('tab', { name: TAB.reminders }).click();
    await expect(page).toHaveURL(/RemindersMain/);
    await shot(page, '07-reminders');
  });

  test('08 — Tasks tab content', async ({ page }) => {
    await ensureMainTabs(page);
    await page.getByRole('tab', { name: TAB.reminders }).click();
    await page.getByRole('tab', { name: 'Tasks' }).first().click();
    await shot(page, '08-tasks');
  });

  test('09 — Statistics screen', async ({ page }) => {
    await ensureMainTabs(page);
    await page.getByRole('tab', { name: TAB.reminders }).click();
    await page.getByRole('tab', { name: 'Tasks' }).first().click();
    await page
      .getByRole('button', {
        name: /View Statistics|Voir mes statistiques|عرض الإحصائيات|شوف الإحصائيات/i,
      })
      .click();
    await expect(page).toHaveURL(/Statistics/, { timeout: 20_000 });
    await expect(page.getByTestId('statistics_screen_root').first()).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, '09-statistics');
  });

  test('10 — Resources Articles tab', async ({ page }) => {
    await ensureMainTabs(page);
    await page.getByRole('tab', { name: TAB.resources }).click();
    await expect(page).toHaveURL(/Ressources\/ResourcesMain/);
    await shot(page, '10-resources-articles');
  });

  test('11 — Resources Supplements tab', async ({ page }) => {
    await ensureMainTabs(page);
    await page.getByRole('tab', { name: TAB.resources }).click();
    // Click second top-tab (Supplements / Compléments).
    await page.getByRole('tab', { name: /^Supplements$|^Compléments$/i }).last().click();
    await shot(page, '11-resources-supplements');
  });

  test('12 — Chatbot screen', async ({ page }) => {
    await ensureMainTabs(page);
    await page.getByRole('tab', { name: TAB.chatbot }).click();
    await expect(page).toHaveURL(/Chatbot/);
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 15_000 });
    await shot(page, '12-chatbot');
  });

  // === T6.5 — Captures additionnelles demandées par adversary ===

  // Cycle 2 F501 fix : `waitForTimeout` est anti-pattern (cf. F35 Cycle 1).
  // Pour les captures « après chargement », on attend `networkidle` (pas de
  // requête en vol pendant 500ms) — signal clair que les fetches Firestore
  // ont soit abouti, soit timeout silencieusement. Timeout 25s couvre le cold
  // start Firebase + la transition skeleton → content/error.
  async function waitForSettled(page: import('@playwright/test').Page) {
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {
      // On accepte que networkidle puisse timeout : c'est précisément le signal
      // que F-LOAD est actif (Firestore queries pendantes infiniment).
      // La capture screenshot suit pour documenter l'état réel observé.
    });
  }

  test('13 — Home dashboard après settle (test F42 = capture trop vite vs runtime cassé)', async ({
    page,
  }) => {
    await ensureMainTabs(page);
    await expect(page).toHaveURL(/HomeMain/);
    await waitForSettled(page);
    await shot(page, '13-home-dashboard-after-20s');
  });

  test('14 — Profile screen (RGPD critique)', async ({ page }) => {
    await ensureMainTabs(page);
    await page.goto('/Profile', { waitUntil: 'domcontentloaded' });
    await waitForSettled(page);
    await shot(page, '14-profile');
  });

  test('15 — Settings screen (RGPD critique)', async ({ page }) => {
    await ensureMainTabs(page);
    await page.goto('/Settings', { waitUntil: 'domcontentloaded' });
    await waitForSettled(page);
    await shot(page, '15-settings');
  });

  test('16 — Articles après settle (test F51)', async ({ page }) => {
    await ensureMainTabs(page);
    await page.getByRole('tab', { name: TAB.resources }).click();
    await waitForSettled(page);
    await shot(page, '16-articles-after-20s');
  });
});
