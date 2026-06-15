import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r4_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IGNORE=[/DevTools/i,/AsyncStorage has been extracted/i,/Setting a timer/i,/tintColor/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/magic word/i,/wasm/i,/DatabaseService/i,/DB Init/i,/ArrayBuffer instantiation/i,/source ?map/i,/Download the React DevTools/i,/status of 403/i,/status of 404/i,/firestore/i,/googleapis/i,/WebChannelConnection/i,/installations/i,/Aborted\(/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function oops(txt){ return /Oops!|Oups|عذر|A small error|Une petite erreur|Back to home|Retour à l'accueil/.test(txt); }
const out={};
const b=await chromium.launch();
async function ctx(){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const errs=[],perr=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){const t=m.text(); if(keep(t)) errs.push(t.slice(0,200));}});
  p.on('pageerror',e=>{const t=String(e&&e.message||e); if(keep(t)) perr.push(t.slice(0,200));});
  return {c,p,errs,perr};
}

// ---- WEIGHT full flow: setup -> add (kg dialog) -> replace (exists dialog) -> persist ----
{
  const {c,p,errs,perr}=await ctx();
  const r={dialogs:[]};
  p.on('dialog',async d=>{ r.dialogs.push(d.message().replace(/\s+/g,' ').slice(0,180)); await d.accept(); });
  await p.goto(`${BASE}/weight`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  const inputs=p.locator('input');
  // setup
  if(await inputs.count()>=2){
    await inputs.nth(0).fill('60'); await inputs.nth(1).fill('165');
    const save=p.getByText(/✓\s*Save|^Save$|Enregistrer/).first();
    if(await save.count()) await save.click({timeout:3000});
    await sleep(3500);
  }
  // expand add form
  const addToggle=p.getByText(/Add today's weight|Ajouter.*poids du jour|➕/).first();
  r.addToggleFound=await addToggle.count()>0;
  if(r.addToggleFound){ await addToggle.click({timeout:3000}); await sleep(1200); }
  // fill daily weight
  const inp=p.locator('input').last();
  r.inputAfterToggle=await p.locator('input').count();
  await inp.fill('70'); await sleep(400);
  // click Save in form (the Save button, not Cancel)
  const saveBtn=p.getByText(/^Save$|^Enregistrer$|^حفظ$/).last();
  if(await saveBtn.count()) await saveBtn.click({timeout:3000});
  await sleep(3000);
  let t=await body(p); r.afterAdd=t.slice(0,160); r.oopsAdd=oops(t);
  await p.screenshot({path:`${OUT}/weight_added.png`});
  // replace: open form again, same value
  const addToggle2=p.getByText(/Add today's weight|Ajouter.*poids|➕/).first();
  if(await addToggle2.count()){ await addToggle2.click({timeout:3000}); await sleep(1000);
    const inp2=p.locator('input').last(); await inp2.fill('70'); await sleep(400);
    const saveBtn2=p.getByText(/^Save$|^Enregistrer$/).last(); if(await saveBtn2.count()) await saveBtn2.click({timeout:3000});
    await sleep(3000);
  }
  t=await body(p); r.afterReplace=t.slice(0,180); r.oopsReplace=oops(t);
  await p.screenshot({path:`${OUT}/weight_replaced.png`});
  // persist
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(4000);
  t=await body(p); r.afterReload=t.slice(0,200); r.has70=/\b70(\.0)?\b/.test(t)||/70 kg/.test(t); r.oopsReload=oops(t);
  r.errs=errs.slice(); r.perr=perr.slice();
  out.weight=r;
  await c.close();
}

// ---- KICK full ----
{
  const {c,p,errs,perr}=await ctx();
  const r={dialogs:[]};
  p.on('dialog',async d=>{ r.dialogs.push(d.message().replace(/\s+/g,' ').slice(0,160)); await d.accept(); });
  await p.goto(`${BASE}/kick-counter`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  // start session
  const startBtn=p.getByText(/Start session|Démarrer|Commencer la séance|بدء/i).first();
  r.startFound=await startBtn.count()>0;
  if(r.startFound){ await startBtn.click({timeout:3000}); await sleep(2000); }
  let t=await body(p); r.afterStart=t.slice(0,160); r.oopsStart=oops(t);
  await p.screenshot({path:`${OUT}/kick_active.png`});
  // tap to count a few times
  const tap=p.getByText(/Tap to count|Appuyez pour compter|اضغط/i).first();
  r.tapFound=await tap.count()>0;
  if(r.tapFound){ for(let i=0;i<3;i++){ try{ await tap.click({timeout:1500}); }catch(e){} await sleep(600); } }
  await sleep(1000);
  t=await body(p); r.afterTaps=t.slice(0,200); r.oopsTaps=oops(t);
  // extract the big count number
  r.countVisible=/Kicks in the last hour|kicks last hour|dernière heure|الساعة/i.test(t);
  await p.screenshot({path:`${OUT}/kick_counted.png`});
  // cancel session (confirm dialog)
  const cancel=p.getByText(/Cancel session|Annuler la séance|إلغاء/i).first();
  if(await cancel.count()){ await cancel.click({timeout:3000}); await sleep(1500); r.cancelClicked=true; }
  t=await body(p); r.afterCancel=t.slice(0,160); r.oopsCancel=oops(t);
  // persist today count via reload
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(3500);
  t=await body(p); r.afterReload=t.slice(0,200); r.oopsReload=oops(t);
  r.errs=errs.slice(); r.perr=perr.slice();
  out.kick=r;
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
