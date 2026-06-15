import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
async function once(neutralize){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  if(neutralize){
    // Replace the SQLite worker with a stub that immediately posts an error back
    // so openDatabaseAsync rejects cleanly (caught by App's .catch) without WASM abort.
    await c.route('**/worker-*.js',route=>route.fulfill({status:200,contentType:'application/javascript',
      body:`self.onmessage=function(e){ try{ self.postMessage({type:'error',error:'neutralized'}); }catch(_){} };`}));
  }
  const c0=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(/Uncaught error|Database initialized|Failed to initialize/i.test(m.text())) c0.push(m.text().slice(0,70)); });
  await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(6500);
  const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  await c.close();
  return {oops:/Oops|small error/i.test(body), snip:body.slice(0,70), logs:[...new Set(c0)]};
}
console.log('--- root / WITHOUT neutralize ---');
for(let i=0;i<3;i++){ const r=await once(false); console.log(`  oops=${r.oops} | ${r.snip}`); }
console.log('--- root / WITH worker neutralized ---');
for(let i=0;i<3;i++){ const r=await once(true); console.log(`  oops=${r.oops} | ${r.snip} | logs=${JSON.stringify(r.logs)}`); }
await b.close();
