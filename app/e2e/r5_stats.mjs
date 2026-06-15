import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const BENIGN=/wasm|WebAssembly|CompileError|ArrayBuffer|DatabaseService|DB Init|Aborted\(|firestore|googleapis|insufficient permissions|DevTools|AsyncStorage has been|Setting a timer|tintColor|preloaded|status of 4|installations|identitytoolkit|securetoken/i;
async function freshPage(){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const cons=[],perr=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){ const x=m.text(); if(!BENIGN.test(x)) cons.push(x.slice(0,300)); }});
  p.on('pageerror',e=>{ const x=String(e&&e.stack||e&&e.message||e); if(!BENIGN.test(x)) perr.push(x.slice(0,400)); });
  p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
  return {c,p,cons,perr};
}
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
const out={};

function seedScript(numDays, waterMl){
  return (args)=>{
    const {numDays, waterMl}=args;
    const fmt=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
    const today=new Date();
    // clear old
    Object.keys(localStorage).filter(k=>k.startsWith('@daily_checklist_v2_')||k==='hydration_data_v1').forEach(k=>localStorage.removeItem(k));
    // real water for today
    localStorage.setItem('hydration_data_v1', JSON.stringify({currentIntake:waterMl, dailyGoal:3000, lastUpdated:today.toISOString(), reminderEnabled:false}));
    // checklist days
    for(let i=0;i<numDays;i++){
      const day=fmt(new Date(today.getTime()-i*864e5));
      const items=[{id:'reminder-rem_hyd_herbal_tea', completed:true, current:9, skipped:false},{id:'reminder-rem_vitamin_d', completed: i%2===0, skipped:false}];
      localStorage.setItem('@daily_checklist_v2_'+day, JSON.stringify(items));
    }
  };
}

// SCENARIO 1: empty -> EmptyState "no data"
{
  const {c,p,cons,perr}=await freshPage();
  await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(500);
  await p.evaluate(()=>{ Object.keys(localStorage).filter(k=>k.startsWith('@daily_checklist_v2_')||k==='hydration_data_v1').forEach(k=>localStorage.removeItem(k)); });
  await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p);
  out.empty={snip:t.slice(0,160), isEmptyState:/No data yet|Use the app|pas encore de don/i.test(t), cons:cons.slice(), perr:perr.slice()};
  await p.screenshot({path:`${OUT}/stats_empty.png`});
  await c.close();
}

// SCENARIO 2: single day -> charts should show "log more days" placeholder (single-point guard)
{
  const {c,p,cons,perr}=await freshPage();
  await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(500);
  await p.evaluate(seedScript(), {numDays:1, waterMl:1500});
  await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p);
  out.singleDay={
    snip:t.slice(0,300),
    hasPlaceholder:/Log at least 2 days|at least 2|plus de jours|chartNeedMoreDays/i.test(t),
    hasStreak:/streak|série|day/i.test(t),
    cons:cons.slice(), perr:perr.slice()
  };
  await p.screenshot({path:`${OUT}/stats_single.png`});
  await c.close();
}

// SCENARIO 3: 5 days + real water 1500ml -> charts render, hydration shows 1.5L today
{
  const {c,p,cons,perr}=await freshPage();
  await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(500);
  await p.evaluate(seedScript(), {numDays:5, waterMl:1500});
  await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p);
  // chart svg presence
  const svgCount=await p.evaluate(()=>document.querySelectorAll('svg').length);
  // hydration: today should be 1.5 (1500ml/1000). Chart is SVG so check label/axis. Also check the success chart rendered (>=2 pts).
  out.fiveDays={
    snip:t.slice(0,320),
    hasGlobalSuccess:/Global success|Réussite globale|success|réussite/i.test(t),
    hasHydrationChart:/Hydration|hydratation/i.test(t),
    hasPlaceholder:/Log at least 2 days|at least 2|plus de jours/i.test(t),
    svgCount,
    cons:cons.slice(), perr:perr.slice()
  };
  // Switch to 30d range
  await p.getByText(/^30 Days$|^30 jours$/i).first().click({timeout:3000}).catch(()=>{});
  await sleep(2000);
  t=await body(p);
  out.fiveDays.after30d=t.slice(0,160);
  await p.screenshot({path:`${OUT}/stats_5days.png`});
  await c.close();
}

// SCENARIO 4: verify hydration reflects REAL water not tea — set water=2500 and confirm value path
{
  const {c,p,cons,perr}=await freshPage();
  await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(500);
  await p.evaluate(seedScript(), {numDays:3, waterMl:2500});
  // read what getHistoricalData would produce by reading storage directly
  const storageCheck=await p.evaluate(()=>{
    const w=JSON.parse(localStorage.getItem('hydration_data_v1')||'{}');
    return {currentIntakeMl:w.currentIntake, expectedLitersToday:(w.currentIntake||0)/1000};
  });
  out.waterCheck={storageCheck};
  await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  let t=await body(p);
  out.waterCheck.statsSnip=t.slice(0,200);
  out.waterCheck.cons=cons.slice(); out.waterCheck.perr=perr.slice();
  await p.screenshot({path:`${OUT}/stats_water.png`});
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
