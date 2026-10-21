import { chromium } from 'playwright';
const BASE='http://localhost:8099'; // correct wasm MIME
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state8099.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
const dbLogs=[];
p.on('console',m=>{ if(/Database initialized successfully|Failed to initialize database/i.test(m.text())) dbLogs.push(m.text().slice(0,70)); });
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(7000);
let body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('8099 root / : oops=',/Oops/i.test(body),'| dbLogs=',JSON.stringify([...new Set(dbLogs)]));
console.log('   snip=',body.slice(0,110));
// also check a known-good screen path on 8099 to confirm app boots authed
await p.goto(`${BASE}/weight`,{waitUntil:'domcontentloaded'}); await sleep(5000);
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('8099 /weight : oops=',/Oops/i.test(body),'| snip=',body.slice(0,70));
await b.close();
