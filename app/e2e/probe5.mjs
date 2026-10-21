import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const route=process.argv[2]||'KickCounter';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
// capture global error events from the page itself
await p.addInitScript(()=>{
  window.__caught=[];
  window.addEventListener('error', e=>{ try{ window.__caught.push('ONERROR: '+(e.error?.stack||e.message||e.type)); }catch(_){} });
  window.addEventListener('unhandledrejection', e=>{ try{ window.__caught.push('UNHANDLED: '+(e.reason?.stack||e.reason?.message||String(e.reason))); }catch(_){} });
});
await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'});
await sleep(6000);
const dom = await p.evaluate(()=>{
  const hasRetryTid = !!document.querySelector('[data-testid="error_boundary_retry"]') || !!document.querySelector('[testID="error_boundary_retry"]');
  // search for testID attr in any form
  const allTids = Array.from(document.querySelectorAll('*')).map(e=>e.getAttribute&&(e.getAttribute('data-testid')||e.getAttribute('testID'))).filter(Boolean);
  return { hasRetryTid, tids:[...new Set(allTids)].slice(0,40), bodyLen: document.body.innerText.length };
});
const caught = await p.evaluate(()=>window.__caught||[]);
console.log('=== ROUTE',route,'===');
console.log('DOM testIDs:', JSON.stringify(dom.tids));
console.log('hasRetryTid:', dom.hasRetryTid);
console.log('--- window error/rejection events (deduped, first 120 chars) ---');
const seen=new Set();
caught.forEach(l=>{ const k=l.slice(0,140); if(!seen.has(k)){ seen.add(k); console.log(l.slice(0,600)); }});
await b.close();
