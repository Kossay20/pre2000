import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
// log EVERY request (incl worker) for wasm/worker
const reqs=[];
await c.route('**/*',route=>{ const u=route.request().url(); if(/\.wasm|worker|sqlite/i.test(u)) reqs.push(`${route.request().resourceType()} ${u}`); route.continue(); });
const p=await c.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(6000);
console.log('=== wasm/worker/sqlite requests (context-level) ===');
[...new Set(reqs)].forEach(r=>console.log(r));
await b.close();
