import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const OUT='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/r5_shots';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
// NO storageState -> logged out -> AuthChoice reachable
const c=await b.newContext({baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
await p.goto(BASE); await p.evaluate(()=>localStorage.setItem('app_locale','en'));
await p.goto(`${BASE}/auth`,{waitUntil:'domcontentloaded'}); await sleep(5000);
await p.screenshot({path:`${OUT}/auth_fresh.png`,fullPage:true});
const r = await p.evaluate(()=>{
  function parse(c){const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return null;const x=m[1].split(',').map(s=>parseFloat(s.trim()));return {r:x[0],g:x[1],b:x[2],a:x[3]===undefined?1:x[3]};}
  function lum({r,g,b}){const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);}
  function effBg(node){let cur=node;while(cur){const bg=parse(getComputedStyle(cur).backgroundColor);if(bg&&bg.a>0.01)return bg;cur=cur.parentElement;}return {r:255,g:255,b:255};}
  function ratio(a,b){const hi=Math.max(a,b),lo=Math.min(a,b);return (hi+0.05)/(lo+0.05);}
  const all=[...document.querySelectorAll('div,span,p,a')].filter(e=>e.children.length===0&&(e.innerText||'').trim().length>0);
  const targets=all.filter(e=>/Sign in|Se connecter|Continue as guest|guest|Create|account/i.test((e.innerText||'')));
  return targets.map(e=>{const cs=getComputedStyle(e);const fg=parse(cs.color);const bg=effBg(e.parentElement);const rr=ratio(lum(fg),lum(bg));return {t:(e.innerText||'').trim().slice(0,30),color:cs.color,bg:'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')',ratio:+rr.toFixed(2),fs:cs.fontSize,fw:cs.fontWeight};});
});
const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,200);
console.log('BODY:',body);
console.log(JSON.stringify(r,null,2));
await b.close();
