// Round-3 adversarial audit harness — Pregnancy Tools + Health/Stats
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:8081';
const STATE = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r3_shots';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function newCtx(browser, locale = 'en') {
  const ctx = await browser.newContext({
    storageState: STATE,
    baseURL: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (locale !== 'en') {
    // override locale in storage
    const page0 = await ctx.newPage();
    await page0.goto(BASE);
    await page0.evaluate((l) => localStorage.setItem('app_locale', l), locale);
    await page0.close();
  }
  return ctx;
}

const BENIGN = /DevTools|AsyncStorage has been extracted|Setting a timer|tintColor|Missing or insufficient permissions|source-?map|wasm|MIME|Download the React DevTools|expo-notifications|Notification|\[expo-av\]|useNativeDriver|wbr|shadow\*|pointerEvents is deprecated|props\.pointerEvents|accessibilityLabel|new NativeEventEmitter|EventEmitter\.removeListener|findDOMNode|ReactDOM\.render|act\(\)|punycode|web-streams|deprecated/i;

function attachConsole(page, bucket) {
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') {
      const text = m.text();
      if (!BENIGN.test(text)) bucket.push(`[${t}] ${text}`);
    }
  });
  page.on('pageerror', (e) => {
    const text = String(e.message || e);
    if (!BENIGN.test(text)) bucket.push(`[pageerror] ${text}`);
  });
}

async function gotoDeep(page, route) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
  // give the SPA hydration + navigation time
  await sleep(3500);
}

// Find a clickable element whose visible text contains substring (case-insensitive)
async function clickByText(page, substr, { exact = false, timeout = 4000 } = {}) {
  const loc = exact
    ? page.getByText(substr, { exact: true })
    : page.getByText(new RegExp(substr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout }).catch(() => {});
      return true;
    }
  }
  return false;
}

async function bodyText(page) {
  return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();
}

