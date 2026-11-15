// Crew generation tables: skills, traits, backgrounds, names.

export const SKILLS = ['farming', 'crafting', 'salvage', 'hustle', 'gunplay', 'stealth', 'driving', 'bookkeeping', 'leadership'];
export const SKILL_NAMES = { farming: 'Farming', crafting: 'Crafting', salvage: 'Salvage', hustle: 'Hustle', gunplay: 'Gunplay', stealth: 'Stealth', driving: 'Driving', bookkeeping: 'Bookkeeping', leadership: 'Leadership' };
export const SKILL_TIPS = {
  farming: 'Plot care, yield and cure quality (x1.0 to x1.4).',
  crafting: 'Component stars, gun grade, craft time (-5%/pt).',
  salvage: 'Scavenging yields and smelting output.',
  hustle: 'Street prices (+3%/pt) and dealer volume.',
  gunplay: 'Squad accuracy and damage.',
  stealth: 'Dealer heat, lookout intel, lockpicking.',
  driving: 'Getaways, smuggling runs, convoy jobs.',
  bookkeeping: 'Laundering fee (-2%/pt) and capacity (+10%/pt).',
  leadership: 'Manager efficiency and squad morale.',
};

// good: visible at hire. bad traits may be hidden until the recruit is vetted.
export const TRAITS = {
  green_thumb: { name: 'Green Thumb', good: true, desc: '+2 effective Farming; +10% yield on tended plots.' },
  steady_hands: { name: 'Steady Hands', good: true, desc: '+2 effective Crafting; never makes Unreliable guns.' },
  veteran: { name: 'Veteran', good: true, desc: '+2 Gunplay, +25 HP in the squad.' },
  born_leader: { name: 'Born Leader', good: true, desc: '+2 Leadership; squad morale never breaks.' },
  smooth_talker: { name: 'Smooth Talker', good: true, desc: '+2 effective Hustle; bribes cost 10% less.' },
  bookworm: { name: 'Bookworm', good: true, desc: '+2 Bookkeeping; learns 50% faster.' },
  grease_monkey: { name: 'Grease Monkey', good: true, desc: '+2 Driving; vehicles never break down on jobs.' },
  ghost: { name: 'Ghost', good: true, desc: '+2 Stealth; dealer heat -25%.' },
  night_owl: { name: 'Night Owl', good: true, desc: '+25% output between 20:00 and 06:00.' },
  lucky: { name: 'Lucky', good: true, desc: 'Delegated jobs +8% success; survives lethal hits once a week.' },
  loyal: { name: 'Loyal Dog', good: true, desc: 'Loyalty decays at half rate. Never snitches.' },
  sticky_fingers: { name: 'Sticky Fingers', good: false, desc: 'Skims 3-6% of what passes through their hands.' },
  loose_lips: { name: 'Loose Lips', good: false, desc: 'Triple snitch risk. Talks at taverns.' },
  coward: { name: 'Coward', good: false, desc: 'Flees combat below half HP; -10 morale in raids.' },
  lazy: { name: 'Lazy', good: false, desc: '-20% productivity.' },
  greedy: { name: 'Greedy', good: false, desc: 'Demands raises; loyalty drops faster when unpaid.' },
  hothead: { name: 'Hothead', good: false, desc: '+15% damage, but picks fights (heat +1 per job).' },
  addict: { name: 'Addict', good: false, desc: 'Eats 1 unit of product a day if any is stored.' },
};
export const GOOD_TRAITS = Object.keys(TRAITS).filter((k) => TRAITS[k].good);
export const BAD_TRAITS = Object.keys(TRAITS).filter((k) => !TRAITS[k].good);

