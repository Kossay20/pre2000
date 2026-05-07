import { test, expect } from '@playwright/test';
import { ensureMainTabs } from './helpers/bootstrap-main-tabs';

const TAB = {
  home: '🏠 🏠 Home',
  calendar: '📅 📅 Calendar',
  reminders: '🔔 🔔 Reminders',
  resources: '📚 📚 Resources',
  chatbot: '💬 💬 Chatbot',
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
});
