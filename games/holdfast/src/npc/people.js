// Who the survivors are: personalities (temperament and voice) and
// backgrounds (a life in Bridger County, told in chapters as trust grows).
// Two survivors may share a personality; within one camp no two share a
// background, so their stories, skills and talk are their own.

// Traits 0..1: temper, warmth, humor, bravery, honesty, social, discipline,
// faith, greed, anxiety, optimism. tone picks the shared line pool.
export const PERSONALITIES = {
  rock: { name: 'Steady', tone: 'warm', desc: 'Calm, dependable, quietly looks after everyone. Says little and means it.',
    t: { temper: .15, warmth: .8, humor: .35, bravery: .7, honesty: .85, social: .45, discipline: .85, faith: .5, greed: .1, anxiety: .2, optimism: .6 }, wake: 5.3, sleep: 21.6 },
  hothead: { name: 'Hothead', tone: 'blunt', desc: 'Loyal and brave, with a short fuse. Says what everyone else is thinking, loudly.',
    t: { temper: .9, warmth: .55, humor: .4, bravery: .85, honesty: .75, social: .6, discipline: .4, faith: .3, greed: .3, anxiety: .35, optimism: .45 }, wake: 6.4, sleep: 23.2 },
  cynic: { name: 'Cynic', tone: 'dry', desc: 'Sharp, sardonic and usually right about the worst case. Hides decency under sarcasm.',
    t: { temper: .45, warmth: .3, humor: .75, bravery: .55, honesty: .7, social: .4, discipline: .55, faith: .05, greed: .35, anxiety: .45, optimism: .1 }, wake: 7.0, sleep: 23.6 },
  joker: { name: 'Joker', tone: 'cheery', desc: 'Keeps everyone laughing so nobody has to think. The jokes get thinner when things go bad.',
    t: { temper: .2, warmth: .75, humor: .95, bravery: .55, honesty: .6, social: .9, discipline: .3, faith: .3, greed: .25, anxiety: .3, optimism: .85 }, wake: 7.2, sleep: 23.8 },
  believer: { name: 'Believer', tone: 'warm', desc: 'Faith holds them together. Gentle, forgiving, and stubborn about right and wrong.',
    t: { temper: .15, warmth: .85, humor: .35, bravery: .6, honesty: .9, social: .6, discipline: .7, faith: .95, greed: .1, anxiety: .3, optimism: .85 }, wake: 5.6, sleep: 21.8 },
  planner: { name: 'Planner', tone: 'earnest', desc: 'Lists, schedules and contingencies. Wants a say in everything and gets tense when things drift.',
    t: { temper: .45, warmth: .45, humor: .25, bravery: .55, honesty: .75, social: .5, discipline: .95, faith: .35, greed: .3, anxiety: .4, optimism: .5 }, wake: 5.5, sleep: 22.4 },
  loner: { name: 'Loner', tone: 'blunt', desc: 'Self-reliant, guarded, very good at staying alive. Trust is earned one inch at a time.',
    t: { temper: .4, warmth: .25, humor: .3, bravery: .75, honesty: .7, social: .1, discipline: .7, faith: .2, greed: .25, anxiety: .25, optimism: .35 }, wake: 5.8, sleep: 23.0 },
  schemer: { name: 'Schemer', tone: 'dry', desc: 'Charming, quick, always working an angle. Useful, and not to be left alone with the stores.',
    t: { temper: .3, warmth: .5, humor: .6, bravery: .4, honesty: .25, social: .75, discipline: .35, faith: .15, greed: .9, anxiety: .35, optimism: .55 }, wake: 7.5, sleep: 24.0 },
  worrier: { name: 'Worrier', tone: 'nervous', desc: 'Kind, anxious, sees every danger coming. Braver than they believe when it counts.',
    t: { temper: .2, warmth: .8, humor: .3, bravery: .15, honesty: .85, social: .5, discipline: .55, faith: .55, greed: .1, anxiety: .95, optimism: .25 }, wake: 6.0, sleep: 22.0 },
  idealist: { name: 'Idealist', tone: 'earnest', desc: 'Wants to rebuild something better than what fell. Inspiring, and exhausting.',
    t: { temper: .5, warmth: .7, humor: .35, bravery: .75, honesty: .8, social: .7, discipline: .6, faith: .45, greed: .15, anxiety: .3, optimism: .8 }, wake: 6.0, sleep: 23.0 },
  oldsoul: { name: 'Old soul', tone: 'warm', desc: 'Has seen hard times before. Full of stories, sayings and patience.',
    t: { temper: .2, warmth: .75, humor: .6, bravery: .45, honesty: .8, social: .65, discipline: .55, faith: .55, greed: .15, anxiety: .25, optimism: .55 }, wake: 5.0, sleep: 21.2 },
  wildcard: { name: 'Wild card', tone: 'cheery', desc: 'Restless and fearless. Lives for the next run and gets twitchy sitting still.',
    t: { temper: .55, warmth: .55, humor: .75, bravery: .95, honesty: .55, social: .8, discipline: .15, faith: .15, greed: .4, anxiety: .1, optimism: .75 }, wake: 8.0, sleep: 24.8 },
};

// Camp roles. prod: what working the role makes per game hour of work.
export const ROLES = {
  cook: { name: 'Cook', desc: 'Makes the food go further. Meals at breakfast, noon and supper.', stations: ['grill', 'campfire', 'stove', 'counter'] },
  farmer: { name: 'Farmer', desc: 'Tends gardens. More beds, more food.', stations: ['garden'] },
  medic: { name: 'Medic', desc: 'Patches up the camp and you. Keeps sickness away.', stations: ['medcot', 'bed', 'table'] },
  mechanic: { name: 'Mechanic', desc: 'Salvages metal and fuel, keeps tools and doors working.', stations: ['workbench', 'toolchest'] },
  builder: { name: 'Builder', desc: 'Chops wood and gathers stone. Repairs what breaks.', stations: ['chopping', 'workbench'] },
  guard: { name: 'Guard', desc: 'Watches the edges and fights off the dead. Fewer attacks reach camp.', stations: ['lookout', 'flag'] },
  hunter: { name: 'Hunter', desc: 'Goes out hunting and fishing and comes back with food.', stations: ['campfire'] },
  scavenger: { name: 'Scavenger', desc: 'Makes supply runs on their own. Risky, but brings back a bit of everything.', stations: ['crate'] },
  quartermaster: { name: 'Quartermaster', desc: 'Keeps the stores straight. Less waste, less theft.', stations: ['crate', 'shelf'] },
  counselor: { name: 'Counselor', desc: 'Keeps spirits up and settles quarrels before they turn ugly.', stations: ['campfire', 'table'] },
};

// Skills 0..3: cooking, medicine, mechanics, combat, shooting, scavenging,
// farming, building, leadership, stealth.
const sk = (s) => {
  const keys = ['cooking', 'medicine', 'mechanics', 'combat', 'shooting', 'scavenging', 'farming', 'building', 'leadership', 'stealth'];
  const o = {};
  keys.forEach((k, i) => { o[k] = +s[i]; });
  return o;
};

