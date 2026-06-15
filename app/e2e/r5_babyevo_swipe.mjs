import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844},hasTouch:true});
const p=await c.newPage();
p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
await p.goto(BASE); await p.evaluate(()=>localStorage.setItem('app_locale','ar'));
await p.goto(`${BASE}/baby-evolution`,{waitUntil:'domcontentloaded'}); await sleep(4500);
const label=async()=>{ const t=await p.evaluate(()=>document.body.innerText); const m=t.match(/(الشهر)\s*(-?\d+)\s*\/\s*9/); return m?m[2]:'?'; };
console.log('AR initial month label:', await label());
// realistic incremental scrolls (one card width ~406px) in BOTH directions via wheel
const results=[];
for(let i=0;i<10;i++){
  await p.mouse.move(195,420);
  await p.mouse.wheel(-200,0); // wheel left
  await sleep(700);
  results.push(await label());
}
console.log('AR after 10 wheel-left steps, month labels seen:', results.join(', '));
// any negative?
console.log('NEGATIVE month label observed:', results.some(x=>parseInt(x)<1));
await p.screenshot({path:`${OUT}/babyevo_swipe_ar.png`});
await b.close();
