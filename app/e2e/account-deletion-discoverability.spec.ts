/**
 * Apple 5.1.1(v) rejected build 21: the reviewer did not find the delete-account button.
 * This spec fails if the path from Home to the button gets longer than two taps, or if the
 * button is pushed below the fold again. It drives the REAL path: Home -> the "Profil" caption
 * under the avatar -> the first section of the Profile screen.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import {
  createAccount, seedProfile, newAccountEmail, E2E_PASSWORD, uiLogin, waveUse, type AppLocale,
} from './helpers/emulator-account';
import { attachMegaAuditRecorder } from './helpers/mega-audit-snap';

test.use(waveUse('fr'));

// Visible caption under the Home avatar and visible label of the delete row, per locale
// (src/i18n/locales/<l>/home.json "profileLabel", profile.json "deleteAccount").
const LOCALES: { l: AppLocale; caption: string; del: string }[] = [
  { l: 'fr', caption: 'Profil', del: 'Supprimer mon compte' },
  { l: 'en', caption: 'Profile', del: 'Delete my account' },
  { l: 'ar', caption: 'ملفي', del: 'حذف حسابي' },
  { l: 'tn', caption: 'ملفي', del: 'نفسّخ الكونت متاعي' },
];

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 320, height: 568 },
];

const quartetDir = (): string => process.env.E2E_QUARTET_DIR || path.join('test-results', 'disc-quartet');

for (const { l, caption, del } of LOCALES) {
  for (const vp of VIEWPORTS) {
    test(`delete account [${l}]: Home -> ${caption} -> visible above the tab bar at ${vp.width}x${vp.height}`, async ({ page }) => {
      const rec = attachMegaAuditRecorder(page, quartetDir());
      const acct = await createAccount(newAccountEmail('discover', `${l}${vp.width}`), E2E_PASSWORD);
      await seedProfile(acct.uid, acct.idToken, { week: 30, country: 'france', firstName: 'Salma' });
      await page.setViewportSize(vp);
      await uiLogin(page, acct.email, acct.password, l);

      // Tap 1: the visible caption under the avatar must itself be tappable (one accessible button).
      const profileBtn = page.getByRole('button', { name: new RegExp(caption, 'i') }).first();
      await expect(profileBtn, `the "${caption}" button is on Home`).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1200); // header entrance animation
      await rec.snap(`${l}-${vp.width}x${vp.height}-1-home`);
      // The avatar block pulses forever, so Playwright never sees it as stable: force the real click.
      await profileBtn.click({ force: true });

      // The account block opens the Profile screen: sign out, reset, DELETE.
      const delBtn = page.getByRole('button', { name: del });
      await expect(delBtn, `visible label and accessible name are both "${del}"`).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(600);
      await rec.snap(`${l}-${vp.width}x${vp.height}-2-profile`);
      const box = await delBtn.boundingBox();
      const tabs = await page.getByRole('tablist').first().boundingBox();
      expect(box, 'delete button has a box').not.toBeNull();
      expect(tabs, 'tab bar has a box').not.toBeNull();
      expect(box!.y + box!.height, `delete button ends above the tab bar (top ${tabs!.y}): no scrolling needed`).toBeLessThanOrEqual(tabs!.y);
    });
  }
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
