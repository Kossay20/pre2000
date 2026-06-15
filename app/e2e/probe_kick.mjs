import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
const errs=[];
p.on('console',m=>{if(m.type()==='error'){const t=m.text(); if(!/wasm|magic word|Aborted|DatabaseService|DB Init|403|404|firestore|insufficient|ArrayBuffer|tintColor|Setting a timer|DevTools|AsyncStorage/i.test(t)) errs.push(t.slice(0,160));}});
p.on('pageerror',e=>errs.push('PAGEERR:'+String(e.message).slice(0,160)));
await p.goto(`${BASE}/kick-counter`,{waitUntil:'domcontentloaded'}); await sleep(4000);
// dump all clickable text nodes
const btns=await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('[role="button"],button,[tabindex],div[onclick]').forEach(el=>{
    const t=(el.innerText||'').replace(/\s+/g,' ').trim();
    if(t&&t.length<60) out.push({tag:el.tagName,role:el.getAttribute('role'),text:t});
  });
  return out.slice(0,40);
});
console.log('BUTTONS:',JSON.stringify(btns,null,1));
// try clicking the start session by role
const start=p.getByRole('button',{name:/start|démarrer|commencer/i}).first();
const sc=await start.count();
console.log('start role count',sc);
let beforeTotal=await p.evaluate(()=>{const m=document.body.innerText.match(/Kicks today[\s\S]{0,20}?(\d+)/i)||document.body.innerText.match(/(\d+)\s*$/);return document.body.innerText.replace(/\s+/g,' ');});
if(sc){ await start.click(); await sleep(2500); }
let mid=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
console.log('AFTER START active?', /Tap to count|elapsed|Elapsed|last hour/i.test(mid), 'oops?', /Oops|Back to home/i.test(mid));
// tap to count
const tap=p.getByRole('button',{name:/tap to count|appuyez/i}).first();
const tc=await tap.count(); console.log('tap count',tc);
if(tc){ for(let i=0;i<3;i++){ await tap.click({timeout:1500}); await sleep(500);} }
let after=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
const bigNum=after.match(/(\d+)\s*Kicks in the last hour|(\d+)\s*kicks/i);
console.log('AFTER TAPS snip:', after.slice(0,180));
console.log('counts present:', after.match(/\b[1-9]\b/g)?.slice(0,8));
// end session
const end=p.getByRole('button',{name:/end session|terminer|end/i}).first();
if(await end.count()){ p.once('dialog',d=>d.accept()); await end.click(); await sleep(1500); }
let fin=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
console.log('AFTER END oops?', /Oops|Back to home/i.test(fin), 'snip', fin.slice(0,120));
console.log('ERRS', JSON.stringify(errs));
await b.close();
