/* Headless harness. Pulls the game's script blocks out of index.html and runs
   them in a vm with a stub DOM, then drives the real-time loop at a fixed step
   so matches can be played out without a browser. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const GAME = path.join(__dirname, "..", "index.html");

function scripts(){
  const html = fs.readFileSync(GAME, "utf8");
  const blocks = html.match(/<script>\n([\s\S]*?)<\/script>/g) || [];
  return blocks.map(b => b.replace(/^<script>\n/, "").replace(/<\/script>$/, "")).join("\n");
}
function el(){
  const o = {
    innerHTML:"", textContent:"", hidden:true, disabled:false, className:"", id:"",
    style:{setProperty(){}, getPropertyValue(){ return "1"; }, cssText:"", width:"", transform:"", opacity:""},
    dataset:{}, scrollTop:0, scrollHeight:0, offsetWidth:600, offsetHeight:980,
    clientWidth:900, clientHeight:640, childElementCount:0, children:[], firstChild:null,
    classList:{add(){}, remove(){}, toggle(){}, contains(){ return false; }},
    appendChild(){}, remove(){}, addEventListener(){}, closest(){ return null; },
    insertAdjacentHTML(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return {left:0, top:0, right:600, bottom:600, width:600, height:600}; },
  };
  o.firstChild = {style:{transform:""}};
  return o;
}
function makeCtx(){
  const els = {}, store = {};
  const ctx = {
    console, Math, Date, Object, Array, String, Number, Set, JSON, isNaN, parseInt, parseFloat,
    setTimeout(){ return 0; }, clearTimeout(){},
    requestAnimationFrame(){ return 0; }, cancelAnimationFrame(){},
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
  vm.runInContext(`
    syncMobs=function(){}; syncFx=function(){}; renderHud=function(){}; buildGround=function(){};
    paintPatches=function(){}; fitGround=function(){}; calibrate=function(){}; shake=function(){};
    toast=function(){}; showSheet=function(){}; hideSheet=function(){}; showEnd=function(){};
    persist=function(){}; startLoop=function(){};
  `, ctx);
  return {ctx, vm};
}

/* A player bot that spends juice the way a person would: a card every second or
   so, defending what is on its half and otherwise pushing a lane. */
const PLAYER = `
var __pNext = 1.2;
function playerTick(dt){
  const P = S.you;
  __pNext -= dt;
  if(__pNext > 0) return;
  __pNext = 0.8 + Math.random() * 1.2;
  const threats = S.mobs.filter(m => m.alive && !m.inside && m.side === "foe" && !m.struct && m.y > RIVER_Y - 40);
  let best = -1, bestVal = -1;
  for(let h=0;h<HAND_SIZE;h++){
    const d = CARDS[P.hand[h]], rt = d.rt;
    if(d.cost > P.juice) continue;
    const val = ((rt.hp || 0) * 0.01 + (rt.dmg || 0) * 0.05 * (rt.n || 1) + (rt.radius ? rt.radius * 0.03 : 0)) / d.cost;
    if(val > bestVal){ bestVal = val; best = h; }
  }
  if(best < 0) return;
  const d = CARDS[P.hand[best]];
  let x, y;
  if(threats.length && Math.random() < 0.6){
    const t = threats[(Math.random() * threats.length) | 0];
    x = t.x; y = d.kind === "spell" ? t.y : Math.min(AH - 30, t.y + 60);
  } else {
    const l = (Math.random() * 3) | 0;
    x = LANEX[l] + (Math.random() * 40 - 20);
    y = RIVER_Y + RIVER_H + 40 + Math.random() * 120;
  }
  if(d.kind === "spell" && d.rt.spell === "reclaim"){
    P.juice -= d.cost; P.patches[(Math.random()*9)|0] = BIO_KEYS[(Math.random()*6)|0]; cycleOut(P, best); return;
  }
  if(d.kind !== "spell" && !canDeployAt(P, x, y)){ y = RIVER_Y + RIVER_H + 60; }
  deploy(P, best, x, y);
  if(P.juice >= 2 && Math.random() < 0.06){ P.juice -= 2; P.patches[(Math.random()*9)|0] = BIO_KEYS[(Math.random()*6)|0]; }
}
function playMatch(deckKey, foeKey, dt){
  dt = dt || 0.05;
  SAVE.deck = DECKS[deckKey].cards.slice();
  __pNext = 1.2;
  newMatch(foeKey);
  let guard = 0;
  while(!S.over && guard++ < 20000){
    step(dt); aiTick(dt); playerTick(dt);
  }
  return {over:S.over, t:S.t, yourWalls:3 - S.you.wallsDown, theirWalls:3 - S.foe.wallsDown,
          mobs:S.mobs.length, guard};
}
`;
module.exports = {makeCtx, PLAYER,
  DECKS:["cornlord","blitz","swampdoc","studyhall"],
  FOES:["finn","jake","bmo","marcy","pb"]};