// place: a map spot they know (a sign on a building, or coordinates).
// story: four chapters ({kin} name, {kinRel} "my sister", {item}).
// known: how others describe them. flavor: their own turns of phrase.
// ideas: plans they pitch (see missions.js for kinds).
export const BACKGROUNDS = [
  { id: 'diner_cook', job: 'Line cook at the River Diner', role: 'cook', skills: sk('3000110000'), kin: ['daughter', 'son'], item: 'a cast-iron skillet', place: { sign: 'RIVER DINER' },
    known: 'ran the grill at the River Diner for eleven years',
    story: [
      "I ran the grill at the River Diner. Eleven years of hash browns, Friday fish fry, and truckers who wanted their eggs “wet but not runny.”",
      "{kinRel} {kin} used to sit at the end of the counter doing homework while I worked doubles. I'd slide over fries when the boss wasn't looking. That's {item} I carry. It was my grandma's before it was mine.",
      "The morning it went bad we had a full room. A man came in bleeding from the arm and sat in booth four. Ten minutes later he wasn't a man anymore. I locked myself in the walk-in with two waitresses and the dishwasher. Only two of us came out.",
      "I tell people {kin} got out on the school bus to Cape. I don't actually know that. I say it enough times and it gets easier to believe. Don't take that away from me." ],
    flavor: ["Smells like a Friday fish fry in here. Or I'm losing my mind.", "My feet ache like a double shift on a Sunday.", "You can feed six people on one can of beans if you know what you're doing.", "Nobody ever tipped the cook, you know that?"],
    ideas: [{ kind: 'cache', at: 'RIVER DINER', label: 'Diner walk-in pantry', table: 'food_cache', text: "The diner's walk-in had a dry pantry behind it. Sacks of flour, canned tomatoes, coffee. If nobody's broken in, that's a month of meals." }, { kind: 'build', what: 'grill', text: "Get me a grill and I'll make whatever we find taste like it came off a menu." }] },
  { id: 'farmhand', job: 'Hired hand on the Dekker farm', role: 'farmer', skills: sk('0001011200'), kin: ['brother', 'father'], item: 'a pocketknife with a cracked bone handle', place: { name: 'Dekker Farm', at: [-238, 98] },
    known: 'worked the Dekker place since high school',
    story: [
      "Worked for old man Dekker since I was sixteen. Planting, haying, fixing fence. I can tell you what's wrong with a field by smelling the dirt.",
      "{kinRel} {kin} and me were going to buy forty acres off County Road 210. We had it half saved. {item} was his. He gave it to me the day I got the job.",
      "Dekker went into the barn to check on the heifers and didn't come out right. I had to put him down with a hay fork. I can still hear the sound it made. I don't go in barns if I can help it.",
      "I knew where {kin} was that last week. Holed up in town. I didn't go. I told myself the roads were too bad. The roads were fine. I was scared." ],
    flavor: ["Hot as haying in August.", "Ground's too wet to plant. Too wet to do much of anything.", "You can't rush corn and you can't rush people.", "Rain in the morning, sailors take warning. Farmers just take a nap."],
    ideas: [{ kind: 'cache', at: [-272, 88], label: 'Seed stock in the Dekker barn', table: 'seed_cache', text: "Dekker kept seed corn and bean seed in drums in the back of his barn. Plant that and we eat next year, not just this week." }, { kind: 'build', what: 'garden', text: "Give me a couple of garden beds. I'll have greens up in a week and potatoes by fall." }] },
  { id: 'firefighter', job: 'Volunteer firefighter and county road crew', role: 'guard', skills: sk('0102100110'), kin: ['wife', 'husband'], item: 'a brass fire department badge', place: { name: 'Water tower', at: [106, 118] },
    known: 'was a volunteer firefighter for Harlan’s Landing',
    story: [
      "Days I ran a grader for the county. Nights and weekends I was on the volunteer department. Grass fires, car wrecks on 34, a cat or two.",
      "{kinRel} {kin} hated the pager. It went off during our wedding dinner. {item} was pinned on my coat that day and every call after.",
      "When it started, we got toned out to a 'disturbance' on Spanish Street. There were nine of them in one kitchen. We lost the chief and two of the guys before anybody understood what we were looking at.",
      "I can make a fire do what I want. Burn a building down slow, push smoke where I need it. I've thought about using that on the living. I'm not proud of how much I've thought about it." ],
    flavor: ["Smell that? Somebody's burning tires out east.", "Rule one: know your way out before you go in.", "Every building's a chimney if you give it a chance.", "Water's heavier than people think."],
    ideas: [{ kind: 'raidmod', mod: 'distraction', text: "Those raiders camp near dry grass and old cars. A controlled burn upwind and enough noise, and every dead thing for a mile walks right into their fire. We go in the back while they're busy." }] },
  { id: 'nurse', job: 'ER nurse at the hospital in Cape', role: 'medic', skills: sk('0300000001'), kin: ['mother', 'son'], item: 'a stethoscope with her initials taped on', place: null,
    known: 'worked nights in an emergency room down in Cape',
    story: [
      "Twelve years of night shift in the ER down in Cape. Overdoses, farm accidents, kids who swallowed batteries. I'm good in a crisis and terrible at everything else.",
      "I drove up here to get {kinRel} {kin} out of town when the news turned. {item} is what I grabbed off the counter on the way out. Habit.",
      "The ER filled up in forty minutes. Bite victims everywhere, nobody listening to the CDC call. I watched a doctor I respected bite a security guard. I walked out a fire door and didn't stop driving.",
      "I left patients. People on gurneys who were still people. I'd do it again, and I'll never forgive myself, and both of those are true." ],
    flavor: ["Let me see that cut. No, really, let me see it.", "Drink water. Everybody. You're all dehydrated.", "Worst shift I ever had still had a vending machine.", "I can sleep anywhere. Twelve years of nights does that."],
    ideas: [{ kind: 'cache', at: [62, 150], label: 'Ambulance on River Road', table: 'med_cache', text: "There's an ambulance in the ditch on River Road. I saw it coming in. Ambulances carry trauma kits, saline, splints. Nobody would have thought to check it." }, { kind: 'build', what: 'medcot', text: "If I had a proper cot and somewhere clean, I could do a lot more than slap bandages on people." }] },
  { id: 'pharmacist', job: 'Pharmacist on Main Street', role: 'medic', skills: sk('0200010001'), kin: ['husband', 'sister'], item: 'a ring of pharmacy keys', place: { sign: 'PHARMACY' },
    known: 'ran the pharmacy on Main Street',
    story: [
      "I filled prescriptions for half this county. I knew who was diabetic, who was depressed, who was faking a bad back. People tell their pharmacist everything.",
      "{kinRel} {kin} wanted me to retire last spring. We were going to see the ocean. {item} is still on my belt. I locked up that last night out of habit.",
      "People came to the pharmacy in a mob that last day. Not for medicine. For anything. Someone threw a brick through the window. I went out the back and left the keys in my pocket.",
      "I know exactly what's in the back room safe, down to the milligram. Sedatives, painkillers, enough to put a room full of people to sleep. I think about who'd want that, and what for." ],
    flavor: ["Two of these, with food. Don't argue.", "That's not a rash, that's an allergic reaction. Stop touching it.", "Half the town owed me money for co-pays.", "I counted pills for thirty years. Counting cans is the same."],
    ideas: [{ kind: 'cache', at: 'PHARMACY', label: 'Pharmacy back-room safe', table: 'med_cache', give: 'sedatives', text: "The back room safe at the pharmacy. I have the keys. Antibiotics, painkillers... and sedatives. Strong ones." }, { kind: 'raidmod', mod: 'drugged', needs: 'sedatives', text: "Raiders drink. If we got the sedatives from my safe into their liquor, they'd sleep through anything for a night. One night is all we'd need." }] },
  { id: 'diesel_mech', job: 'Diesel mechanic at the county garage', role: 'mechanic', skills: sk('0030110200'), kin: ['uncle', 'son'], item: 'a 3/8 ratchet worn smooth', place: { name: 'Gas & Go', at: [44, 8] },
    known: 'fixed every tractor and plow truck in the county',
    story: [
      "If it had a diesel engine and broke down in this county, I probably fixed it. Combines, plow trucks, the school buses.",
      "{kinRel} {kin} taught me on a '72 Ford in his barn. {item} was his too. Some guys collect knives. I collect the tools of dead men, apparently.",
      "I was under a bus at the garage when the screaming started. I stayed under there. Heard it all. Came out after dark and the lot was empty except for what was left of the driver.",
      "I can make an engine run on almost anything. I've been thinking a generator could light this camp. I've also been thinking light is how they find you." ],
    flavor: ["That's not broke, it just needs persuading.", "Hand me that. No, the other one. The one I'm looking at.", "Diesel smell beats anything else in this world.", "Everything's fixable except people."],
    ideas: [{ kind: 'cache', at: [52, 14], label: 'Gas & Go underground tank', table: 'fuel_cache', text: "The Gas & Go has a tank under the lot with a hand-pump access. I know how to open it. That's more fuel than we can carry." }] },
  { id: 'trucker', job: 'Long-haul trucker', role: 'scavenger', skills: sk('1011210000'), kin: ['ex-wife', 'twin brother'], item: 'a CB radio handset', place: { name: 'Highway 34', at: [-120, 38] },
    known: 'drove a rig coast to coast for twenty years',
    story: [
      "Twenty years on the road. Coast to coast, every truck stop between. I've slept in a cab more nights than in a bed.",
      "{kinRel} {kin} said I was married to the road. She wasn't wrong. {item} is off my rig. Sometimes I key it at night. Nobody answers. Sometimes that's worse.",
      "I was coming up 34 with a load of canned goods when traffic stopped. I watched it come down the line of cars like a wave. I jackknifed trying to turn around. Walked away. Trailer's probably still there.",
      "I had a girl in Tulsa and a woman in Memphis and neither knew about the other. Doesn't matter now. Funny how it still feels like it does." ],
    flavor: ["I've had worse coffee at a Flying J.", "Breaker, breaker. Nobody. Figures.", "You learn a lot about people at three in the morning at a truck stop.", "My back's shaped like a driver's seat."],
    ideas: [{ kind: 'cache', at: [-215, 22], label: 'Jackknifed trailer on Highway 34', table: 'food_cache', text: "My trailer's still out on 34, west of the county road. Thirty thousand pounds of canned goods, if the dead haven't learned to use can openers." }, { kind: 'raidmod', mod: 'ambush', text: "Raiders move supplies on the highway around dawn. I've heard their engines. We set up where 34 bends and they'd never see it coming." }] },
  { id: 'shop_teacher', job: 'High school shop teacher', role: 'builder', skills: sk('0020100320'), kin: ['wife', 'nephew'], item: 'a carpenter’s pencil behind the ear', place: null,
    known: 'taught shop class at the high school for twenty years',
    story: [
      "Twenty years teaching sixteen-year-olds not to cut their fingers off. Birdhouses, gun racks, one kid built a canoe that actually floated.",
      "{kinRel} {kin} still has every birdhouse I ever made her, God knows why. {item}: I'm never without one. Old habit.",
      "School was in session. We put the kids in the gym and barricaded it. I went out for the buses. When I came back the doors were open. I don't know who opened them.",
      "I know it was a kid who opened those doors. I know which one. He was scared and he wanted his mom. I've never said that out loud." ],
    flavor: ["Measure twice, cut once. Measure three times if it's me.", "That wall's out of square. It bugs me.", "Every board's got a good face. You just have to find it.", "Safety glasses. I'm serious."],
    ideas: [{ kind: 'build', what: 'workbench', text: "Get me a real workbench and some tools and I'll build us anything we need: shelves, shutters, a better door." }] },
  { id: 'pastor', job: 'Pastor of First Church', role: 'counselor', skills: sk('1100000020'), kin: ['wife', 'daughter'], item: 'a Bible with a cracked spine', place: { name: 'First Church', at: [145, -114] },
    known: 'was the pastor at First Church in town',
    story: [
      "I preached at First Church for fourteen years. Weddings, funerals, potlucks. I knew every family in that town, which ones were hurting and which ones were hiding it.",
      "{kinRel} {kin} played organ on Sundays, badly, and nobody had the heart to tell her. {item} was my father's. He was a preacher too, in Kentucky.",
      "People came to the church when it started, because that's where you go. We held the doors for two days. On the third night someone inside turned. In the sanctuary. During prayer.",
      "I'm not sure I believe anymore. I say the words because people need them. Some mornings I need them too. Some mornings they're just words." ],
    flavor: ["Grace isn't earned. That's the whole point of it.", "Everyone here is carrying something. Go easy.", "There's a time to mourn. There's also a time to eat.", "I used to give sermons. Now I mostly listen."],
    ideas: [{ kind: 'cache', at: [143, -110], label: 'First Church food pantry', table: 'food_cache', text: "The church food pantry was full for the Thanksgiving drive. If the building held, the basement pantry might still be stocked." }] },
  { id: 'deputy', job: 'Sheriff’s deputy', role: 'guard', skills: sk('0102300110'), kin: ['son', 'partner'], item: 'a dented deputy’s star', place: { sign: 'POST OFFICE' },
    known: 'was a deputy with the county sheriff',
    story: [
      "Eight years with the county sheriff. Speeding tickets, domestic calls, meth houses out on the county roads. Small town policing is mostly knowing everybody's business.",
      "{kinRel} {kin} wanted me off patrol. Said I'd get shot over a traffic stop. {item} has a dent from the one time I almost did.",
      "Dispatch kept sending us to 'assaults.' My partner went into a house on Broadway and came out wrong. I emptied my sidearm. I'm still not sure all those rounds were necessary.",
      "Some of those raiders out there, I've arrested. I know their names, their families, what they did before. They knew me too. That's going to matter when we meet." ],
    flavor: ["Keep your hands where I can see them. Habit, sorry.", "Every one of those houses, I've been called to.", "Most trouble starts with somebody bored at two in the morning.", "Radio silence is the worst sound in the world."],
    ideas: [{ kind: 'raidmod', mod: 'night', text: "I watched their camp. They post two guards at night and both of them drink. After two in the morning it's one guard, and he sleeps. That's our window." }] },
  { id: 'guard_vet', job: 'Army veteran, National Guard sergeant', role: 'guard', skills: sk('0103300220'), kin: ['brother', 'mother'], item: 'dog tags that aren’t his', place: null,
    known: 'did two tours overseas and came home to the Guard',
    story: [
      "Two tours overseas, then the Guard. Weekend drills, flood duty on the river. I liked the Guard. Nobody shot at you during sandbag duty.",
      "{kinRel} {kin} never understood why I went back after the first tour. {item} belonged to a kid in my squad named Ruiz. I've carried them since.",
      "They called the Guard up on day two. We set up a checkpoint on the bridge. Orders changed every hour. By the second night we were shooting civilians who didn't stop. Some of them weren't infected.",
      "I left my post. I walked off the bridge with my rifle and didn't look back. Somewhere there's a report that says I'm a deserter. They're right." ],
    flavor: ["Hydrate. Check your feet. Check your weapon. In that order.", "Two is one and one is none.", "I've slept in worse. Not much worse.", "Nobody moves until we know what's out there."],
    ideas: [{ kind: 'raidmod', mod: 'night', text: "Recon first. I watched their camp for an hour. Sentries rotate at midnight and they get sloppy around three. We go in quiet then, we come out rich." }, { kind: 'build', what: 'lookout', text: "We need a lookout post. Eyes up high on the approach. Most attacks are lost in the first thirty seconds." }] },
  { id: 'deckhand', job: 'Barge deckhand on the Mississippi', role: 'hunter', skills: sk('1001110100'), kin: ['grandmother', 'cousin'], item: 'a coil of good rope', place: { name: 'the river', at: [205, 0] },
    known: 'worked the barges up and down the river',
    story: [
      "Deckhand on the towboats. Twenty-eight days on, fourteen off, pushing fifteen barges of grain to New Orleans. River's a whole other world.",
      "{kinRel} {kin} raised me in a trailer by the levee. Taught me to fish before I could read. {item}: never go anywhere without good rope.",
      "We were tied off below Harlan's Landing when the radio went crazy. The pilot turned. I went over the side and swam for the floodwall. Watched the boat drift into the bridge pilings with him still in the wheelhouse.",
      "There's a houseboat on the far bank with my stash on it. Cash, mostly, which is worth nothing now. And something I owe a man I'll never see again." ],
    flavor: ["River's up. Catfish will be biting.", "On the boats we'd say: one hand for you, one for the boat.", "I can tie you nine knots and every one's useful.", "Water doesn't care about any of this."],
    ideas: [{ kind: 'cache', at: [196, -60], label: 'Riverwalk fish traps', table: 'food_cache', text: "Let me set trotlines off the riverwalk. Or better, there's a bait shop shed by the floodwall gate with traps and gear in it." }] },
  { id: 'hunting_guide', job: 'Hunting and fishing guide', role: 'hunter', skills: sk('1002301003'), kin: ['father', 'daughter'], item: 'a turkey call carved from cedar', place: { name: 'the woods off Price Lane', at: [-30, -60] },
    known: 'guided deer and turkey hunts in these hills',
    story: [
      "I took city folks out in these hills for deer and turkey. Showed them how to sit still, which most of them couldn't do.",
      "{kinRel} {kin} carved {item}. Best caller in the county. Said patience was just another word for paying attention.",
      "I was in a tree stand at dawn when it started. Watched a whole family walk through the woods below me, slow, wrong. I sat up there all day. Patience.",
      "I've taken a few of the living since. Men who would've killed us. I tracked them like deer. It wasn't hard. That's what scares me." ],
    flavor: ["Wind's out of the west. They'll smell us coming from the east.", "Deer don't look up. Neither do the dead.", "Sit still long enough and the world walks past you.", "Blood trail goes cold after rain."],
    ideas: [{ kind: 'cache', at: [-34, -68], label: 'Deer stand cache', table: 'gun_cache', text: "I keep a cache in a box under my deer stand in the woods off Price Lane. A rifle, shells, jerky. Nobody knows it's there but me." }, { kind: 'raidmod', mod: 'night', text: "I've been watching their camp from the treeline. I know where their guards stand and when they piss. We go in from downwind after midnight." }] },
  { id: 'vet', job: 'Large-animal veterinarian', role: 'medic', skills: sk('0201010200'), kin: ['wife', 'son'], item: 'a battered leather vet bag', place: { name: 'Hollis Farm', at: [-190, -105] },
    known: 'was the county vet for cattle and horses',
    story: [
      "I was the vet for every cow, horse and stubborn goat in the county. Calving at three in the morning, arm up to the shoulder. Glamorous.",
      "{kinRel} {kin} used to ride along on calls when he was small. {item} has been to every farm on this map.",
      "Animals knew first. Cattle broke fences all over the county two days before anyone got sick. Nobody listened to me.",
      "I've put down more animals than I can count. It doesn't get easier. It's not supposed to. I've had to do it to people now. Same rule." ],
    flavor: ["People are just animals who complain more.", "Hold still. I've stitched horses that behaved better.", "Dogs went quiet before it happened. Remember that.", "Never stand directly behind anything that kicks."],
    ideas: [{ kind: 'cache', at: 'FEED & SEED', label: 'Feed store vet supplies', table: 'med_cache', text: "The Feed & Seed kept livestock antibiotics and suture kits behind the counter. Same drugs, cheaper bottles." }] },
  { id: 'feed_clerk', job: 'Clerk at the Feed & Seed', role: 'quartermaster', skills: sk('0000020110'), kin: ['grandson', 'sister'], item: 'a receipt book', place: { sign: 'FEED & SEED' },
    known: 'kept the books and stock at the Feed & Seed',
    story: [
      "I ran the counter at the Feed & Seed for thirty years. Knew every farmer's order by heart and which ones paid late.",
      "{kinRel} {kin} was going to take over the store someday. {item} has every sale I ever made in it. Old habits.",
      "The day it happened, farmers came in buying everything: fencing, chain, ammunition. I sold it to them. Then one of them bit the other at the register.",
      "I kept two sets of books for the owner. For years. Tax man never knew. It seemed like such a big sin then. Now it's almost funny." ],
    flavor: ["Inventory first. Panic second.", "You'd be amazed what people forget they own.", "Fifty-pound sacks build character.", "Put it back where you found it, please."],
    ideas: [{ kind: 'cache', at: 'FEED & SEED', label: 'Feed & Seed warehouse', table: 'build_cache', text: "The warehouse behind the Feed & Seed had fence posts, wire, tools and stacks of lumber. Building supplies we could use." }, { kind: 'build', what: 'shelf', text: "We need real storage. Shelves, labels. Half our food goes bad because nobody can find it." }] },
  { id: 'student', job: 'Engineering student home for break', role: 'scavenger', skills: sk('0011120100'), kin: ['mom', 'little sister'], item: 'a cracked phone that still powers on', place: null,
    known: 'was home from college when it all came down',
    story: [
      "I was two years into engineering school. Came home for break to do laundry and eat real food. Great timing.",
      "{kinRel} {kin} picked me up from the bus station. {item} still has all my photos. I charge it off a solar keychain and scroll.",
      "We were at Walmart in Cape when it started. Everyone ran for their cars. {kin} drove us up the back roads and we ran out of gas outside Harlan's Landing.",
      "I'm not as scared as I should be. Sometimes it feels like a game, and I know that's messed up. I think something in me broke and it's protecting me." ],
    flavor: ["Technically, that's a pulley problem.", "I miss the internet like a limb.", "If we had a soldering iron I could fix that radio.", "Professors never covered this."],
    ideas: [{ kind: 'cache', at: 'HARDWARE', label: 'Hardware store back stock', table: 'build_cache', text: "The hardware store back room probably still has batteries, wire and solar lights. I could rig up some light for camp." }] },
  { id: 'reporter', job: 'Reporter for the Harlan Gazette', role: 'scavenger', skills: sk('0000020011'), kin: ['husband', 'father'], item: 'a notebook full of shorthand', place: { sign: 'GAZETTE' },
    known: 'wrote for the Gazette',
    story: [
      "I covered city council, high school football and the occasional scandal for the Gazette. Mostly city council.",
      "{kinRel} {kin} read every story I wrote, even the zoning ones. {item} is my notes from the last two weeks before. I'm still writing in it.",
      "I had a source at county health who called me three days before anyone else knew. I wrote it up. My editor killed the story. Said we'd cause a panic.",
      "I've been keeping notes on everyone in camp. Not to hurt anybody. Somebody should remember who we were. Don't tell them." ],
    flavor: ["That's not a fact, that's a rumor with confidence.", "Off the record? Everything's off the record now.", "Who, what, when, where, why. Mostly why.", "Somebody should be writing this down."],
    ideas: [{ kind: 'raidmod', mod: 'scout', text: "Let me scout the raiders. I'll count heads, map their stash, figure out who's in charge. Information first." }, { kind: 'cache', at: 'GAZETTE', label: 'Gazette office records', table: 'mixed_cache', text: "The Gazette got a FEMA supply notice before the phones died. The address is in my desk at the office." }] },
  { id: 'bartender', job: 'Bartender at the Tavern', role: 'counselor', skills: sk('1001110001'), kin: ['ex-husband', 'son'], item: 'a bottle opener on a keychain', place: { sign: 'TAVERN' },
    known: 'poured drinks at the Tavern on Main',
    story: [
      "I poured drinks at the Tavern for nine years. Bartenders are therapists who can also throw you out.",
      "{kinRel} {kin} ran off with a pipeline welder. Left me {item} and a stack of bills. Best thing he ever did.",
      "We had a Friday crowd when it started. Guy at the end of the bar collapsed. I thought he'd had too much. When he got up, I learned how hard I can swing a bat.",
      "I know which bottles at the Tavern aren't watered down. I also know who in this camp drinks when nobody's looking. I'll keep that one to myself." ],
    flavor: ["Last call was a long time ago.", "Everybody's got a story. Most of them are boring.", "I can tell what you're drinking by how you walk in.", "Tip your bartender. Figuratively."],
    ideas: [{ kind: 'cache', at: 'TAVERN', label: 'The good bottles at the Tavern', table: 'liquor_cache', give: 'liquor', text: "The Tavern has a locked cabinet with the good stuff. Whiskey is worth more than ammo right now. And raiders will trade anything for it." }, { kind: 'raidmod', mod: 'drugged', needs: 'sedatives', text: "Raiders love a drink. Get me something to mix in and I'll make them a bottle they won't forget, or remember." }] },
  { id: 'lineman', job: 'Electric co-op lineman', role: 'mechanic', skills: sk('0021100200'), kin: ['wife', 'daughter'], item: 'a pair of lineman’s pliers', place: { name: 'Bluff Road', at: [30, -226] },
    known: 'climbed power poles for the electric co-op',
    story: [
      "Twenty years climbing poles for the co-op. Ice storms, tornadoes, squirrels. Mostly squirrels.",
      "{kinRel} {kin} used to say I loved the storms. She was right. {item} hung on my belt every day.",
      "We were restoring power after a storm out on Bluff Road. My partner was up in the bucket. Something grabbed him from the ditch while he climbed down.",
      "The substation on Bluff Road has a backup generator and a fuel tank nobody's touched. I've known that the whole time. I didn't say anything because I didn't know if I could trust you." ],
    flavor: ["Never trust a wire you didn't de-energize yourself.", "Storm's coming. Can feel it in my knees.", "I've been higher up than anyone here, guaranteed.", "Squirrels caused more outages than storms. True story."],
    ideas: [{ kind: 'cache', at: [36, -230], label: 'Substation on Bluff Road', table: 'fuel_cache', text: "There's a co-op substation off Bluff Road with a diesel generator tank and spare cable. Fuel and metal, if we can get in." }, { kind: 'raidmod', mod: 'distraction', text: "Raiders run a generator at night. I can make it fail loud and bright. Every dead thing nearby will head straight for the noise." }] },
  { id: 'elevator_op', job: 'Grain elevator operator', role: 'builder', skills: sk('0011010210'), kin: ['son', 'brother'], item: 'a moisture meter', place: { name: 'Hollis grain bins', at: [-218, -122] },
    known: 'ran the grain elevator during harvest',
    story: [
      "I ran the elevator during harvest. Trucks lined up for a mile, everybody in a hurry, everybody sure their corn was drier than it was.",
      "{kinRel} {kin} worked the dump pit with me summers. {item} was how I settled arguments. Numbers don't lie.",
      "We had a man fall into a bin that September before all this. Grain takes you like quicksand. I think about him more than the people I lost to the dead. Isn't that strange.",
      "The Hollis bins still have corn in them. Thousands of bushels. Dry, if the roofs held. That's not hope, that's arithmetic." ],
    flavor: ["Fifteen percent moisture or it'll rot. Same with people.", "Harvest is the only time this county ever hurried.", "Never walk on grain. Never.", "Everything weighs something."],
    ideas: [{ kind: 'cache', at: [-214, -126], label: 'Corn in the Hollis bins', table: 'food_cache', text: "The grain bins on the Hollis place. Dry corn keeps for years. We grind it, we eat. I know how to get in from the top hatch without falling in." }] },
  { id: 'teacher', job: 'Retired schoolteacher', role: 'counselor', skills: sk('1100000020'), kin: ['late husband', 'former student'], item: 'reading glasses on a beaded chain', place: { sign: 'POST OFFICE' },
    known: 'taught third grade in Harlan’s Landing for thirty-five years',
    story: [
      "I taught third grade for thirty-five years. Half the adults in this county learned long division from me, and most of them have forgotten it.",
      "{kinRel} {kin} used to say I could quiet a room by raising an eyebrow. {item}: I can't read a label without them now.",
      "I was at the post office when it happened. A man I taught to read grabbed the clerk across the counter. I said his name in my classroom voice and he stopped. For a second. Then he didn't.",
      "I've buried a lot of former students these last weeks. I keep a list in my head. I say the names before I sleep. Somebody has to." ],
    flavor: ["Inside voices, please. The dead have good ears.", "I've handled worse than this. I've handled field trips.", "Everyone learns. Some people just take longer.", "Please and thank you cost nothing."],
    ideas: [{ kind: 'build', what: 'table', text: "We should eat together. A real table, everyone at it, at least once a day. It matters more than you'd think." }] },
  { id: 'emt', job: 'EMT on the county ambulance', role: 'medic', skills: sk('0200210000'), kin: ['girlfriend', 'dad'], item: 'trauma shears', place: { name: 'County Road 210', at: [-150, -20] },
    known: 'drove the county ambulance',
    story: [
      "I drove the county ambulance. Half our calls were car wrecks on 34 and the other half were old folks who fell.",
      "{kinRel} {kin} hated my hours. {item}: I can cut you out of a pair of jeans in four seconds.",
      "We took a bite call on County Road 210. Patient woke up in the back of the rig while I was starting a line. My partner held the door shut while I got out the side. He didn't make it out.",
      "Our rig is still out on 210 with the doors closed. I know what's in the back. I've wanted to go back for the supplies. I haven't wanted to open that door." ],
    flavor: ["ABCs. Airway, breathing, circulation. Then panic.", "You're fine. Mostly fine. Sit down.", "I've seen worse on a Saturday night on 34.", "Pressure on the wound. Harder than that."],
    ideas: [{ kind: 'cache', at: [-148, -30], label: 'Ambulance on County Road 210', table: 'med_cache', text: "My ambulance is on County Road 210. Full trauma kit, oxygen, meds. Somebody needs to open the back. Somebody who isn't me." }] },
  { id: 'framer', job: 'Construction framer', role: 'builder', skills: sk('0001100310'), kin: ['brother', 'daughter'], item: 'a framing hammer with his name burned in', place: { sign: 'HARDWARE' },
    known: 'framed half the new houses in the county',
    story: [
      "I framed houses. Walls up, roof on, next job. You can put up a house in a week with a good crew and enough coffee.",
      "{kinRel} {kin} was on my crew. {item}: I burned my name in it so the guys would quit borrowing it.",
      "We were framing a house on Broadway when the neighbors started screaming. My crew got on the roof and pulled the ladder up. We were up there for two days.",
      "I left my brother on that roof. I went down for water and couldn't get back up. By morning he'd come down too. Not the way I did." ],
    flavor: ["Sixteen on center. Always.", "Give me a nail gun and a generator and I'll give you a house.", "Plumb, level and square. Pick two if you're in a hurry.", "Roofs leak. That's what roofs do."],
    ideas: [{ kind: 'build', what: 'chopping', text: "Get me a chopping block and an axe and I'll keep us in wood all winter." }, { kind: 'cache', at: 'HARDWARE', label: 'Hardware store lumber yard', table: 'build_cache', text: "The hardware store's yard had a pallet of treated lumber and boxes of nails. Builds a lot of wall." }] },
  { id: 'waitress', job: 'Waitress at the River Bar, single mom', role: 'cook', skills: sk('2000110001'), kin: ['son', 'daughter'], item: 'a child’s drawing folded small', place: { sign: 'RIVER BAR' },
    known: 'waited tables at the River Bar to raise her kid',
    story: [
      "I waited tables at the River Bar. Lunch and dinner, six days a week, so my kid could have braces.",
      "{kinRel} {kin} drew me {item}. It's a horse. Or a dog. We argued about it. I keep it in my bra so I don't lose it.",
      "{kin} was at day care across town. I ran there. Took me forty minutes. The building was empty. A note on the door said 'Gone to the church.'",
      "I went to the church. I didn't go in. I heard what was in there. I tell myself they left before. I tell myself that every night." ],
    flavor: ["Hon, you look like you need to sit down.", "I've carried six plates at once. I can carry this.", "Mean customers tip worst. Same with people now.", "Coffee's on. It's terrible. Drink it."],
    ideas: [{ kind: 'cache', at: 'RIVER BAR', label: 'River Bar kitchen', table: 'food_cache', text: "The River Bar kitchen had a pantry and a freezer full of frozen burger patties. Those are gone, but the canned stuff and the coffee might not be." }] },
  { id: 'ex_con', job: 'Paroled ex-con working at the scrapyard', role: 'scavenger', skills: sk('0002120013'), kin: ['mother', 'cellmate'], item: 'a set of lock picks in a sock', place: { name: 'Gas & Go', at: [44, 8] },
    known: 'did six years in Bonne Terre before this',
    story: [
      "Six years in Bonne Terre for something I'll tell you about some other time. Got out last spring. Got a job at the scrapyard behind the Gas & Go.",
      "{kinRel} {kin} wrote me every week inside. Only one who did. {item}: old skills. Prison's a good school for the wrong subjects.",
      "My parole officer was coming to see me the day it started. He showed up at the scrapyard and tried to eat me. I've never been so happy to miss an appointment.",
      "The guy running the raiders out there? We were inside together. He owes me. Or I owe him. Depends who you ask. Either way, he'll talk to me." ],
    flavor: ["Every lock's just a question.", "Inside, you learn who to trust fast. Same here.", "Don't ask where I got it.", "Six years taught me how to wait."],
    ideas: [{ kind: 'raidmod', mod: 'inside', text: "I know their boss from Bonne Terre. Let me walk in there and talk trade. While I keep them talking, you get to that stash. They'll never see it coming." }] },
  { id: 'beekeeper', job: 'Beekeeper and orchard keeper', role: 'farmer', skills: sk('1100002100'), kin: ['wife', 'grandson'], item: 'a smoker tin', place: { name: 'Price Farm', at: [-72, -131] },
    known: 'kept bees and an orchard out by the Price place',
    story: [
      "Forty hives and an acre of apple trees. Sold honey at the farmers market on Saturdays.",
      "{kinRel} {kin} hated bees and loved honey. {item}: smoke calms them down. Wish it worked on people.",
      "The bees knew. Hives went quiet a week before. Then whole colonies flew off. I should have packed up the truck then.",
      "I still visit the hives when I'm out. Talk to them. Tell them who's died. It's an old custom. Telling the bees. Otherwise they leave." ],
    flavor: ["Slow movements. Bees and dead things both like slow movements.", "Honey never spoils. Three thousand years in a tomb, still good.", "Apple blossoms in May. We'll see if anyone's here for them.", "Busy as a bee is not a compliment, it's a warning."],
    ideas: [{ kind: 'cache', at: [-84, -118], label: 'Honey house at the Price place', table: 'food_cache', text: "My honey house behind the Price place. Buckets of honey, jars, wax. Honey doesn't spoil. It's medicine too." }, { kind: 'build', what: 'garden', text: "Plant me a garden and I'll make it bloom. Squash, beans, flowers for whatever bees are left." }] },
  { id: 'mail_carrier', job: 'Rural mail carrier', role: 'scavenger', skills: sk('0000030011'), kin: ['husband', 'niece'], item: 'a mail route map, annotated', place: { name: 'County Road 210', at: [-150, 100] },
    known: 'drove every mail route in the county',
    story: [
      "Rural route carrier. Every road in this county, every mailbox, every dog that chased the truck.",
      "{kinRel} {kin} used to ride along on Saturdays. {item}: every house, who lived there, what they got in the mail.",
      "I was halfway through my route when the radio said stay inside. I kept delivering. People were still waving at me from their porches. Some of them were still people.",
      "I know which houses ordered ammunition, which ordered prescriptions, which ordered gun safes. I've been using that. I know it's invading their privacy. They're dead." ],
    flavor: ["Neither rain nor sleet nor the walking dead.", "That house got a package every Tuesday. Never knew what.", "I know a back way.", "Every dog on 210 hated me."],
    ideas: [{ kind: 'cache', at: [-240, 104], label: 'Gun safe the mail route remembers', table: 'gun_cache', text: "The Dekker house got a gun safe delivered two summers ago. Heavy one. My knees still remember it." }, { kind: 'raidmod', mod: 'scout', text: "I know every back road around their camp. Let me map it. We'll come in the way they don't watch." }] },
  { id: 'warden', job: 'State conservation officer', role: 'hunter', skills: sk('0002301002'), kin: ['wife', 'twin sister'], item: 'binoculars with a cracked lens', place: { name: 'the river bluffs', at: [150, -190] },
    known: 'was the game warden for the county',
    story: [
      "I was the game warden. Poachers, drunk boaters, people fishing without a license. Mostly people fishing without a license.",
      "{kinRel} {kin} said I liked animals more than people. {item}: I've watched this whole county through them.",
      "I was on the river bluffs checking hunting permits. Watched a deer camp get overrun from a quarter mile away. Couldn't get there in time.",
      "I've seen the raiders' camp. I've written down every one of them like a poacher's description. Old habits. Someday somebody should answer for what they've done." ],
    flavor: ["You're not supposed to feed the wildlife. Including him.", "Tracks are fresh. Within the hour.", "Quiet. Listen. The birds stopped.", "I used to give tickets for this."],
    ideas: [{ kind: 'raidmod', mod: 'scout', text: "I'll glass their camp from the bluffs. Every guard, every route, where the stash sits. We don't go in blind." }] },
  { id: 'bank_teller', job: 'Bank teller at the First National', role: 'quartermaster', skills: sk('0000010021'), kin: ['mother', 'boyfriend'], item: 'a gold pen from the bank', place: { sign: 'BANK' },
    known: 'counted money at the bank on Main',
    story: [
      "I counted other people's money for six years. Very boring until the day it wasn't.",
      "{kinRel} {kin} wanted me to go to college. I was saving up. {item}: they gave it to me for five years of service.",
      "The bank locked down when it started. I was inside with the manager and two customers. The vault has a time lock. We sat on the floor of the lobby for a day.",
      "There's a revolver in the bank manager's desk. And the vault... money's worthless now. But the vault's the safest room in town. I keep thinking about that." ],
    flavor: ["That's twelve cans, not thirteen. I counted.", "Money's just a promise. So's everything.", "I can balance a ledger in my sleep.", "Somebody should keep track."],
    ideas: [{ kind: 'cache', at: 'BANK', label: 'Bank manager’s desk', table: 'gun_cache', text: "The bank manager kept a revolver and a box of shells in his desk. And the cash drawers have gold coins someone deposited for safekeeping. Raiders still take gold." }, { kind: 'build', what: 'shelf', text: "Let me set up proper stores. A shelf, a ledger. We'd waste a lot less." }] },
  { id: 'musician', job: 'Bar-band guitarist and piano teacher', role: 'counselor', skills: sk('1000000011'), kin: ['bandmate', 'father'], item: 'a guitar pick on a string', place: { sign: 'RIVER BAR' },
    known: 'played guitar at the River Bar on weekends',
    story: [
      "I taught piano to kids during the week and played the River Bar on weekends. Classic rock covers mostly. People request 'Free Bird' even in the apocalypse.",
      "{kinRel} {kin} played bass in the band. {item} is all I've got left of my guitar. Smashed it on one of them.",
      "We were mid-set when it started. Somebody screamed and the crowd thought it was part of the show. We played on another minute. I'll never forget that minute.",
      "I hum all the time now. It keeps the quiet away. When it's too quiet I start hearing that bar again." ],
    flavor: ["♪ ... ♪", "This would be better with a guitar.", "Everybody's got a song. Mine's mostly out of tune now.", "Music doesn't need electricity. People forgot that."],
    ideas: [{ kind: 'build', what: 'campfire', text: "We need somewhere to sit together at night. A real fire, some logs. People sing around fires. Even people who say they don't." }] },
];

