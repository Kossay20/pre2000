import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
// FRESH context+page, enter at root
async function freshRoot(){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  let body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  console.log('FRESH / entry: oops=',/Oops/i.test(body),'| snip=',body.slice(0,80));
  // hard reload (true reload, re-boots SPA) after bad nav
  await p.goto(`${BASE}/KickCounter`,{waitUntil:'domcontentloaded'}); await sleep(3000);
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(4500); // reload still on /KickCounter URL
  body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  console.log('hard reload ON /KickCounter: oops=',/Oops/i.test(body),'| snip=',body.slice(0,60));
  await c.close();
}
await freshRoot();
await b.close();
