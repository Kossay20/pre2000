import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r4_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const IGNORE=[/DevTools/i,/AsyncStorage has been extracted/i,/Setting a timer/i,/tintColor/i,/Missing or insufficient permissions/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/source ?map/i,/sourcemap/i,/Download the React DevTools/i,/\[expo-/i,/Possible Unhandled Promise/i,/was preloaded using link preload/i,/Failed to load resource.*firestore/i,/net::ERR_.*firestore/i,/firestore\.googleapis/i,/googleapis\.com/i,/WebChannelConnection/i,/transport errored/i,/installations/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));

const out={};
const b=await chromium.launch();

async function newP(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const errs=[];
  const pageerrs=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){ const t=m.text(); if(keep(t)) errs.push(t.slice(0,300)); }});
  p.on('pageerror',e=>{ const t=String(e&&e.message||e); if(keep(t)) pageerrs.push(t.slice(0,300)); });
  p.on('dialog',d=>{ /* default: accept after capture */ });
  if(locale){
    await p.goto(BASE);
    await p.evaluate(l=>localStorage.setItem('app_locale',l),locale);
  }
  return {c,p,errs,pageerrs};
}

async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function oops(txt){ return /Oops!|Oups|عذر|A small error|Une petite erreur|Back to home|Retour à l'accueil/.test(txt); }
function hasBackToHome(txt){ return /Back to home|Retour à l'accueil|العودة إلى الص/.test(txt); }

// seed runtime localStorage for stats
async function seedStats(p, days){
  await p.evaluate((d)=>{
    const today=new Date(); const fmt=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
    localStorage.setItem('hydration_data_v1',JSON.stringify({currentIntake:1500,dailyGoal:3000,lastUpdated:today.toISOString(),reminderEnabled:false}));
    const mkc=done=>JSON.stringify([{id:'reminder-rem_hyd_herbal_tea',completed:done,current:9,skipped:false},{id:'reminder-rem_vitamin_d',completed:done,skipped:false}]);
    for(let i=0;i<d;i++){ const day=fmt(new Date(today.getTime()-i*864e5)); localStorage.setItem('@daily_checklist_v2_'+day,mkc(true)); }
  }, days);
}
async function clearStatsSeed(p){
  await p.evaluate(()=>{ Object.keys(localStorage).filter(k=>k.startsWith('@daily_checklist_v2_')||k==='hydration_data_v1').forEach(k=>localStorage.removeItem(k)); });
}

// ---------- 1) PREGNANCY TOOLS ----------
{
  const {c,p,errs,pageerrs}=await newP();
  const r={};
  // Baby Evolution
  await p.goto(`${BASE}/baby-evolution`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  let t=await body(p); r.babyEvo={oops:oops(t),backToHome:hasBackToHome(t),len:t.length,snip:t.slice(0,160)};
  await p.screenshot({path:`${OUT}/babyevo.png`});
  // Forbidden foods
  await p.goto(`${BASE}/forbidden-foods`,{waitUntil:'domcontentloaded'}); await sleep(3500);
  t=await body(p); r.forbidden={oops:oops(t),backToHome:hasBackToHome(t),len:t.length,snip:t.slice(0,160)};
  await p.screenshot({path:`${OUT}/forbidden.png`});
  // Recommendations
  await p.goto(`${BASE}/recommendations`,{waitUntil:'domcontentloaded'}); await sleep(3500);
  t=await body(p); r.recs={oops:oops(t),backToHome:hasBackToHome(t),len:t.length,snip:t.slice(0,160)};
  await p.screenshot({path:`${OUT}/recs.png`});
  // Diagnostic
  await p.goto(`${BASE}/diagnostic`,{waitUntil:'domcontentloaded'}); await sleep(3500);
  t=await body(p); r.diagnostic={oops:oops(t),backToHome:hasBackToHome(t),len:t.length,snip:t.slice(0,160)};
  await p.screenshot({path:`${OUT}/diagnostic.png`});
  // Ramadan
  await p.goto(`${BASE}/ramadan`,{waitUntil:'domcontentloaded'}); await sleep(3500);
  t=await body(p); r.ramadan={oops:oops(t),backToHome:hasBackToHome(t),len:t.length,snip:t.slice(0,160)};
  await p.screenshot({path:`${OUT}/ramadan.png`});
  // Hospital bag
  await p.goto(`${BASE}/hospital-bag`,{waitUntil:'domcontentloaded'}); await sleep(3000);
  t=await body(p); r.hospitalBag={oops:oops(t),backToHome:hasBackToHome(t),len:t.length,snip:t.slice(0,160)};
  r.errs=errs.slice(); r.pageerrs=pageerrs.slice();
  out.tools=r;
  await c.close();
}

// ---------- 2) WEIGHT TRACKER (save + replace) ----------
{
  const {c,p,errs,pageerrs}=await newP();
  const r={dialogs:[]};
  p.removeAllListeners('dialog');
  p.on('dialog',async d=>{ r.dialogs.push(d.message().replace(/\s+/g,' ').slice(0,160)); await d.accept(); });
  await p.goto(`${BASE}/weight`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  let t=await body(p); r.onWeight=!oops(t)&&/weight|poids|kg|وزن/i.test(t); r.snip0=t.slice(0,140);
  await p.screenshot({path:`${OUT}/weight.png`});
  // type a weight and save
  const inp=p.locator('input[type="text"], input[inputmode="decimal"], input[inputmode="numeric"], input').first();
  try{
    await inp.fill('72', {timeout:4000});
    // find a save/add button
    const btns=['Save','Add','Enregistrer','Ajouter','حفظ','إضافة'];
    let clicked=false;
    for(const lbl of btns){ const el=p.getByText(new RegExp('^'+lbl+'$','i')).first(); if(await el.count()){ try{ await el.click({timeout:2500}); clicked=true; break;}catch(e){} } }
    if(!clicked){ // try role button containing
      for(const lbl of btns){ const el=p.getByRole('button',{name:new RegExp(lbl,'i')}).first(); if(await el.count()){ try{ await el.click({timeout:2500}); clicked=true; break;}catch(e){} } }
    }
    r.saveClicked=clicked;
    await sleep(2500);
    // replace same value
    await inp.fill('72',{timeout:3000});
    for(const lbl of btns){ const el=p.getByText(new RegExp('^'+lbl+'$','i')).first(); if(await el.count()){ try{ await el.click({timeout:2500}); break;}catch(e){} } }
    await sleep(2500);
  }catch(e){ r.fillErr=String(e).slice(0,120); }
  t=await body(p); r.afterSave=t.slice(0,200); r.oopsAfter=oops(t);
  await p.screenshot({path:`${OUT}/weight_after.png`});
  // persistence: reload
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(3500);
  t=await body(p); r.persistText=t.slice(0,200); r.oopsReload=oops(t);
  r.errs=errs.slice(); r.pageerrs=pageerrs.slice();
  out.weight=r;
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
