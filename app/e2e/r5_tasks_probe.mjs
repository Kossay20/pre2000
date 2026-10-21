import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
async function freshPage(){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const allConsole=[],pageerrs=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){ allConsole.push(m.text().slice(0,400)); }});
  p.on('pageerror',e=>{ pageerrs.push(String(e&&e.stack||e&&e.message||e).slice(0,600)); });
  p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
  return {c,p,allConsole,pageerrs};
}
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function oops(t){ return /Oops!|A small error occurred/.test(t); }

const results={};

// TEST A: fresh load /reminders, then click Tasks tab (clean, no toggles)
{
  const {c,p,allConsole,pageerrs}=await freshPage();
  await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(5500);
  let t=await body(p);
  const a={remindersLoaded:!oops(t), remindersSnip:t.slice(0,120)};
  // click Tasks tab (text)
  const tasksClicked=await p.getByText(/^Tasks$/i).first().click({timeout:4000}).then(()=>true).catch(e=>String(e).slice(0,80));
  a.tasksClicked=tasksClicked;
  await sleep(3500);
  t=await body(p);
  a.tasksOops=oops(t); a.tasksSnip=t.slice(0,220);
  await p.screenshot({path:`${OUT}/probe_tasksA.png`});
  // capture the relevant (non-benign) errors
  const BENIGN=/wasm|WebAssembly|CompileError|ArrayBuffer|DatabaseService|DB Init|Aborted\(|firestore|googleapis|insufficient permissions|DevTools|AsyncStorage has been|Setting a timer|tintColor|preloaded|status of 4|installations|identitytoolkit|securetoken/i;
  a.realConsole=allConsole.filter(x=>!BENIGN.test(x));
  a.realPageErrs=pageerrs.filter(x=>!BENIGN.test(x));
  results.testA_tasksTab=a;
  await c.close();
}

// TEST B: fresh load /reminders then reload (no interaction)
{
  const {c,p,allConsole,pageerrs}=await freshPage();
  await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(5500);
  let t=await body(p);
  const a={firstLoadOops:oops(t)};
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(5500);
  t=await body(p);
  a.afterReloadOops=oops(t); a.snip=t.slice(0,220);
  await p.screenshot({path:`${OUT}/probe_reloadB.png`});
  const BENIGN=/wasm|WebAssembly|CompileError|ArrayBuffer|DatabaseService|DB Init|Aborted\(|firestore|googleapis|insufficient permissions|DevTools|AsyncStorage has been|Setting a timer|tintColor|preloaded|status of 4|installations|identitytoolkit|securetoken/i;
  a.realConsole=allConsole.filter(x=>!BENIGN.test(x));
  a.realPageErrs=pageerrs.filter(x=>!BENIGN.test(x));
  results.testB_reload=a;
  await c.close();
}

// TEST C: direct deep-link is not available for Tasks (it's a top tab). But Statistics deep-link from Tasks. Try /statistics directly.
{
  const {c,p,allConsole,pageerrs}=await freshPage();
  await p.goto(`${BASE}/statistics`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  let t=await body(p);
  const a={statsOops:oops(t), statsSnip:t.slice(0,200)};
  await p.screenshot({path:`${OUT}/probe_statsC.png`});
  const BENIGN=/wasm|WebAssembly|CompileError|ArrayBuffer|DatabaseService|DB Init|Aborted\(|firestore|googleapis|insufficient permissions|DevTools|AsyncStorage has been|Setting a timer|tintColor|preloaded|status of 4|installations|identitytoolkit|securetoken/i;
  a.realConsole=allConsole.filter(x=>!BENIGN.test(x));
  a.realPageErrs=pageerrs.filter(x=>!BENIGN.test(x));
  results.testC_statistics=a;
  await c.close();
}

console.log(JSON.stringify(results,null,2));
await b.close();
