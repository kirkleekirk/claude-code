/* =====================================================================
   NPCS & DIALOGUE
   ===================================================================== */
const VILLAGERS = [
  { id: 'bao', name: 'Elder Bao', x: 5, z: -29, yaw: 3.0, wander: 4, look: { nation: 'earth', body: 'A', height: 0.95, build: 0.95, skin: '#d9ad84', hair: 'long', hairColor: '#d8d4cc', eyes: '#2f2416', outfit: 0, beard: true }, palette: ['#6b5a3e', '#d8c79a', '#3b3222'] },
  { id: 'mei', name: 'Merchant Mei', x: -9.6, z: 6.6, yaw: 0.9 + Math.PI, look: { nation: 'earth', body: 'B', height: 0.96, build: 1, skin: '#e1b892', hair: 'bun', hairColor: '#1b120c', eyes: '#5a3a22', outfit: 1 }, palette: ['#8a3a2a', '#e5d6ad', '#5a2a1a'] },
  { id: 'cabbage', name: 'Cabbage Merchant', x: 15.2, z: -1.6, yaw: 2.6, hat: '#d8c080', look: { nation: 'earth', body: 'A', height: 0.94, build: 0.9, skin: '#c99a72', hair: 'short', hairColor: '#2b1d12', eyes: '#2f2416', outfit: 1 }, palette: ['#5a7a3a', '#cfc08f', '#3b4a22'] },
  { id: 'lin', name: 'Innkeeper Lin', x: -25, z: -14, yaw: 0.9, look: { nation: 'earth', body: 'B', height: 0.98, build: 1.05, skin: '#f0cba6', hair: 'braids', hairColor: '#3a2618', eyes: '#3d7a3a', outfit: 2 }, palette: ['#2f5e3a', '#e5d6ad', '#1f3a22'] },
  { id: 'ru', name: 'Farmer Ru', x: 44, z: 22, wander: 9, hat: '#c8b070', look: { nation: 'earth', body: 'A', height: 1.0, build: 1.15, skin: '#b5835c', hair: 'bun', hairColor: '#2b1d12', eyes: '#2f2416', outfit: 2 }, palette: ['#7a6a3a', '#cfc08f', '#4a3f1f'] },
  { id: 'tam', name: 'Watchman Tam', x: -11, z: 33, yaw: 2.7, look: { nation: 'earth', body: 'A', height: 1.04, build: 1.1, skin: '#c99a72', hair: 'topknot', hairColor: '#1b120c', eyes: '#2f2416', outfit: 0 }, palette: ['#3f5a2a', '#8a7a52', '#2a2a1a'] },
  { id: 'kid', name: 'Little Shu', x: 4, z: 9, wander: 9, look: { nation: 'earth', body: 'B', height: 0.66, build: 0.9, skin: '#e1b892', hair: 'loopies', hairColor: '#2b1d12', eyes: '#5a3a22', outfit: 1 }, palette: ['#d9a441', '#efe0bb', '#8a3a2a'] },
  { id: 'dorje', name: 'Monk Dorje', x: 82, z: -73, yaw: 3.14, meditate: true, look: { nation: 'air', body: 'A', height: 0.98, build: 0.95, skin: '#c08f62', hair: 'shaved', hairColor: '#111', eyes: '#3a2a1a', outfit: 0, arrows: true } },
];
const Dialog = {
  open(npc) { const fn = DIALOGUE[npc.def.id]; if (!fn) return; this.npc = npc; G.ui.dialogOpen = true; playAction(npc.H, 'bow', 1.4); this.show(npc.name, fn(npc)); SFX.ui(); },
  show(name, node) {
    const d = document.getElementById('dialog'); d.classList.remove('hidden'); d.querySelector('.who').textContent = name; d.querySelector('.txt').innerHTML = node.t; const ch = d.querySelector('.ch'); ch.innerHTML = '';
    (node.c || [{ t: 'Farewell.', f: () => this.close() }]).forEach((c, i) => { const b = document.createElement('button'); b.textContent = `${i + 1}. ${c.t}`; b.onclick = () => { SFX.ui(); const r = c.f ? c.f() : null; if (r) this.show(name, r); else if (!c.keep) this.close(); }; ch.appendChild(b); });
    this.choices = node.c || null; G.input.unlock();
  },
  close() { document.getElementById('dialog').classList.add('hidden'); G.ui.dialogOpen = false; this.npc = null; },
  pick(i) { const btn = document.querySelectorAll('#dialog .ch button')[i]; if (btn) btn.click(); },
  inn() { const n = G.ents.find(e => e.def && e.def.id === 'lin'); if (n) this.open(n); },
};
const pName = () => G.player.profile.name;
const prevAv = () => PAST_AVATARS[prevElement(G.player.native)];
const DIALOGUE = {
  bao(npc) {
    const s = Game.state; const q = s.activeQuest; const P = G.player; const nx = nextElement(P.native);
    const lore = { t: 'Ask about the world…', keep: true, f: () => ({ t: 'Ask me what you like. My memory is long, even if my beard is longer.', c: [
      { t: 'Who was the Avatar before me?', f: () => ({ t: `Avatar ${prevAv().name} — ${prevAv().desc}. They died the year you were born. That is always the way of it: one flame goes out, and another is lit somewhere in the world.`, c: [{ t: 'Back', f: () => DIALOGUE.bao(npc) }] }) },
      { t: 'What is this valley?', f: () => ({ t: 'Tienhai — the Valley of Four Winds. Earth Kingdom land, on paper. In truth, Water Tribe traders come up the river, Fire Nation islanders sail in to the eastern shore, and Air Nomads drop from the sky to buy our peaches. The old ones say all four first teachers left marks here.', c: [{ t: 'Back', f: () => DIALOGUE.bao(npc) }] }) },
      { t: 'Why are the elements so hard to learn?', f: () => ({ t: `Every Avatar finds their own element easiest, and the one opposite hardest. ${EL[OPPOSITE[P.native]].name} will fight you every step — it is the opposite of your nature. The cycle teaches patience: ${ELEMENTS.map(e => EL[e].short).join(', ')}, and around again.`, c: [{ t: 'Back', f: () => DIALOGUE.bao(npc) }] }) },
      { t: 'Tell me about spirits.', f: () => ({ t: 'Seven thousand years ago, Avatar Wan shut the doors between our world and the spirits\'. Since then, spirits are… shy. But lately the farmers say lights move under the Elder Banyan at night. Lights that are not fireflies.', c: [{ t: 'Back', f: () => DIALOGUE.bao(npc) }] }) },
      { t: 'That is all.' }] }) };
    if (q === 'arrival') return { t: `So the Sages' messenger spoke true. The new Avatar, in my little village… I am Bao. I have kept Tienhai since my hair was black. Welcome, Avatar ${pName()}.`, c: [
      { t: 'I have come to train.', f: () => { G.flags.talkedBao = true; return { t: 'Then first you must learn to <i>live</i> out here. This valley is beautiful, and it will kill you if you let it. Eat. Drink. Respect the night. Come back to me when you have hunted, cooked and eaten a proper meal.', c: [{ t: 'I will.' }] }; } }, lore] };
    if (q === 'eat') { const hint = { fire: 'You carry your own hearth, firebender. Cook with your hands — gently. Burnt meat is a lesson too, but a bitter one.', water: 'Your people pull fish from the sea with a twist of the wrist. Draw water from the lake or river and see what comes with it.', earth: 'Gather firewood, build a fire, strike stone for sparks. An earthbender can pull stone straight from the ground.', air: 'The monks eat no meat, I know. The orchards and berry bushes will feed you — but a hide or a fish will sell, and a fire still warms.' }[P.native];
      return { t: `Hungry? ${hint} Rabbaroos graze the meadows, turtle-ducks paddle on the lake. Avoid the river at dusk — platypus-bears.`, c: [lore, { t: 'Thank you, Elder.' }] }; }
    if (q === 'night') return { t: `Night comes fast in the valley. Predators grow bold after dark — but every beast fears fire. Build a campfire, ${P.native === 'earth' ? 'or raise stone around yourself the way earth sages do on the road,' : ''} or take a bed at Lin's inn. Then sleep until the sun returns.`, c: [lore, { t: 'I understand.' }] };
    if (q === 'path') return { t: 'Every technique is a lesson, and every lesson has a price. Open your scroll and look at the trials that stand before you. The Avatar must earn each step, just as any bender.', c: [lore, { t: 'I will look.' }] };
    if (q === 'daofei') { const prog = s.quests.daofei || { step: 0 };
      if (prog.step >= 2 && !G.flags.reportedDaofei) return { t: `The road is free again? ${s.daofeiDown.length >= DAOFEI.length ? 'And you left them breathing. Good. Daofei are cruel, but an Avatar who answers cruelty with killing becomes a different kind of story.' : ''} Yao carried a map, they say. Keep it close. You have done this valley a great service.`, c: [{ t: 'It was the right thing to do.', f: () => { G.flags.reportedDaofei = true; return null; } }] };
      return { t: 'Mei tells me daofei have taken the old east road. Outlaws, led by an earthbender called Yao the Breaker. If anyone can drive them off, it is you. But be careful: there are five of them.', c: [lore, { t: 'I will deal with them.' }] }; }
    if (q === 'teachers') return { t: `Now you are ready for the old teachers. The cycle says that after ${EL[P.native].name} comes <b>${EL[nx].name}</b>. ${{ fire: 'Sky bison graze atop the great northern peak. Sit among them and listen to the wind.', air: 'The Moon Pool shrine by Lake Yue holds the Moon\'s light. Go there at night and meditate.', water: 'A badgermole sleeps in the caves northeast of the pagoda hill. Go, and listen as it listens.', earth: 'The ruins of a people who learned fire from dragons stand in the western crags. Their flame still burns. Meditate before it by day.' }[nx]} Learn it through your scroll when the trial is done — then come sit beneath the Elder Banyan. I have a feeling it is waiting for you.`, c: [lore, { t: 'I will seek the teacher.' }] };
    return { t: `Avatar ${pName()}. The valley is quieter with you in it. Train, hunt, rest. The world will call when it is ready.`, c: [lore, { t: 'Farewell, Elder.' }] };
  },
  mei(npc) {
    const buy = (item, n, cost, label) => ({ t: `${label} — ${cost} copper`, keep: true, f: () => { if (Game.count('copper') < cost) return { t: 'You cannot afford that, Avatar or not.', c: [{ t: 'Back', f: () => DIALOGUE.mei(npc) }] }; Game.take('copper', cost); if (item === 'skin') { G.player.waterMax += 2; G.player.water = G.player.waterMax; G.flags.bigSkin = true; G.ui.note('Your waterskin now holds more.', 'good'); } else Game.give(item, n); SFX.coin(); return DIALOGUE.mei(npc); } });
    const sellAll = (item, price) => ({ t: `Sell all ${ITEMS[item].name} (${Game.count(item)}) — ${price} each`, keep: true, f: () => { const n = Game.count(item); if (!n) return DIALOGUE.mei(npc); Game.take(item, n); Game.give('copper', n * price); SFX.coin(); return DIALOGUE.mei(npc); } });
    const c = [buy('meat_cooked', 1, 10, 'Buy roast meat'), buy('herb', 1, 10, 'Buy a healing herb'), buy('wood', 4, 5, 'Buy a bundle of firewood (4)')];
    if (!G.flags.bigSkin) c.push(buy('skin', 1, 30, 'Buy a larger waterskin'));
    if (Game.count('hide')) c.push(sellAll('hide', 6)); if (Game.count('meat_raw')) c.push(sellAll('meat_raw', 3)); if (Game.count('fish_raw')) c.push(sellAll('fish_raw', 3));
    c.push({ t: 'Any news on the road?', keep: true, f: () => ({ t: 'Daofei. A gang camped east of here on the old road to the coast — they took two of my carts last month. Their leader, Yao, can split a boulder with one fist. Someone should do something.', c: [{ t: 'Back', f: () => DIALOGUE.mei(npc) }] }) });
    c.push({ t: 'Nothing today.' });
    return { t: `Welcome, welcome! You have ${Game.count('copper')} copper. Mei's stall has the best prices between Ba Sing Se and the sea.`, c };
  },
  cabbage(npc) { return { t: 'Cabbages! The finest cabbages in the valley! Grown with love, carried with care. Please — whatever you do — <i>be careful with the cart.</i>', c: [
    { t: 'Buy a cabbage (2 copper)', keep: true, f: () => { if (Game.take('copper', 2)) { Game.give('cabbage', 1); SFX.coin(); return { t: 'A wise choice! Crunchy, sweet, and very, very fragile.', c: [{ t: 'Back', f: () => DIALOGUE.cabbage(npc) }] }; } return { t: 'No copper, no cabbage.', c: [{ t: 'Back', f: () => DIALOGUE.cabbage(npc) }] }; } },
    { t: 'Why so nervous?', f: () => ({ t: 'Benders! Every time benders fight in a market, it is <i>always</i> the cabbage cart. Always! I think the universe has something against cabbages.', c: [{ t: 'I will be careful.' }] }) }, { t: 'Goodbye.' }] }; },
  lin(npc) { const free = !G.flags.innUsed; const night = G.time >= 19 || G.time < 5;
    return { t: night ? `A bed for the night, Avatar? ${free ? 'The first night is on the house.' : 'Five copper, and breakfast is included.'}` : 'Welcome to the Inn of the Jade Lantern. Beds are for the night — come back after dusk.', c: [
      ...(night ? [{ t: free ? 'Thank you. I will rest.' : 'Rent a bed (5 copper)', f: () => { if (!free && !Game.take('copper', 5)) return { t: 'You are short on copper.', c: [{ t: 'Another time.' }] }; G.flags.innUsed = true; G.player.pos.set(World.inn.x + 4, groundH(World.inn.x + 4, World.inn.z + 5), World.inn.z + 5); Game.sleep(); return null; } }] : []),
      { t: 'Heard anything interesting?', f: () => ({ t: 'A monk climbed the pagoda hill three days ago and has not come down. Sits up there like a statue. Says he is waiting for "the one the bison told him about." Monks!', c: [{ t: 'Interesting.' }] }) }, { t: 'Goodbye.' }] }; },
  ru(npc) { return { t: 'Mind the fields! Platypus-bears have been bold this season — came right up to the fence last night. If you hunt, hunt by the river and keep a fire going at dusk. Beasts fear the flame.', c: [{ t: 'Any work for me?', f: () => ({ t: 'Ha! The Avatar, pulling weeds? Bring meat and hides to Mei instead — she pays fair.', c: [{ t: 'Fair enough.' }] }) }, { t: 'Goodbye.' }] }; },
  tam(npc) { return { t: `Halt — oh. You are the one Bao told us about. Avatar ${pName()}. The east road has been dangerous since the daofei camped there. And something howls in the northern woods at night. A saber-tooth moose-lion, I'd wager.`, c: [{ t: 'I will be careful.' }] }; },
  kid(npc) { return { t: 'Are you REALLY the Avatar? Can you do a trick? Do a trick! Do a bending trick!', c: [{ t: '(Show off a little)', f: () => { const P = G.player; const el = P.element; FX.burst(V3(P.pos.x, P.pos.y + 1.5, P.pos.z), el === 'fire' ? PAL.fireA : el === 'water' ? PAL.waterA : el === 'earth' ? PAL.dustA : PAL.airA, el === 'fire' ? PAL.fireB : el === 'water' ? PAL.waterB : el === 'earth' ? PAL.dustB : PAL.airB, 30, 3, 0.4, 0.8, { up: 2, normal: el !== 'fire' }); SFX[el === 'avatar' ? 'air' : el](); playAction(npc.H, 'leap'); return { t: 'WHOAAA! When I grow up I\'m going to be a bender too! Or a cabbage merchant.', c: [{ t: 'Ha. Good luck.' }] }; } }, { t: 'Not now.' }] }; },
  dorje(npc) { const P = G.player; return { t: P.native === 'air' ? `Ah — a child of the temples, wearing the Avatar's spirit. The bison told me you would come. Have you remembered to breathe today?` : `Welcome, Avatar. I am Dorje, of the ${['Southern', 'Eastern', 'Western', 'Northern'][P.profile.name.length % 4]} Air Temple. The sky bison told me a new Avatar was walking in this valley.`, c: [
    { t: 'What does it mean to meditate?', f: () => ({ t: 'To let go of what weighs on you. Sit (C). Breathe. Let your chi return. Many of your trials will ask you to sit in a particular place — where the old teachers left their mark. Sunrise for fire, moonlight for water, the bison\'s peak for air, the badgermole\'s cave for earth.', c: [{ t: 'Thank you.' }] }) },
    { t: 'Tell me about airbending.', f: () => ({ t: 'Air is the element of freedom. We do not fight — we evade, we redirect. An airbender who must stand and strike has already lost a little. And we fall like leaves: the air catches us.', c: [{ t: 'I see.' }] }) },
    { t: 'Goodbye.' }] }; },
};

