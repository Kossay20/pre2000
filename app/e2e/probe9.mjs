import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r3_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
await p.goto(BASE);
await p.evaluate(()=>{
  const today=new Date(); const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  // 3 days of data incl today water
  for(let i=0;i<3;i++){ const dd=new Date(today.getTime()-i*864e5);
    localStorage.setItem('@daily_checklist_v2_'+fmt(dd),JSON.stringify([{id:'reminder-rem_vitamin_d',completed:i%2===0,skipped:false},{id:'reminder-rem_hyd_herbal_tea',completed:true,current:7,skipped:false}]));
  }
  localStorage.setItem('hydration_data_v1',JSON.stringify({currentIntake:2200,dailyGoal:3000,lastUpdated:today.toISOString(),reminderEnabled:false,reminderFrequency:8,reminderStartHour:8,reminderEndHour:22}));
});
await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(6000);
// click 30 Days
const thirty=p.getByText(/30 Days/i).first(); if(await thirty.isVisible().catch(()=>false)){ await thirty.click().catch(()=>{}); await sleep(2500); }
const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
const svg=await p.evaluate(()=>Array.from(document.querySelectorAll('svg text')).map(t=>(t.textContent||'').trim()));
const rects=await p.evaluate(()=>document.querySelectorAll('svg rect').length);
console.log('30-day toggle body snip:', body.slice(0,200));
console.log('svg labels:', JSON.stringify(svg));
console.log('svg rects (bars):', rects);
console.log('herbal-tea-7 leaked as 7L?', svg.some(l=>/^7(\.0+)?$/.test(l)));
await p.screenshot({path:`${OUT}/F_stats_30d.png`});
await b.close();
