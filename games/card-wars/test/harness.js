/* Headless harness: pulls the game's script blocks out of index.html and runs
   them in a vm with a stub DOM, so the rules engine can be tested without a
   browser. Everything visual is stubbed; everything mechanical is real. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const GAME = path.join(__dirname, "..", "index.html");

function scripts(){
  const html = fs.readFileSync(GAME, "utf8");
  const blocks = html.match(/<script>\n([\s\S]*?)<\/script>/g) || [];
  return blocks.map(b => b.replace(/^<script>\n/, "").replace(/<\/script>$/, "")).join("\n");
}
function el(){
  return {
    innerHTML:"", textContent:"", hidden:true, disabled:false, className:"", id:"",
    style:{setProperty(){}, getPropertyValue(){ return "1"; }, width:""},
    dataset:{}, scrollTop:0, scrollHeight:0, offsetWidth:400, offsetHeight:600,
    clientWidth:900, clientHeight:600,
    classList:{add(){}, remove(){}, toggle(){}, contains(){ return false; }},
    appendChild(){}, remove(){}, addEventListener(){}, closest(){ return null; },
    insertAdjacentHTML(){}, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return {left:0, top:0, right:10, bottom:10, width:10, height:10}; },
  };
}
function makeCtx(){
  const els = {}, timers = [], store = {};
  const ctx = {
    console, Math, Date, Object, Array, String, Number, Set, JSON, isNaN, parseInt, parseFloat,
    setTimeout(fn){ timers.push(fn); return timers.length; },
    localStorage:{
      getItem:(k) => (k in store ? store[k] : null),
      setItem:(k, v) => { store[k] = String(v); },
      removeItem:(k) => { delete store[k]; },
    },
    document:{
      getElementById(id){ return els[id] || (els[id] = el()); },
      querySelector(){ return el(); }, querySelectorAll(){ return []; },
      createElement(){ return el(); }, addEventListener(){}, body: el(),
    },
    window:{ addEventListener(){} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(scripts(), ctx);
  ctx.__t = timers;
  vm.runInContext(`
    render=function(){}; flushFx=function(){}; shake=function(){}; fitBoard=function(){};
    toast=function(){}; persist=function(){};
    var __sheetOpen=false;
    showSheet=function(){ __sheetOpen=true; }; hideSheet=function(){ __sheetOpen=false; };
    showEnd=function(){ __sheetOpen=true; };
  `, ctx);
  return {ctx, vm, timers};
}
/* a scripted player, limited by juice exactly as the opponent is */
const PLAYER = `
function randPlay(){
  const P = S.you;
  for(let t=0;t<10;t++){
    const h = (Math.random()*HAND_SIZE)|0, id = P.hand[h], d = CARDS[id];
    if(bestCost(P,id) > P.juice) continue;
    if(d.kind === "spell"){
      const tg = d.spell.target;
      if(!tg){ playCard(P,h,0); return true; }
      if(tg === "enemyLane"){ playCard(P,h,(Math.random()*3)|0); return true; }
      if(tg === "myTile"){
        const tl=[], bl=[];
        for(let i=0;i<9 && tl.length<(d.spell.n||1);i++) if(!P.units[i]){ tl.push(i); bl.push(BIO_KEYS[(Math.random()*6)|0]); }
        if(tl.length){ playCard(P,h,tl,bl); return true; }
        continue;
      }
      if(tg === "myUnit"){
        const list = P.units.map((u,i)=>u && base(u).kind!=="structure"?i:-1).filter(i=>i>=0);
        if(!list.length) continue;
        const from = list[(Math.random()*list.length)|0];
        if(d.spell.id === "teleport"){
          const dest = P.units.map((u,i)=>!u?i:-1).filter(i=>i>=0);
          if(!dest.length) continue;
          playCard(P,h,from,dest[(Math.random()*dest.length)|0]); return true;
        }
        playCard(P,h,from); return true;
      }
    } else if(d.special === "swarm"){
      if(P.units.some(u=>!u)){ playCard(P,h,0); return true; }
    } else {
      const spots = P.units.map((u,i)=>(!u && costOf(P,id,i)<=P.juice)?i:-1).filter(i=>i>=0);
      if(spots.length){ playCard(P,h,spots[(Math.random()*spots.length)|0]); return true; }
    }
  }
  return false;
}
function randExtras(){
  const P = S.you;
  for(let i=0;i<9;i++){
    const u = P.units[i];
    if(!u) continue;
    const d = base(u);
    if(d.kind === "structure" && d.houses && !u.guest && Math.random() < 0.7){
      const list = garrisonTargets(P,i);
      if(list.length){ moveIn(P,i,list[(Math.random()*list.length)|0]); continue; }
    }
    if(canFloopUnit(P,i) && Math.random() < 0.55){
      const f = d.floop;
      if(f.target === "enemyUnit"){ const t=S.foe.units.map((x,k)=>x?k:-1).filter(k=>k>=0); if(t.length) doFloop(P,i,{target:t[0]}); }
      else if(f.target === "myEmptyTile"){ const t=P.units.map((x,k)=>!x?k:-1).filter(k=>k>=0); if(t.length) doFloop(P,i,{target:t[0]}); }
      else if(f.target === "myUnit"){ const t=P.units.map((x,k)=>x?k:-1).filter(k=>k>=0); if(t.length) doFloop(P,i,{target:t[0]}); }
      else doFloop(P,i);
    }
  }
  if(!P.tileFlooped && P.juice >= TILE_FLOOP_COST + 2 && Math.random() < 0.4)
    floopTile(P,(Math.random()*9)|0,BIO_KEYS[(Math.random()*6)|0]);
}
function runMatch(deckKey, foeKey){
  SAVE.deck = DECKS[deckKey].cards.slice();
  newMatch(foeKey);
  let g = 0;
  while(!S.over && g++ < 5000){
    if(S.active === "you"){ let n=0; while(n++<8 && randPlay()){} randExtras(); if(!S.over) endTurn(); }
    else { if(!__t.length) break; __t.shift()(); }
  }
  return {over:S.over, round:S.round};
}
`;
module.exports = {makeCtx, PLAYER, DECKS:["cornlord","blitz","swampdoc","studyhall"],
                 FOES:["finn","jake","bmo","marcy","pb"]};