/* =====================================================================
   UI
   ===================================================================== */
const $ = (s) => document.querySelector(s);
const UI = {
  dialogOpen: false, panelOpen: false, lastHud: 0, el: {},
  init() {
    this.feed = $('#feed'); this.floaters = $('#floaters'); this.hpw = [];
    $('#needs').innerHTML = ['hunger:食', 'thirst:飲', 'warmth:暖', 'water:囊'].map(s => { const [k, g] = s.split(':'); return `<div class="need" id="n_${k}" title="${k}"><svg viewBox="0 0 38 38"><circle cx="19" cy="19" r="16" fill="rgba(10,6,3,.6)" stroke="rgba(255,255,255,.15)" stroke-width="3"/><circle class="arc" cx="19" cy="19" r="16" fill="none" stroke="#ffd27a" stroke-width="3.5" stroke-dasharray="100.5" stroke-dashoffset="0" stroke-linecap="round"/></svg><div class="ic">${g}</div></div>`; }).join('');
    $('#titleEmblems').innerHTML = ELEMENTS.map(e => `<div class="emblem" style="color:${EL[e].color};font-family:var(--brush);font-size:40px;text-align:center;text-shadow:0 0 12px ${EL[e].color}">${EL[e].glyph}</div>`).join('');
    $('#pClose').onclick = () => this.closePanel(); document.querySelectorAll('#ptabs button[data-p]').forEach(b => b.onclick = () => this.openPanel(b.dataset.p));
    $('#bResume').onclick = () => this.pause(false); $('#bSave').onclick = () => Game.save(false); $('#bQuit').onclick = () => { Game.save(); location.reload(); };
    $('#bHelp').onclick = () => { $('#pauseExtra').innerHTML = CONTROLS_HTML; }; $('#bSettings').onclick = () => this.settings();
    $('#bRespawn').onclick = () => Game.respawn(); this.mm = $('#minimap').getContext('2d');
  },
  note(text, cls = '') { if (!this.feed) return; const d = document.createElement('div'); d.className = 'note ' + cls; d.innerHTML = text; this.feed.appendChild(d); while (this.feed.children.length > (IS_TOUCH ? 3 : 5)) this.feed.firstChild.remove(); setTimeout(() => { d.style.transition = 'opacity .6s'; d.style.opacity = 0; setTimeout(() => d.remove(), 650); }, 4200 + text.length * 25); G.lastNote = text; },
  banner(a, b) { const el = $('#banner'); el.querySelector('.a').textContent = a; el.querySelector('.b').textContent = b || ''; el.classList.add('show'); clearTimeout(this._bt); this._bt = setTimeout(() => el.classList.remove('show'), 3200); },
  floater(pos, n, el) { if (G.vr) return; const d = document.createElement('div'); d.className = 'dmg'; d.textContent = n; d.style.color = { fire: '#ffb070', water: '#9fe0ff', ice: '#c8f0ff', iceprison: '#c8f0ff', earth: '#d8c890', air: '#ffffff', hurt: '#ff6a55' }[el] || '#fff';
    this.floaters.appendChild(d); const p = pos.clone(); p.y += 1.8; const t0 = performance.now(); const jitter = (Math.random() - 0.5) * 30;
    const step = () => { const t = (performance.now() - t0) / 900; if (t > 1) { d.remove(); return; } const s = p.clone(); s.y += t * 1.2; s.project(G.cam); if (s.z > 1) { d.style.display = 'none'; } else { d.style.display = ''; d.style.left = ((s.x + 1) / 2 * innerWidth + jitter) + 'px'; d.style.top = ((1 - s.y) / 2 * innerHeight) + 'px'; d.style.opacity = 1 - t * t; } requestAnimationFrame(step); }; step(); },
  hurtFlash() { const v = $('#vignette'); v.style.opacity = 1; clearTimeout(this._hv); this._hv = setTimeout(() => v.style.opacity = 0, 220); },
  progress(f) { const p = $('#progress'); if (f < 0) { p.classList.add('hidden'); return; } p.classList.remove('hidden'); p.querySelector('i').style.width = (U.clamp(f, 0, 1) * 100) + '%'; },
  ceremony(glyph, t1, t2, t3, color) { const c = $('#ceremony'); c.querySelector('.glyph').textContent = glyph; c.querySelector('.glyph').style.color = color; c.querySelector('.t1').textContent = t1; c.querySelector('.t2').textContent = t2; c.querySelector('.t2').style.color = color; c.querySelector('.t3').textContent = '“' + t3 + '”';
    c.querySelector('.wash').style.background = `radial-gradient(ellipse at center, ${color}55 0%, ${color}22 40%, transparent 75%)`; c.classList.add('show'); clearTimeout(this._ct); this._ct = setTimeout(() => c.classList.remove('show'), 4200); },
  dead(text) { $('#deadTxt').textContent = text; $('#dead').classList.remove('hidden'); G.input.unlock(); },
  hideDead() { $('#dead').classList.add('hidden'); },
  fade(on) { $('#fade').style.opacity = on ? 1 : 0; },
  story(pages, done, opts = {}) { let i = 0; const box = $('#story'); box.classList.remove('hidden'); G.input.unlock(); G.ui.storyOpen = true;
    const show = () => { $('#storyText').innerHTML = pages[i]; $('#storyNext').textContent = i < pages.length - 1 ? 'Continue' : (opts.last || 'Close'); };
    const end = () => { box.classList.add('hidden'); G.ui.storyOpen = false; if (done) done(); };
    $('#storyNext').onclick = () => { SFX.ui(); i++; if (i >= pages.length) end(); else show(); }; $('#storySkip').onclick = () => { SFX.ui(); end(); }; $('#storySkip').style.display = pages.length > 1 ? '' : 'none'; show(); },
  pause(on) { if (G.mode !== 'play' && G.mode !== 'paused') return; $('#pause').classList.toggle('hidden', !on); G.mode = on ? 'paused' : 'play'; $('#pauseExtra').innerHTML = ''; if (on) G.input.unlock(); },
  settings() {
    const s = G.settings; $('#pauseExtra').innerHTML = `<div class="ctrl" style="margin-top:12px">
      <label><input type="checkbox" id="sSfx" ${SFX.on ? 'checked' : ''}> Sound effects</label><br>
      <label><input type="checkbox" id="sMus" ${SFX.music ? 'checked' : ''}> Ambient music</label><br>
      <label>Mouse / touch look sensitivity <input type="range" id="sSens" min="0.3" max="2.5" step="0.1" value="${s.sens}"></label>
      <label><input type="checkbox" id="sInv" ${s.invertY ? 'checked' : ''}> Invert vertical look</label><br>
      <label><input type="checkbox" id="sFP" ${s.firstPerson ? 'checked' : ''}> First-person camera (V)</label><br>
      <label>Day length <select id="sDay"><option value="600">10 min</option><option value="840">14 min</option><option value="1200">20 min</option></select></label></div>`;
    $('#sDay').value = String(G.dayLen); $('#sSfx').onchange = (e) => SFX.on = e.target.checked; $('#sMus').onchange = (e) => SFX.music = e.target.checked; $('#sSens').oninput = (e) => s.sens = +e.target.value; $('#sInv').onchange = (e) => s.invertY = e.target.checked; $('#sFP').onchange = (e) => s.firstPerson = e.target.checked; $('#sDay').onchange = (e) => G.dayLen = +e.target.value;
  },
  /* ---------------- HUD ---------------- */
  hud(dt) {
    const P = G.player; if (!P) return; const s = Game.state;
    const set = (id, v, max, txt) => { const b = document.getElementById(id); b.querySelector('i').style.width = (U.clamp(v / max, 0, 1) * 100) + '%'; const sp = b.querySelector('span'); if (sp) sp.textContent = txt; };
    set('hpbar', P.hp, P.maxHp, `HEALTH ${Math.ceil(P.hp)} / ${P.maxHp}`); set('chibar', P.chi, P.maxChi, `CHI ${Math.floor(P.chi)} / ${P.maxChi}`); set('stbar', P.stam, 100); set('xpbar', s.xp, Game.xpNeed());
    const need = (k, v) => { const n = document.getElementById('n_' + k); n.querySelector('.arc').style.strokeDashoffset = 100.5 * (1 - U.clamp(v / 100, 0, 1)); n.querySelector('.arc').style.stroke = v < 25 ? '#ff6a55' : k === 'warmth' ? (v < 40 ? '#9fd8ff' : '#ffb070') : k === 'water' ? '#57c0e8' : '#ffd27a'; n.classList.toggle('low', v < 20); };
    need('hunger', P.hunger); need('thirst', P.thirst); need('warmth', P.warmth); need('water', P.water / P.waterMax * 100);
    if (G.t - this.lastHud < 0.1) return; this.lastHud = G.t;
    $('#lvl').textContent = `${P.profile.name} · Level ${s.level}${s.sp ? ` · ${s.sp} SP` : ''}`;
    const st = []; if (P.meditating) st.push('Meditating'); if (P.sheltered) st.push('Sheltered'); if (P.status.sick > 0) st.push('Sick'); if (P.warmth < 20) st.push('Freezing'); if (P.hunger < 15) st.push('Starving'); if (P.thirst < 15) st.push('Parched'); if (P.handFlame > 0) st.push('Hand Flame'); if (nearestLitFire(P.pos, 6)) st.push('By the Fire');
    if (P.native === 'fire' || Game.state.awakened.includes('fire')) st.push(isNight() ? 'Fire ▼ (night)' : 'Fire ▲ (sun)'); if (P.native === 'water' || Game.state.awakened.includes('water')) st.push(isNight() ? (moonPhase() > 0.95 ? 'Water ▲▲ (full moon)' : 'Water ▲ (moon)') : 'Water ▼ (day)');
    $('#status').innerHTML = st.map(x => `<b>${x}</b>`).join('');
    const hh = Math.floor(G.time), mm = Math.floor((G.time - hh) * 60); const icon = isNight() ? '☾' : '☀'; $('#clock').textContent = `${icon} Day ${G.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${isNight() && moonPhase() > 0.95 ? ' · Full Moon' : ''}`;
    // region
    let reg = 'Tienhai Valley'; let bd = 1e9; for (const k in LOC) { const L = LOC[k]; const d = Math.hypot(P.pos.x - L.x, P.pos.z - L.z); if (d < L.r + 20 && d < bd) { bd = d; reg = L.name; } } $('#region').textContent = reg;
    // hotbar
    this.hotbar(); this.compass(); this.minimap(); this.questBox(); this.prompt(); this.healthBars();
    $('#cold').style.opacity = P.warmth < 30 ? (30 - P.warmth) / 30 : 0;
  },
  slotsFor(el) { return Object.keys(TECH).filter(id => TECH[id].el === el && Game.has(id) && TECH[id].kind !== 'passive'); },
  hotbar() {
    const P = G.player; const els = ELEMENTS.filter(e => Game.elementOpen(e));
    const eh = ELEMENTS.map(e => `<div class="el ${Game.elementOpen(e) ? 'ok' : ''} ${P.element === e ? 'on' : ''}" data-e="${e}" style="color:${EL[e].color}">${EL[e].glyph}</div>`).join('');
    if (eh !== this._eh) { $('#elems').innerHTML = eh; this._eh = eh; $('#elems').querySelectorAll('.el').forEach(d => d.onclick = (ev) => { ev.stopPropagation(); if (Game.elementOpen(d.dataset.e)) G.player.element = d.dataset.e; }); }
    void els;
    const ids = this.slotsFor(P.element); const keys = IS_TOUCH ? ['A', 'B', 'C', 'D', ''] : ['LMB', 'RMB', '3', '4', '5'];
    const html = ids.slice(0, 5).map((id, i) => { const t = TECH[id]; const cd = P.cds[id] || 0; const can = P.chi >= chiCost(id); return `<div class="slot ${can ? '' : 'nochi'} ${G.vr && i === (G.vrSlot || 0) ? 'sel' : ''}" data-i="${i}"><div class="k">${keys[i]}</div><div class="c">${chiCost(id) || ''}</div><div class="g" style="color:${EL[t.el] ? EL[t.el].color : '#fff'}">${t.glyph}</div><div class="n">${t.name}</div><div class="cd" style="height:${U.clamp(cd / (t.cd || 1), 0, 1) * 100}%"></div></div>`; }).join('');
    if (html !== this._sh) { $('#slots').innerHTML = html; this._sh = html; $('#slots').querySelectorAll('.slot').forEach(d => d.onpointerdown = (ev) => { ev.stopPropagation(); G.input.castSlot(+d.dataset.i); }); }
    // touch: the ELEM button shows the current element (the desktop hotbar is hidden on phones)
    if (IS_TOUCH) { const te = document.getElementById('tE'); const g2 = `${EL[P.element].glyph}<small>ELEM</small>`; if (te.dataset.g !== P.element) { te.dataset.g = P.element; te.innerHTML = g2; te.style.color = EL[P.element].color; te.style.fontFamily = 'var(--brush)'; te.style.fontSize = '20px'; } }
    // touch button glyphs
    if (IS_TOUCH) ['tA', 'tB', 'tC', 'tD'].forEach((b, i) => { const id = ids[i]; const el = document.getElementById(b); const g = id ? TECH[id].glyph : '·'; if (el.dataset.g !== g) { el.dataset.g = g; el.innerHTML = id ? `<div class="cdr"></div>${g}<small>${TECH[id].name.split(' ')[0].toUpperCase()}</small>` : '·'; el.style.color = id ? EL[TECH[id].el].color : '#888'; }
      if (id) { const cd = U.clamp((P.cds[id] || 0) / (TECH[id].cd || 1), 0, 1); const r = el.querySelector('.cdr'); if (r) r.style.background = cd > 0 ? `conic-gradient(rgba(0,0,0,.6) ${cd * 360}deg, transparent 0)` : 'none'; el.style.opacity = P.chi >= chiCost(id) ? 1 : 0.45; } });
  },
  markers() {
    const P = G.player; const out = [];
    for (const k in LOC) { if (!Game.state.discovered.includes(k) && k !== 'village') continue; const L = LOC[k]; out.push({ x: L.x, z: L.z, g: L.glyph, c: L.color, name: L.name }); }
    const q = this.questTarget(); if (q) out.push({ x: q.x, z: q.z, g: '◆', c: '#ff6a3a', q: true, name: 'Quest' });
    void P; return out;
  },
  questTarget() {
    const s = Game.state; const q = s.activeQuest; const pr = s.quests[q] || { step: 0 }; const P = G.player;
    if (q === 'arrival') return pr.step === 0 ? { x: 0, z: 0 } : { x: G.ents.find(e => e.def && e.def.id === 'bao').pos.x, z: G.ents.find(e => e.def && e.def.id === 'bao').pos.z };
    if (q === 'daofei') return pr.step < 2 ? { x: LOC.daofei.x, z: LOC.daofei.z } : { x: G.ents.find(e => e.def && e.def.id === 'bao').pos.x, z: G.ents.find(e => e.def && e.def.id === 'bao').pos.z };
    if (q === 'teachers') { if (pr.step === 0) { const nx = nextElement(P.native); const L = { fire: LOC.sunruins, air: LOC.bisonpeak, water: LOC.moonpool, earth: LOC.badgercave }[nx]; return { x: L.x, z: L.z }; } return { x: LOC.banyan.x, z: LOC.banyan.z }; }
    if (q === 'night' && pr.step === 1 && !(G.time >= 19 || G.time < 5)) return null;
    return null;
  },
  compass() {
    const P = G.player; const c = $('#compass'); const W = c.clientWidth; const fwd = G.camFwd; const head = Math.atan2(fwd.x, fwd.z);
    const items = [{ b: Math.PI, t: 'N', m: true }, { b: Math.PI / 2, t: 'E', m: true }, { b: 0, t: 'S', m: true }, { b: -Math.PI / 2, t: 'W', m: true }];
    for (const m of this.markers()) items.push({ b: Math.atan2(m.x - P.pos.x, m.z - P.pos.z), t: m.g, col: m.c, q: m.q, d: Math.hypot(m.x - P.pos.x, m.z - P.pos.z) });
    let html = '<div class="tick"></div>'; for (const it of items) { const rel = U.angDiff(it.b, head); if (Math.abs(rel) > Math.PI / 2) continue; const x = W / 2 + rel / (Math.PI / 2) * (W / 2);
      html += `<div class="c ${it.m ? 'm' : ''} ${it.q ? 'q' : ''}" style="left:${x}px;${it.col && !it.q ? `color:${it.col}` : ''}">${it.t}${it.q && it.d ? `<span style="font-size:10px"> ${Math.round(it.d)}m</span>` : ''}</div>`; }
    c.innerHTML = html;
  },
  minimap() {
    const g = this.mm; const P = G.player; const S = 300, span = 170; const sc = S / span; const img = World.minimapImg; const k = img.width / WORLD.size; const fwd = G.camFwd; const head = Math.atan2(fwd.x, fwd.z);
    g.save(); g.clearRect(0, 0, S, S); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip(); g.fillStyle = '#1d3a55'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2); g.rotate(head + Math.PI); g.scale(sc, sc); g.translate(-(P.pos.x + WORLD.half), -(P.pos.z + WORLD.half)); g.imageSmoothingEnabled = true; g.drawImage(img, 0, 0, img.width, img.height, 0, 0, WORLD.size, WORLD.size);
    const dot = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x + WORLD.half, z + WORLD.half, r / sc, 0, 7); g.fill(); };
    for (const f of G.campfires) if (f.lit) dot(f.pos.x, f.pos.z, 4, '#ff8a3a');
    const sense = Game.has('spirit_sense');
    for (const e of G.ents) { if (!e.alive || e.removed) continue; const d = e.pos.distanceTo(P.pos); if (d > span) continue;
      if (e.kind === 'villager') dot(e.pos.x, e.pos.z, 3.5, '#9fd68a'); else if (e.hostile && (sense || e.state === 'chase' || e.state === 'attack' || e.kind === 'daofei' && G.flags.daofeiAlert)) dot(e.pos.x, e.pos.z, 4, '#ff4a3a'); else if (sense) dot(e.pos.x, e.pos.z, 3, e.sp && e.sp.passive ? '#bfe7ff' : '#ffe08a'); }
    g.restore();
    // landmark glyphs (upright)
    g.save(); g.translate(S / 2, S / 2); g.font = '22px "Ma Shan Zheng", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of this.markers()) { const dx = m.x - P.pos.x, dz = m.z - P.pos.z; const rx = (dx * Math.cos(head + Math.PI) - dz * Math.sin(head + Math.PI)) * sc, rz = (dx * Math.sin(head + Math.PI) + dz * Math.cos(head + Math.PI)) * sc; let x = rx, y = rz; const r = Math.hypot(x, y); if (r > S / 2 - 14) { x *= (S / 2 - 14) / r; y *= (S / 2 - 14) / r; }
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill(); g.fillStyle = m.c; g.fillText(m.g, x, y + 1); }
    // player arrow
    g.rotate(-U.angDiff(head, P.yaw)); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
    // north indicator on the rim: north is world -z, i.e. bearing PI
    const rel = U.angDiff(head, Math.PI); g.fillStyle = '#ffe2a8'; g.font = 'bold 22px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = '#000'; g.lineWidth = 4;
    const nx = S / 2 - Math.sin(rel) * (S / 2 - 18), ny = S / 2 - Math.cos(rel) * (S / 2 - 18); g.strokeText('N', nx, ny); g.fillText('N', nx, ny);
  },
  questBox() {
    const s = Game.state; const q = QUESTS[s.activeQuest]; const box = $('#quest'); if (!q) { box.innerHTML = G.flags.chapter1 ? '<div class="t">Chapter One Complete</div><div class="o">Train your elements and explore the valley.</div>' : ''; return; }
    const pr = s.quests[s.activeQuest] || { step: 0 };
    const html = `<div class="t">${q.title}</div><div class="o">${q.steps.map((st, i) => { const txt = typeof st.text === 'function' ? st.text() : st.text; if (i > pr.step) return ''; return `<div class="${i < pr.step ? 'done' : ''}">${i < pr.step ? '✓' : '◆'} ${txt}${st.progress && i === pr.step ? ` (${st.progress()})` : ''}</div>`; }).join('')}</div>`;
    if (html !== this._qh) { box.innerHTML = html; this._qh = html; }
  },
  prompt() {
    const P = G.player; const p = $('#prompt'); if (P.dead || G.vr) { p.classList.add('hidden'); return; } const it = Game.findInteract(); G.curInteract = it;
    if (it) { p.classList.remove('hidden'); p.innerHTML = `<kbd>${IS_TOUCH ? '✋' : 'F'}</kbd>${it.label}`; } else p.classList.add('hidden');
    $('#cross').classList.toggle('lock', !!G.aim.target);
  },
  healthBars() {
    if (G.vr) return; const show = G.ents.filter(e => e.alive && !e.removed && (e.kind === 'daofei' || (e.kind === 'animal' && !e.sp.passive)) && (e.hp < e.maxHp || e === G.aim.target || (e.hostile && (e.state === 'chase' || e.state === 'attack'))) && e.pos.distanceTo(G.player.pos) < 40).slice(0, 8);
    while (this.hpw.length < show.length) { const d = document.createElement('div'); d.className = 'hpw'; d.innerHTML = '<div class="nm"></div><div class="hb"><i></i></div>'; this.floaters.appendChild(d); this.hpw.push(d); }
    this.hpw.forEach((d, i) => { const e = show[i]; if (!e) { d.style.display = 'none'; return; } const p = V3(e.pos.x, e.pos.y + e.height + 0.5, e.pos.z).project(G.cam); if (p.z > 1) { d.style.display = 'none'; return; }
      d.style.display = ''; d.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - p.y) / 2 * innerHeight) + 'px'; d.className = 'hpw' + (e.sp && e.sp.prey ? ' prey' : ''); d.querySelector('.nm').textContent = e.name; d.querySelector('i').style.width = (e.hp / e.maxHp * 100) + '%'; });
  },
  /* ---------------- panels ---------------- */
  openPanel(tab) { this.panelOpen = true; this.tab = tab; $('#pbody').className = tab === 'skills' ? 'skills' : ''; $('#panel').classList.remove('hidden'); G.input.unlock(); document.querySelectorAll('#ptabs button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === tab)); $('#spLabel').textContent = `Skill Points: ${Game.state.sp}`; this['panel_' + tab](); SFX.ui(); if (tab === 'skills') G.flags.openedSkills = true; },
  closePanel() { this.panelOpen = false; $('#panel').classList.add('hidden'); },
  panel_skills() {
    const P = G.player; this.treeEl = this.treeEl || P.native; const tabs = ['avatar', ...ELEMENTS];
    $('#pbody').innerHTML = `<div id="etabs">${tabs.map(e => { const nm = e === 'avatar' ? 'Avatar' : EL[e].short; const g = e === 'avatar' ? '神' : EL[e].glyph; const col = e === 'avatar' ? '#3a6a8a' : EL[e].color; const aff = e === 'avatar' ? '' : affinity(P.native, e); const open = e === 'avatar' || Game.elementOpen(e);
      return `<button data-e="${e}" class="${this.treeEl === e ? 'on' : ''}"><span class="g" style="color:${col}">${g}</span>${nm}${aff ? `<small style="opacity:.7">&nbsp;· ${aff}${open ? '' : ' · sealed'}</small>` : ''}</button>`; }).join('')}</div>
      <div id="tree"><div id="treeview"><div class="bg">${this.treeEl === 'avatar' ? '神' : EL[this.treeEl].glyph}</div><svg class="links"></svg></div><div id="tinfo"></div></div>`;
    document.querySelectorAll('#etabs button').forEach(b => b.onclick = () => { this.treeEl = b.dataset.e; this.sel = null; this.panel_skills(); SFX.ui(); });
    const tv = $('#treeview'); const ids = Object.keys(TECH).filter(id => TECH[id].el === this.treeEl && TREE_POS[id] && !(TECH[id].awaken === P.native));
    let lines = ''; for (const id of ids) for (const r of (TECH[id].req || [])) { if (!TREE_POS[r] || !ids.includes(r) && TECH[r].el !== this.treeEl) continue; const a = TREE_POS[r], b = TREE_POS[id]; const lit = Game.state.learned.includes(r) && Game.state.learned.includes(id);
      lines += `<line x1="${a[0]}%" y1="${9 + a[1] * 0.82}%" x2="${b[0]}%" y2="${9 + b[1] * 0.82}%" stroke="${lit ? '#b8321f' : '#8a6a35'}" stroke-width="${lit ? 4 : 2}" stroke-dasharray="${TECH[id].late ? '6 6' : ''}"/>`; }
    tv.querySelector('svg').innerHTML = lines;
    for (const id of ids) { const t = TECH[id]; const d = document.createElement('div'); const learned = Game.state.learned.includes(id) && (t.el === 'avatar' || Game.elementOpen(t.el)); const reason = Game.lockReason(id);
      const cls = t.late ? 'late' : learned ? 'learned' : Game.canLearn(id) ? 'ready' : reason ? 'locked' : ''; d.className = 'node ' + cls + (this.sel === id ? ' sel' : '');
      const col = t.el === 'avatar' ? (t.awaken ? EL[t.awaken].color : '#3a6a8a') : EL[t.el].color; d.style.left = TREE_POS[id][0] + '%'; d.style.top = (9 + TREE_POS[id][1] * 0.82) + '%';
      d.innerHTML = `<div class="g" style="color:${col}">${t.glyph}</div><div class="n">${t.name}</div>`; d.onclick = () => { this.sel = id; this.panel_skills(); SFX.ui(); }; tv.appendChild(d); }
    if (!this.sel || !ids.includes(this.sel)) this.sel = ids.find(id => Game.canLearn(id)) || ids[0];
    this.techInfo(this.sel);
  },
  techInfo(id) {
    const t = TECH[id]; const P = G.player; const box = $('#tinfo'); if (!t) { box.innerHTML = ''; return; }
    const learned = Game.state.learned.includes(id) && (t.el === 'avatar' || Game.elementOpen(t.el)); const reason = Game.lockReason(id);
    const affEl = t.awaken || (t.el !== 'avatar' ? t.el : null); const aff = affEl ? affinity(P.native, affEl) : null;
    const affTxt = aff === 'native' ? `<span style="color:#2f6e2a">Native element</span> — learned at normal cost.` : aff === 'adjacent' ? `<span style="color:#8a6a1a">Adjacent element</span> — trials and costs ×1.5, chi ×1.1.` : aff === 'opposite' ? `<span style="color:#b8321f">Opposite element</span> — your nature resists it. Trials and costs ×2.5, chi ×1.25.` : '';
    let html = `<div class="tier">${t.el === 'avatar' ? 'AVATAR' : EL[t.el].name.toUpperCase()} · TIER ${['', 'I', 'II', 'III', 'IV'][t.tier]}${t.kind ? ' · ' + ({ proj: 'Ranged', melee: 'Melee', self: 'Movement', aoe: 'Area', util: 'Survival / Utility', passive: 'Passive' }[t.kind] || '') : ''}</div><h3>${t.name}</h3><p>${t.desc}</p>`;
    if (t.quote) html += `<div class="q">“${t.quote}”</div>`; if (affTxt) html += `<div class="aff">${affTxt}</div>`;
    if (!t.late) { const stats = []; if (t.chi) stats.push(`Chi: ${chiCost(id)}`); if (t.cd) stats.push(`Cooldown: ${t.cd}s`); if (t.dmg) stats.push(`Power: ${t.dmg}`); if (t.water) stats.push('Needs a water source'); if (t.grounded) stats.push('Must be on the ground'); if (stats.length) html += `<div class="stats">${stats.join(' · ')}</div>`; }
    if (learned) html += `<p style="color:#2f6e2a;font-weight:700">✓ Mastered</p>`;
    else if (t.late) html += `<p style="font-style:italic;color:#6a5a3a">This path lies further along your journey.</p>`;
    else {
      if (t.trial) { const cur = Game.trialCur(id), need = Game.trialNeed(id); const desc = t.trial.desc.replace(/\b(\d+)\b/, need === t.trial.n ? '$1' : String(need)); html += `<div class="trial"><b>TRIAL</b><br>${desc}<div class="pbar"><i style="width:${Math.min(100, cur / need * 100)}%"></i></div><small>${Math.min(cur, need)} / ${need}</small></div>`; }
      html += `<p><b>Cost:</b> ${Game.spCost(id)} Skill Point${Game.spCost(id) > 1 ? 's' : ''} (you have ${Game.state.sp})</p>`;
      if (reason) html += `<p style="color:#b8321f">${reason}</p>`;
      html += `<button class="btn" id="learnBtn" ${Game.canLearn(id) ? '' : 'disabled'}>${t.awaken ? 'Awaken' : 'Learn'}</button>`;
    }
    box.innerHTML = html; const lb = $('#learnBtn'); if (lb) lb.onclick = () => { if (Game.learn(id)) { this.closePanel(); } };
  },
  panel_inv() {
    const s = Game.state; const P = G.player; const items = Object.keys(s.inv).filter(k => s.inv[k] > 0);
    $('#pbody').innerHTML = `<div class="cols"><div><h3>Satchel</h3><div class="inv">${items.length ? items.map(k => { const it = ITEMS[k]; return `<div class="item" data-k="${k}"><div class="g">${it.glyph}</div><div class="nm">${it.name}</div><div class="ct">${s.inv[k]}</div><div class="d">${it.desc}${it.food ? ` <b>Food ${it.food}</b>` : ''}${it.heal ? ` <b>Heal ${it.heal}</b>` : ''}</div></div>`; }).join('') : '<p>Your satchel is empty.</p>'}</div>
      <p style="font-size:14px">Click food to eat it. Raw food should be cooked first.</p></div>
      <div style="max-width:320px"><h3>Condition</h3>${[['Health', `${Math.ceil(P.hp)} / ${P.maxHp}`], ['Chi', `${Math.floor(P.chi)} / ${P.maxChi}`], ['Hunger', `${Math.round(P.hunger)}%`], ['Thirst', `${Math.round(P.thirst)}%`], ['Warmth', `${Math.round(P.warmth)}%`], ['Waterskin', `${P.water} / ${P.waterMax}`], ['Level', s.level], ['Experience', `${s.xp} / ${Game.xpNeed()}`]].map(([a, b]) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`).join('')}
      <h3 style="margin-top:12px">Survival</h3><p style="font-size:14px;line-height:1.35">Hunger and thirst fall over time. Cold nights and high peaks sap warmth — fire, shelter and firebending restore it. Sleep is only safe by a fire, in a shelter, or at the inn. Predators will not step close to a lit campfire.</p></div></div>`;
    document.querySelectorAll('.item').forEach(d => d.onclick = () => { const k = d.dataset.k; if (ITEMS[k].food || ITEMS[k].heal) { Game.eatItem(k); this.panel_inv(); } });
  },
  panel_map() {
    $('#pbody').innerHTML = `<div id="mapwrap"><canvas id="mapcanvas" width="900" height="900"></canvas><div id="maplegend"></div></div>`;
    const c = $('#mapcanvas'); const g = c.getContext('2d'); const S = 900; const k = S / WORLD.size; const P = G.player;
    g.drawImage(World.minimapImg, 0, 0, S, S); g.fillStyle = 'rgba(241,227,196,0.12)'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#7a5a2b'; g.lineWidth = 10; g.strokeRect(5, 5, S - 10, S - 10);
    g.font = 'bold 30px Cinzel, serif'; g.fillStyle = '#3b2810'; g.textAlign = 'left'; g.fillText('Tienhai Valley', 30, 52); g.font = 'italic 18px "Cormorant Garamond", serif'; g.fillText('Western Earth Kingdom · the Valley of Four Winds', 30, 76);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const key in LOC) { const L = LOC[key]; const disc = Game.state.discovered.includes(key) || key === 'village'; const x = (L.x + WORLD.half) * k, y = (L.z + WORLD.half) * k;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); g.fillStyle = disc ? L.color : '#888'; g.font = '24px "Ma Shan Zheng", serif'; g.fillText(disc ? L.glyph : '?', x, y + 1);
      if (disc) { g.font = 'bold 15px Cinzel, serif'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 4; g.strokeText(L.name, x, y + 28); g.fillText(L.name, x, y + 28); } }
    const q = this.questTarget(); if (q) { const x = (q.x + WORLD.half) * k, y = (q.z + WORLD.half) * k; g.strokeStyle = '#ff6a3a'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 24 + Math.sin(G.t * 4) * 3, 0, 7); g.stroke(); }
    const px = (P.pos.x + WORLD.half) * k, py = (P.pos.z + WORLD.half) * k; g.save(); g.translate(px, py); g.rotate(-P.yaw + Math.PI); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke(); g.restore();
    // compass rose
    g.save(); g.translate(S - 70, S - 70); g.strokeStyle = '#3b2810'; g.fillStyle = '#3b2810'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 40, 0, 7); g.stroke(); g.font = 'bold 18px Cinzel'; g.fillText('N', 0, -52); g.beginPath(); g.moveTo(0, -36); g.lineTo(7, 0); g.lineTo(0, 36); g.lineTo(-7, 0); g.closePath(); g.fill(); g.restore();
    $('#maplegend').innerHTML = `<h3>Landmarks</h3>${Object.keys(LOC).map(k2 => { const L = LOC[k2]; const disc = Game.state.discovered.includes(k2) || k2 === 'village'; return `<div class="lg"><span style="font-family:var(--brush);color:${disc ? L.color : '#888'};font-size:20px;width:22px">${disc ? L.glyph : '?'}</span>${disc ? L.name : 'Undiscovered'}</div>`; }).join('')}
      <p style="font-size:13px;margin-top:10px">This valley lies on the western frontier of the Earth Kingdom, east of the Great Divide. The wider world — the Fire Nation isles, the poles, the Air Temples — awaits in later chapters.</p>`;
  },
  panel_journal() {
    const s = Game.state; const qs = Object.keys(QUESTS).filter(k => s.quests[k]);
    $('#pbody').innerHTML = `<div class="cols"><div><h3>Quests</h3>${qs.map(k => { const q = QUESTS[k]; const pr = s.quests[k]; return `<div class="qcard ${pr.done ? 'done' : ''}"><b>${q.title}</b> <small>— ${q.giver}${pr.done ? ' · complete' : ''}</small><div style="font-size:15px">${q.steps.map((st, i) => i <= pr.step || pr.done ? `<div>${i < pr.step || pr.done ? '✓' : '◆'} ${typeof st.text === 'function' ? st.text() : st.text}</div>` : '').join('')}</div></div>`; }).join('')}
      <h3>Bestiary</h3>${Object.keys(SPECIES).map(k => `<div class="qcard ${s.bestiary.includes(k) ? '' : 'done'}"><b>${s.bestiary.includes(k) || SPECIES[k].passive ? SPECIES[k].name : '???'}</b>${s.bestiary.includes(k) || SPECIES[k].passive ? `<div style="font-size:14px">${BESTIARY[k]}</div>` : ''}</div>`).join('')}</div>
      <div class="lore"><h3>Lore of the Lost Era</h3>${LORE.filter(l => s.lore.includes(l.k)).map(l => `<h4>${l.t}</h4><p>${l.b}</p>`).join('')}</div></div>`;
  },
  panel_char() {
    const P = G.player; const pr = P.profile; const N = NATIONS[pr.nation]; const home = N.homes[pr.home]; const prev = prevAv();
    $('#pbody').innerHTML = `<div class="cols"><div><h3>Avatar ${pr.name}</h3>${[['Nation', N.name], ['Home', home.name], ['Upbringing', BACKGROUNDS[pr.bg].name], ['Native element', EL[P.native].name], ['Previous Avatar', `${prev.name} (${EL[prevElement(P.native)].name})`], ['Next Avatar in the cycle', `will be born to the ${EL[nextElement(P.native)].people}`]].map(([a, b]) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`).join('')}
      <p><b>Origin perk:</b> ${home.perk}</p><p><b>Upbringing:</b> ${BACKGROUNDS[pr.bg].desc}</p></div>
      <div><h3>Elemental Affinity</h3>${ELEMENTS.map(e => { const a = affinity(P.native, e); return `<div class="kv"><span style="color:${EL[e].color};font-family:var(--brush);font-size:22px">${EL[e].glyph}</span><span>${EL[e].name}</span><b>${a}${Game.elementOpen(e) ? ' · awakened' : ' · sealed'}</b></div>`; }).join('')}
      <p style="font-size:14px">The Avatar learns elements in the order of the cycle — Fire, Air, Water, Earth — beginning with their own. The element opposite your own resists you most.</p>
      <h3>Active Effects</h3><p style="font-size:14px">${isNight() ? 'Night: firebending weakened, waterbending strengthened.' : 'Day: firebending strengthened, waterbending weakened.'} ${moonPhase() > 0.95 ? 'The moon is full tonight.' : ''}</p></div></div>`;
  },
};
const CONTROLS_HTML = `<div class="ctrl" style="margin-top:10px">
  <b>Keyboard &amp; mouse</b><br><kbd>WASD</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · Mouse look (click to capture)<br>
  <kbd>LMB</kbd>/<kbd>RMB</kbd> first two techniques · <kbd>3</kbd><kbd>4</kbd><kbd>5</kbd> more techniques · <kbd>Q</kbd>/<kbd>E</kbd> or wheel: switch element<br>
  <kbd>F</kbd> interact / harvest / talk · <kbd>X</kbd> eat · <kbd>Z</kbd> drink waterskin · <kbd>B</kbd> build campfire · <kbd>C</kbd> meditate<br>
  <kbd>K</kbd>/<kbd>Tab</kbd> bending scroll · <kbd>I</kbd> satchel · <kbd>M</kbd> map · <kbd>J</kbd> journal · <kbd>V</kbd> camera · <kbd>Esc</kbd> pause<br><br>
  <b>Touch</b><br>Left stick to move, drag the right side to look. Big buttons cast your techniques; ELEM switches element.<br><br>
  <b>VR</b><br>Left stick move · right stick turn (push up to jump) · Trigger: selected technique · Grip: second technique · A: next technique · B: next element · X: interact · Y: eat. Bend in the direction your right hand points.</div>`;

/* =====================================================================
   CHARACTER CREATOR
   ===================================================================== */
const Creator = {
  tab: 'origin', look: null, profile: null,
  open() {
    this.profile = { name: '', nation: 'water', home: 'south', bg: 'hunter' }; this.look = defaultLook('water'); this.tab = 'origin';
    $('#creator').classList.remove('hidden'); document.querySelectorAll('#creator .tabs button').forEach(b => b.onclick = () => { this.tab = b.dataset.t; this.render(); SFX.ui(); });
    $('#cBack').onclick = () => { const order = ['origin', 'looks', 'name']; const i = order.indexOf(this.tab); if (i > 0) { this.tab = order[i - 1]; this.render(); } else { $('#creator').classList.add('hidden'); Boot.title(); } SFX.ui(); };
    $('#cNext').onclick = () => { const order = ['origin', 'looks', 'name']; const i = order.indexOf(this.tab); if (i < 2) { this.tab = order[i + 1]; this.render(); SFX.ui(); } else this.finish(); };
    G.mode = 'creator'; G.time = 17.4; this.rebuild(); this.render();
  },
  rebuild() { if (this.model) G.scene.remove(this.model.root); this.model = buildHumanoid(this.look); const y = groundH(0, 9); this.model.root.position.set(0, y, 9); this.model.root.rotation.y = 0; G.scene.add(this.model.root); },
  setNation(n) { this.profile.nation = n; this.profile.home = Object.keys(NATIONS[n].homes)[0]; const h = this.look.height, b = this.look.build, body = this.look.body; this.look = defaultLook(n); this.look.height = h; this.look.build = b; this.look.body = body; this.rebuild(); this.render(); },
  render() {
    document.querySelectorAll('#creator .tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === this.tab)); const pr = this.profile, lk = this.look, N = NATIONS[pr.nation]; const body = $('#cbody');
    $('#cNext').textContent = this.tab === 'name' ? 'Begin' : 'Next';
    if (this.tab === 'origin') {
      body.innerHTML = `<label class="l">Nation</label><div class="nation">${Object.keys(NATIONS).map(n => `<div class="ncard ${pr.nation === n ? 'on' : ''}" data-n="${n}"><div class="g" style="color:${EL[NATIONS[n].element].color}">${NATIONS[n].glyph}</div><div class="n">${NATIONS[n].name}</div><small>${EL[NATIONS[n].element].name}</small></div>`).join('')}</div>
        <div class="desc">${EL[N.element].blurb} <br><b>Your native element:</b> ${EL[N.element].name}. <b>Hardest to learn:</b> ${EL[OPPOSITE[N.element]].name}.</div>
        <label class="l">Homeland</label><div class="opts">${Object.keys(N.homes).map(h => `<div class="opt ${pr.home === h ? 'on' : ''}" data-h="${h}">${N.homes[h].name}</div>`).join('')}</div><div class="desc">${N.homes[pr.home].perk}</div>
        <label class="l">Upbringing</label><div class="opts">${Object.keys(BACKGROUNDS).map(b => `<div class="opt ${pr.bg === b ? 'on' : ''}" data-b="${b}">${BACKGROUNDS[b].name}</div>`).join('')}</div><div class="desc">${BACKGROUNDS[pr.bg].desc}</div>`;
      body.querySelectorAll('.ncard').forEach(d => d.onclick = () => { this.setNation(d.dataset.n); SFX.ui(); });
      body.querySelectorAll('[data-h]').forEach(d => d.onclick = () => { pr.home = d.dataset.h; this.render(); SFX.ui(); });
      body.querySelectorAll('[data-b]').forEach(d => d.onclick = () => { pr.bg = d.dataset.b; this.render(); SFX.ui(); });
    } else if (this.tab === 'looks') {
      const allSkins = ['#f7dfc4', '#f0cba6', '#e1b892', '#d9ad84', '#c99a72', '#b5835c', '#a8714a', '#8d5a36', '#6e4428', '#4f3020'];
      const allHair = ['#111111', '#1b120c', '#2b1d12', '#4a3020', '#6a4a2a', '#8a5a2a', '#b07a3a', '#d8d4cc'];
      const allEyes = ['#3a8fd0', '#4aa7d9', '#5a8fa8', '#3d7a3a', '#6a8a3a', '#c98a1a', '#d9a441', '#8a5a1a', '#5a3a22', '#2f2416'];
      const sw = (arr, key) => `<div class="swatches">${arr.map(c => `<div class="sw ${lk[key] === c ? 'on' : ''}" data-k="${key}" data-v="${c}" style="background:${c}"></div>`).join('')}</div>`;
      body.innerHTML = `<label class="l">Body</label><div class="opts">${['A', 'B'].map(b => `<div class="opt ${lk.body === b ? 'on' : ''}" data-body="${b}">Frame ${b === 'A' ? 'I (broad)' : 'II (slender)'}</div>`).join('')}</div>
        <label class="l">Height</label><input type="range" min="0.88" max="1.1" step="0.01" value="${lk.height}" id="cH"><label class="l">Build</label><input type="range" min="0.85" max="1.25" step="0.01" value="${lk.build}" id="cB">
        <label class="l">Skin</label>${sw(allSkins, 'skin')}<label class="l">Hair style</label><div class="opts">${Object.keys(HAIR_STYLES).map(h => `<div class="opt ${lk.hair === h ? 'on' : ''}" data-hair="${h}">${HAIR_STYLES[h]}</div>`).join('')}</div>
        <label class="l">Hair colour</label>${sw(allHair, 'hairColor')}<label class="l">Eyes</label>${sw(allEyes, 'eyes')}
        <label class="l">${N.name} attire</label><div class="opts">${N.outfits.map((o, i) => `<div class="opt ${lk.outfit === i ? 'on' : ''}" data-o="${i}"><span style="display:inline-block;width:14px;height:14px;background:${o[0]};border:1px solid #000;vertical-align:middle"></span><span style="display:inline-block;width:14px;height:14px;background:${o[1]};border:1px solid #000;vertical-align:middle"></span> Style ${i + 1}</div>`).join('')}</div>
        <p style="font-size:13px;margin-top:10px;opacity:.8">Drag on the scene to turn your Avatar. More customisation will come in future chapters.</p>`;
      body.querySelectorAll('[data-body]').forEach(d => d.onclick = () => { lk.body = d.dataset.body; this.rebuild(); this.render(); });
      body.querySelectorAll('.sw').forEach(d => d.onclick = () => { lk[d.dataset.k] = d.dataset.v; this.rebuild(); this.render(); });
      body.querySelectorAll('[data-hair]').forEach(d => d.onclick = () => { lk.hair = d.dataset.hair; this.rebuild(); this.render(); });
      body.querySelectorAll('[data-o]').forEach(d => d.onclick = () => { lk.outfit = +d.dataset.o; this.rebuild(); this.render(); });
      $('#cH').oninput = (e) => { lk.height = +e.target.value; this.model.root.scale.setScalar(lk.height); }; $('#cB').onchange = (e) => { lk.build = +e.target.value; this.rebuild(); };
    } else {
      const names = { water: ['Siqiniq', 'Nanuq', 'Atka', 'Tulok', 'Ahnah', 'Pakku'], earth: ['Jin-Wei', 'Lian', 'Bolin', 'Xu', 'Mei-Lan', 'Kun'], fire: ['Haruto', 'Rinzen', 'Akemi', 'Ryoka', 'Isamu', 'Kaito'], air: ['Tenzing', 'Pema', 'Norbu', 'Dawa', 'Yeshe', 'Lhamo'] }[pr.nation];
      const nx = nextElement(N.element), prev = PAST_AVATARS[prevElement(N.element)];
      body.innerHTML = `<label class="l">Name</label><input type="text" id="cName" maxlength="18" placeholder="Your name" value="${pr.name}"><div class="opts" style="margin-top:6px">${names.map(n => `<div class="opt" data-nm="${n}">${n}</div>`).join('')}</div>
        <div class="desc" style="margin-top:14px"><b>${pr.name || 'You'}</b> of the ${N.homes[pr.home].name}, raised as a ${BACKGROUNDS[pr.bg].name.toLowerCase()}.<br><br>${N.homes[pr.home].reveal}<br><br>You are the successor of <b>Avatar ${prev.name}</b>, ${prev.desc}. The cycle says you will learn <b>${EL[nx].name}</b> next — and that <b>${EL[OPPOSITE[N.element]].name}</b> will resist you most.</div>`;
      $('#cName').oninput = (e) => { pr.name = e.target.value.replace(/[<>&"]/g, ''); }; $('#cName').onkeydown = (e) => e.stopPropagation();
      body.querySelectorAll('[data-nm]').forEach(d => d.onclick = () => { pr.name = d.dataset.nm; this.render(); });
    }
  },
  finish() {
    const pr = this.profile; if (!pr.name.trim()) { const nm = $('#cName'); if (nm) { nm.focus(); nm.style.outline = '3px solid #b8321f'; } return; }
    $('#creator').classList.add('hidden'); G.scene.remove(this.model.root); this.model = null;
    Boot.newGame({ name: pr.name.trim(), nation: pr.nation, home: pr.home, bg: pr.bg, look: Object.assign({}, this.look) });
  },
  tickCamera(dt) {
    if (!this.model) return; this.orbit = (this.orbit ?? 0.35); const m = this.model.root.position; const wide = innerWidth > 760; const r = wide ? 2.7 : 3.6; const a = this.orbit;
    const target = V3(m.x, m.y + (wide ? 1.0 : 0.55), m.z); const cam = V3(m.x + Math.sin(a) * r, m.y + 1.2, m.z + Math.cos(a) * r);
    // shift the framing so the model sits right of the creator panel (desktop) or above it (mobile)
    const right = V3(Math.cos(a), 0, -Math.sin(a)); if (wide) target.addScaledVector(right, -0.62);
    G.camObj.position.copy(cam); aimCam(G.camObj, target.x, target.y, target.z); animateHumanoid(this.model, dt, { speed: 0, grounded: true, combat: Math.sin(G.t * 0.5) > 0.3, element: NATIONS[this.look.nation].element });
  },
};

/* =====================================================================
   INPUT
   ===================================================================== */
const Input = {
  keys: {}, mx: 0, mz: 0, lookDX: 0, lookDY: 0, locked: false, joy: { id: null, x: 0, y: 0 }, look: { id: null, x: 0, y: 0 }, runToggle: false,
  init() {
    const canvas = G.sceneEl.canvas;
    addEventListener('keydown', (e) => this.key(e, true)); addEventListener('keyup', (e) => this.key(e, false));
    canvas.addEventListener('mousedown', (e) => { if (G.mode !== 'play' || IS_TOUCH) return; SFX.init(); if (!this.locked) { canvas.requestPointerLock && canvas.requestPointerLock(); return; } if (e.button === 0) this.castSlot(0); if (e.button === 2) this.castSlot(1); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault()); document.addEventListener('contextmenu', (e) => { if (G.mode === 'play') e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.lookDX += e.movementX; this.lookDY += e.movementY; } else if (G.mode === 'creator' && e.buttons & 1 && e.target === canvas) { Creator.orbit = (Creator.orbit || 0) - e.movementX * 0.01; } });
    addEventListener('wheel', (e) => { if (G.mode !== 'play' || this.panelBlock()) return; if (e.ctrlKey) return; if (this.locked) this.cycleElement(e.deltaY > 0 ? 1 : -1); }, { passive: true });
    if (IS_TOUCH) this.initTouch(canvas);
    addEventListener('blur', () => { this.keys = {}; });
  },
  panelBlock() { return G.ui.panelOpen || G.ui.dialogOpen || G.ui.storyOpen; },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  key(e, down) {
    if (e.target && e.target.tagName === 'INPUT') return; const k = e.code; this.keys[k] = down; if (!down) return; SFX.init();
    if (G.ui.dialogOpen) { if (/^Digit[1-9]$/.test(k)) Dialog.pick(+k.slice(5) - 1); if (k === 'Escape') Dialog.close(); return; }
    if (k === 'Escape') { if (G.ui.panelOpen) G.ui.closePanel(); else if (G.mode === 'play') G.ui.pause(true); else if (G.mode === 'paused') G.ui.pause(false); return; }
    if (G.ui.panelOpen) { if (k === 'Tab' || k === 'KeyK' || k === 'KeyI' || k === 'KeyM' || k === 'KeyJ') { e.preventDefault(); const t = { Tab: 'skills', KeyK: 'skills', KeyI: 'inv', KeyM: 'map', KeyJ: 'journal' }[k]; if (G.ui.tab === t) G.ui.closePanel(); else G.ui.openPanel(t); } return; }
    if (G.mode !== 'play') return; const P = G.player; if (!P || P.dead) return;
    switch (k) {
      case 'Space': e.preventDefault(); this.jump(); break;
      case 'KeyF': Game.interact(); break; case 'KeyX': Game.eatBest(); break; case 'KeyZ': Game.drinkSkin(); break; case 'KeyB': Game.buildCampfire(); break;
      case 'KeyC': this.meditate(); break; case 'KeyQ': this.cycleElement(-1); break; case 'KeyE': this.cycleElement(1); break;
      case 'Digit1': this.castSlot(0); break; case 'Digit2': this.castSlot(1); break; case 'Digit3': this.castSlot(2); break; case 'Digit4': this.castSlot(3); break; case 'Digit5': this.castSlot(4); break;
      case 'Tab': e.preventDefault(); G.ui.openPanel('skills'); break; case 'KeyK': G.ui.openPanel('skills'); break; case 'KeyI': G.ui.openPanel('inv'); break; case 'KeyM': G.ui.openPanel('map'); break; case 'KeyJ': G.ui.openPanel('journal'); break;
      case 'KeyV': G.settings.firstPerson = !G.settings.firstPerson; break;
    }
  },
  jump() { const P = G.player; if (P.meditating) { P.stopMeditate(); return; } if (P.grounded || P.swimming) { P.vy = P.swimming ? 6 : 7.6; P.grounded = false; Game.stat('jumps', 1); playAction(P.H, 'leap', 1.4); } else if (Game.has('air_jump') && P.airJumps < 1 && P.chi >= chiCost('air_jump')) { P.airJumps++; Tech.cast('air_jump'); } },
  meditate() { const P = G.player; if (P.meditating) { P.meditating = false; return; } if (!P.grounded || P.moving || P.swimming) { G.ui.note('Stand still on solid ground to meditate.', 'bad'); return; } P.meditating = true; G.ui.note('You sit, close your eyes, and breathe…', 'lore'); },
  cycleElement(d) { const P = G.player; const open = ELEMENTS.filter(e => Game.elementOpen(e)); if (open.length < 2) { if (d) G.ui.note(`You have only awakened ${EL[P.element].name}. Seek the old teachers.`); return; } let i = open.indexOf(P.element); i = (i + d + open.length) % open.length; P.element = open[i]; SFX.ui(); },
  castSlot(i) { if (G.mode !== 'play' || this.panelBlock()) return; const ids = G.ui.slotsFor(G.player.element); const id = ids[i]; if (!id) return; if (G.player.castLock > 0) { G.player.queued = id; return; } Tech.cast(id); },
  initTouch(canvas) {
    document.body.classList.add('touch'); const joy = $('#joy'), knob = joy.querySelector('i');
    const btn = (id, fn, hold) => { const b = document.getElementById(id); b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); SFX.init(); b.classList.add('on'); fn(true); }, { passive: false }); b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('on'); if (hold) fn(false); }, { passive: false }); };
    btn('tA', () => this.castSlot(0)); btn('tB', () => this.castSlot(1)); btn('tC', () => this.castSlot(2)); btn('tD', () => this.castSlot(3));
    btn('tJ', () => this.jump()); btn('tF', () => Game.interact()); btn('tE', () => this.cycleElement(1)); btn('tMed', () => this.meditate()); btn('tEat', () => Game.eatBest());
    btn('tRun', () => { this.runToggle = !this.runToggle; $('#tRun').classList.toggle('on', this.runToggle); }); btn('tMenu', () => G.ui.pause(true)); btn('tBag', () => G.ui.openPanel('skills'));
    joy.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; this.joy.id = t.identifier; this.joy.cx = t.clientX; this.joy.cy = t.clientY; const r = joy.getBoundingClientRect(); this.joy.cx = r.left + r.width / 2; this.joy.cy = r.top + r.height / 2; this.joyMove(t, knob); }, { passive: false });
    addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (t.identifier === this.joy.id) this.joyMove(t, knob); if (t.identifier === this.look.id) { this.lookDX += (t.clientX - this.look.x) * 2.2; this.lookDY += (t.clientY - this.look.y) * 2.2; this.look.x = t.clientX; this.look.y = t.clientY; if (G.mode === 'creator') Creator.orbit -= (t.clientX - this.look.x) * 0.01; } } }, { passive: false });
    addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === this.joy.id) { this.joy.id = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; } if (t.identifier === this.look.id) this.look.id = null; } });
    canvas.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) { if (this.look.id === null && (t.clientX > innerWidth * 0.35 || G.mode === 'creator')) { this.look.id = t.identifier; this.look.x = t.clientX; this.look.y = t.clientY; } } }, { passive: true });
  },
  joyMove(t, knob) { let dx = t.clientX - this.joy.cx, dy = t.clientY - this.joy.cy; const r = 52; const d = Math.hypot(dx, dy); if (d > r) { dx *= r / d; dy *= r / d; } this.joy.x = dx / r; this.joy.y = dy / r; knob.style.transform = `translate(${dx}px,${dy}px)`; },
  read() {
    let x = 0, z = 0; const k = this.keys; if (k.KeyW || k.ArrowUp) z += 1; if (k.KeyS || k.ArrowDown) z -= 1; if (k.KeyA || k.ArrowLeft) x -= 1; if (k.KeyD || k.ArrowRight) x += 1;
    if (this.joy.id !== null) { x += this.joy.x; z -= this.joy.y; } if (G.vrMove) { x += G.vrMove.x; z -= G.vrMove.y; }
    const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; } this.mx = x; this.mz = z;
    this.sprint = !!(k.ShiftLeft || k.ShiftRight) || this.runToggle || (this.joy.id !== null && Math.hypot(this.joy.x, this.joy.y) > 0.95) || (G.vrMove && Math.hypot(G.vrMove.x, G.vrMove.y) > 0.95);
  },
};

