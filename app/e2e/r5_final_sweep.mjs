import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const BENIGN=/wasm|WebAssembly|CompileError|ArrayBuffer|DatabaseService|DB Init|Aborted\(|firestore|googleapis|insufficient permissions|DevTools|AsyncStorage has been|Setting a timer|tintColor|preloaded|status of 4|installations|identitytoolkit|securetoken/i;
async function newP(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const cons=[],perr=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){ const x=m.text(); if(!BENIGN.test(x)) cons.push(x.slice(0,300)); }});
  p.on('pageerror',e=>{ const x=String(e&&e.stack||e&&e.message||e); if(!BENIGN.test(x)) perr.push(x.slice(0,400)); });
  p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
  if(locale){ await p.goto(BASE); await p.evaluate(l=>localStorage.setItem('app_locale',l),locale); }
  return {c,p,cons,perr};
}
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function eb(t){ return /🙈/.test(t); } // GLOBAL error boundary marker (not the documented 😔 in-screen)
const out={};

// BabyEvolution week nav + AR
for(const loc of ['en','ar']){
  const {c,p,cons,perr}=await newP(loc);
  const r={};
  await p.goto(`${BASE}/baby-evolution`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p); r.loaded=!eb(t); r.snip=t.slice(0,140);
  // try tap a month to expand (BabyEvolution lists months)
  const monthTap=p.getByText(/Month 6|Month 7|الشهر 6|الشهر 7/i).first();
  if(await monthTap.count()){ await monthTap.click({timeout:2500}).catch(()=>{}); await sleep(1200); }
  t=await body(p); r.afterTap=t.slice(0,140);
  r.globalEB=eb(t); r.cons=cons.slice(); r.perr=perr.slice();
  await p.screenshot({path:`${OUT}/babyevo_${loc}.png`});
  out['babyEvo_'+loc]=r;
  await c.close();
}

// Tools in AR/RTL: weight, kick, contraction quick render check
for(const route of ['weight','kick-counter','contraction-timer','statistics']){
  const {c,p,cons,perr}=await newP('ar');
  const r={};
  await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p);
  r.dir=await p.evaluate(()=>document.documentElement.dir||getComputedStyle(document.body).direction);
  r.globalEB=eb(t); r.snip=t.slice(0,120); r.cons=cons.slice(); r.perr=perr.slice();
  await p.screenshot({path:`${OUT}/ar_${route}.png`});
  out['ar_'+route]=r;
  await c.close();
}

// WeekRecommendations classification: confirm it's a graceful empty (no global EB), with the documented "week data not found"
{
  const {c,p,cons,perr}=await newP('en');
  const r={};
  await p.goto(`${BASE}/recommendations`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p);
  r.snip=t.slice(0,160); r.globalEB=eb(t); r.weekDataNotFound=/Week data not found|données.*introuv|not found/i.test(t);
  r.hasBackToHome=/Back to home|Retour à l'accueil/i.test(t);
  r.cons=cons.slice(); r.perr=perr.slice();
  out.recommendations=r;
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
