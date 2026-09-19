/* Balance run. Both sides are limited by juice in the same way, so the numbers
   compare the opponent AI against a player that always spends its turn fully. */
const {makeCtx, PLAYER, DECKS, FOES} = require("./harness.js");
const N = +process.argv[2] || 600;
const {ctx, vm} = makeCtx();
vm.runInContext(PLAYER, ctx);
let crashes = 0, rounds = 0, done = 0;
const tally = {you:0, foe:0, draw:0};
const byFoe = {}, byDeck = {};
FOES.forEach(f => byFoe[f] = {w:0, t:0});
DECKS.forEach(d => byDeck[d] = {w:0, t:0});
for(let i=0;i<N;i++){
  const d = DECKS[i % DECKS.length], f = FOES[(i / DECKS.length | 0) % FOES.length];
  try{
    ctx.__d = d; ctx.__f = f;
    const r = vm.runInContext("runMatch(__d, __f)", ctx);
    if(!r.over) continue;
    tally[r.over]++; rounds += r.round; done++;
    byFoe[f].t++; byDeck[d].t++;
    if(r.over === "foe"){ byFoe[f].w++; byDeck[d].w++; }
  }catch(e){ crashes++; if(crashes < 4) console.log("CRASH", d, "vs", f, "->", e.message); }
}
console.log("matches:", done, "| crashes:", crashes);
console.log("avg rounds:", (rounds/done).toFixed(1), "| draws:", (100*tally.draw/done).toFixed(1) + "%");
console.log("opponent win rate:");
FOES.forEach(f => console.log("  ", f.padEnd(7), (100*byFoe[f].w/Math.max(1,byFoe[f].t)).toFixed(0) + "%"));
console.log("player win rate by deck:");
DECKS.forEach(d => console.log("  ", d.padEnd(10), (100*(byDeck[d].t-byDeck[d].w)/Math.max(1,byDeck[d].t)).toFixed(0) + "%"));
process.exit(crashes ? 1 : 0);
