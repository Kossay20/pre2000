import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:8081';
const STATE = '/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT = '/tmp/r7audit/shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOCALE = process.argv[2] || 'en';

// Routes I own. name -> path
const ROUTES = [
  ['welcome', 'welcome'],
  ['auth', 'auth'],
  ['login', 'login'],
  ['register', 'register'],
  ['onboarding', 'onboarding'],
  ['privacy', 'privacy'],
  ['profile', 'profile'],
  ['settings', 'settings'],
  ['ramadan', 'ramadan'],
  ['hospitalbag', 'hospital-bag'],
  ['resources', 'resources'],
  ['unknown_route', 'totally-unknown-xyz'],
  ['capital_Profile', 'Profile'],
];

const BENIGN = /Missing or insufficient permissions|insufficient permissions|wasm|MIME|AsyncStorage has been extracted|Setting a timer|tintColor|Download the React DevTools|ArrayBuffer instantiation|magic word|DatabaseService|workerMessageHandler|FFFFFF|Sentry|sourcemap|favicon|net::ERR|the server responded with a status of 4|Failed to load resource|preloaded using link preload|was preloaded|chunk|expo-router/;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: STATE, baseURL: BASE, viewport: { width: 390, height: 844 }
});
const page = await ctx.newPage();
page.on('dialog', d => d.accept());

// set locale
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate((loc) => { localStorage.setItem('app_locale', loc); }, LOCALE);

const report = {};
for (const [name, path] of ROUTES) {
  const logs = [];
  const onConsole = m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); };
  const onErr = e => logs.push(`[PAGEERROR] ${(e.stack || e.message || '').slice(0,500)}`);
  page.on('console', onConsole);
  page.on('pageerror', onErr);
  try {
    await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
    await sleep(4500);
    const body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();
    const title = await page.title();
    const url = page.url();
    const h1 = await page.evaluate(() => Array.from(document.querySelectorAll('h1')).map(e=>e.innerText).join(' | '));
    await page.screenshot({ path: `${OUT}/${LOCALE}_${name}.png`, fullPage: false });
    const real = logs.filter(l => !BENIGN.test(l));
    report[name] = { url, title, bodyLen: body.length, bodyHead: body.slice(0, 260), h1, errors: real };
  } catch (e) {
    report[name] = { error: String(e).slice(0, 300) };
  }
  page.off('console', onConsole);
  page.off('pageerror', onErr);
}
fs.writeFileSync(`/tmp/r7audit/report_${LOCALE}.json`, JSON.stringify(report, null, 2));
for (const [k, v] of Object.entries(report)) {
  console.log(`\n### ${k}  -> ${v.url || ''}`);
  if (v.error) { console.log('  NAV ERROR:', v.error); continue; }
  console.log(`  title="${v.title}" h1="${v.h1}" bodyLen=${v.bodyLen}`);
  console.log(`  body: ${v.bodyHead}`);
  if (v.errors && v.errors.length) v.errors.slice(0,8).forEach(e => console.log('  ERR:', e.slice(0,300)));
}
await browser.close();
console.log('\nDONE', LOCALE);
