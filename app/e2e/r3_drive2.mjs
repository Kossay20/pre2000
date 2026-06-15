// Deterministic neutralization via addInitScript stubbing Worker + WebAssembly
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:8081';
const STATE = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r3_shots';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const BENIGN = /DevTools|AsyncStorage has been extracted|Setting a timer|tintColor|Missing or insufficient permissions|source-?map|wasm|MIME|WebAssembly|ArrayBuffer|DatabaseService|Failed to initialize database|DB Init|React DevTools|expo-notifications|Notification|useNativeDriver|pointerEvents|punycode|shadow\*|props\.|findDOMNode|act\(|deprecated|wa-sqlite|openDatabaseAsync|sqlite|Worker/i;

const STUB = () => {
  try {
    // Neutralize the chatbot SQLite worker so its WASM abort never crashes the app globally.
    const RealWorker = window.Worker;
    window.Worker = class { constructor(){ this.onmessage=null; this.onerror=null; } postMessage(){} terminate(){} addEventListener(){} removeEventListener(){} };
    window.__realWorker = RealWorker;
  } catch (e) {}
};

async function mk(browser, locale, seed) {
  const ctx = await browser.newContext({ storageState: STATE, baseURL: BASE, viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(STUB);
  await ctx.route('**/*.wasm', r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { const t = m.type(); if ((t === 'error' || t === 'warning') && !BENIGN.test(m.text())) errs.push(`[${t}] ${m.text()}`); });
  page.on('pageerror', e => { const s = String(e.message || e); if (!BENIGN.test(s)) errs.push(`[pageerror] ${s}`); });
  page.__errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  if (locale && locale !== 'en') await page.evaluate(l => localStorage.setItem('app_locale', l), locale);
  if (seed) await page.evaluate(seed);
  return { ctx, page };
}
async function deep(page, route, ms = 5000) { await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' }); await sleep(ms); }
async function txt(page) { return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim(); }
async function click(page, re, timeout = 4000) { const loc = page.getByText(re); const n = await loc.count(); for (let i = 0; i < n; i++) { const el = loc.nth(i); if (await el.isVisible().catch(() => false)) { await el.click({ timeout }).catch(() => {}); return true; } } return false; }

const results = {};
const browser = await chromium.launch();

// sanity
{ const { ctx, page } = await mk(browser, 'en'); await deep(page, 'HomeMain'); const b = await txt(page); results._sanity = { homeOops: /Oops/i.test(b), snip: b.slice(0, 70) }; await ctx.close(); }

// KICK
{
  const { ctx, page } = await mk(browser, 'en', () => Object.keys(localStorage).filter(k => /kick/i.test(k)).forEach(k => localStorage.removeItem(k)));
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await deep(page, 'KickCounter');
  let b = await txt(page); const onKick = /Tap to count|Start a session/i.test(b) && !/Oops/i.test(b);
  await click(page, /Start a session/i); await sleep(1000);
  for (let i = 0; i < 3; i++) { await click(page, /Tap to count/i); await sleep(450); }
  b = await txt(page); const counted = /\b3\b/.test(b);
  await page.screenshot({ path: `${OUT}/kick3.png`, fullPage: true });
  dialogs.length = 0; await click(page, /^Cancel$/); await sleep(1100); b = await txt(page);
  const cancelWorked = /Start a session|No session/i.test(b) && !/Tap to count/i.test(b);
  // persist
  await click(page, /Start a session/i); await sleep(700); await click(page, /Tap to count/i); await sleep(400); await click(page, /End session/i); await sleep(900);
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000); const kb = await txt(page);
  const kickPersist = /History|kick/i.test(kb) && !/Oops/i.test(kb);
  results.kick = { onKick, counted, cancelWorked, cancelDialogs: dialogs, kickPersist, errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// CONTRACTION
{
  const { ctx, page } = await mk(browser, 'en', () => Object.keys(localStorage).filter(k => /contraction/i.test(k)).forEach(k => localStorage.removeItem(k)));
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await deep(page, 'ContractionTimer');
  let b = await txt(page); const onContr = /Contraction/i.test(b) && !/Oops/i.test(b);
  await click(page, /Contraction start/i); await sleep(1400); await click(page, /Contraction end/i); await sleep(700);
  await click(page, /Contraction start/i); await sleep(1400); await click(page, /Contraction end/i); await sleep(700);
  b = await txt(page); const recorded = /History|Average|Count|Frequency/i.test(b);
  await page.screenshot({ path: `${OUT}/contraction3.png`, fullPage: true });
  dialogs.length = 0; await click(page, /Clear all/i); await sleep(1100); b = await txt(page);
  const clearWorked = /No contractions logged/i.test(b) && dialogs.some(d => /Clear all contractions|cannot be undone/i.test(d));
  await click(page, /Contraction start/i); await sleep(1200); await click(page, /Contraction end/i); await sleep(700);
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000); const cb = await txt(page);
  const contrPersist = /History|Count|Average/i.test(cb) && !/Oops/i.test(cb);
  results.contraction = { onContr, recorded, clearWorked, clearDialogs: dialogs, contrPersist, errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// STATS empty
{
  const { ctx, page } = await mk(browser, 'en', () => Object.keys(localStorage).filter(k => k.startsWith('@daily_checklist_v2_')).forEach(k => localStorage.removeItem(k)));
  page.on('dialog', async d => d.accept());
  await deep(page, 'Statistics');
  const b = await txt(page);
  await page.screenshot({ path: `${OUT}/stats_empty3.png`, fullPage: true });
  results.statsEmpty = { oops: /Oops/i.test(b), emptyState: /No data yet|Use the app/i.test(b), snip: b.slice(0, 200), errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// STATS seeded (hydration real water)
{
  const { ctx, page } = await mk(browser, 'en', () => {
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const t = fmt(today), y = fmt(new Date(today.getTime() - 864e5));
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 1500, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    const mkc = done => JSON.stringify([{ id: 'reminder-rem_hyd_herbal_tea', completed: done, current: 9, skipped: false }, { id: 'reminder-rem_vitamin_d', completed: done, skipped: false }]);
    localStorage.setItem('@daily_checklist_v2_' + y, mkc(true)); localStorage.setItem('@daily_checklist_v2_' + t, mkc(true));
  });
  page.on('dialog', async d => d.accept());
  await deep(page, 'Statistics', 6000);
  const b = await txt(page);
  const svgLabels = await page.evaluate(() => Array.from(document.querySelectorAll('svg text')).map(t => (t.textContent || '').trim()));
  await page.screenshot({ path: `${OUT}/stats_seeded3.png`, fullPage: true });
  results.statsSeeded = {
    oops: /Oops/i.test(b),
    hasHydrationChart: /Hydration \(Liters\)/i.test(b),
    hasSuccessChart: /Overall success/i.test(b),
    svgLabels,
    nineLabel: svgLabels.filter(l => /^9(\.0+)?$/.test(l)),
    onePoint5Label: svgLabels.filter(l => /^1\.5/.test(l)),
    snip: b.slice(0, 250),
    errs: [...new Set(page.__errs)],
  };
  await ctx.close();
}

// STATS single point guard
{
  const { ctx, page } = await mk(browser, 'en', () => {
    Object.keys(localStorage).filter(k => k.startsWith('@daily_checklist_v2_')).forEach(k => localStorage.removeItem(k));
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 1000, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    localStorage.setItem('@daily_checklist_v2_' + fmt(today), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: true, skipped: false }]));
  });
  page.on('dialog', async d => d.accept());
  await deep(page, 'Statistics', 6000);
  const b = await txt(page);
  await page.screenshot({ path: `${OUT}/stats_single3.png`, fullPage: true });
  results.statsSingle = { oops: /Oops/i.test(b), guardCount: (b.match(/Log at least 2 days/gi) || []).length, snip: b.slice(0, 250), errs: [...new Set(page.__errs)] };
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/results3.json`, JSON.stringify(results, null, 2));
log(JSON.stringify(results, null, 2));