export const BACKGROUNDS = [
  { id: 'farmhand', name: 'Farmhand', skill: 'farming', story: 'Grew grain in Millbrook until the blight took the fields.' },
  { id: 'tinker', name: 'Tinker', skill: 'crafting', story: 'Fixed radios and rifles for anyone who paid in food.' },
  { id: 'scav', name: 'Scavenger', skill: 'salvage', story: 'Ten years picking the bones of the old city.' },
  { id: 'hustler', name: 'Street Hustler', skill: 'hustle', story: 'Could sell sand to a dune.' },
  { id: 'militia', name: 'Ex-Militia', skill: 'gunplay', story: 'Walked off a Compact patrol and never looked back.' },
  { id: 'burglar', name: 'Cat Burglar', skill: 'stealth', story: 'Light feet, lighter morals.' },
  { id: 'wheelman', name: 'Wheelman', skill: 'driving', story: 'Ran caravans through the ash dunes.' },
  { id: 'clerk', name: 'Clerk', skill: 'bookkeeping', story: 'Kept the books for a Harbor Nine shipping house.' },
  { id: 'foreman', name: 'Foreman', skill: 'leadership', story: 'Ran a Foundry shift crew. People listen.' },
];

export const FIRST = ['Ada', 'Bram', 'Cass', 'Dell', 'Edda', 'Flint', 'Greer', 'Hollis', 'Ivo', 'Jessa', 'Kip', 'Lark', 'Moss', 'Nell', 'Orrin', 'Pell', 'Quill', 'Rook', 'Sable', 'Tamsin', 'Ulla', 'Vic', 'Wren', 'Xan', 'Yara', 'Zeke', 'Abel', 'Bette', 'Cole', 'Dina', 'Ezra', 'Fen', 'Gus', 'Hattie', 'Iggy', 'June', 'Knox', 'Lula', 'Milo', 'Nico', 'Opal', 'Pike', 'Rhea', 'Silas', 'Tess', 'Vera', 'Wade', 'Zora'];
export const LAST = ['Ashby', 'Barrow', 'Coil', 'Drummond', 'Ember', 'Flask', 'Grubb', 'Hatch', 'Ingram', 'Jett', 'Kettle', 'Lowe', 'Marsh', 'Nails', 'Oakes', 'Pike', 'Quarry', 'Rusk', 'Slate', 'Tallow', 'Underhill', 'Vance', 'Wick', 'Yates', 'Zell', 'Brine', 'Cutter', 'Dusk', 'Gravel', 'Hollow', 'Mortar', 'Penny', 'Rivet', 'Sorrow', 'Tinder', 'Whit'];
export const NICKS = ['Two-Bit', 'Lucky', 'Doc', 'Sparks', 'Rat', 'Smiles', 'Patch', 'Biscuit', 'Hammer', 'Whisper', 'Gravel', 'Ace', 'Moth', 'Sketch', 'Tiny', 'Brick'];

// Station assignments (where a worker can be put) and the skill each one uses.
export const JOBS = {
  idle: { name: 'Idle', skill: null },
  farmer: { name: 'Farmer (plots)', skill: 'farming' },
  curer: { name: 'Curer / packer', skill: 'farming' },
  smelter: { name: 'Smelter hand', skill: 'salvage' },
  machinist: { name: 'Machinist (lathe)', skill: 'crafting' },
  gunsmith: { name: 'Gunsmith (bench)', skill: 'crafting' },
  presser: { name: 'Ammo presser', skill: 'crafting' },
  dealer: { name: 'Street dealer', skill: 'hustle' },
  runner: { name: 'Bulk runner', skill: 'driving' },
  scavenger: { name: 'Scavenger', skill: 'salvage' },
  guard: { name: 'Hollow guard', skill: 'gunplay' },
  squad: { name: 'Squad gunman', skill: 'gunplay' },
  lookout: { name: 'Lookout', skill: 'stealth' },
  staff: { name: 'Front staff', skill: 'hustle' },
  accountant: { name: 'Accountant', skill: 'bookkeeping' },
  enforcer: { name: 'Enforcer (rackets)', skill: 'gunplay' },
  garrison: { name: 'Garrison', skill: 'gunplay' },
  manager: { name: 'Manager', skill: 'leadership' },
  trainee: { name: 'Training', skill: null },
};
