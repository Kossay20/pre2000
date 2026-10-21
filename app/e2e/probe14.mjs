import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
// enter on bad route
await p.goto(`${BASE}/KickCounter`,{waitUntil:'domcontentloaded'}); await sleep(4500);
console.log('bad entry oops:', /Oops/i.test((await p.evaluate(()=>document.body.innerText))));
// hard reload to root
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(4500);
let body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('after goto / : oops=',/Oops/i.test(body),'| snip=',body.slice(0,70));
// now click tabs from a healthy root
const cal=p.getByText(/^Calendar$/i).first(); if(await cal.isVisible().catch(()=>false)){await cal.click().catch(()=>{}); await sleep(2500);}
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('healthy entry, Calendar tab: oops=',/Oops/i.test(body),'| snip=',body.slice(0,70));
await b.close();
