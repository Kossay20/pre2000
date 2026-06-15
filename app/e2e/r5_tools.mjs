import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const IGNORE=[/DevTools/i,/AsyncStorage has been extracted/i,/Setting a timer/i,/tintColor/i,/Missing or insufficient permissions/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/source ?map/i,/sourcemap/i,/Download the React DevTools/i,/\[expo-/i,/Possible Unhandled Promise/i,/was preloaded using link preload/i,/Failed to load resource.*firestore/i,/net::ERR_.*firestore/i,/firestore\.googleapis/i,/googleapis\.com/i,/WebChannelConnection/i,/transport errored/i,/installations/i,/preloaded using link preload/i,/identitytoolkit/i,/securetoken/i,/the server responded with a status of 4/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));

const b=await chromium.launch();
async function newP(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const errs=[]; const pageerrs=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){ const t=m.text(); if(keep(t)) errs.push(t.slice(0,300)); }});
  p.on('pageerror',e=>{ const t=String(e&&e.message||e); if(keep(t)) pageerrs.push(t.slice(0,300)); });
  p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
  if(locale){ await p.goto(BASE); await p.evaluate(l=>localStorage.setItem('app_locale',l),locale); }
  return {c,p,errs,pageerrs};
}
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function oops(txt){ return /Oops!|Oups|عذر|A small error|Une petite erreur/.test(txt); }
function hasBackToHome(txt){ return /Back to home|Retour à l'accueil|العودة إلى الص/.test(txt); }
function errState(txt){ return /Retry|Réessayer|إعادة المحاولة|Try again/.test(txt) && !hasBackToHome(txt); }
async function clickText(p,labels,timeout=2200){ for(const lbl of labels){ const el=p.getByText(new RegExp('^\\s*'+lbl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*$','i')).first(); if(await el.count()){ try{ await el.click({timeout}); return lbl;}catch(e){} } } for(const lbl of labels){ const el=p.getByRole('button',{name:new RegExp(lbl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')}).first(); if(await el.count()){ try{ await el.click({timeout}); return lbl;}catch(e){} } } return null; }

const out={};

// ---------- WEIGHT TRACKER full lifecycle (setup gate -> add -> replace -> persist) ----------
{
  const {c,p,errs,pageerrs}=await newP();
  const r={};
  await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(500);
  await p.evaluate(()=>{ Object.keys(localStorage).filter(k=>/weight/i.test(k)).forEach(k=>localStorage.removeItem(k)); });
  await p.goto(`${BASE}/weight`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p);
  r.loaded=!oops(t); r.errState=errState(t); r.snip0=t.slice(0,200);
  const inputs0=p.locator('input'); r.inputCount0=await inputs0.count();
  r.setupShown=/configur|setup|pré-grossesse|pre-pregnancy|taille|height|قبل الحمل|الطول/i.test(t);
  await p.screenshot({path:`${OUT}/wt_0.png`});
  // STEP 1: setup (pre-preg weight + height). Two inputs visible.
  try{
    const inA=inputs0.nth(0), inB=inputs0.nth(1);
    if(await inputs0.count()>=2){
      await inA.fill('65'); await inB.fill('165');
      const lbl=await clickText(p,['Save','Enregistrer','حفظ','✓ Save','✓ Enregistrer']);
      r.setupSaveClicked=lbl;
      await sleep(2500);
    }
  }catch(e){ r.setupErr=String(e).slice(0,140); }
  t=await body(p); r.afterSetup=t.slice(0,200);
  await p.screenshot({path:`${OUT}/wt_aftersetup.png`});
  // STEP 2: open add form
  const addLbl=await clickText(p,['Add my weight today','Ajouter mon poids','Add daily weight','Add weight','أضف وزني']);
  r.addOpenClicked=addLbl; await sleep(1200);
  t=await body(p); r.addFormShown=/kg/i.test(t);
  // VALIDATION: invalid weight (too low)
  let inp=p.locator('input').first();
  try{
    if(await p.locator('input').count()){
      await p.locator('input').first().fill('10');
      const sv=await clickText(p,['Save','Enregistrer','حفظ']);
      r.invalidSaveClicked=sv; await sleep(1500);
      t=await body(p); r.afterInvalid=t.slice(0,240);
      await p.screenshot({path:`${OUT}/wt_invalid.png`});
    }
  }catch(e){ r.invalidErr=String(e).slice(0,140); }
  // VALID add 72.5
  try{
    // re-open add form if closed
    if(!(await p.locator('input').count())){ await clickText(p,['Add my weight today','Ajouter mon poids','Add daily weight','Add weight']); await sleep(800); }
    await p.locator('input').first().fill('72.5');
    const sv=await clickText(p,['Save','Enregistrer','حفظ']);
    r.validSaveClicked=sv; await sleep(2200);
    t=await body(p); r.afterValid=t.slice(0,300); r.has725=/72[.,]5/.test(t);
    await p.screenshot({path:`${OUT}/wt_valid.png`});
  }catch(e){ r.validErr=String(e).slice(0,140); }
  // persistence dump
  r.storageVals=await p.evaluate(()=>{ const o={}; Object.keys(localStorage).filter(k=>/weight/i.test(k)).forEach(k=>o[k]=(localStorage.getItem(k)||'').slice(0,400)); return o; });
  // reload
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(4500);
  t=await body(p); r.afterReload=t.slice(0,300); r.persist725=/72[.,]5/.test(t); r.oopsReload=oops(t);
  await p.screenshot({path:`${OUT}/wt_reload.png`});
  r.errs=errs.slice(); r.pageerrs=pageerrs.slice();
  out.weight=r;
  await c.close();
}

