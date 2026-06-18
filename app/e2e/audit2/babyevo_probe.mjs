import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const b=await chromium.launch();
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
await c.addInitScript(()=>{ localStorage.setItem('app_locale','ar'); localStorage.setItem('user_profile', JSON.stringify({uid:'g',firstName:'E2E',pregnancyStartDate:'2026-02-13T00:00:00.000Z',lmp:'2026-02-13T00:00:00.000Z',currentWeek:18,country:'France',ageRange:'25-29',isFirstPregnancy:true,isGuest:true})); });
const p=await c.newPage();
await p.goto(BASE+'/baby-evolution',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(4500);
const info=await p.evaluate(()=>{
  const vw=window.innerWidth;
  // find horizontal scroller: a div with scrollWidth > clientWidth and overflow-x scroll/auto
  const divs=[...document.querySelectorAll('div')];
  let sc=null;
  for(const d of divs){ const cs=getComputedStyle(d); if((cs.overflowX==='scroll'||cs.overflowX==='auto') && d.scrollWidth>d.clientWidth+50){ sc=d; break; } }
  const out={vw};
  if(sc){
    out.scroller={scrollLeft:sc.scrollLeft, scrollWidth:sc.scrollWidth, clientWidth:sc.clientWidth, dir:getComputedStyle(sc).direction};
    // children = cards
    const kids=[...sc.children[0]?.children||sc.children];
    out.cards=kids.map(k=>{ const r=k.getBoundingClientRect(); const txt=(k.textContent||'').match(/الشهر\s*\d+|Month\s*\d+|Mois\s*\d+/); return {x:Math.round(r.x), w:Math.round(r.width), month:txt?txt[0]:'?'};});
    // which card center is closest to viewport center
    const center=vw/2;
    let best=null,bd=1e9;
    out.cards.forEach((cd,i)=>{ const cc=cd.x+cd.w/2; const d=Math.abs(cc-center); if(d<bd){bd=d;best={i,...cd};}});
    out.centered=best;
  } else out.scroller='NOT FOUND';
  return out;
});
console.log(JSON.stringify(info,null,2));
await b.close();
