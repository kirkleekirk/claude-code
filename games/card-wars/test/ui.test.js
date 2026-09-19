/* Drives matches through the same entry points a real click reaches -
   onHandClick, onFieldPoint, toggleFloop, handleAct - plus the whole menu,
   deck builder, chests and upgrades. */
const {makeCtx, DECKS, FOES} = require("./harness.js");
const N = +process.argv[2] || 120;
const {ctx, vm} = makeCtx();
vm.runInContext(`
var ST={clicks:0,deploys:0,spells:0,floops:0,bio:0,stuck:0,chest:0,swap:0,upg:0,garrison:0};
var _dep = deploy;
deploy = function(P,h,x,y){
  const spell = CARDS[P.hand[h]].kind === "spell";
  const r = _dep(P,h,x,y);
  if(r && P.side === "you"){ if(spell) ST.spells++; else ST.deploys++; }
  return r;
};
/* forward projection matching the page's own maths, so the test can aim clicks */
function worldToScreen(wx, wy){
  const th = TILT*Math.PI/180, p = PERSP, s = CAL.s || 1;
  const y = wy - AH/2, x = wx - AW/2, f = p / (p - y*Math.sin(th));
  return [CAL.cx + s*x*f, CAL.cy + s*y*Math.cos(th)*f];
}
function humanTick(dt){
  const P = S.you;
  if(Math.random() > dt*1.1) return;                 // roughly once a second
  ST.clicks++;
  if(Math.random() < 0.08){                          // sometimes retill a patch
    toggleFloop();
    if(S.floopMode){
      const pt = worldToScreen(LANEX[(Math.random()*3)|0], RIVER_Y + RIVER_H + 80);
      onFieldPoint(pt[0], pt[1]); ST.clicks++;
      if(S.pendPatch >= 0){ handleAct("bio", {key:BIO_KEYS[(Math.random()*6)|0]}); ST.bio++; ST.floops++; }
      else S.floopMode = false;
    }
    return;
  }
  const h = (Math.random()*HAND_SIZE)|0;
  onHandClick(h);
  if(!S.pending) return;
  const l = (Math.random()*3)|0;
  const wx = LANEX[l] + (Math.random()*50 - 25);
  const wy = RIVER_Y + RIVER_H + 30 + Math.random()*250;
  const pt = worldToScreen(wx, wy);
  onFieldPoint(pt[0], pt[1]); ST.clicks++;
  if(S.pendPatch >= 0){ handleAct("bio", {key:BIO_KEYS[(Math.random()*6)|0]}); ST.bio++; }
  if(S.pending){ S.pending = null; ST.stuck++; }
}
function runUi(deckKey, foeKey){
  SAVE.deck = DECKS[deckKey].cards.slice();
  newMatch(foeKey);
  screen = "battle";
  const dt = 0.05;
  let g = 0;
  while(!S.over && g++ < 20000){ step(dt); aiTick(dt); humanTick(dt); }
  ST.garrison += S.mobs.filter(m => m.guest).length;
  return S.over;
}
function exerciseMenu(){
  const ids = Object.keys(SAVE.owned);
  handleAct("sort",{k:["cost","rarity","name"][(Math.random()*3)|0]});
  handleAct("deckslot",{i:String((Math.random()*DECK_SIZE)|0)});
  handleAct("collcard",{id:ids[(Math.random()*ids.length)|0]}); ST.swap++;
  handleAct("deckslot",{i:"2"}); handleAct("deckslot",{i:"2"});   // pick and cancel
  handleAct("collcard",{id:ids[(Math.random()*ids.length)|0]});
  handleAct("usecard",{id:ids[(Math.random()*ids.length)|0]}); ST.swap++;
  handleAct("close",{});
  if(SAVE.deck.length !== DECK_SIZE) throw new Error("deck size broke: " + SAVE.deck.length);
  if(new Set(SAVE.deck).size !== DECK_SIZE) throw new Error("duplicate card in deck");
  for(let i=0;i<SAVE.chests.length;i++) if(SAVE.chests[i]){ handleAct("chest",{i:String(i)}); ST.chest++; handleAct("close",{}); }
  const up = ids.filter(id=>{ const o=SAVE.owned[id], n=UPGRADE[o.lvl+1]; return n && o.copies>=n.copies && SAVE.gold>=n.gold; });
  if(up.length){ handleAct("upgrade",{id:up[0]}); ST.upg++; }
  go("cards"); go("menu"); screen = "battle";
}
`, ctx);
let crashes = 0;
const res = {you:0, foe:0, draw:0};
for(let i=0;i<N;i++){
  ctx.__d = DECKS[i % DECKS.length]; ctx.__f = FOES[(i / DECKS.length | 0) % FOES.length];
  try{
    const o = vm.runInContext("runUi(__d,__f)", ctx);
    if(o) res[o]++;
    vm.runInContext("exerciseMenu()", ctx);
  }catch(e){ crashes++; if(crashes < 5) console.log("CRASH:", e.message, "\n   ", (e.stack||"").split("\n")[1]); }
}
const T = vm.runInContext("ST", ctx), SV = vm.runInContext("SAVE", ctx);
console.log("ui matches:", N, "| crashes:", crashes, "| results:", JSON.stringify(res));
console.log("clicks:", T.clicks, "| creatures deployed", T.deploys, "| spells cast", T.spells,
            "| patches flooped", T.floops, "| biome picks", T.bio);
console.log("deck swaps", T.swap, "| chests", T.chest, "| upgrades", T.upg, "| lodgers seen", T.garrison);
console.log("selections left hanging:", T.stuck);
console.log("save survived:", "trophies", SV.trophies, "lvl", SV.lvl,
            "collection", Object.keys(SV.owned).length + "/" + vm.runInContext("CARD_KEYS.length", ctx));
process.exit(crashes ? 1 : 0);
