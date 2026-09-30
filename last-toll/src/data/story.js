// The story aboard the Magnolia: Staff Sergeant Isaac Hale's war on the Living
// Guard's 9th Garrison, told through the crew and the places on the board.
//
// Steps run in order. Each step's objective is worked out from what you're
// carrying, so "bring the codebook to Hale" becomes true the moment it's in
// your stash, and a lost demolition charge just means building another.

export const STEPS = ['hale', 'tags', 'codebook', 'ledger', 'plan', 'mast', 'report', 'done'];

export const CHAPTERS = {
  hale: 'A Passenger',
  tags: 'Names',
  codebook: 'Signals',
  ledger: 'Intake',
  plan: 'Intake',
  mast: 'The Relay',
  report: 'The Relay',
  done: 'Deaf and Angry',
};

// What the captain's log says when a step begins.
export const LOG = {
  tags: 'Staff Sergeant Isaac Hale, a deserter from the Living Guard\'s 9th Garrison, is living on the aft deck. He wants three Guard dog tags to learn which companies are working the parish.',
  codebook: 'The tags were Pruitt, Okafor and Byrne. Byrne was Signals — Hale trained him. Hale gave me his keycard for the signals locker at the St. Aubin Quarter checkpoint, where the Guard keeps a codebook for talking to Command.',
  ledger: 'Something jams every long-range band at night. And the 9th\'s own traffic says: "Marais intake closed. Transfer to Nine complete." Odile\'s sister Josette lived in Marais Noir.',
  plan: 'Father Anselme\'s ledger: forty-one people from Marais Noir marched to Outpost 9 for "resettlement". Josette Marchand is on the list.',
  mast: 'The relay mast at Outpost 9 drives the herder horns and jams the long bands, so Command can\'t hear what the 9th is doing. Hale drew up a demolition charge I can build at the workshop.',
  report: 'The relay at Outpost 9 is down. Every herder horn in the parish went quiet with it.',
  done: 'Hale reached Command at Natchez. The 9th Garrison was struck from the rolls fourteen months ago, lost with all hands. Colonel Merritt has been running a dead unit. Command is sending someone.',
};

export function newStory() {
  return { step: 'hale', met: {}, seen: {}, mastDown: false, healedDay: 0, log: [] };
}

export const stepIndex = (id) => STEPS.indexOf(id);
export function atLeast(p, id) {
  return stepIndex(p.story.step) >= stepIndex(id);
}

// Everything you own, wherever it sits aboard.
export function countOwned(p, id) {
  let n = 0;
  for (const it of p.stash) if (it.id === id) n += it.qty || 1;
  for (const it of p.backpack) if (it.id === id) n += it.qty || 1;
  for (const k of Object.keys(p.loadout)) if (p.loadout[k] && p.loadout[k].id === id) n++;
  return n;
}

// The current objective: { chapter, text, sub?, where? (a station or crew id aboard), zone? (a board destination) }
export function objective(p) {
  const s = p.story, have = (id) => countOwned(p, id);
  const chapter = CHAPTERS[s.step];
  switch (s.step) {
    case 'hale':
      return { chapter, text: 'Talk to the man on the aft deck', sub: 'Remy says he came aboard in a Guard coat.', where: 'hale' };
    case 'tags': {
      const n = have('dogtags');
      if (n >= 3) return { chapter, text: 'Bring the dog tags to Hale', where: 'hale' };
      return { chapter, text: `Collect Guard dog tags (${n}/3)`, sub: 'Dead Guardsmen carry them: the armoured dead in the Quarter, patrols at the rail yard.', zones: ['quarter', 'railyard', 'outpost'] };
    }
    case 'codebook':
      if (have('codebook')) return { chapter, text: 'Bring the codebook to Hale', where: 'hale' };
      return { chapter, text: 'Take the codebook from the signals locker at the St. Aubin Quarter checkpoint', sub: have('keycard') ? 'The locker takes a Guard keycard. Hale gave you his.' : 'The locker takes a Guard keycard. Take one off a dead Guardsman.', zone: 'quarter' };
    case 'ledger':
      if (have('ledger')) return { chapter, text: 'Bring the ledger to Doc Odile', where: 'odile' };
      if (!s.seen['odile.where']) return { chapter, text: 'Ask Doc Odile about Marais Noir', sub: 'Then go and find out what happened there.', where: 'odile', zone: 'marais' };
      return { chapter, text: 'Find Father Anselme\'s ledger in the chapel at Marais Noir', sub: 'Odile says he hid it in the offering chest by the altar.', zone: 'marais' };
    case 'plan':
      return { chapter, text: 'Tell Hale what the ledger says', where: 'hale' };
    case 'mast':
      if (!have('demo_charge')) return { chapter, text: 'Build a demolition charge at the Workshop Bench', sub: 'Hale left the plans under the vise.', where: 'workshop' };
      return { chapter, text: 'Plant the charge on the relay mast inside Guard Outpost 9', sub: 'Then get out alive.', zone: 'outpost' };
    case 'report':
      return { chapter, text: 'Tell Hale the relay is down', where: 'hale' };
    default:
      return null;
  }
}

