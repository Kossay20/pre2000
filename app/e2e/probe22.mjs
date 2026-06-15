import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
// Start on a KNOWN-GOOD screen
await p.goto(`${BASE}/weight`,{waitUntil:'domcontentloaded'}); await sleep(5000);
let body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('1) /weight start: oops=',/Oops/i.test(body),'| snip=',body.slice(0,50));
// Click bottom Home tab -> in-app navigate to Home tab (HomeScreen)
const home=p.getByText(/^Home$/i).first();
if(await home.isVisible().catch(()=>false)){ await home.click().catch(()=>{}); await sleep(4000); }
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('2) after Home tab (in-app): oops=',/Oops/i.test(body),'| snip=',body.slice(0,90));
// Try Calendar then back to Home
const cal=p.getByText(/^Calendar$/i).first(); if(await cal.isVisible().catch(()=>false)){await cal.click().catch(()=>{}); await sleep(2500);}
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('3) Calendar tab: oops=',/Oops/i.test(body),'| snip=',body.slice(0,70));
await b.close();
