import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
await p.goto(`${BASE}/recommendations`,{waitUntil:'domcontentloaded'}); await sleep(6000);
let body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('recommendations (guest): oops=',/Oops/i.test(body),'| spinner?',/Loading/i.test(body),'| snip=',body.slice(0,90));
// confirm no infinite spinner: re-check after extra wait
await sleep(3000);
body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('after +3s: still spinner?',/Loading/i.test(body),'| snip=',body.slice(0,90));
await b.close();
