import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
import fs from 'fs';
try{fs.mkdirSync(OUT,{recursive:true});}catch{}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IGNORE=[/DevTools/i,/AsyncStorage/i,/Setting a timer/i,/tintColor/i,/insufficient permissions/i,/\.wasm/i,/MIME type/i,/wasm/i,/source ?map/i,/React DevTools/i,/Missing or insufficient/i,/firestore/i,/googleapis/i,/installations/i,/Aborted\(/i,/extracted/i];
const keep=t=>t&&!IGNORE.some(r=>r.test(t));

// luminance + contrast helpers, parse rgb/rgba
function parseColor(c){
  if(!c) return null;
  const m=c.match(/rgba?\(([^)]+)\)/);
  if(!m) return null;
  const p=m[1].split(',').map(s=>parseFloat(s.trim()));
  return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};
}
function lum({r,g,b}){
  const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
}
function comp(fg,bg){ // composite fg(with alpha) over bg(opaque)
  const a=fg.a;
  return {r:fg.r*a+bg.r*(1-a), g:fg.g*a+bg.g*(1-a), b:fg.b*a+bg.b*(1-a), a:1};
}
function ratio(L1,L2){const hi=Math.max(L1,L2),lo=Math.min(L1,L2);return (hi+0.05)/(lo+0.05);}

const b=await chromium.launch();
async function ctx(locale){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const errs=[],perr=[];
  const p=await c.newPage();
  p.on('console',m=>{ if(m.type()==='error'){const t=m.text(); if(keep(t)) errs.push(t.slice(0,200));}});
  p.on('pageerror',e=>{const t=String(e&&e.message||e); if(keep(t)) perr.push(t.slice(0,200));});
  p.on('dialog',d=>d.accept());
  await p.goto(BASE);
  if(locale) await p.evaluate(l=>localStorage.setItem('app_locale',l),locale);
  return {c,p,errs,perr};
}
// In-page: for an element, walk up to find effective bg, composite text color, return ratio + font info
const MEASURE = `(el)=>{
  function parse(c){ if(!c)return null; const m=c.match(/rgba?\\(([^)]+)\\)/); if(!m)return null; const p=m[1].split(',').map(s=>parseFloat(s.trim())); return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]}; }
  function effBg(node){
    let cur=node;
    while(cur){
      const cs=getComputedStyle(cur);
      const bg=parse(cs.backgroundColor);
      if(bg && bg.a>0.01) return bg;
      cur=cur.parentElement;
    }
    return {r:255,g:255,b:255,a:1};
  }
  const cs=getComputedStyle(el);
  const fg=parse(cs.color)||{r:0,g:0,b:0,a:1};
  const bg=effBg(el.parentElement||el);
  return {color:cs.color, bgFound:'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')', fontSize:cs.fontSize, fontWeight:cs.fontWeight, text:(el.innerText||el.textContent||'').slice(0,40)};
}`;

function evalContrast(meas){
  const fg=parseColor(meas.color); const bg=parseColor(meas.bgFound);
  if(!fg||!bg) return null;
  const eff = fg.a<1 ? comp(fg,bg) : fg;
  const r=ratio(lum(eff),lum(bg));
  const fs=parseFloat(meas.fontSize); const fw=parseInt(meas.fontWeight)||400;
  const isBold=fw>=700;
  const large = fs>=24 || (fs>=18.66 && isBold);
  const threshold = large?3.0:4.5;
  return {ratio:+r.toFixed(2), fontSize:fs, fontWeight:fw, large, threshold, pass:r>=threshold, color:meas.color, bg:meas.bgFound, text:meas.text};
}

const results=[];
async function measureFirst(p,selectorFn,label){
  const meas = await p.evaluate(({fnBody,measBody})=>{
    const finder = eval('('+fnBody+')');
    const el = finder();
    if(!el) return {__missing:true};
    const measure = eval('('+measBody+')');
    return measure(el);
  },{fnBody:selectorFn.toString(), measBody:MEASURE});
  if(meas.__missing){ results.push({label, missing:true}); return null; }
  const c=evalContrast(meas);
  results.push({label, ...c});
  return c;
}

// ---------- AUTH CHOICE: 'Sign in' secondary button text ----------
{
  const {c,p,errs,perr}=await ctx('en');
  await p.goto(`${BASE}/auth`,{waitUntil:'domcontentloaded'}); await sleep(4000);
  await p.screenshot({path:`${OUT}/auth.png`});
  await measureFirst(p, ()=>{
    const all=[...document.querySelectorAll('div,span')];
    return all.find(e=>/^(Sign in|Se connecter|تسجيل الدخول)$/.test((e.innerText||'').trim()) && e.children.length===0);
  }, 'AuthChoice: Sign in text');
  results.push({label:'AuthChoice errs', errs, perr});
  await c.close();
}

