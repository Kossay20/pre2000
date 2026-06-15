import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
await p.goto(`${BASE}/KickCounter`,{waitUntil:'domcontentloaded'}); await sleep(5000);
let body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('1) on /KickCounter oops:', /Oops/i.test(body));
// Try Retry
const retry=p.getByText(/^Retry$/i).first();
if(await retry.isVisible().catch(()=>false)){ await retry.click().catch(()=>{}); await sleep(3500); }
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('2) after Retry oops:', /Oops/i.test(body), '| snip:', body.slice(0,60));
// Try bottom tab Home (recover via nav)
await p.goto(`${BASE}/KickCounter`,{waitUntil:'domcontentloaded'}); await sleep(4000);
const home=p.getByText(/^Home$/i).first();
if(await home.isVisible().catch(()=>false)){ await home.click().catch(()=>{}); await sleep(3500); }
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('3) after Home tab oops:', /Oops/i.test(body), '| snip:', body.slice(0,60));
await b.close();
