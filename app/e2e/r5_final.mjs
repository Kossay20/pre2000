import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
function helpers(){
  // returns a function string to inject
}
const INJECT = `
  function parse(c){const m=c&&c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const x=m[1].split(',').map(s=>parseFloat(s.trim()));return {r:x[0],g:x[1],b:x[2],a:x[3]===undefined?1:x[3]};}
  function lum(o){const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};return 0.2126*f(o.r)+0.7152*f(o.g)+0.0722*f(o.b);}
  function comp(fg,bg){const a=fg.a;return {r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a),a:1};}
  function effBg(node){let cur=node;while(cur){const bg=parse(getComputedStyle(cur).backgroundColor);if(bg&&bg.a>0.01)return bg;cur=cur.parentElement;}return {r:255,g:255,b:255,a:1};}
  function ratio(a,bb){const hi=Math.max(a,bb),lo=Math.min(a,bb);return (hi+0.05)/(lo+0.05);}
  function measure(el){const cs=getComputedStyle(el);let fg=parse(cs.color)||{r:0,g:0,b:0,a:1};const bg=effBg(el.parentElement||el);const eff=fg.a<1?comp(fg,bg):fg;const r=ratio(lum(eff),lum(bg));const fs=parseFloat(cs.fontSize);const fw=parseInt(cs.fontWeight)||400;const large=fs>=24||(fs>=18.66&&fw>=700);return {t:(el.innerText||'').trim().slice(0,30),color:cs.color,bg:'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')',ratio:+r.toFixed(2),fs:cs.fontSize,fw:cs.fontWeight,large,threshold:large?3:4.5,pass:r>=(large?3:4.5)};}
`;
async function go(locale,path,wait=5000){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage(); p.on('dialog',d=>d.accept());
  await p.goto(BASE); await p.evaluate(l=>localStorage.setItem('app_locale',l),locale);
  await p.goto(`${BASE}/${path}`,{waitUntil:'domcontentloaded'}); await sleep(wait);
  return {c,p};
}
const out={};
// HydrationCard: measure every pink leaf precisely (L unit, title, percent, note)
{
  const {c,p}=await go('en','reminders');
  out.hydration = await p.evaluate((inj)=>{
    eval(inj);
    const all=[...document.querySelectorAll('div,span')].filter(e=>e.children.length===0&&(e.innerText||'').trim().length>0&&(e.innerText||'').trim().length<60);
    const pinkish=all.filter(e=>{const c=getComputedStyle(e).color;const m=c.match(/rgb\(([^)]+)\)/);if(!m)return false;const[r,g,bl]=m[1].split(',').map(Number);return r>120&&g<160&&bl>40&&bl<200&&r>bl;});
    return pinkish.map(measure);
  }, INJECT);
  await c.close();
}
// AuthChoice terms + guest (logged out)
{
  const c=await b.newContext({baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage();
  await p.goto(BASE); await p.evaluate(()=>localStorage.setItem('app_locale','en'));
  await p.goto(`${BASE}/auth`,{waitUntil:'domcontentloaded'}); await sleep(5000);
  out.auth = await p.evaluate((inj)=>{
    eval(inj);
    const all=[...document.querySelectorAll('div,span,a,p')].filter(e=>e.children.length===0&&(e.innerText||'').trim().length>0);
    const t=all.filter(e=>/guest|won't be saved|Privacy|Sign in|Create/i.test(e.innerText||''));
    return t.map(measure);
  }, INJECT);
  await c.close();
}
// ArticleDetail back link (will hit ErrorState; back link rendered in accent)
{
  const {c,p}=await go('en','article/seed-article-1',5000);
  out.articleDetail = await p.evaluate((inj)=>{
    eval(inj);
    const all=[...document.querySelectorAll('div,span')].filter(e=>e.children.length===0&&(e.innerText||'').trim().length>0&&(e.innerText||'').trim().length<24);
    const back=all.filter(e=>/back|retour|رجوع|←|عودة|Retry|réessayer|إعادة/i.test(e.innerText||''));
    return {snip:(document.body.innerText||'').replace(/\s+/g,' ').slice(0,120), links:back.map(measure)};
  }, INJECT);
  await c.close();
}
console.log(JSON.stringify(out,null,2));
await b.close();
