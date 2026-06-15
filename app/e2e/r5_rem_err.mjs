import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const all=[];
const p=await c.newPage();
p.on('console',m=>{ all.push({t:m.type(),x:m.text().slice(0,600)}); });
p.on('pageerror',e=>{ all.push({t:'PAGEERROR',x:String(e&&e.stack||e&&e.message||e).slice(0,900)}); });
p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });

await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(5500);
console.log('FIRST LOAD OK?', !/Oops!/.test(await p.evaluate(()=>document.body.innerText)));
all.length=0; // clear first-load noise
await p.reload({waitUntil:'domcontentloaded'}); await sleep(5500);
const t=await p.evaluate(()=>document.body.innerText);
console.log('RELOAD OOPS?', /Oops!/.test(t));
// print errors that look meaningful (drop pure wasm/db noise but KEEP react errors)
const NOISE=/wasm|WebAssembly|CompileError|ArrayBuffer instantiation|DatabaseService|DB Init|Aborted\(|firestore|googleapis|insufficient permissions|Download the React DevTools|AsyncStorage has been extracted|Setting a timer|tintColor|preloaded using link preload|status of 4|installations|identitytoolkit|securetoken/i;
const meaningful=all.filter(e=>!NOISE.test(e.x));
console.log('=== MEANINGFUL EVENTS ('+meaningful.length+') ===');
for(const e of meaningful) console.log(`[${e.t}] ${e.x}\n`);
await b.close();
