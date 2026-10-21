import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
async function run(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  p.on('dialog',async d=>{ try{await d.accept();}catch(e){} });
  if(locale){ await p.goto(BASE); await p.evaluate(l=>localStorage.setItem('app_locale',l),locale); }
  await p.goto(`${BASE}/baby-evolution`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  const label=async()=>{ const t=await p.evaluate(()=>document.body.innerText); const m=t.match(/(Month|الشهر)\s*(-?\d+)\s*\/\s*9/); return m?m[0]:'(no label)'; };
  const out={locale, initial:await label()};
  // find the horizontal scroller (the ScrollView). On web it's a div that scrolls horizontally.
  const sc=await p.evaluate(()=>{
    const divs=[...document.querySelectorAll('div')];
    const h=divs.find(d=>d.scrollWidth>d.clientWidth+50 && d.clientWidth>200);
    if(!h) return null;
    return {sw:h.scrollWidth, cw:h.clientWidth, sl:h.scrollLeft};
  });
  out.scroller=sc;
  // Scroll far left (toward negative direction in RTL where content starts at right)
  out.scrolls=[];
  for(const target of [0, -99999, 99999, 99999, 99999]){
    await p.evaluate((tgt)=>{
      const divs=[...document.querySelectorAll('div')];
      const h=divs.find(d=>d.scrollWidth>d.clientWidth+50 && d.clientWidth>200);
      if(h){ h.scrollLeft = tgt; h.dispatchEvent(new Event('scroll',{bubbles:true})); }
    }, target);
    await sleep(900);
    out.scrolls.push({target, label:await label()});
  }
  await p.screenshot({path:`${OUT}/babyevo_scroll_${locale}.png`});
  await c.close();
  return out;
}
console.log(JSON.stringify(await run('en'),null,2));
console.log(JSON.stringify(await run('ar'),null,2));
await b.close();
