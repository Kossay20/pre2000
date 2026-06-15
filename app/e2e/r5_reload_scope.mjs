import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const BENIGN=/wasm|WebAssembly|CompileError|ArrayBuffer|DatabaseService|DB Init|Aborted\(|firestore|googleapis|insufficient permissions|DevTools|AsyncStorage has been|Setting a timer|tintColor|preloaded|status of 4|installations|identitytoolkit|securetoken|Minified React error/i;
async function freshPage(){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const cons=[],perr=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error') cons.push(m.text().slice(0,500)); });
  p.on('pageerror',e=>{ perr.push(String(e&&e.stack||e&&e.message||e).slice(0,700)); });
  p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
  return {c,p,cons,perr};
}
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function oops(t){ return /Oops!|A small error occurred/.test(t); }

const routes=['reminders','calendar','weight','statistics','kick-counter','contraction-timer','baby-evolution','health'];
const out={};
for(const route of routes){
  const {c,p,cons,perr}=await freshPage();
  await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  const firstOops=oops(await body(p));
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(5000);
  const t=await body(p);
  const reloadOops=oops(t);
  out[route]={firstOops, reloadOops, snip: reloadOops? t.slice(0,90):'(ok)',
    realPerr: perr.filter(x=>!BENIGN.test(x)).slice(0,2),
    // include even minified react errors text (they carry the # code)
    reactErr: cons.filter(x=>/React error|Cannot read|undefined is not|is not a function|Maximum update|Rendered (more|fewer)/i.test(x)).slice(0,3),
  };
  if(reloadOops) await p.screenshot({path:`${OUT}/reload_${route}.png`});
  await c.close();
}
console.log(JSON.stringify(out,null,2));
await b.close();
