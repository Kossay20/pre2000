import { test, expect } from '@playwright/test';
import { ensureMainTabs } from './helpers/bootstrap-main-tabs';

// PHASE 2.3 FIX (E2E audit 2026-05-08): tab labels updated. Vector icons
// (Ionicons) replaced emoji <Text>, removing the duplicated emoji that
// previously leaked into the accessible name (`'🏠 🏠 Home'`). The accessible
// name now matches the tabBarLabel only.
const TAB = {
  home: 'Home',
  calendar: 'Calendar',
  reminders: 'Reminders',
  resources: 'Resources',
  chatbot: 'Chatbot',
} as const;

async function gotoMain(page: import('@playwright/test').Page) {
  await ensureMainTabs(page);
}

test.describe('Expo web smoke', () => {
  test('charge l’app (tabs visibles)', async ({ page }) => {
    await gotoMain(page);
    await expect(page.getByRole('tab', { name: TAB.home })).toBeVisible();
    await expect(page.getByRole('tab', { name: TAB.calendar })).toBeVisible();
  });

  test('navigation onglets → URLs attendues', async ({ page }) => {
    await gotoMain(page);
    await expect(page).toHaveURL(/HomeMain/);

    await page.getByRole('tab', { name: TAB.calendar }).click();
    await expect(page).toHaveURL(/CalendarMain/);

    await page.getByRole('tab', { name: TAB.reminders }).click();
    await expect(page).toHaveURL(/RemindersMain/);

    await page.getByRole('tab', { name: TAB.resources }).click();
    await expect(page).toHaveURL(/Ressources\/ResourcesMain/);

    await page.getByRole('tab', { name: TAB.chatbot }).click();
    await expect(page).toHaveURL(/Chatbot/);

    await page.getByRole('tab', { name: TAB.home }).click();
    await expect(page).toHaveURL(/HomeMain/);
  });

  test('calendrier → ajouter un rendez-vous', async ({ page }) => {
    await gotoMain(page);
    await page.getByRole('tab', { name: TAB.calendar }).click();
    await page.getByRole('button', { name: /Add Appointment|Add an appointment/i }).first().click();
    await expect(page).toHaveURL(/AddAppointment/);
  });

  test('rappels → Tasks → Statistiques', async ({ page }) => {
    await gotoMain(page);
    await page.getByRole('tab', { name: TAB.reminders }).click();
    await page.getByRole('tab', { name: 'Tasks' }).first().click();
    await page
      .getByRole('button', {
        name: /View Statistics|Voir mes statistiques|عرض الإحصائيات|شوف الإحصائيات/i,
      })
      .click();
    await expect(page).toHaveURL(/Statistics/, { timeout: 20_000 });
    // Bundle frais garanti par webServer (--clear) → testID présent.
    // `statistics_screen_root` peut apparaître sur loading/empty/scroll states (3 occurrences),
    // .first() évite "strict mode violation" si plusieurs sont rendus en transition.
    await expect(page.getByTestId('statistics_screen_root').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('resources → onglets internes Articles + Compléments visibles', async ({ page }) => {
    await gotoMain(page);
    await page.getByRole('tab', { name: TAB.resources }).click();
    await expect(page).toHaveURL(/Ressources\/ResourcesMain/);
    // ResourcesScreen affiche un MaterialTopTabNavigator interne.
    // Les labels viennent de t('common.screen.articles'/'.supplements'). En EN onboarding,
    // c'est "Articles" et "Supplements". Match insensible à la casse + .last() car
    // bottom-tabs (Resources) et top-tabs (Articles) cohabitent dans le rôle 'tab'.
    await expect(page.getByRole('tab', { name: /^Articles$/i }).last()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('tab', { name: /^Supplements$/i }).last()).toBeVisible();
  });

  test('chatbot → champ saisie présent (sans appel API)', async ({ page }) => {
    await gotoMain(page);
    await page.getByRole('tab', { name: TAB.chatbot }).click();
    await expect(page).toHaveURL(/Chatbot/);
    // ChatbotScreen rend un TextInput (Q de l'utilisateur). On vérifie sa présence
    // sans saisir/envoyer (évite tout appel chatbotService + future activation SQLite F32).
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 15_000 });
  });

  test('langue → écran picker affiche 4 langues', async ({ page }) => {
    // Navigation directe à l'écran Language (sans onboarding).
    await page.goto('/Language', { waitUntil: 'domcontentloaded' });
    // Les 4 langues supportées (LANGUAGES const dans LanguageSelectScreen.tsx).
    // Pas de click — handleLanguageSelect() déclenche un Alert dialog qui complexifierait
    // le smoke. On valide juste que le picker rend toutes les options.
    await expect(page.getByText('Français', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Arabic', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Arabe + Darija', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('English', { exact: true }).first()).toBeVisible();
  });
});
