import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
async function tryRoute(route){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'});
  await sleep(5500);
  const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  console.log(`${route.padEnd(22)} oops=${/Oops|small error/i.test(body)?'YES':'no '} | ${body.slice(0,80)}`);
  await c.close();
}
for(const r of ['kick-counter','contraction-timer','statistics','baby-evolution','KickCounter','ContractionTimer','Statistics','BabyEvolution','weight','recommendations']){
  await tryRoute(r);
}
await b.close();
