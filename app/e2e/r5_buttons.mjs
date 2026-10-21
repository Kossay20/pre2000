import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const INJECT=`
  function parse(c){const m=c&&c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const x=m[1].split(',').map(s=>parseFloat(s.trim()));return {r:x[0],g:x[1],b:x[2],a:x[3]===undefined?1:x[3]};}
  function lum(o){const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};return 0.2126*f(o.r)+0.7152*f(o.g)+0.0722*f(o.b);}
  function ratio(a,bb){const hi=Math.max(a,bb),lo=Math.min(a,bb);return (hi+0.05)/(lo+0.05);}
  function btnInfo(el){
    // find own bg, and bg-image (gradient)
    let cur=el, bg=null, img='none', depth=0;
    while(cur&&depth<5){const cs=getComputedStyle(cur);const pb=parse(cs.backgroundColor);if(!bg&&pb&&pb.a>0.05)bg=pb; if(img==='none'&&cs.backgroundImage&&cs.backgroundImage!=='none')img=cs.backgroundImage; cur=cur.parentElement;depth++;}
    const cs=getComputedStyle(el); const fg=parse(cs.color)||{r:0,g:0,b:0,a:1};
    const r = bg? ratio(lum(fg),lum(bg)) : null;
    return {t:(el.innerText||'').trim().slice(0,28),color:cs.color,btnBg:bg?'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')':null,gradient:img.slice(0,60),ratioVsSolidBg:r?+r.toFixed(2):null,fs:cs.fontSize,fw:cs.fontWeight};
  }
`;
async function go(path,wait=5000,seed){
  const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
  const p=await c.newPage(); p.on('dialog',d=>d.accept());
  await p.goto(BASE); await p.evaluate(()=>localStorage.setItem('app_locale','en'));
  if(seed) await p.evaluate(seed);
  await p.goto(`${BASE}/${path}`,{waitUntil:'domcontentloaded'}); await sleep(wait);
  return {c,p};
}
const out={};
// Hydration "Add a glass" button
{
  const {c,p}=await go('reminders');
  out.hydrationAdd = await p.evaluate((inj)=>{
    eval(inj);
    const all=[...document.querySelectorAll('div,span')].filter(e=>e.children.length===0);
    const add=all.find(e=>/Add a glass|glass|250ml|Ajouter un verre/i.test(e.innerText||''));
    return add?btnInfo(add):{missing:true};
  }, INJECT);
  await c.close();
}
// KickCounter tap button
{
  const {c,p}=await go('kick-counter');
  out.kickTap = await p.evaluate((inj)=>{
    eval(inj);
    const all=[...document.querySelectorAll('div,span')].filter(e=>e.children.length===0&&(e.innerText||'').trim().length>0);
    // tapButtonText uses background color text on primary; find big tap label
    const tap=all.find(e=>/tap|Tap|Compter|كبسة|اضغط|movement|Record|kick/i.test(e.innerText||''))||all.find(e=>parseFloat(getComputedStyle(e).fontSize)>=18&&/[A-Za-z]/.test(e.innerText||''));
    return tap?btnInfo(tap):{missing:true, sample:all.slice(0,12).map(e=>(e.innerText||'').trim().slice(0,16))};
  }, INJECT);
  await c.close();
}
console.log(JSON.stringify(out,null,2));
await b.close();
