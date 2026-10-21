import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();

async function info(tag){
  const d=await p.evaluate(()=>{
    const txt=(document.body.innerText||'').replace(/\s+/g,' ').trim();
    return {
      url:location.pathname+location.hash,
      emoji_monkey: txt.includes('🙈'),
      emoji_sad: txt.includes('😔'),
      oops: /Oops/.test(txt),
      backToHome: /Back to home/.test(txt),
      retry: /Retry/.test(txt),
      hasReminderContent: /My Reminders|Hydration|Daily Goal|Trimester|Enable notifications/i.test(txt),
      hasTasksContent: /Tasks|checklist|today/i.test(txt),
      // which tab is active
      activeTab: (()=>{ const a=document.querySelector('[role="tab"][aria-selected="true"]'); return a?a.innerText.trim():'?'; })(),
      snip: txt.slice(0,160)
    };
  });
  console.log(tag, JSON.stringify(d));
  return d;
}

// fresh
await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(5500);
await info('FRESH ');
// reload
await p.reload({waitUntil:'domcontentloaded'}); await sleep(5500);
const r=await info('RELOAD');
// if oops, click Retry and see if recovers
if(r.oops){
  const retry=p.getByRole('button',{name:/Retry|Réessayer/i}).first();
  const rc=await retry.count();
  console.log('retry button count', rc);
  if(rc){ await retry.click({timeout:3000}); await sleep(5000); await info('AFTER-RETRY'); }
  // also try navigating Home then back to Reminders tab via tab bar
  const remTab=p.getByRole('tab',{name:/Reminders/i}).first();
  if(await remTab.count()){ await remTab.click({timeout:3000}); await sleep(4000); await info('AFTER-REMTAB'); }
}
// Compare: does HOME also oops on cold reload? (documented benign)
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await sleep(5500);
await info('HOME-FRESH');
await p.reload({waitUntil:'domcontentloaded'}); await sleep(5500);
await info('HOME-RELOAD');
await b.close();