async function run() {
  const browser = await chromium.launch();
  const results = {};

  // ================= WEIGHT TRACKER =================
  {
    const ctx = await newCtx(browser, 'en');
    const page = await ctx.newPage();
    const errs = [];
    attachConsole(page, errs);
    // Accept ALL dialogs (window.confirm/alert) — needed for confirm-gated saves
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

    // Seed pre-pregnancy weight + height so the tracker shows main content (needsSetup=false)
    await page.goto(BASE);
    await page.evaluate(() => {
      const raw = localStorage.getItem('user_profile');
      const p = raw ? JSON.parse(raw) : {};
      p.prePregnancyWeight = 65; p.height = 165;
      localStorage.setItem('user_profile', JSON.stringify(p));
    });

    await gotoDeep(page, 'weight');
    let bt = await bodyText(page);
    const onWeight = /My Weight|Initial Setup|Add today/i.test(bt);
    log('WEIGHT loaded:', onWeight, '| dialogs so far:', dialogs.length);

    // R2-PT-NEW-01: save 130kg -> triggers lb/kg confirm (accept = yes kg) then saves
    let saved130 = false, replaceWorked = false, validationWorks = false;
    if (onWeight) {
      // open add form
      await clickByText(page, "Add today's weight");
      await sleep(800);
      // type 130 into the weight input (decimal-pad)
      const inputs = page.locator('input');
      const ic = await inputs.count();
      // pick the visible input
      let target = null;
      for (let i = 0; i < ic; i++) {
        if (await inputs.nth(i).isVisible().catch(() => false)) { target = inputs.nth(i); break; }
      }
      if (target) {
        await target.fill('130');
        await sleep(300);
        await clickByText(page, '^Save$', { });
        await sleep(1500);
        bt = await bodyText(page);
        // 130 should now appear in history / huge weight
        saved130 = /130/.test(bt) && dialogs.some(d => /kilograms|130/i.test(d));
        log('WEIGHT 130 dialogs:', JSON.stringify(dialogs));
        log('WEIGHT after 130 save, body has 130:', /130/.test(bt));
      }

      // R2-PT-NEW-02: same-day replace -> add 72kg today, should prompt "Entry exists" replace
      dialogs.length = 0;
      await clickByText(page, "Add today's weight");
      await sleep(600);
      const inputs2 = page.locator('input');
      let t2 = null;
      const ic2 = await inputs2.count();
      for (let i = 0; i < ic2; i++) {
        if (await inputs2.nth(i).isVisible().catch(() => false)) { t2 = inputs2.nth(i); break; }
      }
      if (t2) {
        await t2.fill('72');
        await sleep(200);
        await clickByText(page, '^Save$');
        await sleep(1500);
        bt = await bodyText(page);
        // Should have shown "Entry exists" replace dialog AND now show 72 (not 130)
        replaceWorked = dialogs.some(d => /Entry exists|exists/i.test(d)) && /72/.test(bt) && !/130/.test(bt.split('History')[1] || bt);
        log('WEIGHT replace dialogs:', JSON.stringify(dialogs), '| body72:', /72/.test(bt), '| body130:', /130/.test(bt));
      }

      // Validation: invalid weight (e.g., 10) should be rejected
      dialogs.length = 0;
      await clickByText(page, "Add today's weight");
      await sleep(500);
      const inputs3 = page.locator('input');
      let t3 = null;
      const ic3 = await inputs3.count();
      for (let i = 0; i < ic3; i++) {
        if (await inputs3.nth(i).isVisible().catch(() => false)) { t3 = inputs3.nth(i); break; }
      }
      if (t3) {
        await t3.fill('10');
        await sleep(200);
        await clickByText(page, '^Save$');
        await sleep(1000);
        validationWorks = dialogs.some(d => /valid weight|between 35/i.test(d));
        log('WEIGHT validation(10) dialogs:', JSON.stringify(dialogs));
      }
    }
    await page.screenshot({ path: `${OUT}/weight.png`, fullPage: true });

    // Persistence across reload: 72 should still be there
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(3500);
    const btReload = await bodyText(page);
    const persists = /72/.test(btReload);

    results.weight = { onWeight, saved130, replaceWorked, validationWorks, persists, errs: [...new Set(errs)] };
    await ctx.close();
  }

  // ================= KICK COUNTER =================
  {
    const ctx = await newCtx(browser, 'en');
    const page = await ctx.newPage();
    const errs = [];
    attachConsole(page, errs);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

    await gotoDeep(page, 'KickCounter');
    let bt = await bodyText(page);
    const onKick = /kick|Tap to count|Start a session/i.test(bt);
    // Start session
    await clickByText(page, 'Start a session');
    await sleep(1200);
    // Tap a few times
    for (let i = 0; i < 3; i++) { await clickByText(page, 'Tap to count'); await sleep(500); }
    bt = await bodyText(page);
    const counted = /\b3\b/.test(bt);
    await page.screenshot({ path: `${OUT}/kick_active.png`, fullPage: true });

    // R2-PT-NEW-03: Cancel works (confirm accepted -> session cancelled)
    dialogs.length = 0;
    await clickByText(page, '^Cancel$');
    await sleep(1200);
    bt = await bodyText(page);
    const cancelWorked = /Start a session|No session/i.test(bt) && !/Tap to count/i.test(bt);
    log('KICK cancel dialogs:', JSON.stringify(dialogs), '| backToEmpty:', cancelWorked);

    // Persistence: start + end a session, reload, check history
    await clickByText(page, 'Start a session'); await sleep(800);
    await clickByText(page, 'Tap to count'); await sleep(500);
    await clickByText(page, 'End session'); await sleep(1000);
    await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(3000);
    const btK = await bodyText(page);
    const kickPersist = /History|kicks/i.test(btK);

    results.kick = { onKick, counted, cancelWorked, kickPersist, errs: [...new Set(errs)] };
    await ctx.close();
  }

  // ================= CONTRACTION TIMER =================
  {
    const ctx = await newCtx(browser, 'en');
    const page = await ctx.newPage();
    const errs = [];
    attachConsole(page, errs);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

    await gotoDeep(page, 'ContractionTimer');
    let bt = await bodyText(page);
    const onContr = /Contraction|contraction/i.test(bt);
    // Record 2 contractions
    await clickByText(page, 'Contraction start'); await sleep(1500);
    await clickByText(page, 'Contraction end'); await sleep(800);
    await clickByText(page, 'Contraction start'); await sleep(1500);
    await clickByText(page, 'Contraction end'); await sleep(800);
    bt = await bodyText(page);
    const recorded = /History|Average|Count/i.test(bt);
    await page.screenshot({ path: `${OUT}/contraction.png`, fullPage: true });

    // R2-PT-NEW-03: Clear all works
    dialogs.length = 0;
    await clickByText(page, 'Clear all');
    await sleep(1200);
    bt = await bodyText(page);
    const clearWorked = /No contractions logged/i.test(bt) && dialogs.some(d => /Clear all contractions|cannot be undone/i.test(d));
    log('CONTR clear dialogs:', JSON.stringify(dialogs), '| empty:', /No contractions/i.test(bt));

    results.contraction = { onContr, recorded, clearWorked, errs: [...new Set(errs)] };
    await ctx.close();
  }

  // ================= BABY EVOLUTION + WEEK RECOMMENDATIONS =================
  {
    const ctx = await newCtx(browser, 'en');
    const page = await ctx.newPage();
    const errs = [];
    attachConsole(page, errs);
    page.on('dialog', async (d) => { await d.accept(); });

    await gotoDeep(page, 'BabyEvolution');
    let bt = await bodyText(page);
    const onBaby = bt.length > 50;
    await page.screenshot({ path: `${OUT}/baby_evolution.png`, fullPage: true });

    await gotoDeep(page, 'recommendations');
    let bt2 = await bodyText(page);
    const onRecs = bt2.length > 50;
    await page.screenshot({ path: `${OUT}/recommendations.png`, fullPage: true });

    results.babyEvo = { onBaby, babyLen: bt.length, onRecs, recsLen: bt2.length, errs: [...new Set(errs)] };
    await ctx.close();
  }

  // ================= STATISTICS (empty state — guest no checklist history) =================
  {
    const ctx = await newCtx(browser, 'en');
    const page = await ctx.newPage();
    const errs = [];
    attachConsole(page, errs);
    page.on('dialog', async (d) => { await d.accept(); });

    await gotoDeep(page, 'Statistics');
    let bt = await bodyText(page);
    const onStats = /Statistic|No data yet|Overall success|streak|day/i.test(bt);
    const emptyState = /No data yet|Use the app/i.test(bt);
    await page.screenshot({ path: `${OUT}/stats_empty.png`, fullPage: true });
    results.statsEmpty = { onStats, emptyState, statsBody: bt.slice(0, 300), errs: [...new Set(errs)] };
    await ctx.close();
  }

  // ================= STATISTICS (seeded: water + checklist history) =================
  {
    const ctx = await newCtx(browser, 'en');
    const page = await ctx.newPage();
    const errs = [];
    attachConsole(page, errs);
    page.on('dialog', async (d) => { await d.accept(); });

    await page.goto(BASE);
    // Seed: real water tracker (1500ml today) + 2 days of checklist incl herbal tea hydration with bogus 'current'
    await page.evaluate(() => {
      const today = new Date();
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const todayStr = fmt(today);
      const yest = new Date(today.getTime() - 864e5);
      const yestStr = fmt(yest);

      // Real water = 1.5 L today
      localStorage.setItem('hydration_data_v1', JSON.stringify({
        currentIntake: 1500, dailyGoal: 3000, lastUpdated: today.toISOString(),
        reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22,
      }));

      // Checklist history with a herbal-tea hydration item carrying current=9 (cups) -> must NOT feed water chart
      const mk = (done) => JSON.stringify([
        { id: 'reminder-rem_hyd_herbal_tea', completed: done, current: 9, skipped: false },
        { id: 'reminder-rem_vitamin_d', completed: done, skipped: false },
        { id: 'apt-x', completed: false, skipped: true },
      ]);
      localStorage.setItem('@daily_checklist_v2_' + yestStr, mk(true));
      localStorage.setItem('@daily_checklist_v2_' + todayStr, mk(true));
    });

    await gotoDeep(page, 'Statistics');
    await sleep(1500);
    let bt = await bodyText(page);
    const hasHydrationChart = /Hydration \(Liters\)/i.test(bt);
    const hasSuccessChart = /Overall success/i.test(bt);
    // The herbal-tea current=9 must NOT appear as "9L". Look for the SVG y-axis labels.
    // Grab all text including SVG
    const svgText = await page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('svg text')).map(t => t.textContent);
      return texts;
    });
    await page.screenshot({ path: `${OUT}/stats_seeded.png`, fullPage: true });
    results.statsSeeded = {
      hasHydrationChart, hasSuccessChart,
      svgLabels: svgText,
      bodyHas9L: /9\.?\d*\s*L|9L/.test(bt),
      bodySnippet: bt.slice(0, 400),
      errs: [...new Set(errs)],
    };
    await ctx.close();
  }

  // ================= STATISTICS single-point guard (1 day only) =================
  {
    const ctx = await newCtx(browser, 'en');
    const page = await ctx.newPage();
    const errs = [];
    attachConsole(page, errs);
    page.on('dialog', async (d) => { await d.accept(); });

    await page.goto(BASE);
    await page.evaluate(() => {
      // clear prior checklist keys
      Object.keys(localStorage).filter(k => k.startsWith('@daily_checklist_v2_')).forEach(k => localStorage.removeItem(k));
      const today = new Date();
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const todayStr = fmt(today);
      localStorage.setItem('hydration_data_v1', JSON.stringify({
        currentIntake: 1000, dailyGoal: 3000, lastUpdated: today.toISOString(),
        reminderEnabled: false, reminderFrequency: 8, reminderStartHour: 8, reminderEndHour: 22,
      }));
      // ONLY today -> 1 data point
      localStorage.setItem('@daily_checklist_v2_' + todayStr, JSON.stringify([
        { id: 'reminder-rem_vitamin_d', completed: true, skipped: false },
      ]));
    });

    await gotoDeep(page, 'Statistics');
    await sleep(1500);
    let bt = await bodyText(page);
    const guardShown = /Log at least 2 days/i.test(bt);
    await page.screenshot({ path: `${OUT}/stats_singlepoint.png`, fullPage: true });
    results.statsSingle = { guardShown, bodySnippet: bt.slice(0, 400), errs: [...new Set(errs)] };
    await ctx.close();
  }

  // ================= AR / RTL on Statistics + Weight =================
  {
    const ctx = await newCtx(browser, 'ar');
    const page = await ctx.newPage();
    const errs = [];
    attachConsole(page, errs);
    page.on('dialog', async (d) => { await d.accept(); });

    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.setItem('app_locale', 'ar');
      const today = new Date();
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      localStorage.setItem('@daily_checklist_v2_' + fmt(today), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: true, skipped: false }]));
      localStorage.setItem('@daily_checklist_v2_' + fmt(new Date(today.getTime()-864e5)), JSON.stringify([{ id: 'reminder-rem_vitamin_d', completed: false, skipped: false }]));
    });
    await gotoDeep(page, 'Statistics');
    await sleep(1500);
    const dir = await page.evaluate(() => document.documentElement.dir || getComputedStyle(document.body).direction);
    let bt = await bodyText(page);
    const hasArabic = /[؀-ۿ]/.test(bt);
    await page.screenshot({ path: `${OUT}/stats_ar.png`, fullPage: true });

    await gotoDeep(page, 'weight');
    await sleep(1000);
    const btW = await bodyText(page);
    const weightArabic = /[؀-ۿ]/.test(btW);
    await page.screenshot({ path: `${OUT}/weight_ar.png`, fullPage: true });

    results.rtl = { dir, hasArabic, weightArabic, errs: [...new Set(errs)] };
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  log('\n================ RESULTS ================');
  log(JSON.stringify(results, null, 2));
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
