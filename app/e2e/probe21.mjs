import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
const all=[];
p.on('console',m=>all.push(`[${m.type()}] ${m.args ? '' : ''}${m.text()}`));
p.on('pageerror',e=>all.push(`[PAGEERROR] ${e.stack||e.message}`));
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(7000);
console.log('=== RAW ALL console (root /, NO interception) ===');
all.forEach((l,i)=>console.log(`${i}: ${l.slice(0,300)}`));
// what is in the DOM root?
const html = await p.evaluate(()=>document.getElementById('root')?.innerText?.slice(0,120) || document.body.innerText.slice(0,120));
console.log('=== root text:', html);
await b.close();
