// UI icons as string-art over the global palette. Digits 0-3 are a tint ramp chosen per use
// (strains, ingots, ammo types, cash colours), so families share one silhouette.
import { RAMPS } from '../data/palette.js';
import { createCanvas, ctx2d } from './canvas.js';

const K = RAMPS;
const MAP = {
  k: K.ink[0], K: K.ink[1], g: K.ink[2], G: K.ink[3], B: K.bone[0], b: K.bone[1], W: K.bone[2], w: K.bone[3],
  z: K.rust[0], q: K.rust[1], r: K.rust[2], R: K.rust[3], f: K.wood[0], o: K.wood[1], O: K.wood[2], d: K.wood[3],
  c: K.sand[1], s: K.sand[2], S: K.sand[3], m: K.olive[1], l: K.olive[2], L: K.olive[3], i: K.teal[1], t: K.teal[2], T: K.teal[3],
  p: K.sea[1], e: K.sea[2], E: K.sea[3], j: K.amber[1], a: K.amber[2], A: K.amber[3], v: K.green[1], n: K.green[2], N: K.green[3],
  x: K.heat[1], h: K.heat[2], H: K.heat[3], u: K.gold[1], y: K.gold[2], Y: K.gold[3],
};

const ICONS = {
  cash: '........../........../0000000000/0122222210/0123333210/0122332210/0123333210/0122222210/0000000000',
  coin: '...0000.../..022220../.02333320./.02322320./.02322320./.02333320./..022220../...0000...',
  heat: '....h...../....hh..../...hHh..../..hHHh.h../..hHYHhh../.hHYYYHh../.hHYYYYh../.hHHYYHh../..hHHHh.../...xxxx...',
  rep: '....Y...../...YYY..../YYYYYYYYY./.YYYYYYY../..YYYYY.../..YY.YY.../.YY...YY..',
  skull: '..WWWWW.../.WWWWWWW../.WkkWkkW../.WkkWkkW../.WWWkWWW../..WWWWW.../..WkWkW.../..WWWWW...',
  person: '...2222.../..222222../..222222../...2222.../........../.22222222./2222222222/2222222222/2222222222',
  heart: '.hh..hh.../hHHhhHHh../hHHHHHHh../hHHHHHHh../.hHHHHh.../..hHHh..../...hh.....',
  shield: '.GGGGGGG../GBBBBBBBG./GBTTTTTBG./GBTTTTTBG./GBTTTTTBG./.GBTTTBG../..GBBBG.../...GGG....',
  lock: '...GGG..../..G...G.../..G...G.../.yyyyyyy../.yuuuuuy../.yuukuuy../.yuukuuy../.yyyyyyy..',
  key: '.yyy....../y...y...../y...yyyyyy/y...y..y.y/.yyy...y..',
  pin: '..hhhh..../.hHHHHh.../.hHwwHh.../.hHwwHh.../.hHHHHh.../..hHHh..../...hh...../...h......',
  warn: '....y...../...yky..../...yky..../..yykyy.../..yykyy.../.yyyyyyy../.yyykyyy../yyyyyyyyy.',
  check: '........N./.......NN./......NN../N....NN.../NN..NN..../.NNNN...../..NN......',
  cross: 'h......h../.h....h.../..h..h..../...hh...../...hh...../..h..h..../.h....h.../h......h..',
  gear: '...GG...../.G.GG.G.../..GGGGG.../GGGkkGGG../GGGkkGGG../..GGGGG.../.G.GG.G.../...GG.....',
  clock: '..bbbbb.../.bWWWWWb../bWWWkWWWb./bWWWkWWWb./bWWWkkkWb./bWWWWWWWb./.bWWWWWb../..bbbbb...',
  bag: '...oo...../..o..o..../.OOOOOO.../OddddddO../OdOOOOdO../OddddddO../OOOOOOOO..',
  book: '.rrrrrrr../rRRRRRRr../rRwwwwRr../rRRRRRRr../rRwwwwRr../rRRRRRRr../rrrrrrrrW./.WWWWWWWW.',
  chart: 'k........./k......N../k.....NN../k..N.NN.../k.NNNN..../kNN......./kkkkkkkkk.',
  case: '...oooo.../...o..o.../.OOOOOOOO./OddddddddO/OOOOyyOOOO/OddddddddO/OddddddddO/OOOOOOOOOO',
  target: '....h...../..hhhhh.../.h..h..h../.h.....h../hhh.H.hhh./.h.....h../.h..h..h../..hhhhh.../....h.....',
  flag: 'G........./GRRRRRR.../GRRRRRRR../GRRRRRR.../GRRRRRRR../G........./G........./G.........',
  bolt: '.....yy.../....yy..../...yy...../..yyyyy.../.....yy.../....yy..../...yy...../..yy......',
  drop: '....E...../...EE...../..EeeE..../.EeeeeE.../.EeeeeE.../.EppeeE.../..EppE..../...EE.....',
  sun: '....y...../.y..y..y../..yyyyy.../.yyYYYyy../yyYYYYYyy./.yyYYYyy../..yyyyy.../.y..y..y../....y.....',
  seed: '........../...ss...../..sSSs..../.sSSSSs.../.sSssSs.../..sSSs..../...ss.....',
  bud: '....2...../...323..../..23332.../.2333332../..23332.../.2333332../..23332.../...232..../....o...../....o.....',
  sprout: '........../........../........../....2...../...2.2..../....2...../....o...../....o...../...ooo..../..ooooo...',
  baggie: '..WWWW..../.WbbbbW.../.W2332W.../.W3333W.../.W2332W.../.WbbbbW.../..WWWW....',
  jar: '..GGGGG.../..bbbbb.../.EEEEEEE../.E23332E../.E33333E../.E23332E../.EEEEEEE..',
  brick: '........../.oooooooo./o22222222o/o23333332o/o22222222o/.oooooooo.',
  jug: '...oo...../...oo...../..OOOO..../.OddddO.../OdSSSSdO../OdSSSSdO../OddddddO../.OOOOOO...',
  scrap: '..G......./.GGG.r..../GGkGGrr.../.GGG.rRr../..G...r.../...GGG..../..GBBBG.../...GGG....',
  ingot: '........../...1111.../..122221../.12333321./1222222221/1111111111',
  timber: '........../.ooooooo../oOOOOOOOs./oOOOOOOsSs/oOOOOOOOs./.ooooooo..',
  spring: '.GGGGGG.../......G.../.GGGGGG.../.G......../.GGGGGG.../......G.../.GGGGGG...',
  brass: '...yy...../..yYYy..../..yYYy..../..yYYy..../..yYYy..../..yuuy..../.yyyyyy...',
  powder: '..oooo..../.OddddO.../.GGGGGG.../.OddddO.../.OdhhdO.../.GGGGGG.../.OddddO.../..oooo....',
  polymer: '........../.tt..tt.../tTTt.TTt../.tt..tt.../...tt...../..tTTt..../...tt.....',
  fuel: '..hh....../.hHHHhh.../hHHHHHHh../hHkHHkHh../hHHkkHHh../hHkHHkHh../hHHHHHHh../.hhhhhh...',
  compost: '........../........../...oo...../..oOOo..../.oOlOOo.../oOOOOlOo../oOlOOOOo../oooooooo..',
  c_barrel: '........../........../GGGGGGGGGG/gggggggggk/GGGGGGGGGG',
  c_frame: '........../GGGGGGGG../GggggggG../GgGGGGGG../Gg......../GG........',
  c_action: '........../....GG..../...GggG.../GGGGggGGGG/GgggggggGG/GGGGGGGGGG',
  c_stock: '........../oooo....../oOOOoo..../oOOOOOooo./oOOOOOOOOo/.oooooooo.',
  c_mag: '.GGGG...../.GggG...../.GggG...../.GggG...../..GggG..../..GggG..../..GGGG....',
  ammo: '....3...../...323..../...323..../...222..../...uyu..../...uyu..../...uyu..../...uuu....',
  shell: '...hhh..../...hHh..../...hHh..../...hHh..../...yyy..../...uyu..../...uuu....',
  arrow: '.........G/........G./.......G../......G.../.....G..../o...G...../.ooG....../.oo.......',
  mod: '...2....../..232...../.23332..../2333332.../.23332..../..232...../...2......',
  molotov: '....h...../...hH...../....w...../...eee..../..eEEEe.../..eEaEe.../..eEaEe.../..eEEEe.../...eee....',
  pipebomb: '.......h../......w.../.....w..../.GGGGGG.../GgggggggG./GgkkkkggG./GgggggggG./.GGGGGG...',
  caltrops: '...G....../..GGG.G.../.G.G.GGG../...G..G.../.G......G./GGG....GGG/.G......G.',
  smoke: '..BBB...../.BbbbB..../BbWWbbB.../.BbbbBB.../..GGGG..../.GggggG.../.GggggG.../..GGGG....',
  lockpick: '.........G/........G./.......G../......G.../GGGGGGG.../G.G.......',
  cutters: 'hh.......h/hhh.....hh/.hhh...hh./..GGG.GG../...GGGG.../...GG.GG../..GG...GG./.GG.....GG',
  cart: '........../oooooooo../oOOOOOOOoo/oOOOOOOOo./.oooooooo./.kk...kk../.kk...kk..',
  buggy: '....GGG.../...Gp..G../rrrrrrrrr./rRRRRRRRRr/rrrrrrrrrr/.kk...kk../.kk...kk..',
  hauler: '.....GGGG./.....GppG./llllllGGGG/lLLLLLGGGG/llllllGGGG/.kk...kk../.kk...kk..',
  ring: '...EE...../..yEEy..../.y....y.../y......y../y......y../.y....y.../..yyyy....',
  meds: '..wwww..../..GGGG..../.wwwwww.../.whhhhw.../.wwHHww.../.whhhhw.../.wwwwww...',
  circuit: '.y.y.y.y../nnnnnnnnn./nNNyNNNnn./nNyyyNNnn./nNNyNyNnn./nnnnnnnnn./.y.y.y.y..',
  relic: '...yyy..../..yYYYy.../..yYkYy.../...yyy..../..yYYYy.../.yYYYYYy../..yyyyy...',
  papers: '.WWWWW..../.WkkkWW.../.WWWWWWW../.WkkkkkW../.WWWWWWW../.WkkkkkW../.WWWWWWW..',
  sack: '...oo...../..O..O..../.OddddO.../OdSSddddO./OdddSSddO./OddddddO../.OOOOOO...',
  front: '....RR..../...RRRR.../..RRRRRR../.RRRRRRRR./..WWWWWW../..WkWWkW../..WWWkWW../..WWWkWW..',
  jaw: '.rrrrrrr../rRRRRRRRr./rwkwkwkwr./rRRRRRRRr./rwkwkwkwr./.rrrrrrr..',
  hand: '..w.w.w.../..w.w.w.w./..w.w.w.w./w.wwwwwww./.wwwwwwww./..wwwwww../...wwww...',
  candle: '....h...../...hHh..../....y...../...www..../...wWw..../...wWw..../...wWw..../..GGGGG...',
  speaker: '...G....../..GG..y.../GGGG...y../GwwG.y.y../GwwG.y.y../GGGG...y../..GG..y.../...G......',
  dice: 'wwwwwww.../wkwwwkw.../wwwwwww.../wwwkwww.../wwwwwww.../wkwwwkw.../wwwwwww...',
  fist: '.........../..hhhh..../.hHHHHh.../.hHHHHHh../.hHHHHHh../..hHHHh.../..hhhh....',
  sleep: '....TTT.../......T.../.....T..../....TTT.../.TTT....../...T....../..T......./.TTT......',
  g_sidearm: '.GGGGGGGGGG.../.GggggggggG.../.GGGGGGGGGG.../...ooo.k....../...ooo......../...ooo........',
  g_shotgun: 'GGGGGGGGGGGGGGG./oOOOOGGGGGGGGGG./oOOOOooo......../oOOOo...........',
  g_rifle: '...GGGGG........../ooGGGGGGGGGGGGGGGG/oOOOOOOOOGG......./oOOOo...Gk........',
  g_smg: 'GGGGGGGGGGG./GgggggggggG./GGGGGGGGGGG./.GG..GG...../.G...GG...../.....GG.....',
  g_silent: '.....o....../.....o....../oooooOooooo./OOOOOOOOOOGG/.....o....../.....o......',
  g_heavy: '....GGG.........../GGGGGGGGGGGGGGGGGG/GgggggggggggggggGG/GGGGGGGGGGGGGGGGGG/GG..GGGG........../G...GGGG..........',
};

const cache = new Map();

export function icon(name, tint = 'bone') {
  const key = name + ':' + tint;
  let c = cache.get(key);
  if (c) return c;
  const def = ICONS[name] || ICONS.warn;
  const rows = def.split('/');
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  c = createCanvas(w, h);
  const g = ctx2d(c);
  const ramp = RAMPS[tint] || RAMPS.bone;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const col = ch >= '0' && ch <= '3' ? ramp[+ch] : MAP[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}

export function drawIcon(ctx, name, x, y, tint, scale = 1) {
  const c = icon(name, tint);
  ctx.drawImage(c, Math.round(x), Math.round(y), c.width * scale, c.height * scale);
  return c.width * scale;
}

export const ICON_NAMES = Object.keys(ICONS);