/* ---------------- VR controllers ---------------- */
const VR = {
  init() {
    const L = $('#ctrlL'), R = $('#ctrlR'); this.L = L; this.R = R; G.vrMove = { x: 0, y: 0 }; let turnReady = true;
    L.addEventListener('thumbstickmoved', (e) => { G.vrMove.x = Math.abs(e.detail.x) > 0.15 ? e.detail.x : 0; G.vrMove.y = Math.abs(e.detail.y) > 0.15 ? e.detail.y : 0; });
    R.addEventListener('thumbstickmoved', (e) => { if (Math.abs(e.detail.x) > 0.7 && turnReady) { turnReady = false; G.vrYaw -= Math.sign(e.detail.x) * Math.PI / 6; } if (Math.abs(e.detail.x) < 0.3) turnReady = true; if (e.detail.y < -0.8 && !this.jumped) { this.jumped = true; Input.jump(); } if (e.detail.y > -0.3) this.jumped = false; });
    R.addEventListener('triggerdown', () => Input.castSlot(G.vrSlot || 0)); R.addEventListener('gripdown', () => Input.castSlot(1));
    R.addEventListener('abuttondown', () => { const n = G.ui.slotsFor(G.player.element).length || 1; G.vrSlot = ((G.vrSlot || 0) + 1) % n; SFX.ui(); }); R.addEventListener('bbuttondown', () => Input.cycleElement(1));
    L.addEventListener('xbuttondown', () => Game.interact()); L.addEventListener('ybuttondown', () => Game.eatBest()); L.addEventListener('triggerdown', () => Input.jump()); L.addEventListener('gripdown', () => Input.meditate());
    G.sceneEl.addEventListener('enter-vr', () => { G.vr = G.sceneEl.is('vr-mode') || G.sceneEl.is('ar-mode'); if (G.vr) { G.vrYaw = G.player ? G.player.yaw + Math.PI : 0; G.camObj.position.set(0, 0, 0); G.camObj.rotation.set(0, 0, 0); this.buildWrist(); } });
    G.sceneEl.addEventListener('exit-vr', () => { G.vr = false; G.rigObj.position.set(0, 0, 0); G.rigObj.rotation.set(0, 0, 0); });
  },
  buildHands() {
    if (this.hands) return; this.hands = [];
    for (const c of [this.L, this.R]) { const b = new GeoBuilder(); b.add(new THREE.SphereGeometry(0.045, 10, 8), '#e8b48a', 0, 0, 0.02, 0, 0, 0, 0.9, 0.55, 1.3); for (let i = 0; i < 4; i++) b.add(new THREE.CapsuleGeometry(0.009, 0.05, 2, 5), '#e8b48a', -0.027 + i * 0.018, 0.0, -0.045, -1.4, 0, 0);
      b.add(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 10), '#8a3a2a', 0, 0, 0.09, Math.PI / 2, 0, 0); const m = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 })); c.object3D.add(m);
      const glow = glowSprite(0xffffff, 0.14, 0); glow.position.set(0, 0, -0.04); c.object3D.add(glow); this.hands.push({ m, glow }); }
  },
  buildWrist() {
    this.buildHands(); if (this.wrist) return; const w = new THREE.Group(); const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.09), new THREE.MeshBasicMaterial({ color: 0x1a120a, transparent: true, opacity: 0.8 })); w.add(bg);
    const bar = (y, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.012), new THREE.MeshBasicMaterial({ color: col })); m.position.set(0, y, 0.001); w.add(m); return m; };
    this.bars = { hp: bar(0.03, 0xd8473a), chi: bar(0.012, 0x57c0e8), hun: bar(-0.006, 0xffd27a), thi: bar(-0.024, 0x9fd8ff), warm: bar(-0.038, 0xffb070) };
    w.position.set(0, 0.05, 0.05); w.rotation.set(-1.2, 0, 0); this.L.object3D.add(w); this.wrist = w;
  },
  tick() {
    if (!this.wrist) return; const P = G.player;
    const col = new THREE.Color(EL[P.element].hex); this.hands.forEach(h => { h.glow.material.color.copy(col); h.glow.material.opacity = 0.35 + Math.sin(G.t * 4) * 0.1; }); const s = (m, v) => { m.scale.x = Math.max(0.001, v); m.position.x = -0.07 * (1 - v); };
    s(this.bars.hp, P.hp / P.maxHp); s(this.bars.chi, P.chi / P.maxChi); s(this.bars.hun, P.hunger / 100); s(this.bars.thi, P.thirst / 100); s(this.bars.warm, P.warmth / 100);
  },
};

