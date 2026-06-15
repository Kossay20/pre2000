import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
// Home root
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(6000);
let t=await p.evaluate(()=>document.body.innerText);
console.log('HOME / firstload:', t.replace(/\s+/g,' ').slice(0,140));
console.log('HOME / oops:', /Oops!/.test(t), '| has 😔:', t.includes('😔'));
// HomeMain explicit
await p.goto(`${BASE}/HomeMain`,{waitUntil:'domcontentloaded'}); await sleep(5000);
t=await p.evaluate(()=>document.body.innerText);
console.log('HomeMain oops:', /Oops!/.test(t), '| snip:', t.replace(/\s+/g,' ').slice(0,120));
// Now: does Reminders tab work when reached via TAB CLICK from a fresh Home (not reload)?
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(5000);
await p.getByRole('tab',{name:/Reminders/i}).first().click({timeout:4000}).catch(e=>console.log('tabclick err',String(e).slice(0,60)));
await sleep(4000);
t=await p.evaluate(()=>document.body.innerText);
console.log('Reminders via TAB CLICK oops:', /Oops!/.test(t), '| hasHydration:', /Hydration|My Reminders/i.test(t));
console.log('Reminders via TAB snip:', t.replace(/\s+/g,' ').slice(0,160));
await b.close();
