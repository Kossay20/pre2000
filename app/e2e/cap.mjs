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
  const t=fmt(today),y=fmt(new Date(today.getTime()-864e5));
  localStorage.setItem('hydration_data_v1',JSON.stringify({currentIntake:1500,dailyGoal:3000,lastUpdated:today.toISOString(),reminderEnabled:false,reminderFrequency:8,reminderStartHour:8,reminderEndHour:22}));
  const mkc=done=>JSON.stringify([{id:'reminder-rem_hyd_herbal_tea',completed:done,current:9,skipped:false},{id:'reminder-rem_vitamin_d',completed:done,skipped:false}]);
  localStorage.setItem('@daily_checklist_v2_'+y,mkc(true)); localStorage.setItem('@daily_checklist_v2_'+t,mkc(true));
});
await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(6000);
// scroll down to hydration chart
await p.evaluate(()=>{ const sc=document.querySelector('[data-testid="statistics_screen_root"]')||document.scrollingElement; if(sc) sc.scrollTo? sc.scrollTo(0,600):0; window.scrollTo(0,600); });
await sleep(1500);
await p.screenshot({path:`${OUT}/F_stats_seeded_scrolled.png`});
await b.close();
console.log('done');
