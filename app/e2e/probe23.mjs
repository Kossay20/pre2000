import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
await p.goto(`${BASE}/calendar`,{waitUntil:'domcontentloaded'}); await sleep(5000);
let body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('1) /calendar: oops=',/Oops/i.test(body),'| snip=',body.slice(0,60));
// click bottom Home tab (use last match = tab bar at bottom)
const homes=p.getByText(/^Home$/i); const n=await homes.count();
console.log('Home matches:',n);
if(n>0){ await homes.nth(n-1).click().catch(()=>{}); await sleep(4000); }
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('2) after Home tab: oops=',/Oops/i.test(body),'| url=',p.url(),'| snip=',body.slice(0,100));
await p.screenshot({path:'/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r3_shots/F_home_inapp.png'});
await b.close();
