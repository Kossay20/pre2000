import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const allerr=[];
const p=await c.newPage();
const BENIGN=/wasm|WebAssembly|CompileError|ArrayBuffer|DatabaseService|DB Init|Aborted\(|firestore|googleapis|insufficient permissions|DevTools|AsyncStorage has been|Setting a timer|tintColor|preloaded|status of 4|installations|identitytoolkit|securetoken/i;
p.on('console',m=>{ if(m.type()==='error'){const x=m.text(); if(!BENIGN.test(x)) allerr.push('[con] '+x.slice(0,200));}});
p.on('pageerror',e=>{ const x=String(e&&e.message||e); if(!BENIGN.test(x)) allerr.push('[pageerr] '+x.slice(0,200));});
p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
await p.goto(`${BASE}/appointment/add`,{waitUntil:'domcontentloaded'}); await sleep(4000);
const urlBefore=p.url();
await p.locator('input').first().fill('Echo 22 SA',{timeout:3000}).catch(()=>{});
await p.getByRole('button',{name:/^Save$|Save changes/i}).first().click({timeout:3000}).catch(()=>{});
await sleep(3000);
const urlAfter=p.url();
const route=await p.evaluate(()=>document.title);
console.log('URL before:', urlBefore);
console.log('URL after accept:', urlAfter);
console.log('doc.title after:', route);
console.log('URL changed:', urlBefore!==urlAfter);
console.log('non-benign errors:', JSON.stringify(allerr));
// Also test the calendar guest DELETE path (uses getParent().navigate('AuthChoice'))
// Need a user event to delete - guests have none loaded, so delete path is unreachable for guest anyway.
await b.close();