/* =====================================================================
   MAIN LOOP
   ===================================================================== */
G.settings = { sens: 1, invertY: false, firstPerson: false };
G.camYaw = 0; G.camPitch = -0.15; G.camDist = 4.6; G.aim = { point: V3(), target: null }; G.camFwd = V3(0, 0, -1); G.dynLights = []; G.camShake = 0; G.vrYaw = 0;
// point the camera entity's -Z (where the THREE.Camera child looks) at a target.
// Object3D.lookAt on a non-camera aims +Z instead, which would face the camera away.
function aimCam(obj, tx, ty, tz) { const dx = tx - obj.position.x, dy = ty - obj.position.y, dz = tz - obj.position.z; obj.rotation.order = 'YXZ'; obj.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0); }
function insideCanopy(p) {
  if (!World.canopy) return false; const k0 = World.canopyKey;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = World.canopy.get(k0(p.x + i * 12, p.z + j * 12)); if (!l) continue;
    for (const t of l) { const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz); if (d > 3.2 * t.s) continue; const h = p.y - t.y;
      if (h > 0 && h < 4 * t.s && d < 0.55 * t.s) return true; // trunk
      if (t.type === 'pine') { const u = (h - 1.8 * t.s) / (5.8 * t.s); if (u > 0 && u < 1 && d < 2.5 * t.s * (1 - u) + 0.3) return true; }
      else { const cy = t.type === 'peach' ? 3.0 : 5.2, cr = t.type === 'peach' ? 1.8 : 2.5; const dy = (h - cy * t.s) / 0.8; if (Math.hypot(d, dy) < cr * t.s) return true; } } }
  return false;
}
function cameraBlocked(p) { return insideCanopy(p) || cameraBlockedSolid(p); }
function cameraBlockedSolid(p) {
  for (const c of collidersNear(p.x, p.z)) { if (c.top !== undefined && p.y > c.top) continue; if (c.type === 'circle') { if (c.r > 0.8 && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.25) return true; continue; }
    const dx = p.x - c.x, dz = p.z - c.z; const lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs; if (Math.abs(lx) < c.hw + 0.25 && Math.abs(lz) < c.hd + 0.25) return true; }
  return false;
}
const Main = {
  tick(dt) {
    if (!G.player && G.mode !== 'title' && G.mode !== 'creator') return;
    G.t += dt;
    if (G.mode === 'play') this.playTick(dt);
    else if (G.mode === 'title') this.titleTick(dt);
    else if (G.mode === 'creator') { Creator.tickCamera(dt); }
    const camPos = V3(); G.camObj.getWorldPosition(camPos);
    if (G.mode !== 'paused') {
      Env.update(dt, camPos); World.tick(G.t, dt, camPos, G.env); World.updateGrass(G.player && G.mode !== 'title' && G.mode !== 'creator' ? G.player.pos.x : camPos.x, G.player && G.mode !== 'title' && G.mode !== 'creator' ? G.player.pos.z : camPos.z);
      for (const e of G.ents) { const d = Math.hypot(e.pos.x - camPos.x, e.pos.z - camPos.z); const root = e.model ? e.model.root : e.H.root; root.visible = e.species === 'skybison' || d < (e.kind !== 'animal' ? 150 : e.sp.size < 1 ? 110 : 210); /* cull distant small things: draw calls on phones */ if (d < 200 || e.kind !== 'animal' || e.species === 'skybison' || (e.alive && e.state === 'chase')) e.update(dt); }
      if (G.ents.some(e => e.removed)) G.ents = G.ents.filter(e => !e.removed);
      Bending.update(dt); const fxNow = G.effects; G.effects = []; for (const fx of fxNow) { if (fx.update(dt)) G.effects.push(fx); else if (fx.end) fx.end(); } // effects may spawn effects
      G.structures = G.structures.filter(s => s.update(dt)); for (const c of G.campfires) c.update(dt); G.drops = G.drops.filter(d => d.update(dt));
      for (const f of World.flames) { FX.fire(f.pos, 5, 1.1, f.size, 3.4); // the Sun Warriors' Eternal Flame: a tall living fire with a white-hot heart
        const r = Math.random; for (let k = 0; k < 2; k++) FX.add.emit(f.pos.x + (r() - 0.5) * 0.5, f.pos.y + 0.2, f.pos.z + (r() - 0.5) * 0.5, (r() - 0.5) * 0.6, 2.4 + r() * 1.4, (r() - 0.5) * 0.6, 0.45, f.size * 0.75, 0.2, PAL.fireA, PAL.ember, { drag: 1.5, alpha: 0.9 });
        if (r() < 0.5) FX.embers(V3(f.pos.x, f.pos.y + 1, f.pos.z), 1); if (r() < 0.12) FX.smoke(V3(f.pos.x, f.pos.y + 3, f.pos.z), 1, 1.6); }
      if (G.mode === 'play' && G.player.pos.y > 52 && Math.random() < 0.6) FX.snow(G.player.pos, 2);
      FX.update(dt, G.cam);
      const lightSrc = G.campfires.filter(c => c.lit).map(c => c.light).concat(G.dynLights);
      for (const f of World.flames) lightSrc.push({ pos: f.pos, intensity: 3, color: 0xff7a2a, range: 22 });
      if (G.player && G.player.handFlame > 0) lightSrc.push({ pos: G.player.handPos('R'), intensity: 2, color: 0xffa040, range: 9 });
      Lights.update(lightSrc, camPos); SFX.tick(dt, G.env);
    }
    if (G.mode === 'play' || G.mode === 'paused' || G.mode === 'dead') { G.ui.hud(dt); if (G.vr) VR.tick(); }
  },
  titleTick(dt) {
    G.time = 18.1; const a = G.t * 0.03; const c = V3(-10, 0, 20); G.camObj.position.set(c.x + Math.cos(a) * 95, 42, c.z + Math.sin(a) * 95); aimCam(G.camObj, c.x, 8, c.z);
  },
  playTick(dt) {
    const P = G.player; Input.read();
    // time of day
    G.time += dt * 24 / G.dayLen; if (G.time >= 24) { G.time -= 24; G.day++; }
    this.updateCameraYaw(dt);
    this.updatePlayer(dt);
    this.survival(dt);
    this.updateAim();
    this.updateCamera(dt);
    Spawner.tick(dt); Game.updateCook(dt);
    this.slow = (this.slow || 0) - dt; if (this.slow <= 0) { this.slow = 0.5; Game.questTick(); this.checkTrials(); this.discover(); this.banyan(); }
    this.autosave = (this.autosave || 60) - dt; if (this.autosave <= 0) { this.autosave = 60; Game.save(); }
  },
  updateCameraYaw(dt) {
    const s = G.settings.sens * 0.0024; G.camYaw -= Input.lookDX * s; G.camPitch -= Input.lookDY * s * (G.settings.invertY ? -1 : 1); Input.lookDX = Input.lookDY = 0; G.camPitch = U.clamp(G.camPitch, -1.25, 0.9);
  },
  updatePlayer(dt) {
    const P = G.player; for (const k in P.cds) if (P.cds[k] > 0) P.cds[k] -= dt; for (const k in P.status) if (P.status[k] > 0) P.status[k] -= dt;
    P.invuln = Math.max(0, P.invuln - dt); P.castLock = Math.max(0, (P.castLock || 0) - dt); P.combatT = Math.max(0, P.combatT - dt); P.handFlame = Math.max(0, P.handFlame - dt); P.ceremonyT = Math.max(0, (P.ceremonyT || 0) - dt);
    if (P.queued && P.castLock <= 0) { const q = P.queued; P.queued = null; Tech.cast(q); }
    if (P.dead || P.sleeping) { animateHumanoid(P.H, dt, { dead: P.dead, sleep: P.sleeping, grounded: true }); P.H.root.position.copy(P.pos); return; }
    if (P.meditating && (Input.mx || Input.mz)) { P.meditating = false; G.ui.note('You rise from meditation.'); } // any movement input stands you up
    const busy = P.meditating || P.ceremonyT > 0 || G.ui.dialogOpen || G.ui.panelOpen || G.ui.storyOpen || !!Game.cooking;
    let ix = busy ? 0 : Input.mx, iz = busy ? 0 : Input.mz;
    // movement basis: camera (or VR head) yaw
    let yaw = G.camYaw; if (G.vr) { const q = new THREE.Quaternion(); G.cam.getWorldQuaternion(q); /* the XR head pose lives on the THREE camera */ const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); yaw = e.y; }
    const fwd = V3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = V3(Math.cos(yaw), 0, -Math.sin(yaw));
    const move = fwd.multiplyScalar(iz).add(right.multiplyScalar(ix)); P.moveDir = move.clone(); P.moving = move.lengthSq() > 0.01;
    P._sprint = Input.sprint && P.stam > 1 && !P.swimming;
    let speed = P.swimming ? 2.9 : (P.sprinting ? 7.8 : 4.6);
    if (P.status.slow > 0) speed *= 0.5; if (P.hunger < 8 || P.thirst < 8) speed *= 0.8; if (P.warmth < 15) speed *= 0.85;
    if (P.sprinting) P.stam = Math.max(0, P.stam - 20 * dt * (P.perk.stamDrain || 1)); else P.stam = Math.min(100, P.stam + 16 * dt);
    // horizontal velocity
    const tvx = move.x * speed, tvz = move.z * speed; const acc = P.grounded || P.swimming ? 14 : 3.5;
    P.hv = P.hv || V3(); P.hv.x = U.damp(P.hv.x, tvx, acc, dt); P.hv.z = U.damp(P.hv.z, tvz, acc, dt);
    if (P.dash) { P.dash.t -= dt; P.hv.x = P.dash.dir.x * 34; P.hv.z = P.dash.dir.z * 34; if (P.dash.t <= 0) { P.dash = null; P.hv.multiplyScalar(0.3); } }
    P.vel.multiplyScalar(Math.exp(-5 * dt)); // knockback decay
    const ox = P.pos.x, oz = P.pos.z;
    P.pos.x += (P.hv.x + P.vel.x) * dt; P.pos.z += (P.hv.z + P.vel.z) * dt;
    // world bounds
    const rr = Math.hypot(P.pos.x, P.pos.z); if (rr > 300) { P.pos.x *= 300 / rr; P.pos.z *= 300 / rr; }
    resolveCollisions(P.pos, P.radius, P.pos.y);
    for (const s of G.structures) if (s.alive && s.col && !s.shelter) { /* walls are colliders already */ }
    // slope limit: very steep climbs slow you down
    const gNew = groundH(P.pos.x, P.pos.z, P.pos.y); if (P.grounded && gNew - P.pos.y > 0.9 && !P.swimming) { P.pos.x = ox; P.pos.z = oz; }
    // vertical
    P.vy -= 22 * dt; if (P.vy < P.minVy || P.grounded) P.minVy = P.grounded ? 0 : Math.min(P.minVy || 0, P.vy);
    P.pos.y += P.vy * dt; const g = groundH(P.pos.x, P.pos.z, P.pos.y);
    const deep = g < -0.95; const swimY = WORLD.sea - 1.15;
    if (deep && P.pos.y <= swimY + 0.05) { if (!P.swimming) { FX.splash(V3(P.pos.x, 0, P.pos.z), 20, 3); SFX.water(); } P.swimming = true; P.pos.y = U.damp(P.pos.y, swimY, 6, dt); P.vy = Math.max(P.vy, 0); P.grounded = false; P.airJumps = 0; Game.stat('swim_time', dt); }
    else { P.swimming = false; }
    if (!P.swimming && P.pos.y <= g) {
      if (!P.grounded) { const fall = -(P.minVy || 0); const softFall = Game.has('air_jump') || P.perk.airJump || P.perk.airCost; if (fall > 15) { Game.stat('falls', 1); if (!softFall) P.hurt((fall - 15) * 4.5, { name: 'a long fall' }); else FX.ring(V3(P.pos.x, g + 0.1, P.pos.z), PAL.airA, PAL.airB, 20, 4, 0.5, true); } if (fall > 6) { FX.dust(V3(P.pos.x, g, P.pos.z), 8, 2, 0.7); SFX.step(); } P.minVy = 0; }
      P.pos.y = g; P.vy = 0; P.grounded = true; P.airJumps = 0;
    } else if (!P.swimming && P.pos.y > g + 0.05) P.grounded = false;
    // footsteps
    if (P.grounded && P.moving) { P.stepT = (P.stepT || 0) - dt * speed; if (P.stepT <= 0) { P.stepT = 2.2; SFX.step(true); Game.stat('distance', 2.2); } }
    // facing
    if (P.castLock > 0 || (P.combatT > 0 && !P.moving)) { /* keep aim-facing set by technique */ }
    else if (P.moving) P.yaw = U.dampAng(P.yaw, Math.atan2(move.x, move.z), 12, dt);
    P.stillT = P.moving ? 0 : (P.stillT || 0) + dt;
    // shelter
    P.sheltered = !!(P.shelter && P.shelter.alive && !P.shelter.collapsing && Math.hypot(P.pos.x - P.shelter.pos.x, P.pos.z - P.shelter.pos.z) < 2.4);
    if (P.shelter && P.shelter.alive && !P.sheltered && Math.hypot(P.pos.x - P.shelter.pos.x, P.pos.z - P.shelter.pos.z) > 6) { P.shelter.collapse(); P.shelter = null; }
    // keep the player inside an active shelter's walls (they must press F to leave)
    if (P.sheltered) { const d = Math.hypot(P.pos.x - P.shelter.pos.x, P.pos.z - P.shelter.pos.z); if (d > 1.7) { P.pos.x = P.shelter.pos.x + (P.pos.x - P.shelter.pos.x) / d * 1.7; P.pos.z = P.shelter.pos.z + (P.pos.z - P.shelter.pos.z) / d * 1.7; } }
    // meditation
    if (P.meditating) { this.meditationTick(dt); }
    // animate
    P.H.root.position.copy(P.pos); P.H.root.rotation.y = P.yaw; if (P.swimming) P.H.root.position.y = P.pos.y + 0.35;
    const hs = Math.hypot(P.hv.x, P.hv.z);
    animateHumanoid(P.H, dt, { lookAt: P.combatT > 0 && !P.meditating ? G.aim.point : null, speed: P.dash ? 9 : hs, grounded: P.grounded, vy: P.vy, swim: P.swimming, meditate: P.meditating, combat: P.combatT > 0, element: P.element, glow: P.meditating ? 0.06 + Math.sin(G.t * 2) * 0.03 : P.healT > 0 ? 0.12 : 0 });
    P.H.shadow.visible = P.grounded; P.H.shadow.position.y = 0.03 + Math.max(0, groundH(P.pos.x, P.pos.z) - P.pos.y);
    const fp = G.settings.firstPerson || G.vr; P.H.J.headMesh.visible = !fp; if (G.vr) P.H.root.visible = false;
    // healing waters over time
    if (P.healT > 0) { P.healT -= dt; P.hp = Math.min(P.maxHp, P.hp + 13 * dt); if (Math.random() < 0.8) { FX.sparkle(P.handPos('L'), PAL.heal, 1, 0.15, 0.22); FX.sparkle(P.handPos('R'), PAL.heal, 1, 0.15, 0.22); } }
    if (P.handFlame > 0 && Math.random() < 0.7) FX.fire(P.handPos('R'), 1, 0.3, 0.3, 0.6);
  },
  meditationTick(dt) {
    const P = G.player; const k = (P.bg.perk.meditate || 1); Game.stat('meditate_time', dt * k);
    P.chi = Math.min(P.maxChi, P.chi + 22 * dt * (P.perk.medChi || 1)); P.hp = Math.min(P.maxHp, P.hp + 1.2 * dt);
    const h = G.time; const near = (v, r) => v && P.pos.distanceTo(v) < r;
    if (h >= 5 && h < 8) Game.stat('sunrise_med', dt * k);
    if (near(World.eternalFlame, 11) && h >= 6 && h < 18.5) Game.stat('flame_med', dt * k);
    if (near(World.moonPoolCenter, 9) && (h >= 20 || h < 4)) Game.stat('moon_med', dt * k);
    if (near(World.caveCenter, 10)) Game.stat('cave_med', dt * k);
    if (near(World.peakCenter, 15)) Game.stat('peak_med', dt * k);
    if (Math.random() < 0.25) { const a = Math.random() * 6.28; const col = P.element === 'fire' ? PAL.ember : P.element === 'water' ? PAL.heal : P.element === 'earth' ? PAL.leaf : PAL.airA; FX.sparkle(V3(P.pos.x + Math.cos(a) * 0.8, P.pos.y + 0.3, P.pos.z + Math.sin(a) * 0.8), col, 1, 0.1, 0.16); }
    if (P.moving) P.meditating = false;
  },
  survival(dt) {
    const P = G.player; if (P.dead) return; const sick = P.status.sick > 0 ? 2 : 1; const run = P.sprinting ? 1.5 : 1;
    P.hunger = Math.max(0, P.hunger - dt * 0.105 * sick * run); P.thirst = Math.max(0, P.thirst - dt * 0.16 * run * (P.warmth > 85 ? 1.2 : 1));
    // warmth
    const h = P.pos.y; let target = isNight() ? 38 : 72; target -= Math.max(0, h - 32) * 0.9; if (P.swimming) target -= 30; if (G.time > 18.5 && G.time < 20) target -= 12;
    const fire = nearestLitFire(P.pos, 7); if (fire) target = Math.max(target, 92); if (P.sheltered) target = Math.max(target, 80); if (Math.hypot(P.pos.x, P.pos.z) < 40 && isNight()) target = Math.max(target, 50);
    if (P.native === 'fire') target += 10; if (Game.has('inner_fire')) target = Math.max(target, 75); if (P.handFlame > 0) target += 12;
    const loss = (P.perk.coldResist || 1); const rate = target > P.warmth ? 3 : 1.4 * loss; P.warmth = U.clamp(P.warmth + Math.sign(target - P.warmth) * Math.min(Math.abs(target - P.warmth), rate * dt), 0, 100);
    if (target < 30 && !fire) Game.stat('cold_time', dt);
    // regen / damage
    let regen = 0; if (P.hunger > 40 && P.thirst > 40 && P.warmth > 30) regen += 0.5; if (P.hunger <= 0) regen -= 0.8; if (P.thirst <= 0) regen -= 1.0; if (P.warmth <= 0) regen -= 1.2; if (sick > 1) regen -= 0.25;
    if (Game.has('badger_stance') && P.stillT > 1 && P.grounded) { regen += 1.5; P.chi = Math.min(P.maxChi, P.chi + 4 * dt); }
    P.hp = U.clamp(P.hp + regen * dt, 0, P.maxHp); if (P.hp <= 0) Game.die({ name: P.warmth <= 0 ? 'the cold' : 'hunger and thirst' });
    let chiR = 5.5; if (P.native === 'fire' && !isNight()) chiR *= (P.perk.sunChi || 1) * 1.1; if (Game.has('inner_fire') && !isNight()) chiR += 2; if (P.native === 'water' && isNight()) chiR *= 1.15;
    if (P.hunger < 10 || P.thirst < 10) chiR *= 0.5; P.chi = Math.min(P.maxChi, P.chi + chiR * dt);
  },
  updateAim() {
    const P = G.player; const origin = V3(), dir = V3();
    if (G.aimOverride) { const o = G.aimOverride; G.aim.target = o.target && o.target.alive ? o.target : null; if (G.aim.target) G.aim.point.set(o.target.pos.x, o.target.pos.y + o.target.height * 0.55, o.target.pos.z); else if (o.point) G.aim.point.copy(o.point); return; } // test hook
    if (G.vr) { const R = VR.R.object3D; R.getWorldPosition(origin); const q = new THREE.Quaternion(); R.getWorldQuaternion(q); dir.set(0, 0, -1).applyQuaternion(q); }
    else { G.camObj.getWorldPosition(origin); G.camObj.getWorldDirection(dir).negate(); } // entity object3D is not a THREE.Camera: its world direction is +Z
    G.camFwd.copy(dir); let best = null, bestA = IS_TOUCH ? 0.14 : 0.075;
    for (const e of G.ents) { if (!e.alive || e.removed || e.kind === 'villager' || (e.sp && e.sp.passive)) continue; const c = V3(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z); const v = c.clone().sub(origin); const t = v.dot(dir); if (t < 1 || t > 70) continue; const perp = v.clone().addScaledVector(dir, -t).length(); const ang = Math.atan2(perp - e.radius * 0.6, t); if (ang < bestA) { bestA = ang; best = e; } }
    G.aim.target = best;
    if (best) { G.aim.point.set(best.pos.x, best.pos.y + best.height * 0.55, best.pos.z); return; }
    const p = origin.clone(); let hit = false; const start = G.vr ? 0.5 : Math.max(1, G.camDist);
    for (let t = start; t < 90; t += 1) { p.copy(origin).addScaledVector(dir, t); if (p.y < groundH(p.x, p.z) || (p.y < WORLD.sea && terrainH(p.x, p.z) < WORLD.sea)) { hit = true; break; } }
    G.aim.point.copy(hit ? p : origin.clone().addScaledVector(dir, 60)); void P;
  },
  updateCamera(dt) {
    const P = G.player; const cam = G.camObj;
    if (G.vr) { const rig = G.rigObj; rig.position.set(P.pos.x, P.pos.y + (P.swimming ? 0.6 : 0), P.pos.z); rig.rotation.set(0, G.vrYaw, 0); return; }
    const fp = G.settings.firstPerson; const shake = G.camShake > 0 ? (G.camShake -= dt, G.camShake) : 0;
    const eyeH = P.H.rest ? P.H.rest.eyeY : 1.62; const eye = V3(P.pos.x, P.pos.y + (P.meditating ? eyeH * 0.58 : P.swimming ? 0.9 : eyeH) * (P.look.height || 1), P.pos.z);
    cam.rotation.order = 'YXZ';
    if (fp) { cam.position.copy(eye).add(V3(Math.sin(P.yaw) * 0.12, 0, Math.cos(P.yaw) * 0.12)); cam.rotation.set(G.camPitch, G.camYaw, 0); }
    else {
      let dist = P.sheltered ? 1.6 : G.camDist; const target = V3(P.pos.x, P.pos.y + (P.meditating ? 1.1 : 1.55), P.pos.z);
      const back = V3(Math.sin(G.camYaw) * Math.cos(G.camPitch), -Math.sin(G.camPitch), Math.cos(G.camYaw) * Math.cos(G.camPitch)); const right = V3(Math.cos(G.camYaw), 0, -Math.sin(G.camYaw));
      const shoulder = P.sheltered ? 0 : 0.55;
      // pull the camera in if terrain blocks the view
      for (let t = 0.5; t <= dist; t += 0.3) { const p = target.clone().addScaledVector(back, t).addScaledVector(right, shoulder * t / dist); if (p.y < groundH(p.x, p.z) + 0.3 || cameraBlocked(p)) { dist = Math.max(1.0, t - 0.35); break; } }
      const want = target.clone().addScaledVector(back, dist).addScaledVector(right, shoulder * Math.min(1, dist / 2));
      cam.position.lerp(want, 1 - Math.exp(-18 * dt)); if (cam.position.distanceTo(want) > 6) cam.position.copy(want);
      const gy = groundH(cam.position.x, cam.position.z) + 0.3; if (cam.position.y < gy) cam.position.y = gy;
      cam.rotation.set(G.camPitch, G.camYaw, 0);
      P.H.root.visible = cam.position.distanceTo(target) > 0.7; // never fill the screen with the back of your own head
    }
    if (shake > 0) { cam.position.x += (Math.random() - 0.5) * shake * 0.4; cam.position.y += (Math.random() - 0.5) * shake * 0.4; }
  },
  checkTrials() {
    const notified = G.flags.trialNotified || (G.flags.trialNotified = []);
    for (const id in TECH) { const t = TECH[id]; if (t.late || !t.trial || Game.state.learned.includes(id) || notified.includes(id)) continue; if (Game.lockReason(id)) continue;
      if (Game.trialCur(id) >= Game.trialNeed(id)) { notified.push(id); G.ui.note(`Trial complete: <b>${t.name}</b>. Open your Bending Scroll (K) to learn it.`, 'good'); SFX.pluck(660, 0.06); SFX.pluck(880, 0.05, 0.15); } }
  },
  discover() {
    const P = G.player; for (const k in LOC) { if (Game.state.discovered.includes(k)) continue; const L = LOC[k]; if (Math.hypot(P.pos.x - L.x, P.pos.z - L.z) < L.r + 12) { Game.state.discovered.push(k); if (k !== 'village') { G.ui.banner(L.name, 'Discovered'); Game.addXP(20); SFX.pluck(523, 0.05); SFX.pluck(784, 0.05, 0.2); }
        if (k === 'daofei' && !Game.state.lore.includes('daofei')) Game.state.lore.push('daofei'); if ((k === 'sunruins' || k === 'moonpool' || k === 'badgercave' || k === 'bisonpeak') && !Game.state.lore.includes('teachers')) Game.state.lore.push('teachers'); if (k === 'banyan' && !Game.state.lore.includes('spirits')) Game.state.lore.push('spirits'); } }
  },
  banyan() {
    const P = G.player; if (G.flags.banyanVision || Game.state.activeQuest !== 'teachers') return; const pr = Game.state.quests.teachers; if (!pr || pr.step < 1) return;
    if (P.meditating && P.pos.distanceTo(World.banyanSeat) < 9) { this.banyanT = (this.banyanT || 0) + 0.5; if (this.banyanT >= 5) this.vision(); } else this.banyanT = 0;
  },
  vision() {
    const P = G.player; const prevEl = prevElement(P.native); const prev = PAST_AVATARS[prevEl]; const nat = Object.keys(NATIONS).find(n => NATIONS[n].element === prevEl);
    const look = defaultLook(nat); look.hair = { fire: 'topknot', air: 'shaved', water: 'wolftail', earth: 'bun' }[prevEl]; if (prevEl === 'air') look.arrows = true;
    const ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0, emissive: 0x3a7aff, depthWrite: false });
    const gh = buildHumanoid(look, { mat: ghostMat }); const fwd = V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); const gp = P.pos.clone().addScaledVector(fwd, 3); gh.root.position.set(gp.x, groundH(gp.x, gp.z), gp.z); gh.root.rotation.y = P.yaw + Math.PI; G.scene.add(gh.root);
    SFX.unlock('avatar'); G.ui.fade(false);
    G.effects.push({ t: 0, update(dt) { this.t += dt; ghostMat.opacity = Math.min(0.75, this.t * 0.4) * (this.t > 14 ? Math.max(0, 1 - (this.t - 14) / 2) : 1); animateHumanoid(gh, dt, { speed: 0, grounded: true, glow: 0.4 }); if (Math.random() < 0.6) FX.sparkle(V3(gh.root.position.x, gh.root.position.y + 1, gh.root.position.z), PAL.spirit, 1, 1.2, 0.2); return this.t < 16 || G.ui.storyOpen; }, end() { G.scene.remove(gh.root); } });
    setTimeout(() => G.ui.story([
      `<p><i>The roots of the banyan seem to breathe. The fireflies stop moving. A figure of pale blue light stands before you, wearing ${NATIONS[nat].name} clothes from another age.</i></p><p>"So. You are me, now." The voice is warm, tired. "I am ${prev.name}. I did not finish what I started, ${P.profile.name}. I am sorry to leave it to you."</p>`,
      `<p>"For seven thousand years the spirits have kept to their side of the world. But something has crossed. I felt it in my last years — a cold place in the west, where the sea meets the edge of the Great Divide. Something old is wearing a hole in the walls between our worlds."</p>`,
      `<p>"The daofei who held this road were paid to watch for travelers going west. Someone does not want the Avatar to find that place. You carry their map now, I think."</p><p>"Master your elements. Learn from the old teachers, as I did. And when you are ready — go west, and find the spiral."</p><p><i>The light fades. The fireflies begin to move again.</i></p>`], () => { G.flags.banyanVision = true; Game.state.lore.push('vision'); LORE.push({ k: 'vision', t: `The Vision of Avatar ${prev.name}`, b: 'Your past life spoke of something crossing between worlds in the far west, near the Great Divide — and of a spiral marked on the daofei map. Someone does not want the Avatar to go there.' }); }, { last: 'Rise' }), 2500);
  },
};

