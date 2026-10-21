// R3 FINAL — correct kebab-case deep-link paths. Drive all PT + HS screens.
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:8081';
const STATE = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r3_shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const BENIGN = /DevTools|AsyncStorage has been extracted|Setting a timer|tintColor|Missing or insufficient permissions|insufficient permissions|source-?map|wasm|MIME|WebAssembly|ArrayBuffer|DatabaseService|Failed to initialize database|DB Init|React DevTools|expo-notifications|Notification|useNativeDriver|pointerEvents|punycode|shadow\*|props\.|findDOMNode|act\(|deprecated|wa-sqlite|openDatabaseAsync|sqlite|babyMessageService|tipsService|FirebaseError/i;

async function mk(browser, locale, seed) {
  const ctx = await browser.newContext({ storageState: STATE, baseURL: BASE, viewport: { width: 390, height: 844 } });
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
async function visInput(page) { const inp = page.locator('input'); const n = await inp.count(); for (let i = 0; i < n; i++) if (await inp.nth(i).isVisible().catch(() => false)) return inp.nth(i); return null; }

const results = {};
const browser = await chromium.launch();

// ---- WEIGHT ----
{
  const { ctx, page } = await mk(browser, 'en', () => {
    const raw = localStorage.getItem('user_profile'); const p = raw ? JSON.parse(raw) : {};
    p.prePregnancyWeight = 65; p.height = 165; localStorage.setItem('user_profile', JSON.stringify(p));
    Object.keys(localStorage).filter(k => k.startsWith('@weight_entries_')).forEach(k => localStorage.removeItem(k));
  });
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await deep(page, 'weight');
  let body = await txt(page);
  const onWeight = /My Weight|Add today/i.test(body) && !/Oops/i.test(body);
  // 130 kg
  await click(page, /Add today's weight/i); await sleep(700);
  let inp = await visInput(page); let saved130 = false, d130 = [];
  if (inp) { await inp.fill('130'); await sleep(200); dialogs.length = 0; await click(page, /^Save$/); await sleep(1500); body = await txt(page); d130 = [...dialogs]; saved130 = dialogs.some(d => /kilograms|130/i.test(d)) && /130/.test(body); }
  // replace 72
  await click(page, /Add today's weight/i); await sleep(600);
  inp = await visInput(page); let replaceWorked = false, dRep = [];
  if (inp) { await inp.fill('72'); await sleep(200); dialogs.length = 0; await click(page, /^Save$/); await sleep(1500); body = await txt(page); dRep = [...dialogs]; const hist = body.split('History')[1] || body; replaceWorked = dialogs.some(d => /exists/i.test(d)) && /72/.test(body) && !/130/.test(hist); }
  // validation 10
  await click(page, /Add today's weight/i); await sleep(500); inp = await visInput(page); let validLow = false, dLow = [];
  if (inp) { await inp.fill('10'); await sleep(150); dialogs.length = 0; await click(page, /^Save$/); await sleep(900); dLow = [...dialogs]; validLow = dialogs.some(d => /valid weight|between 35/i.test(d)); }
  // validation 250
  inp = await visInput(page); let validHigh = false, dHi = [];
  if (inp) { await inp.fill('250'); await sleep(150); dialogs.length = 0; await click(page, /^Save$/); await sleep(900); dHi = [...dialogs]; validHigh = dialogs.some(d => /pounds|lb|113/i.test(d)); }
  await page.screenshot({ path: `${OUT}/F_weight.png`, fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4500);
  const rb = await txt(page); const persists = /72/.test(rb) && !/Oops/i.test(rb);
  results.weight = { onWeight, saved130, d130, replaceWorked, dRep, validLow, dLow, validHigh, dHi, persists, errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---- KICK ----
{
  const { ctx, page } = await mk(browser, 'en', () => Object.keys(localStorage).filter(k => /kick/i.test(k)).forEach(k => localStorage.removeItem(k)));
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await deep(page, 'kick-counter');
  let body = await txt(page); const onKick = /Tap to count|Start a session/i.test(body) && !/Oops/i.test(body);
  await click(page, /Start a session/i); await sleep(1000);
  for (let i = 0; i < 3; i++) { await click(page, /Tap to count/i); await sleep(450); }
  body = await txt(page); const counted = /\b3\b/.test(body);
  await page.screenshot({ path: `${OUT}/F_kick_active.png`, fullPage: true });
  dialogs.length = 0; await click(page, /^Cancel$/); await sleep(1100); body = await txt(page);
  const cancelWorked = /Start a session|No session/i.test(body) && !/Tap to count/i.test(body); const dCancel = [...dialogs];
  await click(page, /Start a session/i); await sleep(700); await click(page, /Tap to count/i); await sleep(400); await click(page, /End session/i); await sleep(900);
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4500); const kb = await txt(page);
  const kickPersist = /History|kick/i.test(kb) && !/Oops/i.test(kb);
  results.kick = { onKick, counted, cancelWorked, dCancel, kickPersist, errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---- CONTRACTION ----
{
  const { ctx, page } = await mk(browser, 'en', () => Object.keys(localStorage).filter(k => /contraction/i.test(k)).forEach(k => localStorage.removeItem(k)));
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await deep(page, 'contraction-timer');
  let body = await txt(page); const onContr = /Contraction/i.test(body) && !/Oops/i.test(body);
  await click(page, /Contraction start/i); await sleep(1400); await click(page, /Contraction end/i); await sleep(700);
  await click(page, /Contraction start/i); await sleep(1400); await click(page, /Contraction end/i); await sleep(700);
  body = await txt(page); const recorded = /History|Average|Count|Frequency/i.test(body);
  await page.screenshot({ path: `${OUT}/F_contraction.png`, fullPage: true });
  dialogs.length = 0; await click(page, /Clear all/i); await sleep(1100); body = await txt(page);
  const clearWorked = /No contractions logged/i.test(body) && dialogs.some(d => /Clear all contractions|cannot be undone/i.test(d)); const dClear = [...dialogs];
  await click(page, /Contraction start/i); await sleep(1200); await click(page, /Contraction end/i); await sleep(700);
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4500); const cb = await txt(page);
  const contrPersist = /History|Count|Average/i.test(cb) && !/Oops/i.test(cb);
  results.contraction = { onContr, recorded, clearWorked, dClear, contrPersist, errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---- BABY EVOLUTION ----
{
  const { ctx, page } = await mk(browser);
  page.on('dialog', async d => d.accept());
  await deep(page, 'baby-evolution');
  const bb = await txt(page);
  await page.screenshot({ path: `${OUT}/F_baby.png`, fullPage: true });
  results.babyEvo = { oops: /Oops/i.test(bb), len: bb.length, snip: bb.slice(0, 160), errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---- STATS empty ----
{
  const { ctx, page } = await mk(browser, 'en', () => Object.keys(localStorage).filter(k => k.startsWith('@daily_checklist_v2_')).forEach(k => localStorage.removeItem(k)));
  page.on('dialog', async d => d.accept());
  await deep(page, 'statistics');
  const b = await txt(page);
  await page.screenshot({ path: `${OUT}/F_stats_empty.png`, fullPage: true });
  results.statsEmpty = { oops: /Oops/i.test(b), emptyState: /No data yet|Use the app/i.test(b), hasCTA: /Go to Tasks/i.test(b), snip: b.slice(0, 200), errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---- STATS seeded (F-HS-02-REGR) ----
{
  const { ctx, page } = await mk(browser, 'en', () => {
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const t = fmt(today), y = fmt(new Date(today.getTime() - 864e5));
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 1500, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    const mkc = done => JSON.stringify([{ id: 'reminder-rem_hyd_herbal_tea', completed: done, current: 9, skipped: false }, { id: 'reminder-rem_vitamin_d', completed: done, skipped: false }]);
    localStorage.setItem('@daily_checklist_v2_' + y, mkc(true)); localStorage.setItem('@daily_checklist_v2_' + t, mkc(true));
  });
  page.on('dialog', async d => d.accept());
  await deep(page, 'statistics', 6000);
  const b = await txt(page);
  const svg = await page.evaluate(() => Array.from(document.querySelectorAll('svg text')).map(t => (t.textContent || '').trim()));
  await page.screenshot({ path: `${OUT}/F_stats_seeded.png`, fullPage: true });
  results.statsSeeded = {
    oops: /Oops/i.test(b), hasHydrationChart: /Hydration \(Liters\)/i.test(b), hasSuccessChart: /Overall success/i.test(b),
    svgLabels: svg, nineLabel: svg.filter(l => /^9(\.0+)?$/.test(l)), waterLabel: svg.filter(l => /1\.5|1,5|^2(\.0+)?$/.test(l)),
    snip: b.slice(0, 240), errs: [...new Set(page.__errs)],
  };
  await ctx.close();
}

// ---- STATS single point guard (F-HS-NEW-01) ----
{
  const { ctx, page } = await mk(browser, 'en', () => {
    Object.keys(localStorage).filter(k => k.startsWith('@daily_checklist_v2_')).forEach(k => localStorage.removeItem(k));
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 1000, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    localStorage.setItem('@daily_checklist_v2_' + fmt(today), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: true, skipped: false }]));
  });
  page.on('dialog', async d => d.accept());
  await deep(page, 'statistics', 6000);
  const b = await txt(page);
  await page.screenshot({ path: `${OUT}/F_stats_single.png`, fullPage: true });
  results.statsSingle = { oops: /Oops/i.test(b), guardCount: (b.match(/Log at least 2 days/gi) || []).length, snip: b.slice(0, 240), errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---- AR / RTL ----
{
  const { ctx, page } = await mk(browser, 'ar', () => {
    localStorage.setItem('app_locale', 'ar');
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('@daily_checklist_v2_' + fmt(today), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: true, skipped: false }]));
    localStorage.setItem('@daily_checklist_v2_' + fmt(new Date(today.getTime() - 864e5)), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: false, skipped: false }]));
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 800, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    const raw = localStorage.getItem('user_profile'); const p = raw ? JSON.parse(raw) : {}; p.prePregnancyWeight = 65; p.height = 165; localStorage.setItem('user_profile', JSON.stringify(p));
  });
  page.on('dialog', async d => d.accept());
  await deep(page, 'statistics', 6000);
  const dir = await page.evaluate(() => document.documentElement.dir || getComputedStyle(document.body).direction);
  const sB = await txt(page); await page.screenshot({ path: `${OUT}/F_stats_ar.png`, fullPage: true });
  await deep(page, 'weight'); const wB = await txt(page); await page.screenshot({ path: `${OUT}/F_weight_ar.png`, fullPage: true });
  await deep(page, 'kick-counter'); const kB = await txt(page); await page.screenshot({ path: `${OUT}/F_kick_ar.png`, fullPage: true });
  await deep(page, 'contraction-timer'); const cB = await txt(page); await page.screenshot({ path: `${OUT}/F_contraction_ar.png`, fullPage: true });
  results.rtl = {
    dir, statsArabic: /[؀-ۿ]/.test(sB), statsOops: /Oops/i.test(sB),
    weightArabic: /[؀-ۿ]/.test(wB), weightOops: /Oops/i.test(wB),
    kickArabic: /[؀-ۿ]/.test(kB), kickOops: /Oops/i.test(kB),
    contrArabic: /[؀-ۿ]/.test(cB), contrOops: /Oops/i.test(cB),
    errs: [...new Set(page.__errs)],
  };
  await ctx.close();
}

// ---- Unknown route handling (adversarial): /KickCounter (wrong path) ----
{
  const { ctx, page } = await mk(browser);
  page.on('dialog', async d => d.accept());
  await deep(page, 'KickCounter');
  const b = await txt(page);
  await page.screenshot({ path: `${OUT}/F_unknown_route.png`, fullPage: true });
  results.unknownRoute = { route: '/KickCounter', oops: /Oops/i.test(b), snip: b.slice(0, 120) };
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/results_final.json`, JSON.stringify(results, null, 2));
log(JSON.stringify(results, null, 2));
