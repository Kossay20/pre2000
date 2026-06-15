import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r4_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IGNORE=[/DevTools/i,/AsyncStorage/i,/Setting a timer/i,/tintColor/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/magic word/i,/wasm/i,/DatabaseService/i,/DB Init/i,/ArrayBuffer/i,/source ?map/i,/React DevTools/i,/status of 403/i,/status of 404/i,/firestore/i,/googleapis/i,/WebChannelConnection/i,/installations/i,/Aborted\(/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function oops(txt){ return /Oops!|Oups|عذر|A small error|Une petite erreur/.test(txt); }
function backHome(txt){ return /Back to home|Retour à l'accueil/.test(txt); }
const out={};
const b=await chromium.launch();
async function ctx(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const errs=[],perr=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){const t=m.text(); if(keep(t)) errs.push(t.slice(0,200));}});
  p.on('pageerror',e=>{const t=String(e&&e.message||e); if(keep(t)) perr.push(t.slice(0,200));});
  await p.goto(BASE);
  if(locale) await p.evaluate(l=>localStorage.setItem('app_locale',l),locale);
  return {c,p,errs,perr};
}
async function seed(p,days,intakeL){
  await p.evaluate(({d,intakeL})=>{
    const today=new Date(); const fmt=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
    localStorage.setItem('hydration_data_v1',JSON.stringify({currentIntake:Math.round(intakeL*1000),dailyGoal:3000,lastUpdated:today.toISOString(),reminderEnabled:false}));
    const mkc=done=>JSON.stringify([{id:'reminder-rem_hyd_herbal_tea',completed:done,current:9,skipped:false},{id:'reminder-rem_vitamin_d',completed:done,skipped:false}]);
    for(let i=0;i<d;i++){ const day=fmt(new Date(today.getTime()-i*864e5)); localStorage.setItem('@daily_checklist_v2_'+day,mkc(true)); }
  },{d:days,intakeL});
}
async function clearSeed(p){ await p.evaluate(()=>{ Object.keys(localStorage).filter(k=>k.startsWith('@daily_checklist_v2_')||k==='hydration_data_v1').forEach(k=>localStorage.removeItem(k)); }); }

// ---- STATS EMPTY ----
{
  const {c,p,errs,perr}=await ctx();
  const r={};
  await clearSeed(p);
  await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(5500);
  let t=await body(p);
  r.oops=oops(t); r.backHome=backHome(t);
  r.emptyState=/No data yet|Aucune donnée|Use the app for a few days|لا توجد/i.test(t);
  r.snip=t.slice(0,200);
  await p.screenshot({path:`${OUT}/stats_empty.png`});
  r.errs=errs.slice(); r.perr=perr.slice();
  out.statsEmpty=r;
  await c.close();
}

// ---- STATS SINGLE POINT (guard) ----
{
  const {c,p,errs,perr}=await ctx();
  const r={};
  await clearSeed(p); await seed(p,1,1.5); // single day
  await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(5500);
  let t=await body(p);
  r.oops=oops(t); r.backHome=backHome(t);
  r.guardCount=(t.match(/Log at least 2 days|au moins 2 jours|سجّل/gi)||[]).length;
  r.snip=t.slice(0,260);
  await p.screenshot({path:`${OUT}/stats_single.png`});
  r.errs=errs.slice(); r.perr=perr.slice();
  out.statsSingle=r;
  await c.close();
}

// ---- STATS SEEDED multi-day: hydration = REAL water in liters ----
{
  const {c,p,errs,perr}=await ctx();
  const r={};
  await clearSeed(p); await seed(p,5,1.5); // 5 days, 1.5L intake
  await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(6000);
  let t=await body(p);
  r.oops=oops(t); r.backHome=backHome(t);
  // hydration chart present + labelled liters
  r.hasHydrationLiters=/Hydration \(Liters\)|Hydratation \(Litres\)|ترطيب/i.test(t);
  r.hasSuccessChart=/success rate|taux de réussite|Overall|نجاح/i.test(t);
  // pull SVG text labels to verify L units + water value, and that it is NOT herbal-tea "9" count
  const svgLabels=await p.evaluate(()=>{ const a=[]; document.querySelectorAll('svg text').forEach(e=>{const tx=(e.textContent||'').trim(); if(tx) a.push(tx);}); return a; });
  r.svgLabels=svgLabels;
  r.hasLunits=svgLabels.some(x=>/L$/.test(x));
  r.has1_5L=svgLabels.some(x=>/1\.5L|1,5L/.test(x));
  r.hasNineCount=svgLabels.includes('9'); // would indicate herbal-tea cups bug
  r.snip=t.slice(0,260);
  await p.screenshot({path:`${OUT}/stats_seeded.png`});
  r.errs=errs.slice(); r.perr=perr.slice();
  out.statsSeeded=r;
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
