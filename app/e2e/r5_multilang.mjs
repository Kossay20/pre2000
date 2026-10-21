import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
async function run(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  p.on('dialog',d=>d.accept());
  await p.goto(BASE);
  await p.evaluate(l=>localStorage.setItem('app_locale',l),locale);
  const res={locale};
  // ---- tabs sweep: visit each tab, grab tab bar labels + check raw-key leak in body ----
  const tabs=['home','calendar','reminders','resources'];
  res.screens={};
  for(const path of tabs){
    await p.goto(`${BASE}/${path}`,{waitUntil:'domcontentloaded'}); await sleep(4000);
    const body=(await p.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').trim();
    // raw i18n key heuristic: dotted.lower.camel tokens, or [missing, or {{var}}
    const rawKeys=(body.match(/\b[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){1,}\b/g)||[]).filter(k=>!/\.(com|app|org|net|0|00|5L|0L)\b/.test(k)).slice(0,8);
    const mustache=(body.match(/\{\{[^}]+\}\}/g)||[]).slice(0,5);
    const missing=/\[missing|translation missing|missingKey/i.test(body);
    // tab bar labels
    const tabLabels=await p.evaluate(()=>{
      return [...document.querySelectorAll('[role="tab"]')].map(t=>{
        const sel=t.getAttribute('aria-selected');
        const txt=[...t.querySelectorAll('div,span')].filter(e=>e.children.length===0&&(e.innerText||'').trim().length>0&&parseFloat(getComputedStyle(e).fontSize)<14).map(e=>(e.innerText||'').trim());
        return {sel,labels:txt};
      }).filter(x=>x.labels.length);
    });
    // RTL check
    const dir=await p.evaluate(()=>document.documentElement.dir||document.body.dir||getComputedStyle(document.body).direction);
    res.screens[path]={rawKeys,mustache,missing,tabLabels,dir,snip:body.slice(0,120)};
    if(path==='home') await p.screenshot({path:`${OUT}/home_${locale}.png`});
  }
  await c.close();
  return res;
}
const out=[];
for(const loc of ['en','fr','ar','tn']){ out.push(await run(loc)); }
console.log(JSON.stringify(out,null,2));
await b.close();
