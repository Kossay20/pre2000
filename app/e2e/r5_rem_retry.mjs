import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(5500);
await p.reload({waitUntil:'domcontentloaded'}); await sleep(5500);
let t=await p.evaluate(()=>document.body.innerText);
console.log('after reload oops:', /Oops!/.test(t));
// click Retry
await p.getByText(/^Retry$/i).first().click({timeout:3000}).catch(e=>console.log('retry click err',String(e).slice(0,80)));
await sleep(4000);
t=await p.evaluate(()=>document.body.innerText);
console.log('after Retry oops:', /Oops!/.test(t));
console.log('after Retry snip:', t.replace(/\s+/g,' ').slice(0,160));
// also: navigate away to Calendar tab and back to Reminders (does in-app nav recover?)
await p.getByRole('tab',{name:/Calendar/i}).first().click({timeout:3000}).catch(()=>{});
await sleep(2500);
await p.getByRole('tab',{name:/Reminders/i}).first().click({timeout:3000}).catch(()=>{});
await sleep(3500);
t=await p.evaluate(()=>document.body.innerText);
console.log('after tab round-trip oops:', /Oops!/.test(t));
console.log('after tab round-trip snip:', t.replace(/\s+/g,' ').slice(0,160));
await b.close();
