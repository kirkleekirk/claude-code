import type { Rng } from '@/core/rng';
import type { StationId } from '../api';

/**
 * Everything the radio says out loud (as captions): fictional artists, track titles, station
 * idents, parody ads and news flashes. All names are invented for Halcyon Bay.
 */

const ARTISTS: Record<StationId, readonly string[]> = {
  sunset: [
    'Neon Manatee', 'Coral Static', 'The Velvet Causeways', 'Laserdisc Lagoon', 'Pastel Cartel', 'Mira Afterglow',
    'Chrome Pelican Club', 'Jet Ski Romance', 'Ultraviolet Avenue', 'Saltwater Sedan', 'Dana Dreamcoast', 'Motel Pool Lights',
    'Flamingo Faxline', 'Vice Grip Valentine', 'Heatwave Hotline', 'Palmscreen',
  ],
  calle: [
    'La Brisa Eléctrica', 'DJ Mangó', 'Yuli Fuego', 'Los Flamencos del Mar', 'Nena Cafecito', 'Marisol y Los Rayos',
    'El Pelícano', 'Coco Volcán', 'Rey Guayaba', 'Dúo Malecón', 'Lunita Tropical', 'Chico Salsero', 'Las Hermanas Oro',
    'MC Tostón', 'Sabrosura Bayside', 'Tía Tormenta',
  ],
  haze: [
    'sleepy heron', 'lo-tide', 'muggy', 'porch light', 'slow manatee', 'ceiling fan', 'soft serve', 'low tide club',
    'pelican pete', 'sundown radio', 'mangrove nap', 'the ice machine', 'salt & screen door', 'warm static', 'flip-flop',
    'mosquito net',
  ],
  bass: [
    'Big Gator Boomin', 'Sub Tropics', 'MC Mangrove', 'Trunk Rattler', 'DJ Swamp Thang', 'Bass Pelican', 'Lil Hurricane',
    'Tailgate Twins', '808 Manatee', 'Bayou Boom Crew', 'Low End Lola', 'Kid Causeway', 'Rattle Cartel', 'Shell Shock Sound',
    'Queen Undertow', 'Airboat Andre',
  ],
};

const TITLE_A: Record<StationId, readonly string[]> = {
  sunset: ['Causeway', 'Pastel', 'Chrome', 'Tangerine', 'Velvet', 'Coral', 'Ultraviolet', 'Flamingo', 'Lagoon', 'Magenta', 'Afterglow', 'Motel', 'Palm', 'Bayfront', 'Overdrive', 'Saltwater'],
  calle: ['Calor', 'Corazón', 'Luna', 'Brisa', 'Fuego', 'Sabor', 'Noche', 'Tormenta', 'Playa', 'Ojos', 'Mojito', 'Bahía', 'Teléfono', 'Verano', 'Malecón', 'Guayaba'],
  haze: ['humidity', 'ceiling fan', 'pier', 'salt', 'mango', 'porch', 'warm', 'cloud', 'gulf', 'sprinkler', 'screen door', 'last ferry', 'iced', 'sundown', 'lazy', 'tide'],
  bass: ['Bayou', 'Tailgate', 'Swamp', 'Trunk', 'Gulf Stream', 'Hurricane', 'Mangrove', 'Boom Box', 'Sub-Tropical', 'Airboat', 'Heat Index', 'Low Tide', 'Gator', 'Causeway', 'Riptide', 'Thunder'],
};

const TITLE_B: Record<StationId, readonly string[]> = {
  sunset: ['Lights', 'Overdrive', 'Heat', 'Shadows', 'Skyline', 'Romance', 'Getaway', 'Horizon', 'Cruise', 'Mirage', 'Static', 'Fever', 'Highway', 'Nights', 'Signal', 'Reverie'],
  calle: ['de Medianoche', 'en la Bahía', 'de Neón', 'Sin Ti', 'Tropical', 'de Verano', 'en el Muelle', 'Rosado', 'de Sal', 'Eléctrica', 'del Malecón', 'Contigo', 'en la Arena', 'Bonita', 'de Caramelo', 'Caliente'],
  haze: ['at 3pm', 'nap', '(interlude)', 'on the windshield', 'rain', 'swing', 'static', 'watching', 'is glass', 'season', 'shuffle', 'tapes', 'coffee', 'drift', 'hours', 'postcard'],
  bass: ['Bounce', 'Thunder', 'Stomp', 'Rattle', 'Season', 'Anthem', 'Knock', 'Boomin', 'Riot', 'Shake', 'Pressure', 'Low End', 'Drop', 'Run', 'Weather', 'Slap'],
};

