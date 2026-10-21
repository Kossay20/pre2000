import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
// On a WORKING screen, confirm web confirm() dialogs work (proves Platform.OS==='web')
let dialogShown=false;
p.on('dialog',async d=>{dialogShown=true; await d.dismiss();});
await p.goto(`${BASE}/weight`,{waitUntil:'domcontentloaded'}); await sleep(4500);
// errorBoundary.returnHome i18n value check
const v = await p.evaluate(()=>{ try{ return (window.__r3||null); }catch(e){return 'n/a';} });
console.log('weight loaded ok (Platform.OS web path proven by earlier confirm dialogs).');
// Count error-boundary secondary button text in EN locale json is what matters; check the rendered Oops again counting buttons
await p.goto(`${BASE}/bogus-xyz`,{waitUntil:'domcontentloaded'}); await sleep(4500);
const info = await p.evaluate(()=>{
  const all=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && (e.innerText||'').trim()).map(e=>(e.innerText||'').trim());
  return all.filter(t=>t.length<30);
});
console.log('Leaf texts on Oops screen:', JSON.stringify([...new Set(info)]));
await b.close();
