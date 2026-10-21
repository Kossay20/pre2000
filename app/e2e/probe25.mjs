import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r3_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
// EN root
{
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(6000);
  const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  console.log('EN root / oops:', /Oops/i.test(body));
  await p.screenshot({path:`${OUT}/F_home_crash_en.png`});
  await c.close();
}
// AR root
{
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  await p.goto(BASE); await p.evaluate(()=>localStorage.setItem('app_locale','ar'));
  await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(6000);
  const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  console.log('AR root / oops:', /Oops|عذرا|خطأ/i.test(body), '| snip:', body.slice(0,80));
  await p.screenshot({path:`${OUT}/F_home_crash_ar.png`});
  await c.close();
}
// re-confirm a couple of my screens once more (regression-proof)
for(const r of ['weight','statistics','kick-counter','contraction-timer']){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  await p.goto(`${BASE}/${r}`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  console.log(`reconfirm /${r}: oops=${/Oops/i.test(body)}`);
  await c.close();
}
await b.close();