const SUFFIX: Record<StationId, readonly string[]> = {
  sunset: ['', '', '', ' (Extended Mix)', ' (Night Drive Edit)', " '86", ' (Sunset Version)'],
  calle: ['', '', '', ' (Remix)', ' (feat. DJ Mangó)', ' (Versión Playa)'],
  haze: ['', '', '', ' (demo)', ' (tape loop)', ' (reprise)'],
  bass: ['', '', '', ' (Trunk Mix)', ' (Swamp Mix)', ' (Clean)'],
};

/** Common phrases that are well-known existing song titles; never produced. */
const BLOCKED = new Set(['Neon Lights', 'Midnight City', 'Golden Hour', 'Heat Waves', 'Nightcall', 'Summer Nights']);

export interface AdSpot {
  readonly sponsor: string;
  readonly caption: string;
  /** Jingle mood: bright, smooth, urgent. */
  readonly jingle: 'bright' | 'smooth' | 'urgent' | 'spooky';
}

export const ADS: readonly AdSpot[] = [
  { sponsor: 'Pinkerton Law', jingle: 'smooth', caption: 'Busted? Don’t panic. Sy Pinkerton, attorney at law. Billboards on every corner because I care. Personally.' },
  { sponsor: 'Zenith Wellness', jingle: 'smooth', caption: 'Zenith Wellness. Breathe. Buy. Become. Now with 40% more inner peace. Results not typical. Peace not guaranteed.' },
  { sponsor: 'Sod Almighty', jingle: 'bright', caption: 'Sod Almighty Garden & Feed — where your lawn finds religion. Seed sale this week only, sinners.' },
  { sponsor: 'Mama Yoli’s Bodega', jingle: 'bright', caption: 'Mama Yoli’s Bodega: cafecito, lotto tickets and opinions about your love life. Open till midnight. Mostly.' },
  { sponsor: 'Gator Golf', jingle: 'bright', caption: 'Gator Golf! Eighteen holes and one enormous fiberglass gator. He hasn’t eaten a tourist in years.' },
  { sponsor: 'Sudsy Flamingo', jingle: 'bright', caption: 'Sudsy Flamingo Car Wash. We’ll wash anything. Anything. Ask about the Platinum Rinse.' },
  { sponsor: 'Flamingo Court Motel', jingle: 'smooth', caption: 'Flamingo Court Motel, Deco Row. Rooms by the night or by the hour. We don’t ask. We don’t remember.' },
  { sponsor: 'Starlite Drive-In', jingle: 'spooky', caption: 'Tonight at the Starlite: “Mangrove Massacre 4” and “Love Boat of Death.” Bring a date. Bring bug spray.' },
  { sponsor: 'Halcyon Herons', jingle: 'urgent', caption: 'Halcyon Herons basketball, tonight at the Arena. They’re due. Statistically, they have to be.' },
  { sponsor: 'HeronCoin', jingle: 'urgent', caption: 'Invest in HeronCoin. It’s a bird. It’s a coin. It’s down eighty percent, which means it’s on sale.' },
  { sponsor: 'First Coastal Bank', jingle: 'smooth', caption: 'First Coastal Bank. We take your money very seriously. Especially the clean kind.' },
  { sponsor: 'Dex’s Wrench & Wax', jingle: 'urgent', caption: 'Dex’s Wrench & Wax: your car is a therapist that never interrupts. Treat it right.' },
  { sponsor: 'Storm-Ready Shutters', jingle: 'urgent', caption: 'Hurricane season is here. Storm-Ready Shutters: because “it’ll probably miss us” is not a plan.' },
  { sponsor: 'Taco Tsunami', jingle: 'bright', caption: 'Taco Tsunami! Find the truck. Follow the line. Ask about the Category Five burrito.' },
  { sponsor: 'Isla Dorada Estates', jingle: 'smooth', caption: 'Isla Dorada Estates: live where the money can see you. Gated. Guarded. Gorgeous.' },
  { sponsor: 'Airboat Annie’s', jingle: 'bright', caption: 'Airboat Annie’s swamp tours. See gators up close. Closer than you’d like, honestly.' },
  { sponsor: 'The Chrome Pelican', jingle: 'smooth', caption: 'The Chrome Pelican diner. Pancakes all day, meetings all night, questions never.' },
  { sponsor: 'Volt! Powder', jingle: 'urgent', caption: 'Volt! Energy Powder. Now legal in four counties. Taste the lightning.' },
  { sponsor: 'Gulf Glow SPF 1000', jingle: 'bright', caption: 'Gulf Glow SPF 1000 — because the sun here takes it personally.' },
  { sponsor: 'Halcyon Bay Wildlife Office', jingle: 'smooth', caption: 'A public service reminder: please do not feed the gators. They have jobs.' },
  { sponsor: 'Big Shell Marine', jingle: 'bright', caption: 'Big Shell Marine: boats, motors and bait by the bucket. Zero percent financing for people who look honest.' },
  { sponsor: 'Leaky Tiki', jingle: 'smooth', caption: 'The Leaky Tiki. Rum, regrets and the best sunset on the Strand. Happy hour is a state of mind.' },
];

