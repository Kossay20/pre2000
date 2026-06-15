import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
const all=[];
p.on('console',m=>all.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror',e=>all.push(`[PAGEERROR] ${e.stack||e.message}`));
await p.goto(`${BASE}/calendar`,{waitUntil:'domcontentloaded'}); await sleep(5000);
all.length=0; // clear boot noise
const homes=p.getByText(/^Home$/i); const n=await homes.count();
if(n>0){ await homes.nth(n-1).click().catch(()=>{}); await sleep(4500); }
console.log('=== console AFTER clicking Home tab (HomeScreen crash) ===');
const seen=new Set();
all.filter(l=>!/insufficient permissions|FirebaseError|babyMessageService|tipsService|wasm|WebAssembly|sqlite|DatabaseService|Aborted|prepare wasm|ArrayBuffer|Incorrect response MIME/i.test(l))
   .filter(l=>/error|Error|PAGEERROR|warn|Uncaught/i.test(l))
   .forEach(l=>{const k=l.slice(0,120); if(!seen.has(k)){seen.add(k); console.log(l.slice(0,900));}});
await b.close();
