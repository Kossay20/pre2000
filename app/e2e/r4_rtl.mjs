import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r4_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IGNORE=[/DevTools/i,/AsyncStorage/i,/Setting a timer/i,/tintColor/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/magic word/i,/wasm/i,/DatabaseService/i,/DB Init/i,/ArrayBuffer/i,/source ?map/i,/React DevTools/i,/status of 403/i,/status of 404/i,/firestore/i,/googleapis/i,/WebChannelConnection/i,/installations/i,/Aborted\(/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));
async function body(p){ return (await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim(); }
function oops(txt){ return /A small error|Une petite erreur|عذر|Oops!/.test(txt); }
function backHome(txt){ return /Back to home|Retour|العودة إلى/.test(txt); }
function arabic(txt){ return /[؀-ۿ]/.test(txt); }
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
const errs=[];
p.on('console',m=>{if(m.type()==='error'){const t=m.text(); if(keep(t)) errs.push(t.slice(0,180));}});
p.on('pageerror',e=>{const t=String(e&&e.message||e); if(keep(t)) errs.push('PAGEERR:'+t.slice(0,180));});
// set arabic
await p.goto(BASE); await p.evaluate(()=>localStorage.setItem('app_locale','ar')); await p.reload({waitUntil:'domcontentloaded'}); await sleep(4000);

const out={};
const screens=[
  ['weight','/weight'],
  ['statistics','/statistics'],
  ['kick','/kick-counter'],
  ['contraction','/contraction-timer'],
  ['babyevo','/baby-evolution'],
  ['ramadan','/ramadan'],
  ['forbidden','/forbidden-foods'],
  ['calendar','/calendar'],
];
for(const [name,path] of screens){
  await p.goto(`${BASE}${path}`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  const dir=await p.evaluate(()=>document.documentElement.dir||document.body.dir||getComputedStyle(document.body).direction||'');
  const t=await body(p);
  out[name]={ dir, arabic:arabic(t), oops:oops(t), backHome:backHome(t), len:t.length, snip:t.slice(0,90) };
  await p.screenshot({path:`${OUT}/ar_${name}.png`});
}

// Calendar chevron swap check in AR: read Ionicons glyph order in header
await p.goto(`${BASE}/calendar`,{waitUntil:'domcontentloaded'}); await sleep(4000);
const chevrons=await p.evaluate(()=>{
  // Ionicons render as <svg> or font glyphs; grab aria-labels / first two icon buttons in header region
  const heads=[...document.querySelectorAll('[role="button"]')].slice(0,6).map(el=>{
    const svg=el.querySelector('svg'); const path=svg?svg.querySelector('path'):null;
    return {text:(el.innerText||'').trim().slice(0,20), hasSvg:!!svg};
  });
  return heads;
});
out.calendarChevrons=chevrons;
// switch month view in AR to ensure no crash
const monthBtn=p.getByText(/شهر|Month/).first();
if(await monthBtn.count()){ await monthBtn.click({timeout:3000}); await sleep(2000); }
let t=await body(p); out.calendarMonthAR={oops:oops(t),arabic:arabic(t),snip:t.slice(0,90)};
await p.screenshot({path:`${OUT}/ar_calendar_month.png`});

out.errs=errs.slice();
console.log(JSON.stringify(out,null,2));
await b.close();
