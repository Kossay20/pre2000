import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r4_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IGNORE=[/DevTools/i,/AsyncStorage has been extracted/i,/Setting a timer/i,/tintColor/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/magic word/i,/wasm/i,/DatabaseService/i,/DB Init/i,/ArrayBuffer instantiation/i,/source ?map/i,/Download the React DevTools/i,/status of 403/i,/status of 404/i,/firestore/i,/googleapis/i,/WebChannelConnection/i,/installations/i,/Aborted\(/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function oops(txt){ return /Oops!|Oups|عذر|A small error|Une petite erreur|Back to home|Retour à l'accueil/.test(txt); }
function backHome(txt){ return /Back to home|Retour à l'accueil/.test(txt); }
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

// ---- WEIGHT: complete setup, then save + replace ----
{
  const {c,p,errs,perr}=await ctx();
  const r={dialogs:[]};
  p.on('dialog',async d=>{ r.dialogs.push(d.message().replace(/\s+/g,' ').slice(0,180)); await d.accept(); });
  await p.goto(`${BASE}/weight`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  // setup inputs: first two textinputs
  const inputs=p.locator('input');
  const n=await inputs.count(); r.inputCountSetup=n;
  try{
    await inputs.nth(0).fill('60');
    await inputs.nth(1).fill('165');
    // Save setup
    let clicked=false;
    const save=p.getByText(/✓\s*Save|^Save$|Enregistrer/).first();
    if(await save.count()){ await save.click({timeout:3000}); clicked=true; }
    r.setupSaveClicked=clicked;
    await sleep(3500);
  }catch(e){ r.setupErr=String(e).slice(0,150); }
  let t=await body(p);
  r.afterSetup=t.slice(0,180); r.setupGoneNoData=/No data|Aucune|noData/i.test(t)||/My Weight|Mon Poids/i.test(t);
  await p.screenshot({path:`${OUT}/weight_postsetup.png`});
  // now daily weight: find the add-daily section input. It's the last visible input
  try{
    const inp2=p.locator('input').last();
    await inp2.scrollIntoViewIfNeeded();
    await inp2.fill('70');
    // add button: weight.addWeightTitle area has a button; try generic "Add"/"+"
    const addBtns=p.getByText(/^Add$|Ajouter|✓|Save/);
    const cc=await addBtns.count(); r.addBtnCount=cc;
    // find the daily add button — the one inside add form (not setup). Click last matching.
    let done=false;
    for(let i=cc-1;i>=0;i--){ try{ await addBtns.nth(i).click({timeout:2000}); done=true; break;}catch(e){} }
    r.addClicked=done;
    await sleep(3000);
  }catch(e){ r.addErr=String(e).slice(0,150); }
  t=await body(p); r.afterAdd=t.slice(0,220); r.oopsAfterAdd=oops(t);
  await p.screenshot({path:`${OUT}/weight_added.png`});
  // replace same value
  try{
    const inp3=p.locator('input').last();
    await inp3.fill('70');
    const addBtns=p.getByText(/^Add$|Ajouter|✓|Save/);
    const cc=await addBtns.count();
    for(let i=cc-1;i>=0;i--){ try{ await addBtns.nth(i).click({timeout:2000}); break;}catch(e){} }
    await sleep(3000);
  }catch(e){ r.replaceErr=String(e).slice(0,150); }
  t=await body(p); r.afterReplace=t.slice(0,220); r.oopsReplace=oops(t);
  await p.screenshot({path:`${OUT}/weight_replaced.png`});
  // persist via reload
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(4000);
  t=await body(p); r.afterReload=t.slice(0,220); r.oopsReload=oops(t); r.has70=/70/.test(t);
  r.errs=errs.slice(); r.perr=perr.slice();
  out.weight=r;
  await c.close();
}

// ---- KICK COUNTER ----
{
  const {c,p,errs,perr}=await ctx();
  const r={dialogs:[]};
  p.on('dialog',async d=>{ r.dialogs.push(d.message().replace(/\s+/g,' ').slice(0,160)); await d.accept(); });
  await p.goto(`${BASE}/kick-counter`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  let t=await body(p); r.on=!oops(t); r.snip=t.slice(0,140); r.backHome=backHome(t);
  await p.screenshot({path:`${OUT}/kick.png`});
  // tap the big kick button a few times
  try{
    // Big circular button usually has the count or a "+1"/foot emoji. Click center-ish big touchable.
    const candidates=p.getByText(/Tap|Appuyez|👶|🦶|Start|Démarrer|\+1|Record|Count/i);
    const cc=await candidates.count(); r.kickBtnCount=cc;
    // Try clicking a large element: use the first big touchable via role button
    const big=p.getByRole('button').filter({hasText:/.*/});
    const bn=await big.count();
    // tap up to 3 times whichever button looks like the kick action
    for(let k=0;k<3;k++){
      let tapped=false;
      const startBtn=p.getByText(/Start|Démarrer|Tap|Appuyez/i).first();
      if(await startBtn.count()){ try{ await startBtn.click({timeout:1500}); tapped=true;}catch(e){} }
      if(!tapped && bn){ try{ await big.first().click({timeout:1500}); tapped=true;}catch(e){} }
      await sleep(700);
    }
    await sleep(1500);
  }catch(e){ r.tapErr=String(e).slice(0,140); }
  t=await body(p); r.afterTap=t.slice(0,180); r.oopsAfterTap=oops(t);
  await p.screenshot({path:`${OUT}/kick_after.png`});
  r.errs=errs.slice(); r.perr=perr.slice();
  out.kick=r;
  await c.close();
}

// ---- CONTRACTION TIMER ----
{
  const {c,p,errs,perr}=await ctx();
  const r={dialogs:[]};
  p.on('dialog',async d=>{ r.dialogs.push(d.message().replace(/\s+/g,' ').slice(0,160)); await d.accept(); });
  await p.goto(`${BASE}/contraction-timer`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  let t=await body(p); r.on=!oops(t); r.snip=t.slice(0,140); r.backHome=backHome(t);
  await p.screenshot({path:`${OUT}/contr.png`});
  try{
    // Start a contraction, wait, stop
    const start=p.getByText(/Start|Démarrer|Begin|Commencer/i).first();
    if(await start.count()){ await start.click({timeout:2500}); r.started=true; await sleep(2000); }
    const stop=p.getByText(/Stop|Arrêter|End|Terminer/i).first();
    if(await stop.count()){ await stop.click({timeout:2500}); r.stopped=true; await sleep(1500); }
  }catch(e){ r.recErr=String(e).slice(0,140); }
  t=await body(p); r.afterRecord=t.slice(0,200); r.oopsAfterRecord=oops(t);
  await p.screenshot({path:`${OUT}/contr_recorded.png`});
  // clear
  try{
    const clr=p.getByText(/Clear|Effacer|Supprimer|Reset/i).first();
    if(await clr.count()){ await clr.click({timeout:2500}); r.clearClicked=true; await sleep(1500); }
  }catch(e){ r.clearErr=String(e).slice(0,140); }
  t=await body(p); r.afterClear=t.slice(0,180); r.oopsAfterClear=oops(t);
  r.errs=errs.slice(); r.perr=perr.slice();
  out.contraction=r;
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