const IDENTS: Record<StationId, readonly string[]> = {
  sunset: [
    'Sunset FM 101.9 — golden hour, all hour.',
    'You’re cruising with Sunset FM. Windows down, Halcyon.',
    'Sunset FM: drive west fast enough and the sun sets twice.',
    'Sunset FM 101.9. Neon on, worries off.',
  ],
  calle: [
    'Calle Ocho Static, 97.3 — ¡súbele!',
    'Static on the dial, fire in the speakers. Calle Ocho Static.',
    '97.3: más calor, menos aire acondicionado.',
    'Calle Ocho Static. Dance like your abuela is watching. She is.',
  ],
  haze: [
    'palm haze 88.5. breathe out.',
    'you’re listening to palm haze. it’s fine. everything’s fine.',
    '88.5 palm haze — music for ceiling fans.',
    'palm haze. low tide, low stress.',
  ],
  bass: [
    'GULF BASS 104.7 — CHECK YOUR TRUNK.',
    'If your mirrors aren’t shaking, turn it up. Gulf Bass.',
    '104.7: bass so heavy the gators file complaints.',
    'Gulf Bass. Rattling windows since the last hurricane.',
  ],
};

export const names = {
  artist(station: StationId, rng: Rng): string {
    return rng.pick(ARTISTS[station]);
  },
  title(station: StationId, rng: Rng): string {
    for (let i = 0; i < 6; i++) {
      const a = rng.pick(TITLE_A[station]);
      const b = rng.pick(TITLE_B[station]);
      const base = `${a} ${b}`;
      if (BLOCKED.has(base)) continue;
      return base + rng.pick(SUFFIX[station]);
    }
    return `${TITLE_A[station][0]} ${TITLE_B[station][0]}`;
  },
  ident(station: StationId, rng: Rng): string {
    return rng.pick(IDENTS[station]);
  },
  ad(rng: Rng): AdSpot {
    return rng.pick(ADS);
  },
  news(text: string): string {
    return `Halcyon News Flash — ${text}`;
  },
  /** DJ back-announce after a track. */
  backAnnounce(artist: string, title: string, rng: Rng, hoursLabel: string | null): string {
    const lines = [
      `That was ${artist} with “${title}.”`,
      `${artist}, “${title}.” Keep it right here.`,
      `You just heard “${title}” by ${artist}.`,
    ];
    const line = rng.pick(lines);
    return hoursLabel ? `${line} ${hoursLabel}` : line;
  },
  isBlocked(title: string): boolean {
    return BLOCKED.has(title);
  },
};
