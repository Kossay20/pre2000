import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:8081';
const OUT = '/tmp/r7audit/shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BENIGN = /Missing or insufficient permissions|insufficient permissions|wasm|MIME|AsyncStorage has been extracted|Setting a timer|tintColor|Download the React DevTools|ArrayBuffer instantiation|magic word|DatabaseService|workerMessageHandler|Sentry|sourcemap|favicon|net::ERR|status of 4|Failed to load resource|preloaded|was preloaded|chunk/;

// FRESH context — no storageState, so user=null => AuthStack mounts
const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());

const ROUTES = [['welcome','welcome'],['auth','auth'],['login','login'],['register','register'],['onboarding','onboarding'],['privacy','privacy']];
const report = {};
for (const [name, path] of ROUTES) {
  const logs = [];
  const oc = m => { if (m.type()==='error'||m.type()==='warning') logs.push(`[${m.type()}] ${m.text()}`); };
  const oe = e => logs.push(`[PAGEERROR] ${(e.stack||e.message||'').slice(0,400)}`);
  page.on('console', oc); page.on('pageerror', oe);
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const body = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  const url = page.url(); const title = await page.title();
  const h1 = await page.evaluate(()=>Array.from(document.querySelectorAll('h1')).map(e=>e.innerText).join(' | '));
  // count inputs/buttons for form screens
  const inputs = await page.evaluate(()=>document.querySelectorAll('input').length);
  const buttons = await page.evaluate(()=>document.querySelectorAll('[role="button"],button').length);
  await page.screenshot({ path: `${OUT}/fresh_${name}.png` });
  const real = logs.filter(l => !BENIGN.test(l));
  report[name] = { url, title, h1, inputs, buttons, bodyLen: body.length, body: body.slice(0,260), errors: real };
  page.off('console', oc); page.off('pageerror', oe);
}
for (const [k,v] of Object.entries(report)) {
  console.log(`\n### FRESH ${k} -> ${v.url}`);
  console.log(`  title="${v.title}" h1="${v.h1}" inputs=${v.inputs} buttons=${v.buttons} bodyLen=${v.bodyLen}`);
  console.log(`  body: ${v.body}`);
  if (v.errors.length) v.errors.slice(0,6).forEach(e=>console.log('  ERR:', e.slice(0,260)));
}
await browser.close();
console.log('\nDONE fresh auth');
