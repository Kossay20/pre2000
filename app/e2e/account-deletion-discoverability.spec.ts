/**
 * Apple 5.1.1(v) rejected build 21: the reviewer did not find the delete-account button.
 * This spec fails if the path from Home to the button gets longer than two taps, or if the
 * button is pushed below the fold again. It drives the REAL path: Home -> the "Profil" caption
 * under the avatar -> the first section of the Profile screen.
 */
import { test, expect } from '@playwright/test';
import { createAccount, seedProfile, newAccountEmail, E2E_PASSWORD, uiLogin, waveUse } from './helpers/emulator-account';

test.use(waveUse('fr'));

const TAB_BAR = 70; // bottom tab bar (~60 px): a button under it is not really visible

for (const vp of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test(`delete account: Home -> Profil -> visible without scrolling at ${vp.width}x${vp.height}`, async ({ page }) => {
    const acct = await createAccount(newAccountEmail('discover', `${vp.width}`), E2E_PASSWORD);
    await seedProfile(acct.uid, acct.idToken, { week: 30, country: 'france', firstName: 'Salma' });
    await page.setViewportSize(vp);
    await uiLogin(page, acct.email, acct.password, 'fr');

    // Tap 1: the visible "Profil" caption under the avatar must itself be tappable.
    const caption = page.getByText('Profil', { exact: true }).first();
    await expect(caption, 'the Profil caption is visible on Home').toBeVisible({ timeout: 30_000 });
    // The avatar block pulses forever, so Playwright never sees it as stable: force the real click.
    await caption.click({ force: true });

    // The account block opens the Profile screen: sign out, reset, DELETE.
    await expect(page.getByText('Zone de danger').first()).toBeVisible({ timeout: 30_000 });
    const del = page.getByRole('button', { name: 'Supprimer mon compte' });
    await expect(del, 'visible label and accessible name are both "Supprimer mon compte"').toBeVisible();
    const box = await del.boundingBox();
    expect(box, 'delete button has a box').not.toBeNull();
    expect(box!.y + box!.height, 'delete button sits above the tab bar, no scrolling needed').toBeLessThanOrEqual(vp.height - TAB_BAR);
  });
}

test('Home credit line and Profil caption do not overlap at 320 px (Slide Over)', async ({ page }) => {
  const acct = await createAccount(newAccountEmail('discover', 'narrow'), E2E_PASSWORD);
  await seedProfile(acct.uid, acct.idToken, { week: 30, country: 'france', firstName: 'Salma' });
  await page.setViewportSize({ width: 320, height: 640 });
  await uiLogin(page, acct.email, acct.password, 'fr');
  const caption = page.getByText('Profil', { exact: true }).first();
  const credit = page.getByText(/développée avec soin/).first();
  await expect(caption).toBeVisible({ timeout: 30_000 });
  await expect(credit).toBeVisible();
  await page.waitForTimeout(1500); // header entrance animation
  const a = await caption.boundingBox();
  const b = await credit.boundingBox();
  const overlap = !(a!.x + a!.width <= b!.x || b!.x + b!.width <= a!.x || a!.y + a!.height <= b!.y || b!.y + b!.height <= a!.y);
  expect(overlap, `caption ${JSON.stringify(a)} vs credit ${JSON.stringify(b)}`).toBe(false);
});
