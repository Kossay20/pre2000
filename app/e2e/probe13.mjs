import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
await p.goto(`${BASE}/KickCounter`,{waitUntil:'domcontentloaded'}); await sleep(5000);
let body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('start oops:', /Oops/i.test(body));
// click Calendar tab
const cal=p.getByText(/^Calendar$/i).first();
if(await cal.isVisible().catch(()=>false)){ await cal.click().catch(()=>{}); await sleep(3500); }
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('after Calendar tab click: url=',p.url(),'| oops=',/Oops/i.test(body),'| snip=',body.slice(0,70));
// click Reminders tab
const rem=p.getByText(/^Reminders$/i).first();
if(await rem.isVisible().catch(()=>false)){ await rem.click().catch(()=>{}); await sleep(3500); }
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('after Reminders tab click: oops=',/Oops/i.test(body),'| snip=',body.slice(0,70));
await b.close();
