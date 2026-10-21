import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r4_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
// seed 5 days then scroll stats to hydration
await p.goto(BASE);
await p.evaluate(()=>{
  const today=new Date(); const fmt=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  localStorage.setItem('hydration_data_v1',JSON.stringify({currentIntake:1500,dailyGoal:3000,lastUpdated:today.toISOString(),reminderEnabled:false}));
  const mkc=d=>JSON.stringify([{id:'reminder-rem_hyd_herbal_tea',completed:d,current:9,skipped:false},{id:'reminder-rem_vitamin_d',completed:d,skipped:false}]);
  for(let i=0;i<5;i++){const day=fmt(new Date(today.getTime()-i*864e5)); localStorage.setItem('@daily_checklist_v2_'+day,mkc(true));}
});
await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(5500);
await p.evaluate(()=>window.scrollTo(0,700)); await sleep(1500);
await p.screenshot({path:`${OUT}/stats_hydration_scrolled.png`});
// AR calendar
await p.evaluate(()=>localStorage.setItem('app_locale','ar'));
await p.goto(`${BASE}/calendar`,{waitUntil:'domcontentloaded'}); await sleep(4500);
await p.screenshot({path:`${OUT}/ar_calendar_top.png`,clip:{x:0,y:0,width:390,height:240}});
await b.close();
console.log('done');
