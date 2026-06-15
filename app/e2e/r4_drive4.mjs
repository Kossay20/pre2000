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
async function ctx(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const errs=[],perr=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){const t=m.text(); if(keep(t)) errs.push(t.slice(0,200));}});
  p.on('pageerror',e=>{const t=String(e&&e.message||e); if(keep(t)) perr.push(t.slice(0,200));});
  if(locale){ await p.goto(BASE); await p.evaluate(l=>localStorage.setItem('app_locale',l),locale); }
  return {c,p,errs,perr};
}

// ---- CALENDAR week/month ----
{
  const {c,p,errs,perr}=await ctx();
  const r={};
  await p.goto(`${BASE}/calendar`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p); r.on=!oops(t); r.snip=t.slice(0,150);
  await p.screenshot({path:`${OUT}/calendar_week.png`});
  // switch to month
  const monthBtn=p.getByText(/^Month$|^Mois$|^شهر$/i).first();
  r.monthBtnFound=await monthBtn.count()>0;
  if(r.monthBtnFound){ await monthBtn.click({timeout:3000}); await sleep(2000); }
  t=await body(p); r.afterMonth=t.slice(0,150); r.oopsMonth=oops(t);
  await p.screenshot({path:`${OUT}/calendar_month.png`});
  // next/prev nav (chevrons): click the header arrow buttons
  const arrows=await p.evaluate(()=>{
    const a=[]; document.querySelectorAll('[role="button"]').forEach(el=>{ const svg=el.querySelector('svg'); if(svg&&(el.innerText||'').trim().length<3) a.push(1); }); return a.length;
  });
  r.arrowButtons=arrows;
  // switch back to week
  const weekBtn=p.getByText(/^Week$|^Semaine$|^أسبوع$/i).first();
  if(await weekBtn.count()){ await weekBtn.click({timeout:3000}); await sleep(1500); }
  t=await body(p); r.afterWeek=t.slice(0,120); r.oopsWeek=oops(t);
  r.errs=errs.slice(); r.perr=perr.slice();
  out.calendar=r;
  await c.close();
}

// ---- ADD APPOINTMENT save persists ----
{
  const {c,p,errs,perr}=await ctx();
  const r={dialogs:[]};
  p.on('dialog',async d=>{ r.dialogs.push(d.message().replace(/\s+/g,' ').slice(0,160)); await d.accept(); });
  await p.goto(`${BASE}/appointment/add`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  let t=await body(p); r.on=!oops(t); r.snip=t.slice(0,160);
  await p.screenshot({path:`${OUT}/addappt.png`});
  // fill title
  try{
    const ti=p.locator('input').first();
    if(await ti.count()){ await ti.fill('E2E Checkup R4'); }
    r.titleFilled=true;
    // Save button
    const save=p.getByText(/^Save$|Enregistrer|Ajouter|Add appointment|Create|حفظ/i).last();
    r.saveFound=await save.count()>0;
    if(r.saveFound){ await save.click({timeout:3500}); await sleep(3000); }
  }catch(e){ r.saveErr=String(e).slice(0,150); }
  t=await body(p); r.afterSave=t.slice(0,200); r.oopsAfter=oops(t);
  await p.screenshot({path:`${OUT}/addappt_saved.png`});
  // verify persistence: go to calendar and look for the title
  await p.goto(`${BASE}/calendar`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  t=await body(p);
  r.persistInCalendar=/E2E Checkup R4/.test(t);
  // also check localStorage
  r.lsEvents=await p.evaluate(()=>{ const keys=Object.keys(localStorage).filter(k=>/event|rdv|appointment|calendar/i.test(k)); return keys.map(k=>({k,v:(localStorage.getItem(k)||'').slice(0,80)})); });
  r.errs=errs.slice(); r.perr=perr.slice();
  out.addAppointment=r;
  await c.close();
}

// ---- REMINDERS toggles/time ----
{
  const {c,p,errs,perr}=await ctx();
  const r={};
  await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p); r.on=!oops(t); r.snip=t.slice(0,160);
  await p.screenshot({path:`${OUT}/reminders.png`});
  // count switches
  const switches=await p.evaluate(()=>document.querySelectorAll('[role="switch"], input[type="checkbox"]').length);
  r.switchCount=switches;
  // toggle the first switch
  try{
    const sw=p.locator('[role="switch"], input[type="checkbox"]').first();
    if(await sw.count()){
      const before=await sw.getAttribute('aria-checked');
      await sw.click({timeout:3000}); await sleep(1500);
      const after=await sw.getAttribute('aria-checked');
      r.toggleBefore=before; r.toggleAfter=after; r.toggled=before!==after;
    }
  }catch(e){ r.toggleErr=String(e).slice(0,150); }
  t=await body(p); r.afterToggle=t.slice(0,120); r.oopsToggle=oops(t);
  await p.screenshot({path:`${OUT}/reminders_toggled.png`});
  // persist toggle across reload
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(4000);
  t=await body(p); r.oopsReload=oops(t);
  try{
    const sw=p.locator('[role="switch"], input[type="checkbox"]').first();
    if(await sw.count()) r.persistAfter=await sw.getAttribute('aria-checked');
  }catch(e){}
  r.errs=errs.slice(); r.perr=perr.slice();
  out.reminders=r;
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
