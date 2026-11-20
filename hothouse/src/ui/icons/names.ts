/**
 * Every icon in the set. Kept separate from the drawings so types can be imported cheaply.
 * Drawings live in `icons/paths.ts` (24 px grid, 2 px stroke, round caps and joins).
 */
export const ICON_NAMES = [
  // interface
  'back', 'close', 'check', 'plus', 'minus', 'chevronRight', 'chevronLeft', 'chevronDown', 'chevronUp', 'search',
  'menu', 'more', 'settings', 'info', 'help', 'warning', 'lock', 'unlock', 'star', 'heart', 'trash', 'edit',
  'undo', 'redo', 'download', 'upload', 'eye', 'eyeOff', 'filter', 'refresh', 'external', 'home', 'bell', 'play', 'pause',
  // devices and settings
  'keyboard', 'mouse', 'gamepad', 'phone', 'volume', 'volumeOff', 'music', 'headphones', 'display', 'accessibility',
  'sliders', 'sparkles', 'textSize', 'contrast',
  // hud
  'clock', 'sun', 'moon', 'cloud', 'cloudSun', 'rain', 'storm', 'wind', 'haze', 'hurricane',
  'cash', 'coin', 'wallet', 'bag', 'flame', 'siren', 'badge', 'flag', 'pin', 'route', 'compass', 'speed', 'bolt', 'flow',
  'radio', 'car', 'xp',
  // phone apps
  'messages', 'map', 'crown', 'jar', 'crew', 'cart', 'wrench', 'bank', 'camera', 'image', 'notebook',
  // empire
  'leaf', 'seedling', 'flower', 'drop', 'scissors', 'flask', 'beaker', 'pot', 'lamp', 'thermometer', 'shield', 'box',
  'house', 'warehouse', 'store', 'building', 'briefcase', 'handshake', 'tag', 'trendUp', 'trendDown', 'trophy', 'gift',
  'user', 'userPlus', 'users', 'target', 'crosshair', 'calendar', 'hourglass', 'bed', 'megaphone', 'sprayCan', 'palm',
  'flamingo', 'snowflake', 'press',
  // effect families
  'social', 'body', 'mind', 'weird', 'apex', 'dud',
  // crew roles
  'grower', 'cook', 'packer', 'dealer', 'driver', 'guard', 'accountant', 'lookout',
  // vehicles
  'pickup', 'scooter', 'boat', 'helicopter', 'van',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