export const BACKGROUND_BY_ID = Object.fromEntries(BACKGROUNDS.map((b) => [b.id, b]));

// Personality pairs that pull together or grind (added to trait-based compatibility)
export const PAIR_BIAS = {
  'rock|hothead': 0.25, 'rock|worrier': 0.3, 'rock|wildcard': 0.1, 'oldsoul|wildcard': 0.25, 'oldsoul|worrier': 0.2,
  'believer|cynic': -0.35, 'believer|schemer': -0.25, 'planner|hothead': -0.35, 'planner|wildcard': -0.4, 'planner|joker': -0.2,
  'loner|joker': -0.3, 'loner|wildcard': -0.1, 'schemer|worrier': -0.15, 'idealist|cynic': -0.3, 'idealist|schemer': -0.3,
  'hothead|cynic': -0.25, 'hothead|wildcard': 0.15, 'joker|wildcard': 0.3, 'joker|worrier': 0.15, 'believer|worrier': 0.25,
  'idealist|planner': 0.15, 'loner|rock': 0.2, 'cynic|joker': 0.1, 'oldsoul|cynic': 0.15, 'schemer|joker': 0.15,
};
export function pairBias(a, b) { return PAIR_BIAS[a + '|' + b] ?? PAIR_BIAS[b + '|' + a] ?? 0; }

