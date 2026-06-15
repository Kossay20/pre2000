// Test: deep-link vs in-app nav, and retry-stability for KickCounter/Contraction/Statistics
import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();

async function probe(route, label) {
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'});
  await sleep(5000);
  let body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  const oops = /Oops|small error/i.test(body);
  let afterRetry = null;
  if (oops) {
    // click Retry
    const retry = p.getByText(/Retry/i).first();
    if (await retry.isVisible().catch(()=>false)) { await retry.click().catch(()=>{}); await sleep(4000); }
    body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
    afterRetry = /Oops|small error/i.test(body) ? 'STILL_OOPS' : 'RECOVERED:'+body.slice(0,80);
  }
  console.log(`[deeplink] ${label} (${route}): oops=${oops} | afterRetry=${afterRetry} | body="${body.slice(0,90)}"`);
  await c.close();
}

// In-app navigation test: load Home, then navigate to Reminders tab -> Statistics
async function inAppStats() {
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  await p.goto(`${BASE}/HomeMain`,{waitUntil:'domcontentloaded'});
  await sleep(5000);
  let homeBody=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  const homeOk = !/Oops/i.test(homeBody);
  // Navigate to Reminders tab
  const rem = p.getByText(/^Reminders$/i).first();
  if (await rem.isVisible().catch(()=>false)) { await rem.click().catch(()=>{}); await sleep(3000); }
  let remBody=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
  console.log(`[inapp] Home ok=${homeOk} | after Reminders tab: "${remBody.slice(0,120)}"`);
  await c.close();
}

for (let i=0;i<2;i++){
  console.log(`--- ROUND ${i+1} ---`);
  await probe('KickCounter','Kick');
  await probe('ContractionTimer','Contr');
  await probe('Statistics','Stats');
  await probe('weight','Weight');
  await probe('HomeMain','Home');
}
await inAppStats();
await b.close();
