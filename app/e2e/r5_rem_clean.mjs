import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(500);
await p.evaluate(()=>{ Object.keys(localStorage).filter(k=>/reminders_v2_settings/i.test(k)).forEach(k=>localStorage.removeItem(k)); });
// reach reminders via tab click (the real user path)
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(5000);
await p.getByRole('tab',{name:/Reminders/i}).first().click({timeout:4000}).catch(()=>{});
await sleep(4500);
// Only count VISIBLE switches (filter by bounding box)
async function visibleSwitches(){
  return await p.evaluate(()=>{
    return [...document.querySelectorAll('[role="switch"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}).map(e=>({checked:e.getAttribute('aria-checked'), y:Math.round(e.getBoundingClientRect().top)}));
  });
}
let sw=await visibleSwitches();
console.log('visible switches on Reminders:', JSON.stringify(sw));
// Toggle the prenatal vitamins switch (2nd visible typically) by clicking via locator visible
const locs=p.locator('[role="switch"]:visible');
const n=await locs.count();
console.log('visible switch locator count:', n);
const before=await locs.nth(Math.min(1,n-1)).getAttribute('aria-checked').catch(()=>null);
await locs.nth(Math.min(1,n-1)).click({timeout:3000}).catch(e=>console.log('click err',String(e).slice(0,60)));
await sleep(2500);
const settings=await p.evaluate(()=>localStorage.getItem('reminders_v2_settings_guest'));
console.log('toggled switch before:', before);
console.log('settings persisted (parsed enabled states):', settings? Object.fromEntries(Object.entries(JSON.parse(settings)).map(([k,v])=>[k,v.enabled])) : 'NULL');
await b.close();