// How well two temperaments get along (-1..1)
export function compatibility(pa, pb) {
  const A = PERSONALITIES[pa].t, B = PERSONALITIES[pb].t;
  let c = 0.15;
  c -= (A.temper + B.temper) * 0.18;
  c += (A.warmth + B.warmth) * 0.12;
  c += (A.humor + B.humor) * 0.06;
  c -= Math.abs(A.discipline - B.discipline) * 0.25;
  c -= Math.abs(A.faith - B.faith) * 0.15;
  c -= Math.abs(A.social - B.social) * 0.12;
  c -= (A.greed + B.greed) * 0.08;
  c += pairBias(pa, pb);
  return Math.max(-1, Math.min(1, c));
}

const FIRST = {
  man: ['Earl', 'Dale', 'Wes', 'Ray', 'Hank', 'Luke', 'Dwight', 'Owen', 'Marcus', 'Curtis', 'Lyle', 'Darnell', 'Tom', 'Mike', 'Jesse', 'Roy', 'Glen', 'Andre', 'Cody', 'Walt', 'Beau', 'Ricky', 'Tyrell', 'Sam', 'Mateo', 'Frank', 'Vern', 'Gus', 'Danny', 'Jim'],
  woman: ['June', 'Rae', 'Lori', 'Dana', 'Kate', 'Nell', 'Tess', 'Mae', 'Rosa', 'Joy', 'Darla', 'Shawna', 'Pam', 'Becky', 'Ida', 'Lynn', 'Tasha', 'Carmen', 'Wanda', 'Kim', 'Ruth', 'Gloria', 'Cheryl', 'Amber', 'Faye', 'Maria', 'Deb', 'Jolene', 'Vera', 'Holly'],
};
const LAST = ['Hollis', 'Wagner', 'Boone', 'Kessler', 'Ruiz', 'Talley', 'Burke', 'Lindqvist', 'Moreau', 'Haskins', 'Pruitt', 'Ostrander', 'McBride', 'Vogel', 'Duvall', 'Jenkins', 'Schaefer', 'Washington', 'Crane', 'Ybarra', 'Mullins', 'Kowalski', 'Fenton', 'Haley', 'Strickland', 'Bishop', 'Toombs', 'Reyes', 'Holt', 'Garrity'];
const KIN_NAMES = {
  m: ['Danny', 'Mike', 'Josh', 'Tommy', 'Carl', 'Rob', 'Kevin', 'Eli', 'Joe', 'Nate', 'Calvin', 'Pete'],
  f: ['Sarah', 'Emma', 'Lily', 'Jenna', 'Grace', 'Beth', 'Ava', 'Molly', 'Rita', 'Anne', 'Josie', 'Carol'],
};
const KIN_SEX = { daughter: 'f', son: 'm', brother: 'm', father: 'm', wife: 'f', husband: 'm', mother: 'f', sister: 'f', uncle: 'm', 'ex-wife': 'f', 'twin brother': 'm', nephew: 'm', partner: 'f', grandmother: 'f', cousin: 'm', grandson: 'm', mom: 'f', 'little sister': 'f', 'ex-husband': 'm', 'late husband': 'm', 'former student': 'm', girlfriend: 'f', dad: 'm', boyfriend: 'm', bandmate: 'm', cellmate: 'm', niece: 'f', 'twin sister': 'f' };

