// Audit2 capture harness — emits the artifact quartet (PNG + DOM + console + network)
// per route, per language, per auth-mode. Mobile viewport. RN-Web + Expo static export.
//
// Usage:  LANG=fr MODE=guest ROUND=1 node e2e/audit2/capture.mjs
//         LANG=ar MODE=fresh ROUND=1 node e2e/audit2/capture.mjs
//
// MODE=guest → localStorage seeded with a guest profile (lands in MainTabs).
// MODE=fresh → no profile (lands in AuthStack) — for auth/onboarding screens.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8081';
const LANG = process.env.LANG_CODE || process.env.LANG || 'fr';
const MODE = process.env.MODE || 'guest';
const ROUND = process.env.ROUND || '1';
const ROOT = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/audit2';
const OUT = join(ROOT, `round-${ROUND}`, MODE, LANG);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mirror e2e/global-setup.ts guest fixture (week 13, France, guest).
const GUEST_PROFILE = {
  uid: 'guest_e2e_fixture', firstName: 'E2E', lastName: 'Tester',
  pregnancyStartDate: '2026-02-13T00:00:00.000Z', lmp: '2026-02-13T00:00:00.000Z',
  currentWeek: 13, country: 'France', ageRange: '25-29', isFirstPregnancy: true, isGuest: true,
};

// Route manifest. `wait` = settle ms (Firestore screens need longer to fail+fallback).
const GUEST_ROUTES = [
  { name: '01-home',             path: '/HomeMain',                    wait: 6500 },
  { name: '02-recommendations',  path: '/recommendations',            wait: 5000 },
  { name: '03-resources-articles', path: '/resources',                wait: 6500, resources: true },
  { name: '04-article-detail',   path: `/article/${encodeURIComponent('a01_symptômes_de_grossesse')}`, wait: 6000 },
  { name: '05-supplement-detail', path: '/supplement/s01_acide_folique', wait: 6000 },
  { name: '06-calendar',         path: '/calendar',                   wait: 4500 },
  { name: '07-add-appointment',  path: '/appointment/add',            wait: 4500 },
  { name: '08-reminders',        path: '/reminders',                  wait: 4500 },
  { name: '09-statistics',       path: '/statistics',                 wait: 5000 },
  { name: '10-health-dashboard', path: '/health',                     wait: 5000 },
  { name: '11-weight-tracker',   path: '/weight',                     wait: 4500 },
  { name: '12-kick-counter',     path: '/kick-counter',               wait: 4000 },
  { name: '13-contraction-timer', path: '/contraction-timer',         wait: 4000 },
  { name: '14-hospital-bag',     path: '/hospital-bag',               wait: 4500 },
  { name: '15-forbidden-foods',  path: '/forbidden-foods',            wait: 5000 },
  { name: '16-ramadan',          path: '/ramadan',                    wait: 4500 },
  { name: '17-baby-evolution',   path: '/baby-evolution',             wait: 5000 },
  { name: '18-profile',          path: '/profile',                    wait: 4500 },
  { name: '19-settings',         path: '/settings',                   wait: 4000 },
  { name: '20-diagnostic',       path: '/diagnostic',                 wait: 4500 },
  { name: '21-language-select',  path: '/language',                   wait: 4000 },
  { name: '22-chatbot',          path: '/HomeMain',                   wait: 5000, chatbot: true },
];

const FRESH_ROUTES = [
  { name: '01-welcome',    path: '/welcome',    wait: 4000 },
  { name: '02-authchoice', path: '/auth',       wait: 4000 },
  { name: '03-register',   path: '/register',   wait: 4000 },
  { name: '04-login',      path: '/login',      wait: 4000 },
  { name: '05-onboarding', path: '/onboarding', wait: 4500 },
  { name: '06-privacy',    path: '/privacy',    wait: 4000 },
];

const ROUTES = MODE === 'fresh' ? FRESH_ROUTES : GUEST_ROUTES;

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: LANG === 'en' ? 'en-US' : LANG === 'ar' ? 'ar' : 'fr-FR',
});

