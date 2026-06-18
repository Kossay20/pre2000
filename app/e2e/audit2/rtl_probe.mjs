import { chromium } from 'playwright';
const BASE='http://localhost:8081';
const b=await chromium.launch();
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
await c.addInitScript(()=>{ localStorage.setItem('app_locale','ar'); localStorage.setItem('user_profile', JSON.stringify({uid:'g',firstName:'E2E',pregnancyStartDate:'2026-02-13T00:00:00.000Z',lmp:'2026-02-13T00:00:00.000Z',currentWeek:13,country:'France',ageRange:'25-29',isFirstPregnancy:true,isGuest:true})); });
const p=await c.newPage();
await p.goto(BASE+'/resources',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(6000);
// click supplements tab
const supp=p.getByText(/مكملات|Compléments|Supplements/).first();
await supp.click({timeout:6000});
await p.waitForTimeout(6000);
const info=await p.evaluate(()=>{
  const vw=window.innerWidth, vh=window.innerHeight;
  // find supplement card text
  function findAncestorCard(el){ let n=el; for(let i=0;i<8&&n;i++){ if(n.getBoundingClientRect && n.getBoundingClientRect().width>200) return n; n=n.parentElement;} return el;}
  const all=[...document.querySelectorAll('*')];
  const nameEl=all.find(e=>e.children.length===0 && /حمض الفوليك|Acide folique|Folic/.test(e.textContent||''));
  const out={vw,vh,found:!!nameEl};
  if(nameEl){
    const r=nameEl.getBoundingClientRect(); out.nameRect={x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};
    const card=findAncestorCard(nameEl); const cr=card.getBoundingClientRect(); out.cardRect={x:Math.round(cr.x),y:Math.round(cr.y),w:Math.round(cr.width),h:Math.round(cr.height)};
  }
  // find the scrollview/flatlist panels (RN-Web puts role=tabpanel? or look for two sibling panels)
  const panels=all.filter(e=>{const r=e.getBoundingClientRect(); return r.width>300 && r.height>200 && e.querySelectorAll('*').length>20;});
  out.bigPanels=panels.slice(0,6).map(e=>{const r=e.getBoundingClientRect(); return {x:Math.round(r.x),w:Math.round(r.width),h:Math.round(r.height),cls:(e.getAttribute('class')||'').slice(0,30)};});
  return out;
});
console.log(JSON.stringify(info,null,2));
await b.close();