const SKINS = ['#e2b9a0', '#d8a888', '#c99a7a', '#a8775a', '#7a5238', '#5a3a28', '#b88a6a'];
const HAIRS = ['#2a1e16', '#4a3020', '#8a6a3a', '#b0a090', '#1a1a1a', '#7a3a22', '#9a9088', '#d8d0c0'];
const SHIRTS = ['#3b5f7a', '#7a3a32', '#5a6a3a', '#c8b88a', '#3a3a3a', '#6a5a8a', '#8a6a3a', '#e0ddd0', '#2f4a5a', '#8a2a2a', '#4a6a5a', '#b06a3a'];
const PANTS = ['#3a4458', '#4a4a52', '#5a4a3a', '#2e3238', '#6a6a5a', '#3a3a2e'];

// a family name nobody in the group already has (no accidental relatives)
function pickLast(rng, taken, list = LAST) {
  const free = taken ? list.filter((l) => !taken.has(l)) : list;
  const pool = free.length ? free : list;
  return pool[Math.floor(rng() * pool.length)];
}
// The leader: you. Their "background" is whatever you made them; their
// skills follow the traits you picked on the survivor screen.
export function registerLeader(profile) {
  const t = new Set(profile.traits || []);
  const lv = (k, base = 1) => Math.min(3, base + (t.has(k) ? 1 : 0));
  BACKGROUND_BY_ID.leader = {
    id: 'leader', job: 'The one holding this group together', role: 'guard',
    skills: { cooking: 0, medicine: lv('medic', 0), mechanics: lv('handy', 0), combat: lv('slugger'), shooting: lv('marksman'), scavenging: lv('scavenger'), farming: 0, building: lv('handy'), leadership: 2, stealth: lv('quiet', 0) },
    kin: ['family'], item: 'the claim flag', place: null, known: 'kept everyone alive on the road', story: [],
    flavor: ['We keep moving. That\u2019s the whole trick.', 'Check your gear before dark.', 'Everybody eats tonight. That\u2019s the job.', 'One more day. Then another one.'],
    ideas: [],
  };
}
// A new person: rng() -> 0..1. used: set of background ids already in the
// group this person will join (their background must be new to it).
export function makePerson(rng, used = new Set(), opts = {}) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const model = opts.model || (rng() < 0.5 ? 'man' : 'woman');
  const free = BACKGROUNDS.filter((b) => !used.has(b.id) && (!opts.roles || opts.roles.includes(b.role)));
  const bg = opts.background ? BACKGROUND_BY_ID[opts.background] : (free.length ? pick(free) : pick(BACKGROUNDS));
  const pkeys = opts.personalities || Object.keys(PERSONALITIES);
  const personality = opts.personality || pick(pkeys);
  const kinRel = pick(bg.kin);
  const kinSex = KIN_SEX[kinRel] || (rng() < 0.5 ? 'm' : 'f');
  const age = model === 'man' || model === 'woman' ? (personality === 'oldsoul' ? 58 + Math.floor(rng() * 16) : 22 + Math.floor(rng() * 34)) : 30;
  const hair = age > 60 ? pick(['#9a9088', '#d8d0c0', '#b0a090']) : pick(HAIRS);
  return {
    id: 'N' + Math.floor(rng() * 1e9).toString(36),
    name: `${pickLast(rng, opts.firstNames, FIRST[model])} ${pickLast(rng, opts.lastNames)}`, model, age,
    palette: [pick(SKINS), pick(SHIRTS), pick(PANTS), '#2a2420', hair, '#2a2018'],
    personality, background: bg.id, role: bg.role,
    kin: pick(KIN_NAMES[kinSex]), kinRel, story: 0, seed: Math.floor(rng() * 1e6),
  };
}
