import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IGNORE=[/DevTools/i,/AsyncStorage has been extracted/i,/Setting a timer/i,/tintColor/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/source ?map/i,/sourcemap/i,/React DevTools/i,/\[expo-/i,/preloaded using link preload/i,/firestore/i,/googleapis/i,/WebChannelConnection/i,/transport errored/i,/installations/i,/identitytoolkit/i,/securetoken/i,/CompileError/i,/WebAssembly/i,/ArrayBuffer instantiation/i,/DatabaseService/i,/DB Init Error/i,/asynchronously prepare wasm/i,/Aborted\(/i,/status of 4/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));
const b=await chromium.launch();
async function newP(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const errs=[],pageerrs=[],dialogs=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){ const t=m.text(); if(keep(t)) errs.push(t.slice(0,260)); }});
  p.on('pageerror',e=>{ const t=String(e&&e.message||e); if(keep(t)) pageerrs.push(t.slice(0,260)); });
  p.on('dialog',async d=>{ dialogs.push({type:d.type(),msg:d.message().replace(/\s+/g,' ').slice(0,160)}); try{await d.accept();}catch(e){} });
  if(locale){ await p.goto(BASE); await p.evaluate(l=>localStorage.setItem('app_locale',l),locale); }
  return {c,p,errs,pageerrs,dialogs};
}
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function oops(txt){ return /Oops!|Oups|عذر|A small error|Une petite erreur/.test(txt); }
const out={};

