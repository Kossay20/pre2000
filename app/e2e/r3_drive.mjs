// R3 driver with SQLite-worker neutralized (wasm static-serve artifact removed)
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:8081';
const STATE = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r3_shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const BENIGN = /DevTools|AsyncStorage has been extracted|Setting a timer|tintColor|Missing or insufficient permissions|source-?map|wasm|MIME|WebAssembly|ArrayBuffer|DatabaseService|Failed to initialize database|DB Init|Download the React DevTools|expo-notifications|Notification|useNativeDriver|pointerEvents|punycode|shadow\*|props\.|findDOMNode|act\(|deprecated|wa-sqlite|openDatabaseAsync|sqlite/i;

async function newPage(browser, locale = 'en', seed) {
  const ctx = await browser.newContext({ storageState: STATE, baseURL: BASE, viewport: { width: 390, height: 844 } });
  // Neutralize SQLite worker + wasm: serve harmless empty worker, abort wasm.
  await ctx.route('**/worker-*.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* neutralized for audit */ self.onmessage=function(){};' }));
  await ctx.route('**/*.wasm', route => route.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { const t = m.type(); if ((t === 'error' || t === 'warning') && !BENIGN.test(m.text())) errs.push(`[${t}] ${m.text()}`); });
  page.on('pageerror', e => { const s = String(e.message || e); if (!BENIGN.test(s)) errs.push(`[pageerror] ${s}`); });
  page.__errs = errs;
  // seed before any app code: set storage then go
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  if (locale !== 'en') await page.evaluate(l => localStorage.setItem('app_locale', l), locale);
  if (seed) await page.evaluate(seed);
  return { ctx, page };
}

async function deep(page, route, ms = 4500) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
  await sleep(ms);
}
async function txt(page) { return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim(); }
async function click(page, re, timeout = 4000) {
  const loc = page.getByText(re);
  const n = await loc.count();
  for (let i = 0; i < n; i++) { const el = loc.nth(i); if (await el.isVisible().catch(() => false)) { await el.click({ timeout }).catch(() => {}); return true; } }
  return false;
}
async function visInput(page) {
  const inp = page.locator('input'); const n = await inp.count();
  for (let i = 0; i < n; i++) if (await inp.nth(i).isVisible().catch(() => false)) return inp.nth(i);
  return null;
}

const results = {};

const browser = await chromium.launch();

// ---------- sanity: does neutralization stop the Oops boundary? ----------
{
  const { ctx, page } = await newPage(browser);
  await deep(page, 'HomeMain');
  const body = await txt(page);
  results._sanity = { homeOops: /Oops|small error/i.test(body), homeSnippet: body.slice(0, 80) };
  await ctx.close();
}