// ---------- BOTTOM TABS: active label ----------
{
  const {c,p,errs,perr}=await ctx('en');
  await p.goto(`${BASE}/home`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  await p.screenshot({path:`${OUT}/home.png`});
  // Active tab label: find the tab button that is selected, get its text node color
  await measureFirst(p, ()=>{
    // RNWeb bottom tab: role=tab, aria-selected
    const tabs=[...document.querySelectorAll('[role="tab"]')];
    const active=tabs.find(t=>t.getAttribute('aria-selected')==='true')||tabs[0];
    if(!active) return null;
    // find the text element inside
    const txt=[...active.querySelectorAll('div,span')].find(e=>e.children.length===0 && (e.innerText||'').trim().length>0);
    return txt||active;
  }, 'BottomTab: active label (Home)');
  // section headers + card values on Home
  await measureFirst(p, ()=>{
    const all=[...document.querySelectorAll('div,span')];
    return all.find(e=>e.children.length===0 && /Semaine|Week|أسبوع/i.test((e.innerText||'')) && (e.innerText||'').length<40);
  }, 'Home: week/section header sample');
  results.push({label:'Home body snippet', snip:(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,160)});
  results.push({label:'Home errs', errs, perr});
  await c.close();
}

// ---------- RESOURCES: active tab label ----------
{
  const {c,p,errs,perr}=await ctx('en');
  await p.goto(`${BASE}/resources`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  await p.screenshot({path:`${OUT}/resources.png`});
  await measureFirst(p, ()=>{
    const tabs=[...document.querySelectorAll('[role="tab"]')];
    const active=tabs.find(t=>t.getAttribute('aria-selected')==='true')||tabs[0];
    if(!active) return null;
    const txt=[...active.querySelectorAll('div,span')].find(e=>e.children.length===0 && (e.innerText||'').trim().length>0);
    return txt||active;
  }, 'Resources: active tab label');
  results.push({label:'Resources errs', errs, perr});
  await c.close();
}

// ---------- KICK COUNTER: bigCount ----------
{
  const {c,p,errs,perr}=await ctx('en');
  await p.goto(`${BASE}/kick-counter`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  await p.screenshot({path:`${OUT}/kick.png`});
  await measureFirst(p, ()=>{
    const all=[...document.querySelectorAll('div,span')];
    // bigCount fontSize 72 → very large number
    return all.filter(e=>e.children.length===0 && /^\d+$/.test((e.innerText||'').trim()))
      .sort((a,b)=>parseFloat(getComputedStyle(b).fontSize)-parseFloat(getComputedStyle(a).fontSize))[0];
  }, 'KickCounter: bigCount value');
  results.push({label:'Kick errs', errs, perr});
  await c.close();
}

// ---------- CONTRACTION TIMER: statValue ----------
{
  const {c,p,errs,perr}=await ctx('en');
  await p.goto(`${BASE}/contraction-timer`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  await p.screenshot({path:`${OUT}/contraction.png`});
  await measureFirst(p, ()=>{
    const all=[...document.querySelectorAll('div,span')];
    // statValue h2 ~22px accent; pick accent-colored numeric/short
    return all.filter(e=>e.children.length===0 && (e.innerText||'').trim().length>0 && (e.innerText||'').trim().length<8)
      .find(e=>{const c=getComputedStyle(e).color; return /194|184/.test(c)||/c2185b/i.test(c) || /rgb\(194/.test(c);}) || all.find(e=>e.children.length===0 && /\d/.test(e.innerText||''));
  }, 'ContractionTimer: stat value');
  results.push({label:'Contraction errs', errs, perr});
  await c.close();
}

// ---------- RAMADAN: statValue ----------
{
  const {c,p,errs,perr}=await ctx('en');
  await p.goto(`${BASE}/ramadan`,{waitUntil:'domcontentloaded'}); await sleep(4500);
  await p.screenshot({path:`${OUT}/ramadan.png`});
  await measureFirst(p, ()=>{
    const all=[...document.querySelectorAll('div,span')];
    return all.filter(e=>e.children.length===0 && /^\d+$/.test((e.innerText||'').trim()))
      .find(e=>{const c=getComputedStyle(e).color; return /rgb\(194/.test(c)||/c2185b/i.test(c);}) ||
      all.find(e=>e.children.length===0 && /^\d+$/.test((e.innerText||'').trim()));
  }, 'Ramadan: stat value');
  results.push({label:'Ramadan errs', errs, perr});
  await c.close();
}

// ---------- REMINDERS / HYDRATION CARD: unit + (open modal) hint ----------
{
  const {c,p,errs,perr}=await ctx('en');
  await p.goto(`${BASE}/reminders`,{waitUntil:'domcontentloaded'}); await sleep(5500);
  await p.screenshot({path:`${OUT}/reminders.png`});
  // hydration title (deepPink), unit (pinkAccent), amountLarge (accent)
  await measureFirst(p, ()=>{
    const all=[...document.querySelectorAll('div,span')];
    // unit text like 'ml' or 'L' small, pinkAccent
    return all.find(e=>e.children.length===0 && /^(ml|L|مل|ل)$/i.test((e.innerText||'').trim()));
  }, 'Hydration: unit text');
  await measureFirst(p, ()=>{
    const all=[...document.querySelectorAll('div,span')];
    return all.filter(e=>e.children.length===0 && parseFloat(getComputedStyle(e).fontSize)>=28)
      .find(e=>{const c=getComputedStyle(e).color; return /rgb\(194/.test(c)||/c2185b/i.test(c);});
  }, 'Hydration: amountLarge value');
  results.push({label:'Reminders body snippet', snip:(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,200)});
  results.push({label:'Reminders errs', errs, perr});
  await c.close();
}

console.log(JSON.stringify(results,null,2));
await b.close();