// ---- The crew -------------------------------------------------------------------------

// look: an avatar look (see entities/avatar/AvatarModel.js); hunch: how far they stoop
export const CREW = {
  remy: {
    name: 'Remy Theriot', role: 'Captain of the Magnolia',
    pos: [-2.25, -11.85], facing: 0.4, pose: 'smoke',
    look: { sex: 'm', height: 0.97, build: 1.08, hunch: 0.08, skin: 0xd9a07a, hair: { style: 'short', color: 0xd8d4cc }, top: { color: 0x26304a, sleeves: 'long' }, bottoms: { color: 0x8a7a5a }, shoes: { color: 0x4a3222 }, gear: ['captain'], face: { eyes: 'hooded', iris: '#5a4a3a', brows: 'thick', browColor: '#cfcac0', mouth: 'smile', marks: ['beard', 'wrinkles', 'bags'], beardColor: '#d8d4cc' } },
    voice: { pitch: 0.55, rate: 0.86, lang: 'en-US' },
    barks: ['Evening.', 'Mind the line on the foredeck.', 'She creaks. She\'s allowed.', 'Water\'s low tonight.'],
  },
  odile: {
    name: 'Odile Marchand', role: 'The Magnolia\'s nurse',
    pos: [2.05, 4.9], facing: -2.5, pose: 'arms',
    look: { sex: 'f', hunch: 0.02, skin: 0x6b4a36, hair: { style: 'bald', color: 0x17120e }, top: { color: 0x3f6f78, sleeves: 'long' }, bottoms: { color: 0x55646a }, shoes: { color: 0x2a2a2a }, gear: ['wrap', 'glasses'], gearColor: { wrap: 0x7a2a3a }, face: { eyes: 'almond', iris: '#2a1a10', brows: 'arched', browColor: '#17120e', mouth: 'flat', lips: 'rgba(90,40,40,0.9)', marks: [] } },
    voice: { pitch: 1.05, rate: 0.95, lang: 'en-US' },
    barks: ['Wipe your boots.', 'Still in one piece?', 'Eat something hot.', 'Mm.'],
  },
  hale: {
    name: 'Isaac Hale', role: 'Staff Sergeant, 9th Garrison (deserted)',
    pos: [2.4, 9.7], facing: -2.1, pose: 'lean',
    look: { sex: 'm', hunch: 0, skin: 0xa87a5a, hair: { style: 'buzz', color: 0x241c14 }, top: { color: 0x3a4048, sleeves: 'long' }, bottoms: { color: 0x2e3338 }, shoes: { color: 0x1e1e1e }, gear: ['beanie', 'vest'], gearColor: { beanie: 0x2e3338, vest: 0x2a2e33, patch: 0x9a1e18 }, face: { eyes: 'narrow', iris: '#3a2a1e', brows: 'heavy', browColor: '#241c14', mouth: 'flat', marks: ['stubble', 'scar'] } },
    voice: { pitch: 0.8, rate: 0.92, lang: 'en-US' },
    barks: ['Sergeant.', 'Keep your voice down near the rail.', 'Radio\'s quiet tonight.', 'Still breathing. Good.'],
  },
};

