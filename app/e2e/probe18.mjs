import { chromium } from 'playwright';
const BASE='http://localhost:8099';  // server WITH correct wasm MIME
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
async function once(route){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  const dbErr=[];
  p.on('console',m=>{ if(/Database initialized successfully|Failed to initialize database/i.test(m.text())) dbErr.push(m.text().slice(0,80)); });
  await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'}); await sleep(6500);
  const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  const oops=/Oops|small error/i.test(body);
  await c.close();
  return {oops, snip:body.slice(0,70), db:[...new Set(dbErr)]};
}
for(const route of ['','','','KickCounter','kick-counter']){
  const r=await once(route);
  console.log(`/${route.padEnd(14)} oops=${r.oops} | db=${JSON.stringify(r.db)} | ${r.snip}`);
}
await b.close();
