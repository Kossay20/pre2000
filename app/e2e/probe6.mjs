// Fulfill the real wa-sqlite.wasm via route interception with correct MIME.
// If Oops disappears -> proves the wasm static-serve gap is the sole cause.
import { chromium } from 'playwright';
import fs from 'fs';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const WASM='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.wasm';
const wasmBuf = fs.readFileSync(WASM);
const route=process.argv[2]||'KickCounter';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
// Fulfill ANY *.wasm with real bytes + proper MIME
await c.route('**/*.wasm', r => r.fulfill({ status:200, contentType:'application/wasm', body: wasmBuf }));
const p=await c.newPage();
const reqs=[];
p.on('request', rq=>{ if(/\.wasm/i.test(rq.url())) reqs.push(rq.url()); });
await p.goto(`${BASE}/${route}`,{waitUntil:'domcontentloaded'});
await sleep(7000);
const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').trim();
console.log('=== ROUTE',route,'(wasm fulfilled) ===');
console.log('wasm requests intercepted:', JSON.stringify(reqs));
console.log('OOPS:', /Oops|small error/i.test(body));
console.log('BODY:', body.slice(0,160));
await b.close();
