import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
async function ctx(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  p.on('dialog',d=>d.accept());
  await p.goto(BASE);
  if(locale) await p.evaluate(l=>localStorage.setItem('app_locale',l),locale);
  return {c,p};
}
const out={};

// ---- AUTH: dump all leaf text nodes with their colors to locate Sign in ----
{
  const {c,p}=await ctx('en');
  await p.goto(`${BASE}/auth`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  await p.screenshot({path:`${OUT}/auth2.png`,fullPage:true});
  out.authLeaves = await p.evaluate(()=>{
    const all=[...document.querySelectorAll('div,span,p,a,button')];
    return all.filter(e=>e.children.length===0 && (e.innerText||'').trim().length>0 && (e.innerText||'').trim().length<40)
      .map(e=>{const cs=getComputedStyle(e);return {t:(e.innerText||'').trim().slice(0,30),color:cs.color,fs:cs.fontSize,fw:cs.fontWeight};});
  });
  await c.close();
}

// ---- RESOURCES: dump role=tab states + their text colors ----
{
  const {c,p}=await ctx('en');
  await p.goto(`${BASE}/resources`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  await p.screenshot({path:`${OUT}/resources2.png`});
  out.resourceTabs = await p.evaluate(()=>{
    const tabs=[...document.querySelectorAll('[role="tab"]')];
    return tabs.map(t=>{
      const sel=t.getAttribute('aria-selected');
      const txt=[...t.querySelectorAll('div,span')].find(e=>e.children.length===0 && (e.innerText||'').trim().length>0)||t;
      const cs=getComputedStyle(txt);
      return {sel, text:(txt.innerText||'').trim().slice(0,20), color:cs.color, fs:cs.fontSize, fw:cs.fontWeight};
    });
  });
  await c.close();
}

// ---- BOTTOM TABS: dump all role=tab + colors (active vs inactive) ----
{
  const {c,p}=await ctx('en');
  await p.goto(`${BASE}/home`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  out.bottomTabs = await p.evaluate(()=>{
    const tabs=[...document.querySelectorAll('[role="tab"]')];
    return tabs.map(t=>{
      const sel=t.getAttribute('aria-selected');
      const txt=[...t.querySelectorAll('div,span')].filter(e=>e.children.length===0 && (e.innerText||'').trim().length>0)
        .map(e=>{const cs=getComputedStyle(e);return {tx:(e.innerText||'').trim().slice(0,16),color:cs.color,fs:cs.fontSize};});
      return {sel, labels:txt};
    });
  });
  await c.close();
}

// ---- KICK: 72px bigCount specifically ----
{
  const {c,p}=await ctx('en');
  await p.goto(`${BASE}/kick-counter`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  out.kickBig = await p.evaluate(()=>{
    const all=[...document.querySelectorAll('div,span')].filter(e=>e.children.length===0 && (e.innerText||'').trim().length>0);
    const big = all.map(e=>({e,fs:parseFloat(getComputedStyle(e).fontSize)})).sort((a,b)=>b.fs-a.fs).slice(0,4);
    return big.map(({e,fs})=>{const cs=getComputedStyle(e);return {t:(e.innerText||'').trim().slice(0,12),color:cs.color,fs:cs.fontSize,fw:cs.fontWeight};});
  });
  await c.close();
}

// ---- HYDRATION unit: re-measure with full parent bg chain ----
{
  const {c,p}=await ctx('en');
  await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(5500);
  out.hydration = await p.evaluate(()=>{
    function parse(c){const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(s=>parseFloat(s.trim()));return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};}
    function chain(node){const arr=[];let cur=node;let depth=0;while(cur&&depth<12){const cs=getComputedStyle(cur);arr.push(cs.backgroundColor);cur=cur.parentElement;depth++;}return arr;}
    const all=[...document.querySelectorAll('div,span')].filter(e=>e.children.length===0);
    const unit=all.find(e=>/^(ml|L|مل|ل)$/i.test((e.innerText||'').trim()));
    if(!unit) return {missing:true};
    const cs=getComputedStyle(unit);
    return {text:(unit.innerText||'').trim(), color:cs.color, fs:cs.fontSize, fw:cs.fontWeight, bgChain:chain(unit.parentElement)};
  });
  // also dump nearby pink leaves on reminders
  out.remindersPink = await p.evaluate(()=>{
    const all=[...document.querySelectorAll('div,span')].filter(e=>e.children.length===0 && (e.innerText||'').trim().length>0 && (e.innerText||'').trim().length<30);
    return all.map(e=>{const cs=getComputedStyle(e);return {t:(e.innerText||'').trim().slice(0,24),color:cs.color,fs:cs.fontSize,fw:cs.fontWeight};})
      .filter(o=>/233, 30, 99|244, 143, 177|136, 14, 79|255, 107|255, 143/.test(o.color));
  });
  await c.close();
}

console.log(JSON.stringify(out,null,2));
await b.close();