/* =====================================================================
   BOOT
   ===================================================================== */
const Boot = {
  start() {
    const sceneEl = document.querySelector('a-scene'); G.sceneEl = sceneEl; G.scene = sceneEl.object3D; G.camObj = $('#cam').object3D; G.cam = $('#cam').getObject3D('camera'); G.rigObj = $('#rig').object3D; G.ui = UI; G.input = Input;
    const r = sceneEl.renderer; r.setPixelRatio(Math.min(devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2)); r.setClearColor(0x87b5d8);
    $('#cam').object3D.rotation.order = 'YXZ';
    const t0 = performance.now(); World.build(G.scene); FX.init(G.scene); Lights.init(G.scene); placeTablets(); UI.init(); Input.init(); VR.init();
    // stone statue of Avatar Guo-Lin, builder of the first roads, on the plaza pedestal
    const statue = buildHumanoid({ nation: 'earth', body: 'A', height: 1.5, build: 1.1, skin: '#9a9286', hair: 'bun', hairColor: '#8a8276', eyes: '#8a8276', outfit: 0, beard: true }, { stone: true, mat: new THREE.MeshLambertMaterial({ vertexColors: true }) });
    statue.root.position.copy(World.statueAt); statue.root.rotation.y = Math.PI * 0.85; G.scene.add(statue.root);
    for (const [j, r] of [['shR', [-1.5, 0, 0.1]], ['elR', [-0.1, 0, 0]], ['shL', [-0.5, 0, 0.3]], ['elL', [-1.7, 0, 0]], ['hipL', [-0.25, 0, 0.3]], ['hipR', [-0.25, 0, -0.3]], ['knL', [0.4, 0, 0]], ['knR', [0.4, 0, 0]]]) statue.J[j].rotation.set(...r);
    settleHumanoid(statue); statue.shadow.visible = false;
    G.campfires.push(new Campfire(-19, -7, true, { permanent: true })); G.campfires.push(new Campfire(LOC.daofei.x, LOC.daofei.z, true, { permanent: true }));
    for (const v of VILLAGERS) { const z = v.id === 'dorje' ? World.pagodaTop.z + 4.6 : v.z, x = v.x; const h = new Human(v, x, z, 'villager'); if (v.id === 'dorje') { h.pos.y = groundH(x, z, 1e9); } G.ents.push(h); }
    G.buildMs = performance.now() - t0;
    sceneEl.addBehavior({ el: sceneEl, tick: (t, dt) => { try { Main.tick(Math.min((dt || 16) / 1000, 0.05)); } catch (e) { console.error(e); G.lastError = String(e && e.stack || e); } } });
    // villagers that meditate (the monk at the pagoda)
    const dj = G.ents.find(e => e.def && e.def.id === 'dorje'); if (dj) { const orig = dj.update.bind(dj); dj.update = (dt) => { dj.H.root.position.copy(dj.pos); dj.H.root.rotation.y = dj.yaw; animateHumanoid(dj.H, dt, { meditate: true, grounded: true, glow: 0.04 }); if (Math.random() < 0.05) FX.air(V3(dj.pos.x, dj.pos.y + 1, dj.pos.z), V3(0, 1, 0), 1, 0.5, 0.5); void orig; }; }
    $('#loading').classList.add('hidden'); this.title();
    window.GAME = { aimCam, G, Game, Tech, World, Main, Input, UI, Creator, Boot, TECH, QUESTS, SPECIES, Spawner, Bending, FX, Env, terrainH, groundH, Dialog };
  },
  title() {
    G.mode = 'title'; $('#title').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden'); const save = Game.loadData(); $('#bCont').disabled = !save; $('#bCont').style.display = save ? '' : 'none';
    $('#bNew').onclick = () => { SFX.init(); SFX.ui(); if (save && !confirm('Begin a new life? Your current journey will be overwritten when you next save.')) return; $('#title').classList.add('hidden'); Creator.open(); };
    $('#bCont').onclick = () => { SFX.init(); SFX.ui(); $('#title').classList.add('hidden'); this.load(save); };
    $('#bHow').onclick = () => { SFX.ui(); UI.story([`<p><b>How to Play</b></p><p>You are a new Avatar in an age long before Kyoshi, Roku, Aang or Korra. Survive the wilds of Tienhai Valley with bending: hunt and cook, find water, keep warm, rest safely at night — and fight the beasts and outlaws who threaten the valley.</p><p>Every technique is learned through a <b>trial</b> drawn from the show's lore — meditating at sunrise, sitting with the badgermoles, practising under the moon. Elements beyond your own must be <b>awakened</b> from their original teachers. The element opposite your own is hardest of all.</p>${CONTROLS_HTML}`], null); };
  },
  common(profile) {
    G.ents.filter(e => e.kind === 'animal' || e.kind === 'daofei').forEach(e => { if (e.model) G.scene.remove(e.model.root); if (e.H) G.scene.remove(e.H.root); }); G.ents = G.ents.filter(e => e.kind === 'villager');
    if (G.player) G.scene.remove(G.player.H.root); G.player = new Player(profile); Spawner.initial();
    const down = Game.state.daofeiDown || []; DAOFEI.forEach((d, i) => { if (down.includes(d.name)) return; const a = i / DAOFEI.length * Math.PI * 2; G.ents.push(new Human(d, LOC.daofei.x + Math.cos(a) * 6, LOC.daofei.z + Math.sin(a) * 6, 'daofei')); });
    $('#hud').classList.remove('hidden'); if (IS_TOUCH) $('#touch').classList.remove('hidden'); document.body.classList.add('playing'); G.mode = 'play';
  },
  newGame(profile) {
    Game.state = Game.newState(); G.stats = {}; G.flags = {}; G.time = 8.0; G.day = 1; this.common(profile); const P = G.player;
    for (const id of STARTING[P.native]) Game.state.learned.push(id); Game.state.learned.push('meditation');
    const bg = BACKGROUNDS[profile.bg]; for (const k in bg.items) Game.state.inv[k] = (Game.state.inv[k] || 0) + bg.items[k]; Game.state.inv.copper = (Game.state.inv.copper || 0) + 10; Game.state.inv.wood = 2;
    if (P.native !== 'fire') Game.state.inv.stone = 2;
    P.pos.set(-22, 0, 124); P.pos.y = groundH(P.pos.x, P.pos.z); P.yaw = Math.PI; G.camYaw = 0; G.camPitch = -0.12; P.respawn = V3(-8, 0, 14); Game.state.quests.arrival = { step: 0 };
    const N = NATIONS[profile.nation]; const home = N.homes[profile.home]; const prev = PAST_AVATARS[prevElement(P.native)];
    G.mode = 'paused';
    UI.story([
      `<p><i>Long before Avatar Kyoshi raised her island from the earth… before Roku, before Aang, before Korra… nearly three thousand years before the Hundred Year War —</i></p><p>the four nations were young. The Fire Nation was a chain of feuding island clans guided by the Fire Sages. The Earth Kingdom was a patchwork of walled cities with lawless roads between them. The Water Tribes kept to the poles, and the Air Nomads drifted between their temples on the backs of sky bison.</p>`,
      `<p>Seven thousand years had passed since Avatar Wan closed the doors between the human world and the spirit world. People had nearly forgotten that spirits once walked among them.</p><p>When Avatar ${prev.name} — ${prev.desc} — died, the cycle turned, and the world waited sixteen years.</p>`,
      `<p>${home.reveal}</p><p>You are <b>${profile.name}</b> of the ${home.name}. You are the Avatar.</p>`,
      `<p>Now you travel to <b>Tienhai</b>, the Valley of Four Winds — a frontier on the western edge of the Earth Kingdom where all four peoples trade. The valley's elders say the first teachers of bending — the dragons, the badgermoles, the Moon and the sky bison — still leave their traces here.</p><p>Survive. Learn. Become the bridge between worlds.</p><p class="sig">${EL[P.native].glyph}</p>`,
    ], () => { G.mode = 'play'; UI.banner('Tienhai Valley', 'Western Earth Kingdom · Day 1'); UI.note(IS_TOUCH ? 'Follow the road north to the village. (Left stick to move, drag to look — BAG opens your Bending Scroll)' : 'Follow the road north to the village. (WASD to move, mouse to look — K opens your Bending Scroll)', 'lore'); Game.save(); }, { last: 'Begin' });
  },
  load(d) {
    try {
      Game.state = Object.assign(Game.newState(), d.state); G.stats = d.stats || {}; G.flags = d.flags || {}; G.time = d.time ?? 8; G.day = d.day || 1; if (d.settings) Object.assign(G.settings, d.settings);
      this.common(d.profile); const P = G.player; P.pos.set(d.pos[0], d.pos[1], d.pos[2]); P.pos.y = groundH(P.pos.x, P.pos.z, P.pos.y + 1); P.yaw = d.yaw || 0; G.camYaw = P.yaw + Math.PI;
      Object.assign(P, { hp: d.hp, chi: d.chi, maxHp: d.maxHp, maxChi: d.maxChi, hunger: d.hunger, thirst: d.thirst, warmth: d.warmth, water: d.water }); if (G.flags.bigSkin) P.waterMax += 2; if (d.respawn) P.respawn = V3(d.respawn[0], 0, d.respawn[1]);
      if (G.flags.banyanVision && !LORE.find(l => l.k === 'vision')) { const prev = PAST_AVATARS[prevElement(P.native)]; LORE.push({ k: 'vision', t: `The Vision of Avatar ${prev.name}`, b: 'Your past life spoke of something crossing between worlds in the far west, near the Great Divide — and of a spiral marked on the daofei map.' }); }
      UI.banner(`Welcome back, Avatar ${d.profile.name}`, `Day ${G.day}`);
    } catch (e) { console.error(e); alert('That save could not be loaded.'); location.reload(); }
  },
};
(function waitScene() {
  const sceneEl = document.querySelector('a-scene');
  const go = () => { try { Boot.start(); } catch (e) { console.error(e); document.getElementById('loadtxt').textContent = 'Error: ' + e.message; window.BOOT_ERROR = String(e.stack || e); } };
  if (sceneEl.hasLoaded) setTimeout(go, 30); else sceneEl.addEventListener('loaded', () => setTimeout(go, 30));
})();
