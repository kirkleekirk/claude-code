/* Curiosity rooms. Each choice: { label, hint?, req?(X) -> string|null (reason it is unavailable), run(X) -> result text }.
   X is the raid API from engine/raid.js. */
(function () {
  'use strict';
  const D = LCO.data;
  const R = LCO.R;
  const EV = {};
  function ev(id, title, text, choices, o) { EV[id] = Object.assign({ id, title, text, choices }, o || {}); }
  const needTickets = (n) => (X) => (X.G.tickets >= n ? null : `Needs ${n} Tickets`);
  const needPack = (X) => (X.raid.backpack.length ? null : 'Your backpack is empty');

  ev('lost_luggage', 'Lost Luggage', 'A battered suitcase sits alone in the aisle. Its paper tag says PLEASE RETURN TO OWNER in shaky handwriting.', [
    { label: 'Open it', run: (X) => { const it = X.loot({ rarityBoost: 1 }); return it ? `Inside, under folded shirts: ${X.itemName(it)}.` : 'Your pack is too full to take anything.'; } },
    { label: 'Read the tag and leave it be', hint: 'Number −1', run: (X) => { X.number(-1); return 'You set it upright so the owner can find it. Your palm feels a little cooler.'; } },
  ]);
  ev('vending', 'Strange Vending Machine', 'It accepts Tickets. When you get close it makes a noise like a sigh.', [
    { label: 'Pay 25 Tickets', req: needTickets(25), run: (X) => { X.G.tickets -= 25; const it = X.consumable(); return it ? `Clunk. Out drops ${X.itemName(it)}.` : 'Clunk. It drops something, but your pack is full.'; } },
    { label: 'Give it a kick', run: (X) => { if (R.chance(0.5)) { const it = X.consumable(); return it ? `It coughs up ${X.itemName(it)}.` : 'It coughs something up, but you have no room.'; } X.hurt(Math.round(X.maxHp * 0.1)); return 'It kicks back. Hard.'; } },
    { label: 'Leave it alone', run: () => 'You back away from the sighing machine.' },
  ]);
  ev('cat_trade', 'The Cat', 'A sleek cat sits on a luggage rack, wearing a bell you are fairly sure was stolen. "Something of yours," she purrs, "for something of mine."', [
    { label: 'Trade a random backpack item', hint: 'Better rarity back', req: needPack, run: (X) => { const gone = X.takeRandomItem(); const r = Math.min(4, (gone ? gone.rarity : 0) + 1); const it = X.loot({ minRarity: r, kind: 'gear' }); return `She takes ${gone ? X.itemName(gone) : 'nothing'} and leaves ${it ? X.itemName(it) : 'a promise'}.`; } },
    { label: 'Ask her about your Number', hint: 'Experience', run: (X) => { X.xp(20 * X.tier); return 'She tells you something true about yourself, then pretends she never did.'; } },
    { label: 'Decline politely', run: () => '"Suit yourself." She is gone before you finish blinking.' },
  ]);
  ev('wounded', 'A Wounded Denizen', 'A small denizen is curled against the wall, bleeding sawdust and trying very hard not to cry.', [
    { label: 'Bandage it', hint: 'Uses a Bandage Roll · Number −2', req: (X) => (X.hasItem('bandage') ? null : 'Needs a Bandage Roll'), run: (X) => { X.useItem('bandage'); X.flag('helped'); X.number(-2); const it = X.loot({ minRarity: 1, kind: 'charm' }); return 'It sniffles a thank-you and presses a keepsake into your hand' + (it ? `: ${X.itemName(it)}.` : '.'); } },
    { label: 'Pay 30 Tickets for a doctor', hint: 'Number −1', req: needTickets(30), run: (X) => { X.G.tickets -= 30; X.flag('helped'); X.number(-1); return 'You send for help and stay until it arrives.'; } },
    { label: 'Take its things', hint: 'Number +2', run: (X) => { X.number(2); const it = X.loot({ kind: 'valuable' }); return 'You take what it has. It does not stop you.' + (it ? ` (${X.itemName(it)})` : ''); } },
    { label: 'Leave it', run: () => 'You tell yourself someone else will come.' },
  ]);
  ev('mirror_hall', 'A Tall Mirror', 'Your reflection waves at you. You have not moved.', [
    { label: 'Wave back', hint: 'Next fight: 2 Mirror Images', run: (X) => { X.nextFight({ mirror: 2 }); return 'It smiles. Some of it comes with you.'; } },
    { label: 'Step through', hint: 'Jump deeper · Instability +6', run: (X) => { X.instability(6); return X.jumpDeeper() ? 'You come out somewhere further along the car.' : 'The glass is solid after all.'; } },
    { label: 'Smash it', hint: 'Glimmer, or a fight', run: (X) => { if (R.chance(0.5)) { X.carry('glimmer', 1); return 'A shard of pure Glimmer falls out of the frame.'; } X.fight(['flec'], { title: 'The glass climbs out after you.' }); return 'Your reflection does not appreciate that.'; } },
  ]);
  ev('sleeping_guard', 'A Sleeping Guard', 'Something enormous is asleep, curled around a locked chest.', [
    { label: 'Sneak off with the chest', hint: 'Dodge helps', run: (X) => { const p = 0.45 + X.S.dodge; if (R.chance(p)) { X.loot({ rarityBoost: 1 }); X.loot({}); return 'You tiptoe away with the chest. It snores the whole time.'; } X.fight(null, { elite: true, title: 'It wakes up.' }); return 'A floorboard creaks. One eye opens.'; } },
    { label: 'Wake it and fight', hint: 'Elite fight', run: (X) => { X.fight(null, { elite: true, title: 'It unfolds, and unfolds, and unfolds.' }); return 'You clear your throat.'; } },
    { label: 'Tiptoe away', run: () => 'Some treasures are better left asleep.' },
  ]);
  ev('tape_recorder', 'A Tape Recorder', 'A tape is already in it. The label is your name, in your handwriting.', [
    { label: 'Listen', hint: 'Experience · Number −1 · Instability +5', run: (X) => { X.xp(30 * X.tier); X.number(-1); X.instability(5); return 'It is you, on your worst day. It hurts. You feel lighter after.'; } },
    { label: 'Smash it', hint: 'Scrap · Number +1', run: (X) => { X.carry('scrap', 8 * X.tier); X.number(1); return 'Plastic and ribbon. You did not want to hear it anyway.'; } },
    { label: 'Leave it', run: () => 'The play button stays down after you walk away.' },
  ]);
  ev('valve', 'Stability Valve', 'A brass valve on a pipe that runs the length of the car. A label reads DO NOT.', [
    { label: 'Turn it', hint: 'Instability −20', run: (X) => { X.instability(-20); return 'The car settles with a long, grateful groan.'; } },
    { label: 'Wrench it off', hint: 'Glimmer · Instability +15', run: (X) => { X.carry('glimmer', 1); X.instability(15); return 'It comes free with a spray of glittering steam you catch in a jar.'; } },
    { label: 'Obey the label', run: () => 'You do not. The valve seems relieved.' },
  ]);
  ev('card_game', 'Denizen Card Game', 'Three denizens play a card game whose rules change every hand. They deal you in.', [
    { label: 'Bet 20 Tickets', hint: '45% to win 50', req: needTickets(20), run: (X) => { if (R.chance(0.45)) { X.carry('tickets', 50); return 'You win! Nobody can explain how.'; } X.G.tickets -= 20; return 'You lose. The rules changed at the very end.'; } },
    { label: 'Bet 60 Tickets', hint: '40% to win 160', req: (X) => (X.tier < 3 ? 'The stakes are too high here' : needTickets(60)(X)), run: (X) => { if (R.chance(0.4)) { X.carry('tickets', 160); return 'A royal flush of something. They pay up, grumbling.'; } X.G.tickets -= 60; return 'You lose. They were playing a different game than you.'; } },
    { label: 'Watch and learn', hint: 'Experience', run: (X) => { X.xp(15 * X.tier); return 'You still do not understand it, but you understand them a little better.'; } },
  ]);
  ev('projector', 'Memory Projector', 'An old projector flickers images onto the wall: a kitchen, a street, a door you know.', [
    { label: 'Watch until the reel ends', hint: 'Number −2 · Instability +12', run: (X) => { X.number(-2); X.instability(12); return 'You watch all of it. You had forgotten how much you missed it.'; } },
    { label: 'Switch it off', run: () => 'Not today.' },
  ]);
  ev('conductor_cap', "An Old Conductor's Cap", 'It hangs on a hook, brim polished by a thousand thumbs.', [
    { label: 'Put it on', hint: 'Reveal the car', run: (X) => { X.revealAll(); return 'For a moment you can feel the whole car, end to end.'; } },
    { label: 'Leave it', run: () => 'It is not your cap. Not yet.' },
  ]);
  ev('trapped_chest', 'Suspicious Chest', 'A chest with too many hinges and one very obvious tripwire.', [
    { label: 'Pick the lock carefully', hint: 'Needs lockpicking', req: (X) => (X.lockpick() > 0 ? null : 'You have no way to pick it'), run: (X) => { X.loot({ rarityBoost: 1 }); return 'Click. The tripwire goes slack.'; } },
    { label: 'Force it open', hint: 'Loot, maybe pain', run: (X) => { X.loot({}); if (R.chance(0.5)) { X.hurt(Math.round(X.maxHp * 0.15)); return 'It opens — and so does the spring-loaded glove inside.'; } return 'It opens cleanly. Lucky.'; } },
    { label: 'Leave it', run: () => 'The tripwire twangs sadly as you go.' },
  ]);
  ev('lost_denizen', 'A Lost Denizen', 'A denizen in a too-big coat asks if you know the way to the Far Door.', [
    { label: 'Walk it partway', hint: 'Number −1 · Instability +4', run: (X) => { X.flag('helped'); X.number(-1); X.instability(4); return 'It hums the whole way, and waves when you part.'; } },
    { label: 'Charge it for directions', hint: '+15 Tickets · Number +1', run: (X) => { X.carry('tickets', 15); X.number(1); return 'It pays. It does not wave.'; } },
    { label: 'Shrug', run: () => 'You do not know the way either.' },
  ]);
  ev('pinned_map', 'A Map Pinned to the Wall', 'Someone has drawn this car by hand, with the exits circled twice.', [
    { label: 'Study it', hint: 'Reveal every exit', run: (X) => { X.revealExits(); return 'You memorize the exits.'; } },
    { label: 'Take it with you', hint: 'Car Schematic', run: (X) => { const it = X.addConsumable('schematic'); return it ? 'You fold it carefully into your pack.' : 'No room to take it.'; } },
  ]);
  ev('feast', 'A Feast Table', 'A long table set for a party that never arrived. The food is still warm.', [
    { label: 'Eat', hint: 'Heal 30%', run: (X) => { if (R.chance(0.2)) { X.hurt(Math.round(X.maxHp * 0.08)); return 'The pudding was not pudding.'; } X.heal(Math.round(X.maxHp * 0.3)); return 'It is the best meal you have had in a long time.'; } },
    { label: 'Pack some for later', hint: 'Tins of Beans', run: (X) => { const a = X.addConsumable('beans', 2); return a ? 'You wrap up two tins of beans.' : 'No room in your pack.'; } },
  ]);
  ev('apex_recruiter', 'An Apex Recruiter', '"Your Number? Doesn’t matter here. Nothing does. Join us."', [
    { label: 'Hear them out', hint: 'Next fight: Strength 3 · Number +2', run: (X) => { X.nextFight({ strength: 3 }); X.number(2); return 'They teach you a trick or two. You feel worse about yourself.'; } },
    { label: 'Refuse — loudly', hint: 'Fight', run: (X) => { X.fight(['apex_raider', 'apex_slinger'], { title: 'They do not take rejection well.' }); return '"Your loss."'; } },
    { label: 'Walk away', run: () => 'You do not look back.' },
  ], { minTier: 5 });
  ev('shrine_offer', 'Shrine of the Number', 'A small altar with a glowing hand carved into it. The carving has no number.', [
    { label: 'Offer blood', hint: 'Lose 20% HP · Number −1', run: (X) => { X.hurt(Math.round(X.maxHp * 0.2)); X.number(-1); return 'The carving glows, briefly, with your Number — one less.'; } },
    { label: 'Offer a treasure', hint: 'Give up a Fine+ item · Number −3', req: (X) => (X.raid.backpack.some((i) => i.rarity >= 2) ? null : 'Needs a Fine or better item in your backpack'), run: (X) => { const it = X.takeBestItem(); X.number(-3); return `You leave ${X.itemName(it)} on the altar. It is gone when you look back.`; } },
    { label: 'Pray for luck', hint: 'Next fight: Regen 6', run: (X) => { X.nextFight({ regen: 6 }); return 'You feel watched over. Probably by the cat.'; } },
  ], { shrine: true });

  D.EVENTS = EV;
})();