// ---------- KICK COUNTER ----------
{
  const {c,p,errs,pageerrs}=await newP();
  const r={};
  await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(400);
  await p.evaluate(()=>localStorage.removeItem('kick_counter_v1'));
  await p.goto(`${BASE}/kick-counter`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  let t=await body(p); r.loaded=!oops(t); r.errState=errState(t); r.snip0=t.slice(0,200);
  await p.screenshot({path:`${OUT}/kick_0.png`});
  // Start a session
  const sl=await clickText(p,['Start a session','Démarrer une session','Start session','ابدأ جلسة']);
  r.startClicked=sl; await sleep(1500);
  t=await body(p); r.afterStart=t.slice(0,200); r.sessionActive=/Tap to count|Toucher|in the last hour|dernière heure/i.test(t);
  r.kickStorageAfterStart=await p.evaluate(()=>localStorage.getItem('kick_counter_v1'));
  await p.screenshot({path:`${OUT}/kick_start.png`});
  // tap to count several times
  for(let i=0;i<4;i++){ const tl=await clickText(p,['Tap to count','Toucher pour compter']); await sleep(500); }
  t=await body(p); r.afterTaps=t.slice(0,200);
  // extract count number near "in the last hour"
  r.kickStorageAfterTaps=await p.evaluate(()=>localStorage.getItem('kick_counter_v1'));
  await p.screenshot({path:`${OUT}/kick_taps.png`});
  // end session
  const el=await clickText(p,['End session','Terminer la session']);
  r.endClicked=el; await sleep(1500);
  t=await body(p); r.afterEnd=t.slice(0,240); r.historyShown=/History|Historique/i.test(t);
  r.kickStorageAfterEnd=await p.evaluate(()=>localStorage.getItem('kick_counter_v1'));
  await p.screenshot({path:`${OUT}/kick_end.png`});
  // reload persistence
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(3500);
  t=await body(p); r.afterReload=t.slice(0,240); r.oopsReload=oops(t);
  r.errs=errs.slice(); r.pageerrs=pageerrs.slice();
  out.kick=r;
  await c.close();
}

// ---------- CONTRACTION TIMER ----------
{
  const {c,p,errs,pageerrs}=await newP();
  const r={};
  await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(400);
  await p.evaluate(()=>localStorage.removeItem('contraction_timer_v1'));
  await p.goto(`${BASE}/contraction-timer`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  let t=await body(p); r.loaded=!oops(t); r.errState=errState(t); r.snip0=t.slice(0,200);
  await p.screenshot({path:`${OUT}/ct_0.png`});
  // start a contraction
  const sl=await clickText(p,['Contraction start','Début contraction','Start contraction']);
  r.startClicked=sl; await sleep(3000);
  t=await body(p); r.afterStart=t.slice(0,200); r.running=/in progress|en cours|0:0|0:0/i.test(t);
  await p.screenshot({path:`${OUT}/ct_running.png`});
  // stop
  const el=await clickText(p,['Contraction end','Fin contraction','Stop contraction']);
  r.stopClicked=el; await sleep(1500);
  t=await body(p); r.afterStop=t.slice(0,260); r.statsShown=/Count|Nombre|Average|Moyenne/i.test(t);
  await p.screenshot({path:`${OUT}/ct_stop.png`});
  // second contraction for frequency
  await clickText(p,['Contraction start','Début contraction']); await sleep(2500);
  await clickText(p,['Contraction end','Fin contraction']); await sleep(1500);
  t=await body(p); r.afterTwo=t.slice(0,300);
  r.ctStorage=await p.evaluate(()=>(localStorage.getItem('contraction_timer_v1')||'').slice(0,300));
  await p.screenshot({path:`${OUT}/ct_two.png`});
  // reload persistence
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(3500);
  t=await body(p); r.afterReload=t.slice(0,260); r.oopsReload=oops(t); r.statsPersist=/Count|Nombre|Average|Moyenne/i.test(t);
  r.errs=errs.slice(); r.pageerrs=pageerrs.slice();
  out.contraction=r;
  await c.close();
}

// ---------- BABY EVOLUTION + RECOMMENDATIONS ----------
{
  const {c,p,errs,pageerrs}=await newP();
  const r={};
  await p.goto(`${BASE}/baby-evolution`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p); r.babyEvo={loaded:!oops(t),errState:errState(t),len:t.length,snip:t.slice(0,200)};
  await p.screenshot({path:`${OUT}/babyevo_0.png`});
  await p.goto(`${BASE}/recommendations`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  t=await body(p); r.recs={loaded:!oops(t),errState:errState(t),len:t.length,snip:t.slice(0,200)};
  await p.screenshot({path:`${OUT}/recs_0.png`});
  r.errs=errs.slice(); r.pageerrs=pageerrs.slice();
  out.evoRecs=r;
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