// ---- Dialogue ---------------------------------------------------------------------------
//
// A conversation is a set of nodes: { say, replies: [{ text, to, act, if, topic }] }.
// `say` and `text` may be functions of the context. `to` names the next node
// (omit it to end the conversation). `topic` replies grey out once heard.
// The context `c` gives: p, step, have(id), take(id, n), give(id, qty, opts),
// advance(step), seen(key), heal(), radio().

const bye = (text = 'Goodbye.') => ({ text, end: true });

export const DIALOGUE = {
  remy: {
    start: (c) => (c.p.story.met.remy ? 'main' : 'hello'),
    nodes: {
      hello: {
        say: 'There you are. Remy Theriot. This is my boat, and you\'re welcome on her as long as you keep coming back from the shore.',
        replies: [
          { text: 'How did the Magnolia end up here?', to: 'aground', topic: 'remy.aground' },
          { text: 'Who\'s the man on the aft deck?', to: 'passenger', if: (c) => c.step === 'hale' },
          { text: 'Anything else I should know?', to: 'main' },
          bye('Later, Captain.'),
        ],
      },
      main: {
        say: (c) => ({
          hale: 'Man on my aft deck came aboard three nights ago in a Guard coat. Calls himself Hale. I haven\'t thrown him over yet. Go see what he wants before I change my mind.',
          tags: 'Hale\'s got you collecting dead men\'s tags. Just remember whose boat you sleep on.',
          codebook: 'The Quarter, is it? Take something that\'ll crack a helmet. The dead out there still wear their armour.',
          ledger: 'Odile hasn\'t slept. Whatever you\'re looking for out in Marais Noir, find it.',
          plan: 'Odile hasn\'t slept. Whatever you\'re looking for out in Marais Noir, find it.',
          mast: 'Hale says you mean to take down a Guard mast. Forty years on this river and I never saw a man pick a fight with something that tall and win. Be the first.',
          report: 'Two nights now and not one horn. The frogs came back. Hear them? That\'s the sound of nobody herding anything.',
          done: 'Two nights now and not one horn. The frogs came back. Hear them? That\'s the sound of nobody herding anything.',
        }[c.step]),
        replies: [
          { text: 'How did the Magnolia end up here?', to: 'aground', topic: 'remy.aground' },
          { text: 'Tell me about the Living Guard.', to: 'guard', topic: 'remy.guard' },
          { text: 'Where should I go next?', to: 'places' },
          { text: 'What\'s the board for?', to: 'board', topic: 'remy.board' },
          bye(),
        ],
      },
      passenger: {
        say: 'Says his name is Hale. Sergeant. Deserted from the Guard garrison at Outpost 9, if you believe him. I do, mostly — a spy would\'ve brought his own food. Go and talk to him.',
        replies: [{ text: 'I will.', to: 'main' }, bye()],
      },
      aground: {
        say: 'She was a casino boat, then a museum, then nothing. When the levees went I brought her up the bayou on a full boiler and a prayer. The water went down. She didn\'t go with it. So now she\'s a house, and I\'m the captain of a house.',
        replies: [{ text: 'Something else.', to: 'main' }, bye()],
      },
      guard: {
        say: 'They came up the river road in white trucks with a red bar down the side. Handed out water, fixed the pumps at St. Aubin. People cheered them. Then the radios went quiet between them and wherever they came from, and the men who stayed started acting like they\'d been left in charge of everything. Now there\'s a curfew, and a Sweep, and a mast that calls the dead.',
        replies: [{ text: 'Something else.', to: 'main' }, bye()],
      },
      places: {
        say: (c) => {
          const lead = {
            tags: 'For Hale\'s tags, the St. Aubin Quarter\'s full of armoured dead, and there\'s a patrol walks the Kessler yard at dusk.',
            codebook: 'Hale wants the checkpoint in the St. Aubin Quarter. It fell with the men still inside.',
            ledger: 'Marais Noir. Go at night or not at all — it\'s always night out there anyway. The dead come up out of the water, so stay off the edges.',
            mast: 'Outpost 9. Soldiers on the gates, drones before curfew. Go in quiet, come out loud.',
          }[c.step];
          return (lead ? lead + ' ' : '') + 'Otherwise: Cypress Row for food and cloth, Kessler Rail Yard for metal and powder, the Quarter for guns and medicine.';
        },
        replies: [{ text: 'Something else.', to: 'main' }, bye()],
      },
      board: {
        say: 'Pick a place, pin the string, and the skiff\'s waiting at the port gangway. The notes on the right are work — folks up and down the bayou trading for what you bring back.',
        replies: [{ text: 'Something else.', to: 'main' }, bye()],
      },
    },
  },

  odile: {
    start: (c) => (c.p.story.met.odile ? 'main' : 'hello'),
    nodes: {
      hello: {
        say: 'Sit down if you\'re bleeding. Stand if you\'re not. I\'m Odile. I was a nurse at Charity before there was no Charity. The infirmary is mine; you can use it, just put things back.',
        replies: [
          { text: 'I found Father Anselme\'s ledger.', to: 'ledger', if: (c) => c.step === 'ledger' && c.have('ledger') },
          { text: 'Hale says your people are from Marais Noir.', to: 'where', if: (c) => c.step === 'ledger' && !c.have('ledger'), topic: 'odile.where' },
          { text: 'Where are you from?', to: 'home', topic: 'odile.home' },
          { text: 'Can you patch me up?', to: 'heal' },
          bye(),
        ],
      },
      main: {
        say: (c) => {
          if (c.step === 'ledger' && c.have('ledger')) return 'You have that look. What did you find?';
          return {
            ledger: 'Hale told me what he heard on his radio. "Marais intake." I grew up out there. My sister Josette never left.',
            plan: 'Go and talk to Hale. I have nothing else to say about it tonight.',
            mast: 'Whatever Hale is building, it had better work. Forty-one names.',
            report: 'If any of those forty-one are still breathing at Outpost 9, they heard the horns stop tonight and wondered why. That is something.',
            done: 'If any of those forty-one are still breathing at Outpost 9, they heard the horns stop tonight and wondered why. That is something.',
          }[c.step] || 'You\'re in one piece. Keep it that way.';
        },
        replies: [
          { text: 'I found Father Anselme\'s ledger.', to: 'ledger', if: (c) => c.step === 'ledger' && c.have('ledger') },
          { text: 'Where would they have written it down?', to: 'where', if: (c) => c.step === 'ledger' && !c.have('ledger'), topic: 'odile.where' },
          { text: 'Where are you from?', to: 'home', topic: 'odile.home' },
          { text: 'Can you patch me up?', to: 'heal' },
          bye(),
        ],
      },
      home: {
        say: 'Marais Noir, out past the cypress line. Fish houses on stilts, a chapel with a bottle tree out front. Josette stayed. She said the swamp takes care of its own. I haven\'t heard from her since the Guard went through.',
        replies: [{ text: 'Something else.', to: 'main' }, bye()],
      },
      heal: {
        say: (c) => {
          if (c.p.health >= c.maxHealth - 1) return 'You\'re not hurt. You\'re hungry. A body heals on food, not stubbornness — the galley stove is right there.';
          if (c.p.story.healedDay === c.p.day) return 'I\'ve done what I can for today. Rest, eat, and don\'t go getting bitten.';
          c.heal();
          return 'Hold still. ... There. Clean, stitched, and it will scar. Eat something hot and you\'ll mend the rest of the way.';
        },
        replies: [{ text: 'Thanks, Doc.', to: 'main' }, bye()],
      },
      where: {
        say: 'Father Anselme kept the parish book. Births, burials, who owes who for bait. If the Guard came for them, he wrote it down, and he\'d hide it where no soldier would look — the offering chest beside the altar. Nobody robs God in Marais Noir.',
        replies: [{ text: 'I\'ll find it.', end: true }, { text: 'Something else.', to: 'main' }],
      },
      ledger: {
        say: 'Let me see. ... The last page. "The soldiers came on the feast of St. Roch. They wrote down every name. Forty-one of us to Outpost Nine, for resettlement. I stay with the ones too sick to walk. God forgive them, because I cannot."',
        act: (c) => c.take('ledger', 1),
        replies: [{ text: 'Is your sister on the list?', to: 'ledger2' }],
      },
      ledger2: {
        say: 'Josette Marchand. Twenty-ninth line. ... Go and tell Hale. Tell him I want to know what "resettlement" means at Outpost Nine.',
        act: (c) => c.advance('plan'),
        replies: [{ text: 'I\'ll tell him.', end: true }],
      },
    },
  },

  hale: {
    start: (c) => (c.p.story.met.hale ? (c.step === 'report' ? 'epilogue' : 'main') : 'hello'),
    nodes: {
      hello: {
        say: 'You\'re the one who goes ashore. Remy says you come back more often than not. That makes you rare.',
        replies: [
          { text: 'Who are you?', to: 'who', topic: 'hale.who' },
          { text: 'Why the Guard uniform?', to: 'uniform', topic: 'hale.uniform' },
          { text: 'What do you want from me?', to: 'want' },
        ],
      },
      who: {
        say: 'Isaac Hale. Staff Sergeant, Signals, 9th Garrison of the Living Guard. Was. I walked out of Outpost 9 eleven days ago and kept walking until I ran out of land.',
        replies: [
          { text: 'Why the Guard uniform?', to: 'uniform', topic: 'hale.uniform' },
          { text: 'What do you want from me?', to: 'want' },
        ],
      },
      uniform: {
        say: 'Because it\'s the only coat I have. The Guard were the good guys once, believe it or don\'t. Colonies from here to the Carolinas. Clean water, power, schools. Then the 9th lost contact with Command, and Colonel Merritt decided that meant he was Command.',
        replies: [
          { text: 'Who are you?', to: 'who', topic: 'hale.who' },
          { text: 'What do you want from me?', to: 'want' },
        ],
      },
      want: {
        say: 'Names. The 9th doesn\'t lose men — it loses names. Bring me their dog tags. Three will do. Tags tell me which companies are working the parish, and who\'s gone.',
        replies: [
          { text: 'I\'ll bring you three tags.', to: 'tagsOk', act: (c) => c.advance('tags') },
          { text: 'Not my war.', to: 'notMine' },
        ],
      },
      tagsOk: {
        say: 'Dead Guardsmen carry them. The armoured dead in the Quarter; the patrols at the rail yard, if you\'re brave. Don\'t get shot over a piece of tin.',
        replies: [bye()],
      },
      notMine: {
        say: 'After curfew it\'s everybody\'s war. Think on it. I\'m not going anywhere.',
        replies: [bye()],
      },
      main: {
        say: (c) => {
          const n = c.have('dogtags');
          switch (c.step) {
            case 'hale': return 'Offer stands. Three tags.';
            case 'tags': return n >= 3 ? 'That jingle in your pocket. Let\'s see them.' : `Three tags. You\'ve got ${n}.`;
            case 'codebook': return c.have('codebook') ? 'Tell me that\'s what I think it is.' : 'The signals locker is in the command tent at the Quarter checkpoint. My card opens it. If you lost it, take one off a dead Guardsman.';
            case 'ledger': return 'Odile knows Marais Noir. Talk to her, then go and find out what "intake" means.';
            case 'plan': return 'Odile came through here like a storm. What did the book say?';
            case 'mast': return c.have('demo_charge')
              ? 'You\'ve got the charge. The relay is the lattice mast inside the compound walls. Set it at the base, then run. Twenty-five seconds is longer than it sounds and shorter than you want.'
              : 'The plans are under the vise on the workshop bench. Powder, fertilizer, and a timer out of anything that ticks.';
            default: return 'Command is sending someone. Until they get here the 9th is deaf, blind and angry. Keep your head down on the Sweep.';
          }
        },
        replies: [
          { text: 'All right. I\'ll get your tags.', to: 'tagsOk', if: (c) => c.step === 'hale', act: (c) => c.advance('tags') },
          { text: 'Here. Three tags.', to: 'tags', if: (c) => c.step === 'tags' && c.have('dogtags') >= 3 },
          { text: 'I have the codebook.', to: 'codebook', if: (c) => c.step === 'codebook' && c.have('codebook') },
          { text: 'Odile read the ledger.', to: 'plan', if: (c) => c.step === 'plan' },
          { text: 'What\'s the Living Guard, really?', to: 'guard', topic: 'hale.guard' },
          { text: 'Tell me about Colonel Merritt.', to: 'merritt', topic: 'hale.merritt', if: (c) => c.at('codebook') },
          { text: 'What is a herder mast?', to: 'herder', topic: 'hale.herder' },
          { text: 'Anything else on the Guard\'s radio?', to: 'covenant', if: (c) => c.at('codebook') && (!c.p.heist || c.p.heist.stage === 'locked') },
          { text: 'About the Covenant.', to: 'covMain', if: (c) => c.p.heist && c.p.heist.stage !== 'locked' && !c.have('prototype_case') },
          { text: 'I brought the prototype case.', to: 'caseOpen', if: (c) => c.have('prototype_case') },
          bye(),
        ],
      },
      covenant: {
        say: 'One thing. There\'s a freighter talking to the 9th every night: the Covenant, anchored off Port Lafitte. She\'s loading Experimental gear out of the Natchez labs for Merritt — the kind of thing the Guard doesn\'t let off the colony walls. She sails when she\'s full.',
        replies: [{ text: 'And you want what\'s on her.', to: 'covenant2' }],
      },
      covenant2: {
        say: 'I want Merritt not to have it, and I wouldn\'t mind if we did. All you need is a boat with fuel, and a plan. Go and look at her first. The lighthouse on the breakwater, or climb a crane. Count heads, find the ways aboard. Then we plan it on the board by my bunk.',
        act: (c) => { c.p.heist.stage = 'offered'; c.log('The Covenant: a Guard freighter off Port Lafitte, loading Experimental gear from the Natchez labs. Scout her from the lighthouse or a crane, then plan it on Hale\'s board.'); },
        replies: [{ text: 'What are the ways aboard?', to: 'covWays' }, bye('I\'ll go and look.')],
      },
      covWays: {
        say: 'Quiet or loud. Quiet is under the water or up a ladder in the dark — a diver through the bottom of her, or a fast boat running with the engine barely ticking over. Loud is a fast boat flat out, or the Magnolia herself alongside with all of us. Each wants its own kit. Suppressors for quiet. Something with a big magazine for loud.',
        replies: [bye('Understood.')],
      },
      covMain: {
        say: (c) => {
          const h = c.p.heist;
          if (h.stage === 'done') return 'The Covenant\'s cage is empty and Merritt knows who emptied it. Worth it.';
          if (!h.scouted) return 'Port Lafitte. Glass her from the lighthouse or the crane, and come back alive with it in your head.';
          return 'The board\'s by my bunk. Four ways in. Pick one, get what it needs, carry the right kit. And think about how you get off her before you get on.';
        },
        replies: [{ text: 'What are the ways aboard?', to: 'covWays' }, { text: 'Something else.', to: 'main' }, bye()],
      },
      caseOpen: {
        say: 'Natchez Labs seal. ... Let me. There. Look at that. They weren\'t giving him rifles, they were giving him the future. Take what\'s in it. You earned the whole case.',
        act: (c) => {
          c.take('prototype_case', 1);
          c.give('beam_lance', 1, { loaded: 4, chambered: true });
          c.give('arc_carbine', 1, { loaded: 18, chambered: true });
          c.give('ecell', 6);
          c.give('nano_injector', 2);
          c.p.heist.stage = 'done';
          c.p.heist.done = true;
          c.log('The Covenant job is done. Hale opened the prototype case: a beam lance, an arc carbine, cells and Guard injectors.');
        },
        replies: [bye('Thank you, Sergeant.')],
      },
      tags: {
        say: 'Pruitt. Okafor. ... Byrne. Byrne was Signals. I trained him. If Merritt is putting radio men on the Sweep, there\'s nobody left on the radios but Merritt\'s own.',
        act: (c) => c.take('dogtags', 3),
        replies: [{ text: 'What now?', to: 'tags2' }],
      },
      tags2: {
        say: 'Now we listen. There\'s a signals locker at the Quarter checkpoint — the post that fell with the men still inside. The codebook in it has the 9th\'s frequencies and Command\'s authentication tables. Take my card. They\'ve wiped half the doors in the parish, but not that one.',
        act: (c) => { c.give('keycard', 1); c.advance('codebook'); },
        replies: [bye('I\'ll bring it back.')],
      },
      codebook: {
        say: 'That\'s it. Command\'s channels — all of it. But every night there\'s a carrier sitting on the long bands, loud enough to drown anything I send. And there\'s this, from the 9th\'s own traffic: "Marais intake closed. Transfer to Nine complete."',
        act: (c) => { c.take('codebook', 1); c.radio(); },
        replies: [{ text: 'Marais Noir?', to: 'codebook2' }],
      },
      codebook2: {
        say: 'That\'s where Odile\'s people are from. Talk to her. If anybody out there wrote down what happened, she\'ll know where they\'d keep it.',
        act: (c) => c.advance('ledger'),
        replies: [bye()],
      },
      plan: {
        say: 'Forty-one people. Resettlement. At Outpost 9 that means work gangs — or bait. The Sweep needs something to walk the dead toward.',
        replies: [{ text: 'And the carrier on the radio?', to: 'plan2' }],
      },
      plan2: {
        say: 'It\'s the relay at Outpost 9. The same mast that drives every herder horn in the parish jams everything past the river. Merritt isn\'t just herding the dead. He\'s making sure Command can\'t hear what the 9th is doing.',
        replies: [{ text: 'So we take it down.', to: 'plan3' }],
      },
      plan3: {
        say: 'So we take it down. I\'ve drawn up a charge you can build at the workshop. Plant it at the base of the relay mast inside the compound, and get clear. The horns go quiet, and my message goes out.',
        act: (c) => c.advance('mast'),
        replies: [{ text: 'What happens after?', to: 'after' }, bye('I\'ll build it.')],
      },
      after: {
        say: 'After, Merritt is blind and angry, and the Sweeps get ugly for a while — more soldiers, more drones. But the dead won\'t be driven any more. And Command will finally hear us.',
        replies: [bye()],
      },
      guard: {
        say: 'A rebuilding army. Most of it still is: colonies, farms, a council that votes. The tech came out of places the old government never admitted to — the lasers, the drones, the horns. The 9th got the best of it because we were the frontier. Then the frontier went quiet.',
        replies: [{ text: 'Something else.', to: 'main' }, bye()],
      },
      merritt: {
        say: 'Colonel Adam Merritt. A good officer, once. When the radios died he held the 9th together. Then he stopped waiting for orders. Then he started writing them.',
        replies: [{ text: 'Something else.', to: 'main' }, bye()],
      },
      herder: {
        say: 'Sonic arrays on a lattice tower. The dead turn toward a certain pitch like flowers to the sun. The Guard built them to lead the dead away from the colonies. Merritt uses them to push the dead through a sector ahead of his Sweep teams. Anyone caught outside gets eaten or shot, and nobody has to write a report.',
        replies: [{ text: 'Something else.', to: 'main' }, bye()],
      },
      epilogue: {
        say: 'You did it. Every horn from here to the river went quiet at once. Listen.',
        act: (c) => c.radio(),
        replies: [{ text: 'Is that Command?', to: 'epi2' }],
      },
      epi2: {
        say: '"Ninth Garrison, this is Living Guard Command, Natchez. Authenticate." ... I gave them the tables from the codebook. Then I told them everything. Merritt. The Sweeps. The forty-one from Marais Noir.',
        replies: [{ text: 'What did they say?', to: 'epi3' }],
      },
      epi3: {
        say: 'They said the 9th was struck from the rolls fourteen months ago. Lost with all hands. As far as the Living Guard is concerned, Merritt and every man he has are already dead.',
        replies: [{ text: 'So what happens now?', to: 'epi4' }],
      },
      epi4: {
        say: 'They\'re sending someone. Not soon. Until then the horns are dead and Merritt is deaf, and he\'ll be looking for whoever did it. Here — this was my sidearm. I don\'t need a Guard weapon to be a Guardsman again.',
        act: (c) => { c.give('photon_pistol', 1, { loaded: 10, chambered: true, mods: { sights: 'guard_optic' } }); c.give('ecell', 3); c.advance('done'); },
        replies: [bye('Thank you, Sergeant.')],
      },
    },
  },
};
