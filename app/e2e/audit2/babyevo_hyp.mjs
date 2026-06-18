import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const b=await chromium.launch();
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
await c.addInitScript(()=>{ localStorage.setItem('app_locale','ar'); localStorage.setItem('user_profile', JSON.stringify({uid:'g',firstName:'E2E',pregnancyStartDate:'2026-02-13T00:00:00.000Z',lmp:'2026-02-13T00:00:00.000Z',currentWeek:18,country:'France',ageRange:'25-29',isFirstPregnancy:true,isGuest:true})); });
const p=await c.newPage();
await p.goto(BASE+'/baby-evolution',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(4000);
const r=await p.evaluate(()=>{
  const interval=358, currentMonth=5;
  const divs=[...document.querySelectorAll('div')];
  let sc=null; for(const d of divs){const cs=getComputedStyle(d); if((cs.overflowX==='scroll'||cs.overflowX==='auto')&&d.scrollWidth>d.clientWidth+50){sc=d;break;}}
  if(!sc) return {err:'no scroller'};
  const content=sc.children[0];
  // HYPOTHESIS: force LTR + natural row order, then scrollLeft = (currentMonth-1)*interval
  sc.style.direction='ltr';
  if(content) content.style.flexDirection='row';
  sc.scrollLeft=(currentMonth-1)*interval; // 4*358=1432
  const vw=window.innerWidth, center=vw/2;
  const kids=[...(content?content.children:sc.children)];
  const cards=kids.map(k=>{const rr=k.getBoundingClientRect();const t=(k.textContent||'').match(/الشهر\s*\d+/);return{x:Math.round(rr.x),w:Math.round(rr.width),month:t?t[0]:'?'};});
  let best=null,bd=1e9; cards.forEach(cd=>{const cc=cd.x+cd.w/2;const d=Math.abs(cc-center);if(d<bd){bd=d;best=cd;}});
  return {scrollLeft:sc.scrollLeft, dir:getComputedStyle(sc).direction, centered:best};
});
console.log(JSON.stringify(r,null,2));
await b.close();