// ---------- CALENDAR (en): load, week/month switch, suggestions, FAB->AddAppointment ----------
{
  const {c,p,errs,pageerrs,dialogs}=await newP();
  const r={};
  await p.goto(`${BASE}/calendar`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  let t=await body(p); r.loaded=!oops(t); r.snip0=t.slice(0,220);
  r.hasWeekMonth=/Week|Month|Semaine|Mois/i.test(t);
  await p.screenshot({path:`${OUT}/cal_week.png`});
  // switch to month
  const monthBtn=p.getByRole('button',{name:/^Month$|^Mois$/i}).first();
  r.monthBtnCount=await p.getByRole('button',{name:/^Month$|^Mois$/i}).count();
  await monthBtn.click({timeout:3000}).catch(e=>r.monthClickErr=String(e).slice(0,80));
  await sleep(1500);
  t=await body(p); r.monthView=/Mon Tue Wed|Lun Mar|S M T W|January|February|March|April|May|June|July/i.test(t)||/\b1\b.*\b28\b/.test(t); r.monthSnip=t.slice(0,200);
  await p.screenshot({path:`${OUT}/cal_month.png`});
  // aria-selected on month button
  r.ariaSelected=await p.evaluate(()=>{ const els=[...document.querySelectorAll('[role=button]')]; const m=els.find(e=>/^(Month|Mois)$/i.test((e.textContent||'').trim())); return m? m.getAttribute('aria-selected'):'NOTFOUND'; });
  // back to week
  await p.getByRole('button',{name:/^Week$|^Semaine$/i}).first().click({timeout:3000}).catch(()=>{});
  await sleep(1000);
  // toggle suggestions
  const sugg=p.getByRole('button',{name:/Suggestion|suggestions/i}).first();
  r.suggCount=await p.getByRole('button',{name:/Suggestion/i}).count();
  await sugg.click({timeout:3000}).catch(()=>{});
  await sleep(1200);
  t=await body(p); r.afterSuggToggle=t.slice(0,200);
  r.suggAriaExpanded=await p.evaluate(()=>{ const els=[...document.querySelectorAll('[role=button]')]; const m=els.find(e=>/suggestion/i.test((e.textContent||'').trim())); return m? m.getAttribute('aria-expanded'):'NOTFOUND'; });
  await p.screenshot({path:`${OUT}/cal_suggestions.png`});
  // prev/next week chevrons clickable
  const navBtns=p.getByRole('button',{name:/previous week|next week|semaine précédente|semaine suivante/i});
  r.navBtnCount=await navBtns.count();
  await p.getByRole('button',{name:/next week|semaine suivante/i}).first().click({timeout:3000}).catch(()=>{});
  await sleep(1000);
  t=await body(p); r.afterNextWeek=/Week|Semaine/i.test(t)&&!oops(t);
  // FAB -> AddAppointment (use deep link to be deterministic)
  await p.goto(`${BASE}/appointment/add`,{waitUntil:'domcontentloaded'}); await sleep(3500);
  t=await body(p); r.addApptLoaded=!oops(t); r.addApptSnip=t.slice(0,200);
  r.addApptInputs=await p.locator('input').count();
  await p.screenshot({path:`${OUT}/cal_addappt.png`});
  // fill title and try to save (guest path => window.confirm)
  const titleInput=p.locator('input').first();
  await titleInput.fill('Echo 22 SA',{timeout:3000}).catch(()=>{});
  // type selector aria-selected
  r.typeMedicalAria=await p.evaluate(()=>{ const els=[...document.querySelectorAll('[role=button]')]; const m=els.find(e=>/medical|médical/i.test((e.textContent||'').trim())); return m? m.getAttribute('aria-selected'):'NOTFOUND'; });
  // reminder switch aria-checked
  r.switchAriaChecked=await p.evaluate(()=>{ const els=[...document.querySelectorAll('[role=switch]')]; return els.slice(0,3).map(e=>e.getAttribute('aria-checked')); });
  r.switchCount=await p.evaluate(()=>document.querySelectorAll('[role=switch]').length);
  // click Save -> expect guest confirm dialog
  dialogs.length=0;
  await p.getByRole('button',{name:/^Save$|Enregistrer|Save changes/i}).first().click({timeout:3000}).catch(e=>r.saveClickErr=String(e).slice(0,80));
  await sleep(1800);
  r.dialogsAfterSave=dialogs.slice();
  t=await body(p); r.afterSaveSnip=t.slice(0,160);
  await p.screenshot({path:`${OUT}/cal_addappt_save.png`});
  r.errs=errs.slice(); r.pageerrs=pageerrs.slice();
  out.calendar=r;
  await c.close();
}

// ---------- CALENDAR RTL (ar): chevrons + dir ----------
{
  const {c,p,errs,pageerrs}=await newP('ar');
  const r={};
  await p.goto(`${BASE}/calendar`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  let t=await body(p); r.loaded=!oops(t); r.snip0=t.slice(0,160);
  r.dir=await p.evaluate(()=>document.documentElement.dir||document.body.dir||getComputedStyle(document.body).direction);
  // detect chevron glyph names via ionicons - check the nav button content / aria
  r.navButtons=await p.evaluate(()=>{ const els=[...document.querySelectorAll('[role=button]')]; return els.filter(e=>/الأسبوع|previous|next|سابق|التالي/i.test(e.getAttribute('aria-label')||'')).map(e=>e.getAttribute('aria-label')); });
  await p.screenshot({path:`${OUT}/cal_rtl.png`});
  // click next/prev still works in RTL
  const anyNav=p.locator('[role=button]').filter({hasText:''});
  r.errs=errs.slice(); r.pageerrs=pageerrs.slice();
  out.calendarRTL=r;
  await c.close();
}

// ---------- REMINDERS: load, toggle persist, a11y switch, tasks tab ----------
{
  const {c,p,errs,pageerrs}=await newP();
  const r={};
  await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(400);
  await p.evaluate(()=>{ Object.keys(localStorage).filter(k=>/reminders_v2/i.test(k)).forEach(k=>localStorage.removeItem(k)); });
  await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(5500);
  let t=await body(p); r.loaded=!oops(t); r.snip0=t.slice(0,220);
  r.hasHydration=/Hydration|hydratation|water|eau|ماء/i.test(t);
  r.switchCount=await p.evaluate(()=>document.querySelectorAll('[role=switch]').length);
  r.switchAria0=await p.evaluate(()=>{ const e=document.querySelector('[role=switch]'); return e?e.getAttribute('aria-checked'):'NONE'; });
  await p.screenshot({path:`${OUT}/rem_0.png`});
  // settings storage before
  r.settingsBefore=await p.evaluate(()=>localStorage.getItem('reminders_v2_settings_guest'));
  // toggle the first switch
  const sw=p.locator('[role=switch]').first();
  const before=await sw.getAttribute('aria-checked').catch(()=>null);
  await sw.click({timeout:3000}).catch(e=>r.toggleErr=String(e).slice(0,80));
  await sleep(2000);
  const after=await p.locator('[role=switch]').first().getAttribute('aria-checked').catch(()=>null);
  r.toggleBefore=before; r.toggleAfter=after; r.toggleChanged=before!==after;
  r.settingsAfter=await p.evaluate(()=>localStorage.getItem('reminders_v2_settings_guest'));
  await p.screenshot({path:`${OUT}/rem_toggled.png`});
  // expand a category section (aria-expanded)
  const secBtn=p.getByRole('button',{name:/Medical|Wellbeing|Recommended|Médical|Bien-être|Recommand/i}).first();
  r.sectionBtnCount=await p.getByRole('button',{name:/Medical|Wellbeing|Recommended|Médical/i}).count();
  const secAriaBefore=await secBtn.getAttribute('aria-expanded').catch(()=>null);
  await secBtn.click({timeout:3000}).catch(()=>{});
  await sleep(1200);
  const secAriaAfter=await p.getByRole('button',{name:/Medical|Wellbeing|Recommended|Médical/i}).first().getAttribute('aria-expanded').catch(()=>null);
  r.sectionAriaBefore=secAriaBefore; r.sectionAriaAfter=secAriaAfter;
  await p.screenshot({path:`${OUT}/rem_section.png`});
  // reload persistence
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(5000);
  const afterReload=await p.locator('[role=switch]').first().getAttribute('aria-checked').catch(()=>null);
  r.toggleAfterReload=afterReload; r.persistMatches=afterReload===after;
  t=await body(p); r.oopsReload=oops(t);
  // switch to Tasks tab
  const tasksTab=p.getByText(/^Tasks$|^Tâches$|^المهام$/i).first();
  r.tasksTabCount=await p.getByText(/^Tasks$|^Tâches$/i).count();
  await tasksTab.click({timeout:3000}).catch(()=>{});
  await sleep(2000);
  t=await body(p); r.tasksTabLoaded=!oops(t); r.tasksSnip=t.slice(0,200);
  await p.screenshot({path:`${OUT}/rem_tasks.png`});
  r.errs=errs.slice(); r.pageerrs=pageerrs.slice();
  out.reminders=r;
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