// Seed localStorage BEFORE any app script runs.
await context.addInitScript(({ lang, profile, mode }) => {
  try {
    localStorage.setItem('app_locale', lang);
    if (mode === 'guest') localStorage.setItem('user_profile', JSON.stringify(profile));
  } catch (e) { /* ignore */ }
}, { lang: LANG, profile: GUEST_PROFILE, mode: MODE });

const results = [];

for (const route of ROUTES) {
  const page = await context.newPage();
  const consoleLogs = [];
  const networkIssues = [];
  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text().slice(0, 500) });
  });
  page.on('pageerror', (err) => {
    consoleLogs.push({ type: 'pageerror', text: String(err && err.message || err).slice(0, 500), stack: String(err && err.stack || '').slice(0, 800) });
  });
  page.on('response', (resp) => {
    const status = resp.status();
    if (status >= 400) networkIssues.push({ url: resp.url().slice(0, 200), status, method: resp.request().method() });
  });

  let navError = null;
  try {
    await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(route.wait);

    if (route.chatbot) {
      // Chatbot has no deep route — click the last bottom tab.
      try {
        const tabs = page.locator('[role="tab"]');
        const n = await tabs.count();
        if (n > 0) { await tabs.nth(n - 1).click({ timeout: 5000 }); await sleep(route.wait); }
      } catch (e) { navError = `chatbot-tab: ${String(e).slice(0,120)}`; }
    }
  } catch (e) {
    navError = String(e && e.message || e).slice(0, 240);
  }

  await capture(page, route.name, consoleLogs, networkIssues, navError, results);

  // Resources: also capture the Suppléments (Compléments) material-top-tab.
  if (route.resources) {
    try {
      const suppTab = page.getByText(/Compléments|Supplements|مكملات|مكمّلات/i).first();
      await suppTab.click({ timeout: 5000 });
      await sleep(6000);
      const cl3 = [], ni3 = [];
      page.on('console', (m) => cl3.push({ type: m.type(), text: m.text().slice(0, 500) }));
      await capture(page, '03b-resources-supplements', cl3, ni3, null, results);
    } catch (e) { /* skip */ }
  }

  await page.close();
}

await browser.close();
writeFileSync(join(OUT, '_manifest.json'), JSON.stringify({ lang: LANG, mode: MODE, round: ROUND, base: BASE, results }, null, 2));
console.log(`[capture] ${MODE}/${LANG} done — ${results.length} states → ${OUT}`);

async function capture(page, name, consoleLogs, networkIssues, navError, results) {
  const pngPath = join(OUT, `${name}.png`);
  const domPath = join(OUT, `${name}.dom.html`);
  const conPath = join(OUT, `${name}.console.json`);
  const netPath = join(OUT, `${name}.network.json`);
  let dom = '';
  try { dom = await page.content(); } catch (e) { dom = `<!-- content() failed: ${e} -->`; }
  try {
    await page.screenshot({ path: pngPath, fullPage: false });
  } catch (e) {
    try { await page.screenshot({ path: pngPath }); } catch (_) {}
  }
  // Extract visible text + dir + title for quick adversarial triage.
  let meta = {};
  try {
    meta = await page.evaluate(() => ({
      title: document.title,
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      bodyTextSample: (document.body.innerText || '').slice(0, 4000),
    }));
  } catch (e) { meta = { error: String(e) }; }
  writeFileSync(domPath, dom);
  writeFileSync(conPath, JSON.stringify({ navError, console: consoleLogs }, null, 2));
  writeFileSync(netPath, JSON.stringify({ networkIssues }, null, 2));
  writeFileSync(join(OUT, `${name}.meta.json`), JSON.stringify(meta, null, 2));
  results.push({ name, navError, consoleCount: consoleLogs.length, netIssues: networkIssues.length, title: meta.title, dir: meta.dir });
}
