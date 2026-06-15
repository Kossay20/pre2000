// Strategy: warm the context on /weight (DB init fails+caught), THEN nav to target.
// Fresh browser per screen. Retry once if Oops. No Worker stub (keep RNW intact).
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:8081';
const STATE = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r3_shots';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const BENIGN = /DevTools|AsyncStorage has been extracted|Setting a timer|tintColor|Missing or insufficient permissions|source-?map|wasm|MIME|WebAssembly|ArrayBuffer|DatabaseService|Failed to initialize database|DB Init|React DevTools|expo-notifications|Notification|useNativeDriver|pointerEvents|punycode|shadow\*|props\.|findDOMNode|act\(|deprecated|wa-sqlite|openDatabaseAsync|sqlite/i;

async function ctxPage(locale, seed) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: STATE, baseURL: BASE, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { const t = m.type(); if ((t === 'error' || t === 'warning') && !BENIGN.test(m.text())) errs.push(`[${t}] ${m.text()}`); });
  page.on('pageerror', e => { const s = String(e.message || e); if (!BENIGN.test(s)) errs.push(`[pageerror] ${s}`); });
  page.__errs = errs; page.__browser = browser;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  if (locale && locale !== 'en') await page.evaluate(l => localStorage.setItem('app_locale', l), locale);
  if (seed) await page.evaluate(seed);
  return page;
}
async function txt(page) { return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim(); }
async function click(page, re, timeout = 4000) { const loc = page.getByText(re); const n = await loc.count(); for (let i = 0; i < n; i++) { const el = loc.nth(i); if (await el.isVisible().catch(() => false)) { await el.click({ timeout }).catch(() => {}); return true; } } return false; }
// warm then deep-nav to target with retry on Oops
async function navWarm(page, route, ms = 5000) {
  // warm: load weight (renders reliably) so DB init promise rejects+caught early
  await page.goto(`${BASE}/weight`, { waitUntil: 'domcontentloaded' }); await sleep(3500);
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' }); await sleep(ms);
    let b = await txt(page);
    if (!/Oops|small error/i.test(b)) return b;
    // try Retry button
    await click(page, /Retry/i); await sleep(3000);
    b = await txt(page);
    if (!/Oops|small error/i.test(b)) return b;
  }
  return await txt(page);
}

const results = {};

// KICK
{
  const page = await ctxPage('en', () => Object.keys(localStorage).filter(k => /kick/i.test(k)).forEach(k => localStorage.removeItem(k)));
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  let b = await navWarm(page, 'KickCounter');
  const onKick = /Tap to count|Start a session/i.test(b) && !/Oops/i.test(b);
  if (onKick) {
    await click(page, /Start a session/i); await sleep(1000);
    for (let i = 0; i < 3; i++) { await click(page, /Tap to count/i); await sleep(450); }
    b = await txt(page);
    var counted = /\b3\b/.test(b);
    await page.screenshot({ path: `${OUT}/kick4.png`, fullPage: true });
    dialogs.length = 0; await click(page, /^Cancel$/); await sleep(1100); b = await txt(page);
    var cancelWorked = /Start a session|No session/i.test(b) && !/Tap to count/i.test(b);
    await click(page, /Start a session/i); await sleep(700); await click(page, /Tap to count/i); await sleep(400); await click(page, /End session/i); await sleep(900);
    await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000); const kb = await txt(page);
    var kickPersist = /History|kick/i.test(kb) && !/Oops/i.test(kb);
  }
  results.kick = { onKick, counted: counted ?? false, cancelWorked: cancelWorked ?? false, cancelDialogs: dialogs, kickPersist: kickPersist ?? false, errs: [...new Set(page.__errs)] };
  await page.__browser.close();
}

