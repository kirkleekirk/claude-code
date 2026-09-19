/* Rules checks against the real engine, stepped like the live loop. */
const {makeCtx} = require("./harness.js");
const {ctx, vm} = makeCtx();
let pass = 0, total = 0;
function check(name, expr){
  total++;
  let ok, got;
  try{ got = vm.runInContext(expr, ctx); ok = got === true; }
  catch(e){ ok = false; got = "threw: " + e.message; }
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : "   -> " + got));
  if(ok) pass++;
}
vm.runInContext(`
function setup(){
  SAVE.deck = DECKS.studyhall.cards.slice();
  newMatch("jake");
  screen = "battle";
  S.mobs = S.mobs.filter(m => m.struct);      // keep walls and keeps, clear the field
  S.you.juice = 10; S.foe.juice = 10;
}
function run(sec, dt){ dt = dt || 0.05; for(let i=0;i<Math.round(sec/dt);i++){ step(dt); } }
function put(side, id, x, y){ return spawnMob(S[side], id, x, y); }
function wall(side, lane){ return S.mobs.find(m => m.struct === "wall" && m.side === side && m.lane === lane); }
function keep(side){ return S.mobs.find(m => m.struct === "keep" && m.side === side); }
`, ctx);

console.log("Walls, keeps and winning");
vm.runInContext("setup();", ctx);
check("the keep starts sealed while its walls stand", "keep('foe').locked === true");
check("breaking a wall opens the keep", "hurt(wall('foe',1), 99999, 'you'); run(0.2); keep('foe').locked === false");
check("and opens that lane for you to deploy past the river", "canDeployAt(S.you, LANEX[1], WALL_Y.foe + 80) === true");
check("the other lanes stay closed", "canDeployAt(S.you, LANEX[0], WALL_Y.foe + 80) === false");
check("destroying the keep wins the match", "keep('foe').hp = 1; die(keep('foe'), 'you'); S.over === 'you'");

console.log("\nCreatures walk to a bridge and cross");
vm.runInContext("setup();", ctx);
check("a creature deployed at the back heads for its lane's bridge",
  "var u = put('you','cooldog', LANEX[0], 900); var y0 = u.y; run(3); u.y < y0 - 40");
check("it funnels onto the bridge rather than swimming",
  "run(6); Math.abs(u.x - LANEX[0]) < 26");
check("it reaches the far side and attacks the wall",
  "run(12); var w = wall('foe',0); w.hp < w.maxHp");

console.log("\nBiomes");
vm.runInContext("setup();", ctx);
check("deploying on a card's home biome costs 1 less",
  "S.you.patches[patchIndex('you', LANEX[1], 700)] = 'corn'; " +
  "deployCost(S.you,'husker', LANEX[1], 700) === CARDS.husker.cost - 1");
check("Cornfields raises attack while you stand on it",
  "var a = put('you','husker', LANEX[1], 700); a.baseDmg=100; run(0.1); Math.round(a.dmg) === 120");
check("SandyLands raises speed",
  "S.you.patches[patchIndex('you', LANEX[1], 700)] = 'sandy'; run(0.1); Math.round(a.spd) === Math.round(a.baseSpd*1.3)");
check("the swamp shrugs off enemy spells",
  "S.you.patches[patchIndex('you', LANEX[1], 700)] = 'swamp'; run(0.1); " +
  "var h0 = a.hp; castSpell(S.foe, CARDS.bloodstorm, a.x, a.y); a.hp === h0");
check("and the same spell does land on open ground",
  "S.you.patches[patchIndex('you', LANEX[1], 700)] = 'corn'; run(0.1); " +
  "var h1 = a.hp; castSpell(S.foe, CARDS.bloodstorm, a.x, a.y); a.hp < h1");

console.log("\nGoing indoors");
vm.runInContext("setup();", ctx);
check("a scholar walks into a Schoolhouse on its own",
  "var st = put('you','school', LANEX[1], 760); var g = put('you','scholar', LANEX[1], 790); " +
  "run(2); st.guest === g && g.inside === st.uid");
check("studying makes it stronger",
  "var d0 = g.dmg; run(5); g.dmg > d0");
check("and it graduates back onto the field",
  "run(8); st.guest === null && g.inside === null && g.alive === true");
check("the Cave shelters whatever naps in it",
  "setup(); var c = put('you','cave', LANEX[0], 760); var pgg = put('you','pig', LANEX[0], 790); " +
  "run(2); c.guest === pgg");
check("nothing can touch the sleeper",
  "pgg.hp = 100; var before = pgg.hp; castSpell(S.foe, CARDS.bloodstorm, c.x, c.y); " +
  "put('foe','wyrm', LANEX[0], 700); run(3); pgg.hp >= before");
check("if the shelter falls the lodger is turned out, not lost",
  "die(c, 'foe'); pgg.inside === null && pgg.alive === true");
check("a structure only takes the lodgers it is built for",
  "setup(); var sc = put('you','school', LANEX[2], 760); put('you','banana', LANEX[2], 790); " +
  "run(2); sc.guest === null");

console.log("\nDeploying");
vm.runInContext("setup();", ctx);
check("you cannot deploy on their half", "canDeployAt(S.you, 300, 200) === false");
check("you can deploy on yours", "canDeployAt(S.you, 300, 700) === true");
check("a swarm card brings its whole group",
  "var n0 = S.mobs.length; S.you.hand[0] = 'earlings'; S.you.juice = 10; " +
  "deploy(S.you, 0, 300, 700); S.mobs.length === n0 + CARDS.earlings.rt.n");
check("juice is actually spent", "S.you.juice < 10");
check("juice refills over time and stops at the cap",
  "S.you.juice = 0; run(40); Math.abs(S.you.juice - JUICE_MAX) < 0.01");

console.log("\n" + pass + "/" + total + " checks passed");
process.exit(pass === total ? 0 : 1);
