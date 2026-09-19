/* Drives whole matches and the whole menu through the same entry points a real
   click reaches - onHandClick, onTileClick, handleAct, startTileFloop - so the
   targeting state machine, deck builder, chests and upgrades are all exercised. */
const {makeCtx, DECKS, FOES} = require("./harness.js");
const N = +process.argv[2] || 300;
const {ctx, vm} = makeCtx();
vm.runInContext(`
var ST={clicks:0,plays:0,floops:0,garrison:0,tileFloop:0,bioPick:0,stuck:0,chest:0,swap:0,upg:0};
var _pc=playCard; playCard=function(P,h,t,x){ if(P.side==="you")ST.plays++; return _pc(P,h,t,x); };
var _df=doFloop; doFloop=function(P,i,o){ if(P.side==="you")ST.floops++; return _df(P,i,o); };
var _mi=moveIn; moveIn=function(P,a,b){ if(P.side==="you")ST.garrison++; return _mi(P,a,b); };
var _ft=floopTile; floopTile=function(P,i,b){ if(P.side==="you")ST.tileFloop++; return _ft(P,i,b); };
function humanTurn(){
  for(let act=0; act<14 && myTurn(); act++){
    const before = ST.plays+ST.floops+ST.garrison+ST.tileFloop;
    const roll = Math.random();
    if(roll < 0.12) startTileFloop();
    else if(roll < 0.72) onHandClick((Math.random()*HAND_SIZE)|0);
    else onTileClick("you",(Math.random()*9)|0);
    ST.clicks++;
    let guard=0;
    while(S.pending && guard++ < 14){
      if(S.pending.kind === "myTile"){
        onTileClick("you",(Math.random()*9)|0); ST.clicks++;
        if(S.pending){ handleAct("bio",{key:BIO_KEYS[(Math.random()*6)|0]}); ST.bioPick++; }
        continue;
      }
      onTileClick(Math.random()<0.5?"you":"foe",(Math.random()*9)|0); ST.clicks++;
    }
    if(guard>=14){ ST.stuck++; S.pending=null; }
    if(ST.plays+ST.floops+ST.garrison+ST.tileFloop === before && act > 9) break;
  }
  if(myTurn()) endTurn();
}
function runUi(deckKey, foeKey){
  SAVE.deck = DECKS[deckKey].cards.slice();
  newMatch(foeKey);
  let g=0;
  while(!S.over && g++<4000){
    if(S.active==="you") humanTurn();
    else { if(!__t.length) break; __t.shift()(); }
  }
  return S.over;
}
function exerciseMenu(){
  const ids = Object.keys(SAVE.owned);
  handleAct("deckslot",{i:String((Math.random()*DECK_SIZE)|0)});
  handleAct("collcard",{id:ids[(Math.random()*ids.length)|0]}); ST.swap++;
  handleAct("collcard",{id:ids[(Math.random()*ids.length)|0]});
  handleAct("close",{});
  for(let i=0;i<SAVE.chests.length;i++) if(SAVE.chests[i]){ handleAct("chest",{i:String(i)}); ST.chest++; handleAct("close",{}); }
  const up = ids.filter(id=>{ const o=SAVE.owned[id], n=UPGRADE[o.lvl+1]; return n && o.copies>=n.copies && SAVE.gold>=n.gold; });
  if(up.length){ handleAct("upgrade",{id:up[0]}); ST.upg++; }
  go("cards"); go("menu"); go("battle");
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
console.log("clicks:", T.clicks, "| cards played", T.plays, "| floops", T.floops,
            "| tile floops", T.tileFloop, "| biome picks", T.bioPick);
console.log("deck swaps", T.swap, "| chests", T.chest, "| upgrades", T.upg);
console.log("targeting states that wedged:", T.stuck);
console.log("save survived:", "trophies", SV.trophies, "lvl", SV.lvl,
            "collection", Object.keys(SV.owned).length + "/" + vm.runInContext("CARD_KEYS.length", ctx));
process.exit(crashes || T.stuck ? 1 : 0);
