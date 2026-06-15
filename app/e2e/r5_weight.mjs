import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IGNORE=[/DevTools/i,/AsyncStorage has been extracted/i,/Setting a timer/i,/tintColor/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/source ?map/i,/sourcemap/i,/React DevTools/i,/\[expo-/i,/preloaded using link preload/i,/firestore/i,/googleapis/i,/WebChannelConnection/i,/transport errored/i,/installations/i,/identitytoolkit/i,/securetoken/i,/CompileError/i,/WebAssembly/i,/ArrayBuffer instantiation/i,/DatabaseService/i,/DB Init Error/i,/asynchronously prepare wasm/i,/Aborted\(/i,/status of 4/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const errs=[],pageerrs=[];
const p=await c.newPage();
p.on('console',m=>{ if(m.type()==='error'){ const t=m.text(); if(keep(t)) errs.push(t.slice(0,260)); }});
p.on('pageerror',e=>{ const t=String(e&&e.message||e); if(keep(t)) pageerrs.push(t.slice(0,260)); });
const dialogs=[];
p.on('dialog',async d=>{ dialogs.push({type:d.type(),msg:d.message().replace(/\s+/g,' ').slice(0,180)}); try{await d.accept();}catch(e){} });
async function body(){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
const r={};

await p.goto(BASE,{waitUntil:'domcontentloaded'}); await sleep(500);
await p.evaluate(()=>{ Object.keys(localStorage).filter(k=>/weight/i.test(k)).forEach(k=>localStorage.removeItem(k)); });
await p.goto(`${BASE}/weight`,{waitUntil:'domcontentloaded'}); await sleep(4500);

// setup
let ins=p.locator('input');
if(await ins.count()>=2){
  await ins.nth(0).fill('65'); await ins.nth(1).fill('165');
  await p.getByText(/Save|Enregistrer/i).first().click({timeout:3000}).catch(()=>{});
  await sleep(2500);
}
r.afterSetup=(await body()).slice(0,160);

// open add form via substring
const addBtn=p.getByText(/Add today's weight|Ajouter mon poids|today's weight/i).first();
r.addBtnCount=await p.getByText(/today's weight|Ajouter mon poids/i).count();
await addBtn.click({timeout:4000}).catch(e=>r.addClickErr=String(e).slice(0,100));
await sleep(1200);
r.inputsAfterAdd=await p.locator('input').count();

// VALIDATION too-low (10kg)
await p.locator('input').first().fill('10').catch(()=>{});
await p.getByText(/^Save$|^Enregistrer$/i).first().click({timeout:3000}).catch(()=>{});
await sleep(1500);
r.dialogsAfterInvalid=dialogs.slice();
r.afterInvalid=(await body()).slice(0,200);
await p.screenshot({path:`${OUT}/wt2_invalid.png`});

// VALID 72.5
if(!(await p.locator('input').count())){ await p.getByText(/today's weight/i).first().click({timeout:3000}).catch(()=>{}); await sleep(800);}
await p.locator('input').first().fill('72.5').catch(()=>{});
await p.getByText(/^Save$|^Enregistrer$/i).first().click({timeout:3000}).catch(()=>{});
await sleep(2200);
r.dialogsAfterValid=dialogs.slice();
let t=await body(); r.has725=/72[.,]5/.test(t); r.afterValid=t.slice(0,260);
await p.screenshot({path:`${OUT}/wt2_valid.png`});
r.storage=await p.evaluate(()=>{ const o={}; Object.keys(localStorage).filter(k=>/weight/i.test(k)).forEach(k=>o[k]=localStorage.getItem(k)); return o; });

// REPLACE same-day: add 73 -> should prompt replace
dialogs.length=0;
if(!(await p.locator('input').count())){ await p.getByText(/today's weight/i).first().click({timeout:3000}).catch(()=>{}); await sleep(800);}
await p.locator('input').first().fill('73').catch(()=>{});
await p.getByText(/^Save$|^Enregistrer$/i).first().click({timeout:3000}).catch(()=>{});
await sleep(2200);
r.dialogsAfterReplace=dialogs.slice();
t=await body(); r.has73=/(^|\D)73(\D|$)/.test(t); r.afterReplace=t.slice(0,260);
r.storageAfterReplace=await p.evaluate(()=>{ const o={}; Object.keys(localStorage).filter(k=>/weight/i.test(k)).forEach(k=>o[k]=localStorage.getItem(k)); return o; });
await p.screenshot({path:`${OUT}/wt2_replace.png`});

// PERSIST reload
await p.reload({waitUntil:'domcontentloaded'}); await sleep(4500);
t=await body(); r.persistAfterReload=/(^|\D)73(\D|$)|72[.,]5/.test(t); r.afterReload=t.slice(0,260);
await p.screenshot({path:`${OUT}/wt2_reload.png`});

r.errs=errs; r.pageerrs=pageerrs;
console.log(JSON.stringify(r,null,2));
await b.close();
