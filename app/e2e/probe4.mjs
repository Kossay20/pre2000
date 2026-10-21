import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const route=process.argv[2]||'KickCounter';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
const all=[];
p.on('console',m=>{ all.push({t:m.type(),x:m.text()}); });
p.on('pageerror',e=>all.push({t:'pageerror',x:e.stack||e.message}));
await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'});
await sleep(6000);
// look for the ErrorBoundary's "Uncaught error" log + anything with a stack referencing screen
console.log('=== ROUTE',route,'===');
const ub = all.filter(l=>/Uncaught error|ErrorBoundary|getDerivedStateFromError/i.test(l.x));
console.log('--- ErrorBoundary logs:',ub.length);
ub.forEach(l=>console.log(`[${l.t}]`, l.x.slice(0,900)));
// also dump ALL error-type logs raw (to see the actual error object text)
console.log('--- ALL error/warn lines (raw, deduped) ---');
const seen=new Set();
all.filter(l=>l.t==='error'||l.t==='pageerror'||l.t==='warning').forEach(l=>{ const k=l.x.slice(0,120); if(!seen.has(k)){seen.add(k); console.log(`[${l.t}]`, l.x.slice(0,500));}});
await b.close();
