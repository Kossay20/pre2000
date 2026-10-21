import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
async function t(route){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  const errs=[];
  p.on('console',m=>{if(m.type()==='error'&&/Uncaught error|ErrorBoundary/i.test(m.text()))errs.push(m.text().slice(0,200));});
  await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  console.log(`${route.padEnd(28)} oops=${/Oops|small error/i.test(body)?'YES':'no '} | first40="${body.slice(0,40)}" | boundaryLog=${errs.length}`);
  await c.close();
}
for(const r of ['totally-bogus-xyz','KickCounter','kickcounter','Kick-Counter','health','HealthDashboard','statistics/','forbidden-foods','ForbiddenFoods']) await t(r);
await b.close();
