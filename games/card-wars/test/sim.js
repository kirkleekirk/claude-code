/* Plays out whole real-time matches headlessly at a fixed step. */
const {makeCtx, PLAYER, DECKS, FOES} = require("./harness.js");
const N = +process.argv[2] || 200;
const {ctx, vm} = makeCtx();
vm.runInContext(PLAYER, ctx);
let crashes = 0, unfinished = 0, secs = 0, done = 0, nan = 0;
const tally = {you:0, foe:0, draw:0};
const byFoe = {}, byDeck = {};
FOES.forEach(f => byFoe[f] = {w:0, t:0});
DECKS.forEach(d => byDeck[d] = {w:0, t:0});
for(let i=0;i<N;i++){
  const d = DECKS[i % DECKS.length], f = FOES[(i / DECKS.length | 0) % FOES.length];
  try{
    ctx.__d = d; ctx.__f = f;
    const r = vm.runInContext("playMatch(__d, __f)", ctx);
    const bad = vm.runInContext("S.mobs.some(m => isNaN(m.x) || isNaN(m.y) || isNaN(m.hp))", ctx);
    if(bad) nan++;
    if(!r.over){ unfinished++; continue; }
    tally[r.over]++; secs += r.t; done++;
    byFoe[f].t++; byDeck[d].t++;
    if(r.over === "foe"){ byFoe[f].w++; byDeck[d].w++; }
  }catch(e){ crashes++; if(crashes < 4) console.log("CRASH", d, "vs", f, "->", e.message, (e.stack||"").split("\n")[1]); }
}
console.log("matches:", done, "| crashes:", crashes, "| unfinished:", unfinished, "| NaN states:", nan);
console.log("avg match length:", (secs/Math.max(1,done)).toFixed(0) + "s | results:", JSON.stringify(tally));
console.log("opponent win rate:");
FOES.forEach(f => console.log("  ", f.padEnd(7), (100*byFoe[f].w/Math.max(1,byFoe[f].t)).toFixed(0) + "%"));
console.log("player win rate by deck:");
DECKS.forEach(d => console.log("  ", d.padEnd(10), (100*(byDeck[d].t-byDeck[d].w)/Math.max(1,byDeck[d].t)).toFixed(0) + "%"));
process.exit(crashes || nan ? 1 : 0);
