/**
 * Visual regression — captures key screens post-Cycle-9 fixes for diff vs
 * audit baseline (audit-screenshots/E2E_2026-05-08/*.png).
 *
 * Usage: node scripts/visual-regression.js
 * Prereq: static dist served on http://localhost:8082 (npx serve dist -l 8082 --single)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '../audit-screenshots/cycle9-after');
const STATE_FILE = path.resolve(__dirname, '../e2e/.auth/state.json');
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8082';

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const storageState = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) : undefined;

  // Cold-boot context (no auth) — Language + Onboarding flow.
  const coldCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const coldPage = await coldCtx.newPage();

  console.log('[1/8] Capture: Language screen (cold boot)');
  await coldPage.goto(`${BASE_URL}/Language`, { waitUntil: 'load', timeout: 60000 });
  await coldPage.waitForFunction(() => document.body.innerText.length > 100, { timeout: 30000 });
  await coldPage.screenshot({ path: path.join(OUTPUT_DIR, '01-language-cold.png') });

  // Authenticated context — main tabs.
  const authCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState });
  const authPage = await authCtx.newPage();

  console.log('[2/8] Capture: Home tab');
  await authPage.goto(`${BASE_URL}/HomeMain`, { waitUntil: 'load', timeout: 60000 });
  await authPage.waitForFunction(() => document.querySelectorAll('[role="tab"]').length >= 5, { timeout: 30000 });
  await authPage.waitForTimeout(1500);
  await authPage.screenshot({ path: path.join(OUTPUT_DIR, '02-home.png'), fullPage: false });

  console.log('[3/8] Capture: Home (full page)');
  await authPage.screenshot({ path: path.join(OUTPUT_DIR, '02b-home-fullpage.png'), fullPage: true });

  console.log('[4/8] Capture: Calendar tab');
  await authPage.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await authPage.waitForURL(/\/calendar/);
  await authPage.waitForTimeout(1500);
  await authPage.screenshot({ path: path.join(OUTPUT_DIR, '03-calendar.png') });

  console.log('[5/8] Capture: Reminders tab');
  await authPage.getByRole('tab', { name: 'Reminders', exact: true }).click();
  await authPage.waitForURL(/Reminders/);
  await authPage.waitForTimeout(1500);
  await authPage.screenshot({ path: path.join(OUTPUT_DIR, '04-reminders.png') });

  console.log('[6/8] Capture: Resources tab');
  await authPage.getByRole('tab', { name: 'Resources', exact: true }).click();
  await authPage.waitForTimeout(1500);
  await authPage.screenshot({ path: path.join(OUTPUT_DIR, '05-resources.png') });

  console.log('[7/8] Capture: Chatbot tab');
  await authPage.getByRole('tab', { name: 'Chatbot', exact: true }).click();
  await authPage.waitForFunction(() => document.body.innerText.includes('Assistant') || document.body.innerText.includes('grossesse'), { timeout: 15000 }).catch(() => {});
  await authPage.waitForTimeout(1500);
  await authPage.screenshot({ path: path.join(OUTPUT_DIR, '06-chatbot.png'), fullPage: true });

  console.log('[8/8] Capture: Desktop layout (1440x900)');
  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const deskPage = await deskCtx.newPage();
  await deskPage.goto(`${BASE_URL}/HomeMain`, { waitUntil: 'load', timeout: 60000 });
  await deskPage.waitForFunction(() => document.querySelectorAll('[role="tab"]').length >= 5, { timeout: 30000 });
  await deskPage.waitForTimeout(1500);
  await deskPage.screenshot({ path: path.join(OUTPUT_DIR, '07-home-desktop.png') });

  await browser.close();
  console.log(`\nDone. ${fs.readdirSync(OUTPUT_DIR).length} screenshots in ${OUTPUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
