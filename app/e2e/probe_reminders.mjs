import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r4_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IGNORE=[/DevTools/i,/AsyncStorage/i,/Setting a timer/i,/tintColor/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/magic word/i,/wasm/i,/DatabaseService/i,/DB Init/i,/ArrayBuffer/i,/source ?map/i,/React DevTools/i,/status of 403/i,/status of 404/i,/firestore/i,/googleapis/i,/WebChannelConnection/i,/installations/i,/Aborted\(/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
const errs=[];
p.on('console',m=>{if(m.type()==='error'){const t=m.text(); if(keep(t)) errs.push('CON:'+t.slice(0,220));}});
p.on('pageerror',e=>errs.push('PAGEERR:'+String(e&&e.message||e).slice(0,260)));

// Run #1: fresh nav to /reminders
await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(5000);
let t=await body(p);
console.log('FRESH /reminders oops?', /Oops|Back to home|عذر/.test(t));
console.log('  snip:', t.slice(0,120));

// Run #2: reload several times to check determinism
for(let i=0;i<3;i++){
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(5000);
  t=await body(p);
  const isOops=/Oops|Back to home|عذر/.test(t);
  const hasBackHome=/Back to home|Retour à l'accueil/.test(t);
  console.log(`RELOAD#${i+1} oops?`, isOops, 'hasBackToHome?', hasBackHome);
  console.log('   snip:', t.slice(0,140));
  await p.screenshot({path:`${OUT}/reminders_reload${i+1}.png`});
}
console.log('ERRS:', JSON.stringify(errs.slice(0,15),null,1));

// Now check: does the global ErrorBoundary (Back to home) fire, or in-screen ErrorState (Retry only)?
const dom=await p.evaluate(()=>{
  const txt=document.body.innerText||'';
  return {
    hasRetry:/Retry|Réessayer|إعادة/.test(txt),
    hasBackHome:/Back to home|Retour à l'accueil/.test(txt),
    full:txt.replace(/\s+/g,' ').slice(0,300)
  };
});
console.log('DOM analysis:', JSON.stringify(dom,null,1));
await b.close();
