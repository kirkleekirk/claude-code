/* Status effects. Values are plain numbers (stacks or turns).
   decay:
     dot1  - start of own turn: take N damage, then N -= 1
     grow  - start of own turn: take N damage, then N += 1 (only ends with combat)
     heal1 - start of own turn: heal N, then N -= 1
     skip  - start of own turn: lose the turn, N -= 1
     start - start of own turn: N -= 1
     end   - end of own turn: N -= 1
     none  - lasts the whole fight unless consumed */
(function () {
  'use strict';
  LCO.data.STATUSES = {
    bleed:   { name: 'Bleed',        icon: 'drop',     kind: 'debuff', decay: 'dot1',  desc: (n) => `Takes ${n} damage at the start of each turn, then loses 1 stack.` },
    burn:    { name: 'Burn',         icon: 'flame',    kind: 'debuff', decay: 'dot1',  desc: (n) => `Takes ${n} damage at the start of each turn and heals 50% less.` },
    corrupt: { name: 'Corruption',   icon: 'tar',      kind: 'debuff', decay: 'grow',  desc: (n) => `Takes ${n} damage each turn and grows by 1. Only ends with the fight.` },
    stun:    { name: 'Stunned',      icon: 'spark',    kind: 'debuff', decay: 'skip',  desc: (n) => `Loses the next ${n > 1 ? n + ' turns' : 'turn'}.` },
    chill:   { name: 'Chill',        icon: 'snow',     kind: 'debuff', decay: 'end',   desc: (n) => `Deals ${n * 10}% less damage. At 3 stacks, becomes Chromed and loses a turn.` },
    weak:    { name: 'Weak',         icon: 'down',     kind: 'debuff', decay: 'end',   desc: (n) => `Deals 25% less damage for ${n} ${n === 1 ? 'turn' : 'turns'}.` },
    exposed: { name: 'Exposed',      icon: 'target',   kind: 'debuff', decay: 'end',   desc: (n) => `Takes 25% more damage for ${n} ${n === 1 ? 'turn' : 'turns'}.` },
    regen:   { name: 'Regen',        icon: 'plus',     kind: 'buff',   decay: 'heal1', desc: (n) => `Heals ${n} at the start of each turn, then loses 1 stack.` },
    strength:{ name: 'Strength',     icon: 'gauntlet', kind: 'buff',   decay: 'none',  desc: (n) => `Deals +${n} damage with every hit.` },
    haste:   { name: 'Haste',        icon: 'wind',     kind: 'buff',   decay: 'end',   desc: (n) => `+1 action point per turn for ${n} ${n === 1 ? 'turn' : 'turns'}.` },
    empower: { name: 'Empowered',    icon: 'up',       kind: 'buff',   decay: 'end',   desc: (n) => `Deals 30% more damage for ${n} ${n === 1 ? 'turn' : 'turns'}.` },
    ward:    { name: 'Warded',       icon: 'shield',   kind: 'buff',   decay: 'start', desc: (n) => `Takes 50% less damage for ${n} ${n === 1 ? 'turn' : 'turns'}.` },
    mirror:  { name: 'Mirror Image', icon: 'copy',     kind: 'buff',   decay: 'none',  desc: (n) => `The next ${n} ${n === 1 ? 'attack' : 'attacks'} against this target miss.` },
    hidden:  { name: 'Hidden',       icon: 'ghost',    kind: 'buff',   decay: 'start', desc: (n) => `Attacks against this target miss half the time. ${n} ${n === 1 ? 'turn' : 'turns'} left.` },
    thorns:  { name: 'Thorns',       icon: 'thorns',   kind: 'buff',   decay: 'none',  desc: (n) => `Attackers take ${n} damage whenever they land a hit.` },
    primal:  { name: 'Primal Form',  icon: 'fang',     kind: 'buff',   decay: 'end',   desc: (n) => `+2 AP each turn, +50% damage, Strikes cause Bleed. ${n} ${n === 1 ? 'turn' : 'turns'} left.` },
    eclipse: { name: 'Eclipse',      icon: 'tar',      kind: 'buff',   decay: 'end',   desc: (n) => `Takes 50% less damage; hits spread Corruption; Corruption ticks twice. ${n} ${n === 1 ? 'turn' : 'turns'} left.` },
  };
  LCO.data.STATUS_ORDER = ['stun', 'bleed', 'burn', 'corrupt', 'chill', 'weak', 'exposed', 'regen', 'strength', 'haste', 'empower', 'ward', 'mirror', 'hidden', 'thorns', 'primal', 'eclipse'];
})();