// ---------- WEIGHT ----------
{
  const { ctx, page } = await newPage(browser, 'en', () => {
    const raw = localStorage.getItem('user_profile'); const p = raw ? JSON.parse(raw) : {};
    p.prePregnancyWeight = 65; p.height = 165; localStorage.setItem('user_profile', JSON.stringify(p));
    // wipe any prior weight entries for clean run
    Object.keys(localStorage).filter(k => k.startsWith('@weight_entries_')).forEach(k => localStorage.removeItem(k));
  });
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });

  await deep(page, 'weight');
  let body = await txt(page);
  const onWeight = /My Weight|Add today/i.test(body) && !/Oops/i.test(body);

  // R2-PT-NEW-01: 130kg => lb/kg confirm (accept=kg) => saves
  await click(page, /Add today's weight/i); await sleep(700);
  let inp = await visInput(page);
  let saved130 = false;
  if (inp) {
    await inp.fill('130'); await sleep(200);
    dialogs.length = 0;
    await click(page, /^Save$/); await sleep(1500);
    body = await txt(page);
    saved130 = dialogs.some(d => /kilograms|130/i.test(d)) && /130/.test(body);
  }
  log('WEIGHT 130 dialogs:', JSON.stringify(dialogs), 'body130:', /130/.test(body));

  // R2-PT-NEW-02: same-day replace -> 72kg
  await click(page, /Add today's weight/i); await sleep(600);
  inp = await visInput(page);
  let replaceWorked = false;
  if (inp) {
    await inp.fill('72'); await sleep(200);
    dialogs.length = 0;
    await click(page, /^Save$/); await sleep(1500);
    body = await txt(page);
    const histPart = body.split('History')[1] || body;
    replaceWorked = dialogs.some(d => /exists/i.test(d)) && /72/.test(body) && !/130/.test(histPart);
  }
  log('WEIGHT replace dialogs:', JSON.stringify(dialogs), 'body72:', /72/.test(body), 'body130:', /130/.test(body));

  // Validation: 10kg rejected; 250 (>200) high-weight warning
  await click(page, /Add today's weight/i); await sleep(500);
  inp = await visInput(page);
  let validLow = false;
  if (inp) { await inp.fill('10'); await sleep(150); dialogs.length = 0; await click(page, /^Save$/); await sleep(900); validLow = dialogs.some(d => /valid weight|between 35/i.test(d)); }
  log('WEIGHT valid(10):', JSON.stringify(dialogs));

  inp = await visInput(page);
  let validHigh = false;
  if (inp) { await inp.fill('250'); await sleep(150); dialogs.length = 0; await click(page, /^Save$/); await sleep(900); validHigh = dialogs.some(d => /pounds|lb|verif/i.test(d) || /250/.test(d)); }
  log('WEIGHT valid(250):', JSON.stringify(dialogs));

  await page.screenshot({ path: `${OUT}/weight2.png`, fullPage: true });

  // persistence
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000);
  const rb = await txt(page);
  const persists = /72/.test(rb) && !/Oops/i.test(rb);

  results.weight = { onWeight, saved130, replaceWorked, validLow, validHigh, persists, errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---------- KICK COUNTER ----------
{
  const { ctx, page } = await newPage(browser, 'en', () => {
    Object.keys(localStorage).filter(k => /kick/i.test(k)).forEach(k => localStorage.removeItem(k));
  });
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await deep(page, 'KickCounter');
  let body = await txt(page);
  const onKick = /Tap to count|Start a session|kick/i.test(body) && !/Oops/i.test(body);
  await click(page, /Start a session/i); await sleep(1000);
  for (let i = 0; i < 3; i++) { await click(page, /Tap to count/i); await sleep(450); }
  body = await txt(page);
  const counted = /\b3\b/.test(body);
  await page.screenshot({ path: `${OUT}/kick2.png`, fullPage: true });
  // Cancel
  dialogs.length = 0;
  await click(page, /^Cancel$/); await sleep(1100);
  body = await txt(page);
  const cancelWorked = /Start a session|No session/i.test(body) && !/Tap to count/i.test(body);
  log('KICK cancel dialogs:', JSON.stringify(dialogs), 'empty:', cancelWorked);
  // persistence via end session
  await click(page, /Start a session/i); await sleep(700);
  await click(page, /Tap to count/i); await sleep(400);
  await click(page, /End session/i); await sleep(900);
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(3500);
  const kb = await txt(page);
  const kickPersist = /History|kick/i.test(kb) && !/Oops/i.test(kb);
  results.kick = { onKick, counted, cancelWorked, kickPersist, errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---------- CONTRACTION ----------
{
  const { ctx, page } = await newPage(browser, 'en', () => {
    Object.keys(localStorage).filter(k => /contraction/i.test(k)).forEach(k => localStorage.removeItem(k));
  });
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await deep(page, 'ContractionTimer');
  let body = await txt(page);
  const onContr = /Contraction/i.test(body) && !/Oops/i.test(body);
  await click(page, /Contraction start/i); await sleep(1400);
  await click(page, /Contraction end/i); await sleep(700);
  await click(page, /Contraction start/i); await sleep(1400);
  await click(page, /Contraction end/i); await sleep(700);
  body = await txt(page);
  const recorded = /History|Average|Count|Frequency/i.test(body);
  await page.screenshot({ path: `${OUT}/contraction2.png`, fullPage: true });
  dialogs.length = 0;
  await click(page, /Clear all/i); await sleep(1100);
  body = await txt(page);
  const clearWorked = /No contractions logged/i.test(body) && dialogs.some(d => /Clear all contractions|cannot be undone/i.test(d));
  log('CONTR clear dialogs:', JSON.stringify(dialogs), 'empty:', /No contractions/i.test(body));
  // persistence
  await click(page, /Contraction start/i); await sleep(1200); await click(page, /Contraction end/i); await sleep(700);
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(3500);
  const cb = await txt(page);
  const contrPersist = /History|Count|Average/i.test(cb) && !/Oops/i.test(cb);
  results.contraction = { onContr, recorded, clearWorked, contrPersist, errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---------- BABY EVO + RECOMMENDATIONS ----------
{
  const { ctx, page } = await newPage(browser);
  page.on('dialog', async d => d.accept());
  await deep(page, 'BabyEvolution');
  const bb = await txt(page);
  await page.screenshot({ path: `${OUT}/baby2.png`, fullPage: true });
  await deep(page, 'recommendations');
  const rb = await txt(page);
  await page.screenshot({ path: `${OUT}/recs2.png`, fullPage: true });
  results.content = { babyOops: /Oops/i.test(bb), babyLen: bb.length, babySnippet: bb.slice(0, 140), recsOops: /Oops/i.test(rb), recsLen: rb.length, recsSnippet: rb.slice(0, 140), errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---------- STATISTICS empty ----------
{
  const { ctx, page } = await newPage(browser, 'en', () => {
    Object.keys(localStorage).filter(k => k.startsWith('@daily_checklist_v2_')).forEach(k => localStorage.removeItem(k));
  });
  page.on('dialog', async d => d.accept());
  await deep(page, 'Statistics');
  const body = await txt(page);
  await page.screenshot({ path: `${OUT}/stats_empty2.png`, fullPage: true });
  results.statsEmpty = { oops: /Oops/i.test(body), emptyState: /No data yet|Use the app/i.test(body), snippet: body.slice(0, 200), errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---------- STATISTICS seeded (F-HS-02-REGR hydration real water) ----------
{
  const { ctx, page } = await newPage(browser, 'en', () => {
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const t = fmt(today), y = fmt(new Date(today.getTime() - 864e5));
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 1500, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    const mk = done => JSON.stringify([
      { id: 'reminder-rem_hyd_herbal_tea', completed: done, current: 9, skipped: false },
      { id: 'reminder-rem_vitamin_d', completed: done, skipped: false },
    ]);
    localStorage.setItem('@daily_checklist_v2_' + y, mk(true));
    localStorage.setItem('@daily_checklist_v2_' + t, mk(true));
  });
  page.on('dialog', async d => d.accept());
  await deep(page, 'Statistics', 5500);
  const body = await txt(page);
  const svgLabels = await page.evaluate(() => Array.from(document.querySelectorAll('svg text')).map(t => t.textContent));
  await page.screenshot({ path: `${OUT}/stats_seeded2.png`, fullPage: true });
  results.statsSeeded = {
    oops: /Oops/i.test(body),
    hasHydrationChart: /Hydration \(Liters\)/i.test(body),
    hasSuccessChart: /Overall success/i.test(body),
    svgLabels,
    // herbal tea current=9 must NOT appear as a y-axis value; real water max=1.5
    nineInLabels: svgLabels.some(l => /^9(\.0+)?$/.test((l || '').trim())),
    snippet: body.slice(0, 300),
    errs: [...new Set(page.__errs)],
  };
  await ctx.close();
}

// ---------- STATISTICS single-point guard (F-HS-NEW-01) ----------
{
  const { ctx, page } = await newPage(browser, 'en', () => {
    Object.keys(localStorage).filter(k => k.startsWith('@daily_checklist_v2_')).forEach(k => localStorage.removeItem(k));
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 1000, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    localStorage.setItem('@daily_checklist_v2_' + fmt(today), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: true, skipped: false }]));
  });
  page.on('dialog', async d => d.accept());
  await deep(page, 'Statistics', 5500);
  const body = await txt(page);
  const guardCount = (body.match(/Log at least 2 days/gi) || []).length;
  await page.screenshot({ path: `${OUT}/stats_single2.png`, fullPage: true });
  results.statsSingle = { oops: /Oops/i.test(body), guardShown: guardCount >= 1, guardCount, snippet: body.slice(0, 300), errs: [...new Set(page.__errs)] };
  await ctx.close();
}

// ---------- AR / RTL ----------
{
  const { ctx, page } = await newPage(browser, 'ar', () => {
    localStorage.setItem('app_locale', 'ar');
    const today = new Date(); const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('@daily_checklist_v2_' + fmt(today), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: true, skipped: false }]));
    localStorage.setItem('@daily_checklist_v2_' + fmt(new Date(today.getTime() - 864e5)), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: false, skipped: false }]));
    localStorage.setItem('hydration_data_v1', JSON.stringify({ currentIntake: 800, dailyGoal: 3000, lastUpdated: today.toISOString(), reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22 }));
    const raw = localStorage.getItem('user_profile'); const p = raw ? JSON.parse(raw) : {}; p.prePregnancyWeight = 65; p.height = 165; localStorage.setItem('user_profile', JSON.stringify(p));
  });
  page.on('dialog', async d => d.accept());
  await deep(page, 'Statistics', 5500);
  const dir = await page.evaluate(() => document.documentElement.dir || getComputedStyle(document.body).direction);
  const sBody = await txt(page);
  await page.screenshot({ path: `${OUT}/stats_ar2.png`, fullPage: true });
  await deep(page, 'weight');
  const wBody = await txt(page);
  await page.screenshot({ path: `${OUT}/weight_ar2.png`, fullPage: true });
  await deep(page, 'KickCounter');
  const kBody = await txt(page);
  await page.screenshot({ path: `${OUT}/kick_ar2.png`, fullPage: true });
  results.rtl = {
    dir, statsArabic: /[؀-ۿ]/.test(sBody), statsOops: /Oops/i.test(sBody),
    weightArabic: /[؀-ۿ]/.test(wBody), weightOops: /Oops/i.test(wBody),
    kickArabic: /[؀-ۿ]/.test(kBody), kickOops: /Oops/i.test(kBody),
    errs: [...new Set(page.__errs)],
  };
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/results2.json`, JSON.stringify(results, null, 2));
log('\n================ RESULTS2 ================');
log(JSON.stringify(results, null, 2));
