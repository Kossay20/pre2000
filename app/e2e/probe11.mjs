import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
await p.goto(`${BASE}/KickCounter`,{waitUntil:'domcontentloaded'}); await sleep(5000);
// list all visible button-ish texts
const texts=await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('div,span,a,button').forEach(e=>{ const tx=(e.innerText||'').trim(); if(tx && tx.length<40 && /retry|home|accueil|retour|oops/i.test(tx)) out.push(tx); });
  return [...new Set(out)];
});
console.log('button-ish texts on Oops:', JSON.stringify(texts));
// click "Return home"/"Retour à l'accueil"/"Home" secondary
const rh = p.getByText(/Return home|Retour à l'accueil|Accueil/i).first();
const found = await rh.isVisible().catch(()=>false);
console.log('Return-home button visible:', found);
if(found){ await rh.click().catch(()=>{}); await sleep(4000); }
const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
const url=p.url();
console.log('after return-home: url=',url,'oops=',/Oops/i.test(body),'snip=',body.slice(0,60));
await b.close();