// CONTRACTION
{
  const page = await ctxPage('en', () => Object.keys(localStorage).filter(k => /contraction/i.test(k)).forEach(k => localStorage.removeItem(k)));
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  let b = await navWarm(page, 'ContractionTimer');
  const onContr = /Contraction/i.test(b) && !/Oops/i.test(b);
  if (onContr) {
    await click(page, /Contraction start/i); await sleep(1400); await click(page, /Contraction end/i); await sleep(700);
    await click(page, /Contraction start/i); await sleep(1400); await click(page, /Contraction end/i); await sleep(700);
    b = await txt(page);
    var recorded = /History|Average|Count|Frequency/i.test(b);
    await page.screenshot({ path: `${OUT}/contraction4.png`, fullPage: true });
    dialogs.length = 0; await click(page, /Clear all/i); await sleep(1100); b = await txt(page);
    var clearWorked = /No contractions logged/i.test(b) && dialogs.some(d => /Clear all contractions|cannot be undone/i.test(d));
    await click(page, /Contraction start/i); await sleep(1200); await click(page, /Contraction end/i); await sleep(700);
    await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000); const cb = await txt(page);
    var contrPersist = /History|Count|Average/i.test(cb) && !/Oops/i.test(cb);
  }
  results.contraction = { onContr, recorded: recorded ?? false, clearWorked: clearWorked ?? false, clearDialogs: dialogs, contrPersist: contrPersist ?? false, errs: [...new Set(page.__errs)] };
  await page.__browser.close();
}

// STATS empty
{
  const page = await ctxPage('en', () => Object.keys(localStorage).filter(k => k.startsWith('@daily_checklist_v2_')).forEach(k => localStorage.removeItem(k)));
  page.on('dialog', async d => d.accept());
  const b = await navWarm(page, 'Statistics');
  await page.screenshot({ path: `${OUT}/stats_empty4.png`, fullPage: true });
  results.statsEmpty = { oops: /Oops/i.test(b), emptyState: /No data yet|Use the app/i.test(b), snip: b.slice(0, 200), errs: [...new Set(page.__errs)] };
  await page.__browser.close();
}

// STATS seeded
{
  const page = await ctxPage('en', () => {
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const t = fmt(today), y = fmt(new Date(today.getTime() - 864e5));
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 1500, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    const mkc = done => JSON.stringify([{ id: 'reminder-rem_hyd_herbal_tea', completed: done, current: 9, skipped: false }, { id: 'reminder-rem_vitamin_d', completed: done, skipped: false }]);
    localStorage.setItem('@daily_checklist_v2_' + y, mkc(true)); localStorage.setItem('@daily_checklist_v2_' + t, mkc(true));
  });
  page.on('dialog', async d => d.accept());
  const b = await navWarm(page, 'Statistics', 6000);
  const svgLabels = await page.evaluate(() => Array.from(document.querySelectorAll('svg text')).map(t => (t.textContent || '').trim()));
  await page.screenshot({ path: `${OUT}/stats_seeded4.png`, fullPage: true });
  results.statsSeeded = {
    oops: /Oops/i.test(b), hasHydrationChart: /Hydration \(Liters\)/i.test(b), hasSuccessChart: /Overall success/i.test(b),
    svgLabels, nineLabel: svgLabels.filter(l => /^9(\.0+)?$/.test(l)), onePoint5Label: svgLabels.filter(l => /1\.5/.test(l)),
    snip: b.slice(0, 250), errs: [...new Set(page.__errs)],
  };
  await page.__browser.close();
}

// STATS single
{
  const page = await ctxPage('en', () => {
    Object.keys(localStorage).filter(k => k.startsWith('@daily_checklist_v2_')).forEach(k => localStorage.removeItem(k));
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 1000, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    localStorage.setItem('@daily_checklist_v2_' + fmt(today), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: true, skipped: false }]));
  });
  page.on('dialog', async d => d.accept());
  const b = await navWarm(page, 'Statistics', 6000);
  await page.screenshot({ path: `${OUT}/stats_single4.png`, fullPage: true });
  results.statsSingle = { oops: /Oops/i.test(b), guardCount: (b.match(/Log at least 2 days/gi) || []).length, snip: b.slice(0, 250), errs: [...new Set(page.__errs)] };
  await page.__browser.close();
}

fs.writeFileSync(`${OUT}/results4.json`, JSON.stringify(results, null, 2));
log(JSON.stringify(results, null, 2));
