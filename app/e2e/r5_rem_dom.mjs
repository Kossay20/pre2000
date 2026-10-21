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
const full=await p.evaluate(()=>document.body.innerText);
console.log('=== FULL BODY INNERTEXT ===');
console.log(JSON.stringify(full));
console.log('=== emoji present? ===');
console.log('has 🙈 (global EB):', full.includes('🙈'));
console.log('has 😔 (ErrorState):', full.includes('😔'));
console.log('has Error code:', /Error code|Code erreur/i.test(full));
console.log('has Back to home:', /Back to home/i.test(full));
console.log('=== testIDs in DOM ===');
const ids=await p.evaluate(()=>{
  const byTest=(id)=>!!document.querySelector(`[data-testid="${id}"]`);
  return {
    retryTid: byTest('error_boundary_retry'),
    homeTid: byTest('error_boundary_home'),
    // count tab role
    tabs: document.querySelectorAll('[role="tab"]').length,
    // any element with text Back to home
    backHome: [...document.querySelectorAll('*')].some(e=>e.children.length===0 && /Back to home/i.test(e.textContent||'')),
  };
});
console.log(JSON.stringify(ids,null,2));
// also: is the tab bar actually visible (rendered) or just in detached DOM?
const tabBarVisible=await p.evaluate(()=>{
  const els=[...document.querySelectorAll('[role="tab"]')];
  return els.map(e=>{ const r=e.getBoundingClientRect(); return {label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,20), w:Math.round(r.width), h:Math.round(r.height), visible:r.width>0&&r.height>0}; });
});
console.log('=== TAB BAR ELEMENTS ===');
console.log(JSON.stringify(tabBarVisible,null,2));
await b.close();
