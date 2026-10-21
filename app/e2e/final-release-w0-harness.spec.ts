/**
 * W0 harness proof (AUDIT_PLAN final-release-2026-09-30 §0.2).
 * Requires the emulator stack: `bash e2e/emulator-stack.sh status` → 3 up, then
 *   E2E_BASE_URL=http://localhost:8090 npx playwright test e2e/final-release-w0-harness.spec.ts
 */
import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { attachConsoleStrict } from './helpers/audit-guards';
import { attachMegaAuditRecorder } from './helpers/mega-audit-snap';
import { attachDialogRecorder } from './helpers/dialog-recorder';
import {
  E2E_PASSWORD,
  authAccountExists,
  createAccount,
  freshContextLogin,
  newAccountEmail,
  seedProfile,
  serverDoc,
  serverQuery,
  uiLogin,
  waveUse,
} from './helpers/emulator-account';

test.use(waveUse('fr'));
test.setTimeout(120_000);

test('W0 harness: REST account → seed week 32 → UI login → server truth → fresh context → strict console → dialogs', async ({
  page,
  browser,
}, testInfo) => {
  // 1. Account via REST + profile seeded AS THE USER (rules apply).
  const email = newAccountEmail('w0', 'harness');
  const acct = await createAccount(email, E2E_PASSWORD);
  expect(acct.uid).toBeTruthy();
  expect(await authAccountExists(acct.uid)).toBe(true);
  expect(await authAccountExists('no-such-uid-w0')).toBe(false);
  const seeded = await seedProfile(acct.uid, acct.idToken, { week: 32, firstName: 'Harness', lastName: 'Testeur' });

  // Rules proof: a seed carrying a 51-char name must be DENIED for the user token.
  await expect(
    seedProfile(acct.uid, acct.idToken, { week: 32, firstName: 'x'.repeat(51) }),
  ).rejects.toThrow(/403|PERMISSION_DENIED/);

  // 2. Recorders.
  const strict = attachConsoleStrict(page);
  const quartetDir = process.env.E2E_QUARTET_DIR || testInfo.outputPath('quartet');
  const mega = attachMegaAuditRecorder(page, quartetDir);
  const dialogs = attachDialogRecorder(page, mega);

  // 3. UI login in fr → tablist + Home week 32.
  await uiLogin(page, email, E2E_PASSWORD, 'fr');
  await expect(page.getByRole('tablist').first()).toBeVisible();
  await expect(page.getByText('Semaine 32', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('3ème Trimestre').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', /fr/);
  await mega.snap('01-home-week32');

  // 4. Server truth: every seeded key present, login did not overwrite lmp.
  const doc = await serverDoc(`userProfiles/${acct.uid}`);
  expect(doc, 'userProfiles doc must exist').not.toBeNull();
  for (const k of ['firstName', 'lastName', 'lmp', 'pregnancyStartDate', 'country', 'ageRange', 'isFirstPregnancy', 'dpa', 'createdAt', 'updatedAt']) {
    expect(doc![k], `server userProfiles.${k}`).toEqual(seeded[k]);
  }
  // runQuery path works (0 events for a brand-new account, as owner).
  expect(await serverQuery('userEvents', 'user_id', acct.uid)).toEqual([]);

  // 5. Fresh-context oracle (b): empty localStorage + IndexedDB → same week.
  const fresh = await freshContextLogin(browser, email, E2E_PASSWORD, 'fr');
  const freshStrict = attachConsoleStrict(fresh);
  try {
    const ls = await fresh.evaluate(() => JSON.parse(localStorage.getItem('user_profile') || '{}'));
    expect(ls.uid).toBe(acct.uid);
    await expect(fresh.getByText('Semaine 32', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await fresh.waitForTimeout(1500);
    expect(freshStrict, `fresh-context strict console: ${freshStrict.join(' | ')}`).toEqual([]);
  } finally {
    await fresh.context().close();
  }

  // 6. Dialog recorder: accept by default, one-shot dismiss, alert, and quartet integration.
  const accepted = await page.evaluate(() => window.confirm('W0 harness confirm'));
  expect(accepted).toBe(true);
  dialogs.next('dismiss');
  const dismissed = await page.evaluate(() => window.confirm('W0 harness cancel'));
  expect(dismissed).toBe(false);
  await page.evaluate(() => window.alert('W0 harness alert'));
  expect(dialogs.dialogs.map((d) => [d.type, d.message, d.action])).toEqual([
    ['confirm', 'W0 harness confirm', 'accepted'],
    ['confirm', 'W0 harness cancel', 'dismissed'],
    ['alert', 'W0 harness alert', 'accepted'],
  ]);
  await mega.snap('02-dialogs');
  const consoleJson = JSON.parse(fs.readFileSync(path.join(quartetDir, '02-dialogs.console.json'), 'utf8'));
  const recorded = consoleJson.filter((e: any) => e.level === 'dialog').map((e: any) => e.message);
  expect(recorded).toEqual(['W0 harness confirm', 'W0 harness cancel', 'W0 harness alert']);

  // 7. Strict console on the signed-in page.
  await page.waitForTimeout(1500);
  expect(strict, `strict console: ${strict.join(' | ')}`).toEqual([]);

  mega.dispose();
  dialogs.dispose();
});
