import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const STATE='/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/.auth/state.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,baseURL:BASE,viewport:{width:390,height:844}});
const p=await c.newPage();
await p.goto(BASE); await p.evaluate(()=>localStorage.setItem('app_locale','en'));
await p.goto(`${BASE}/resources`,{waitUntil:'domcontentloaded'}); await sleep(5000);
// Find the actual visible "Articles"/"Supplements" text and walk DOM: own color, parent colors, opacity
const r = await p.evaluate(()=>{
  const out=[];
  const all=[...document.querySelectorAll('*')];
  for(const e of all){
    if(e.children.length===0){
      const tx=(e.innerText||'').trim();
      if(tx==='Articles'||tx==='Supplements'){
        const cs=getComputedStyle(e);
        // climb to find aria-selected ancestor
        let anc=e, sel=null, depth=0;
        while(anc&&depth<8){ if(anc.getAttribute&&anc.getAttribute('aria-selected')!=null){sel=anc.getAttribute('aria-selected');break;} anc=anc.parentElement; depth++; }
        out.push({tx, color:cs.color, opacity:cs.opacity, fs:cs.fontSize, fw:cs.fontWeight, ariaSelected:sel,
          parentOpacity: e.parentElement?getComputedStyle(e.parentElement).opacity:null});
      }
    }
  }
  return out;
});
console.log(JSON.stringify(r,null,2));
await b.close();
