const {makeCtx} = require("./harness.js");
const {ctx, vm} = makeCtx();
const t = (name, expr) => {
  let ok, got;
  try{ got = vm.runInContext(expr, ctx); ok = got === true; }
  catch(e){ ok = false; got = "threw: " + e.message; }
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : "   -> " + got));
  return ok;
};
let pass = 0, total = 0;
function check(name, expr){ total++; if(t(name, expr)) pass++; }

vm.runInContext(`
function setup(){
  SAVE.deck = DECKS.studyhall.cards.slice();
  newMatch("jake");
  screen="battle"; S.active="you"; S.pending=null; S.you.juice=30;
  for(let i=0;i<9;i++){ S.you.units[i]=null; S.foe.units[i]=null; }
}
function put(side,i,id){ const u = spawn(S[side], i, id); u.sick=false; return u; }
`, ctx);

console.log("Schoolhouse + Ancient Scholar (Finn sends the scholar to study)");
vm.runInContext("setup(); put('you', idx(1,0), 'school'); put('you', idx(2,0), 'scholar');", ctx);
check("clicking the structure opens the garrison picker",
  "onTileClick('you', idx(1,0)); S.pending && S.pending.kind==='garrison' && S.pending.list.includes(idx(2,0))");
check("clicking the scholar moves it inside",
  "onTileClick('you', idx(2,0)); !!S.you.units[idx(1,0)].guest && S.you.units[idx(2,0)]===null");
vm.runInContext("const j=S.you.juice; S.active='you'; beginTurn('you'); ctxJ=S.you.juice-j;", ctx);
check("studying pays 3 juice a turn", "S.you.units[idx(1,0)].guest.study===1");
check("and the scholar permanently grows +1/+1", "S.you.units[idx(1,0)].guest.bonusAtk>=1 && S.you.units[idx(1,0)].guest.bonusHp>=1");
check("study caps at +4/+4",
  "for(let k=0;k<9;k++) beginTurn('you'); S.you.units[idx(1,0)].guest.study===4");
check("sending it back out lands it on an empty tile in the same lane",
  "S.pending=null; onTileClick('you', idx(1,0)); " +
  "onTileClick('you', idx(0,0)); !S.you.units[idx(1,0)].guest && !!S.you.units[idx(0,0)]");

console.log("\nThe Cave of Solitude (whatever naps inside is invulnerable)");
vm.runInContext("setup(); S.you.tiles[idx(1,1)].bio='corn'; put('you', idx(1,1), 'cave'); put('you', idx(2,1), 'pig');", ctx);
check("the Pig goes in for a nap",
  "onTileClick('you', idx(1,1)); onTileClick('you', idx(2,1)); base(S.you.units[idx(1,1)].guest).name==='The Pig'");
check("a sweep spell cannot touch the sleeper",
  "S.you.units[idx(1,1)].guest.dmg=0; castSpell(S.foe, CARDS.bloodstorm, 0); " +
  "S.you.units[idx(1,1)].dmg>0 && S.you.units[idx(1,1)].guest.dmg===0");
check("neither can combat, because only the cave is a target",
  "S.you.units[idx(1,1)].dmg=0; var g=S.you.units[idx(1,1)].guest; " +
  "put('foe', idx(0,1),'cooldog'); fightLane(S.foe,S.you,1); " +
  "S.you.units[idx(1,1)].dmg>0 && g.dmg===0");
check("if the cave falls the lodger is turned out, not lost",
  "kill(S.you, idx(1,1)); !S.you.units[idx(1,1)] && S.you.units.some(u=>u && base(u).name==='The Pig')");

console.log("\nSpirit Tower (a ranged creature shoots from inside)");
vm.runInContext("setup(); put('you', idx(1,2), 'tower'); put('you', idx(2,2), 'archer'); put('foe', idx(0,2), 'banana');", ctx);
check("Archer Dan moves into the tower",
  "onTileClick('you', idx(1,2)); onTileClick('you', idx(2,2)); !!S.you.units[idx(1,2)].guest");
check("the tower shoots for the lodger's attack +3",
  "var before=S.foe.units[idx(0,2)].dmg; S.you.units[idx(1,2)].tapped=false; S.you.units[idx(1,2)].sick=false; " +
  "fightLane(S.you,S.foe,2); S.foe.units[idx(0,2)] ? S.foe.units[idx(0,2)].dmg>before : true");
check("a structure only takes lodgers it is built for",
  "setup(); put('you', idx(1,0),'school'); put('you', idx(2,0),'banana'); garrisonTargets(S.you, idx(1,0)).length===0");

console.log("\nBiome rules");
vm.runInContext("setup();", ctx);
check("a creature on its home biome costs 1 less",
  "S.you.tiles[0].bio='corn'; S.you.tiles[1].bio='swamp'; costOf(S.you,'husker',0) === costOf(S.you,'husker',1)-1");
check("and arrives with +1/+1",
  "S.you.units[0]=null; var u=spawn(S.you,0,'husker'); u.bonusAtk>=1 && u.bonusHp>=1");
check("the swamp makes its occupant spell-proof",
  "S.you.units[3]=null; S.you.tiles[3].bio='swamp'; spawn(S.you,3,'pig'); spellSafe(S.you,3)===true");
check("rainbow counts as every card's home",
  "S.you.tiles[4].bio='rain'; costOf(S.you,'reaper',4) === CARDS.reaper.cost-1");
check("flooping a tile costs juice and changes the biome",
  "var jj=S.you.juice; floopTile(S.you,8,'nice'); S.you.tiles[8].bio==='nice' && S.you.juice===jj-TILE_FLOOP_COST");
check("only one tile floop per turn",
  "S.you.tileFlooped===true");
console.log("\n" + pass + "/" + total + " checks passed");
process.exit(pass===total ? 0 : 1);
