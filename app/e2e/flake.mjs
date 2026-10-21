import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
async function once(route){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  const oops=/Oops|small error/i.test((await p.evaluate(()=>document.body.innerText)));
  await c.close();
  return oops;
}
for(const route of ['','weight','statistics','kick-counter','contraction-timer','baby-evolution']){
  let oops=0; const N=5;
  for(let i=0;i<N;i++){ if(await once(route)) oops++; }
  console.log(`route '/${route}'  Oops ${oops}/${N}`);
}
await b.close();
