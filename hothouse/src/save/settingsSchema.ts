import { defineStrings } from '@/core/i18n';

/**
 * Every player-facing option, declared once. The Settings screens are generated from this schema,
 * the store validates against it, and systems subscribe to the ids they care about.
 */

export type SettingCategory = 'graphics' | 'audio' | 'controls' | 'gameplay' | 'accessibility';
export type SliderUnit = 'percent' | 'degrees' | 'none';

interface Base {
  readonly category: SettingCategory;
}
export interface ToggleDef extends Base {
  readonly type: 'toggle';
  readonly default: boolean;
}
export interface SliderDef extends Base {
  readonly type: 'slider';
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: SliderUnit;
}
export interface SelectDef extends Base {
  readonly type: 'select';
  readonly default: string;
  readonly options: readonly string[];
}
export type SettingDef = ToggleDef | SliderDef | SelectDef;

const toggle = (category: SettingCategory, def: boolean) => ({ category, type: 'toggle', default: def }) as const;
const slider = (category: SettingCategory, def: number, min: number, max: number, step: number, unit: SliderUnit = 'percent') =>
  ({ category, type: 'slider', default: def, min, max, step, unit }) as const;
const select = <const O extends readonly string[]>(category: SettingCategory, def: O[number], options: O) =>
  ({ category, type: 'select', default: def, options }) as const;

export const SETTINGS = {
  // ── graphics ──────────────────────────────────────────────────────────────
  'gfx.preset': select('graphics', 'auto', ['auto', 'low', 'medium', 'high', 'ultra', 'custom']),
  'gfx.resolutionScale': slider('graphics', 100, 50, 150, 5),
  'gfx.dynamicResolution': toggle('graphics', true),
  'gfx.shadows': select('graphics', 'high', ['off', 'low', 'medium', 'high', 'ultra']),
  'gfx.reflections': select('graphics', 'high', ['off', 'low', 'high']),
  'gfx.ambientOcclusion': select('graphics', 'high', ['off', 'low', 'high']),
  'gfx.effects': select('graphics', 'high', ['low', 'medium', 'high']),
  'gfx.drawDistance': select('graphics', 'high', ['low', 'medium', 'high']),
  'gfx.motionBlur': toggle('graphics', true),
  'gfx.filmGrain': toggle('graphics', true),
  'gfx.lensEffects': toggle('graphics', true),
  'gfx.fpsCap': select('graphics', 'display', ['30', '60', '120', 'display']),
  'gfx.fov': slider('graphics', 68, 55, 95, 1, 'degrees'),
  'gfx.fullscreen': toggle('graphics', false),
  'gfx.fpsCounter': toggle('graphics', false),
  'gfx.uiBlur': toggle('graphics', true),
  // ── audio ─────────────────────────────────────────────────────────────────
  'audio.master': slider('audio', 80, 0, 100, 1),
  'audio.music': slider('audio', 70, 0, 100, 1),
  'audio.sfx': slider('audio', 85, 0, 100, 1),
  'audio.ambience': slider('audio', 70, 0, 100, 1),
  'audio.ui': slider('audio', 70, 0, 100, 1),
  'audio.barks': slider('audio', 80, 0, 100, 1),
  'audio.defaultStation': select('audio', 'sunset', ['sunset', 'calle', 'haze', 'bass', 'off']),
  'audio.muteOnBlur': toggle('audio', true),
  // ── controls ──────────────────────────────────────────────────────────────
  'controls.mouseSensitivity': slider('controls', 100, 20, 300, 5),
  'controls.padSensitivity': slider('controls', 100, 20, 300, 5),
  'controls.invertY': toggle('controls', false),
  'controls.vibration': toggle('controls', true),
  'controls.glyphs': select('controls', 'auto', ['auto', 'xbox', 'playstation', 'switch']),
  // ── gameplay ──────────────────────────────────────────────────────────────
  'game.difficulty': select('gameplay', 'classic', ['chill', 'classic', 'sweaty']),
  'game.aimAssist': slider('gameplay', 60, 0, 100, 5),
  'game.assistTraction': toggle('gameplay', true),
  'game.assistSteering': toggle('gameplay', true),
  'game.assistCountersteer': toggle('gameplay', true),
  'game.autoTend': toggle('gameplay', false),
  'game.timing': select('gameplay', 'normal', ['normal', 'easy', 'auto']),
  'game.phoneTime': select('gameplay', 'slow', ['pause', 'slow', 'realtime']),
  'game.holdToToggle': toggle('gameplay', false),
  'game.units': select('gameplay', 'mph', ['mph', 'kmh']),
  'game.clock24': toggle('gameplay', false),
  'game.hints': toggle('gameplay', true),
  // ── accessibility ─────────────────────────────────────────────────────────
  'a11y.uiScale': slider('accessibility', 100, 80, 150, 5),
  'a11y.hudScale': slider('accessibility', 100, 80, 130, 5),
  'a11y.hudOpacity': slider('accessibility', 100, 40, 100, 5),
  'a11y.subtitleSize': select('accessibility', 'medium', ['small', 'medium', 'large']),
  'a11y.subtitleBackground': toggle('accessibility', true),
  'a11y.colorblind': select('accessibility', 'off', ['off', 'safe']),
  'a11y.highContrast': toggle('accessibility', false),
  'a11y.reducedMotion': toggle('accessibility', false),
  'a11y.reduceFlashing': toggle('accessibility', false),
  'a11y.screenShake': slider('accessibility', 100, 0, 100, 5),
  'a11y.dyslexiaFont': toggle('accessibility', false),
} as const satisfies Record<string, SettingDef>;

export type SettingId = keyof typeof SETTINGS;
export const SETTING_IDS = Object.keys(SETTINGS) as SettingId[];

export type SettingValue<K extends SettingId> = (typeof SETTINGS)[K] extends { type: 'toggle' }
  ? boolean
  : (typeof SETTINGS)[K] extends { type: 'slider' }
    ? number
    : (typeof SETTINGS)[K] extends { options: infer O extends readonly string[] }
      ? O[number]
      : never;

export const SETTING_CATEGORIES: readonly SettingCategory[] = ['graphics', 'audio', 'controls', 'gameplay', 'accessibility'];

/**
 * Labels (`<id>`), one-line descriptions (`<id>.desc`) and option names (`<id>.<option>`).
 * The Settings UI looks these up by convention.
 */
export const settingsText = defineStrings('settings', {
  'category.graphics': 'Graphics',
  'category.audio': 'Audio',
  'category.controls': 'Controls',
  'category.gameplay': 'Gameplay',
  'category.accessibility': 'Accessibility',

  'gfx.preset': 'Quality preset',
  'gfx.preset.desc': 'Auto picks a preset from a quick benchmark the first time you play.',
  'gfx.preset.auto': 'Auto', 'gfx.preset.low': 'Low', 'gfx.preset.medium': 'Medium', 'gfx.preset.high': 'High',
  'gfx.preset.ultra': 'Ultra', 'gfx.preset.custom': 'Custom',
  'gfx.resolutionScale': 'Resolution scale',
  'gfx.resolutionScale.desc': 'Render sharper or faster than your display. 100% is native.',
  'gfx.dynamicResolution': 'Dynamic resolution',
  'gfx.dynamicResolution.desc': 'Lowers resolution briefly to keep the frame rate smooth.',
  'gfx.shadows': 'Shadows',
  'gfx.shadows.desc': 'Sun and moon shadow quality.',
  'gfx.shadows.off': 'Off', 'gfx.shadows.low': 'Low', 'gfx.shadows.medium': 'Medium', 'gfx.shadows.high': 'High', 'gfx.shadows.ultra': 'Ultra',
  'gfx.reflections': 'Reflections',
  'gfx.reflections.desc': 'Mirror reflections on wet roads, water and paint.',
  'gfx.reflections.off': 'Off', 'gfx.reflections.low': 'Low', 'gfx.reflections.high': 'High',
  'gfx.ambientOcclusion': 'Ambient occlusion',
  'gfx.ambientOcclusion.desc': 'Soft contact shadows where surfaces meet.',
  'gfx.ambientOcclusion.off': 'Off', 'gfx.ambientOcclusion.low': 'Low', 'gfx.ambientOcclusion.high': 'High',
  'gfx.effects': 'Effects',
  'gfx.effects.desc': 'Bloom, light shafts, heat haze, rain and particles.',
  'gfx.effects.low': 'Low', 'gfx.effects.medium': 'Medium', 'gfx.effects.high': 'High',
  'gfx.drawDistance': 'Draw distance',
  'gfx.drawDistance.desc': 'How far detailed buildings, props and crowds are shown.',
  'gfx.drawDistance.low': 'Near', 'gfx.drawDistance.medium': 'Medium', 'gfx.drawDistance.high': 'Far',
  'gfx.motionBlur': 'Motion blur',
  'gfx.motionBlur.desc': 'Speed streaks when driving fast.',
  'gfx.filmGrain': 'Film grain',
  'gfx.filmGrain.desc': 'A touch of texture over the picture.',
  'gfx.lensEffects': 'Lens effects',
  'gfx.lensEffects.desc': 'Sun flares, starbursts and edge fringing.',
  'gfx.fpsCap': 'Frame rate limit',
  'gfx.fpsCap.desc': 'Cap the frame rate to save power.',
  'gfx.fpsCap.30': '30', 'gfx.fpsCap.60': '60', 'gfx.fpsCap.120': '120', 'gfx.fpsCap.display': 'Match display',
  'gfx.fov': 'Field of view',
  'gfx.fov.desc': 'Wider shows more of the street; narrower feels closer.',
  'gfx.fullscreen': 'Fullscreen',
  'gfx.fullscreen.desc': 'Fill the whole display.',
  'gfx.fpsCounter': 'Show frame rate',
  'gfx.fpsCounter.desc': 'A small counter in the corner.',
  'gfx.uiBlur': 'Frosted glass',
  'gfx.uiBlur.desc': 'Blur the world behind panels. Turn off on slower machines.',

  'audio.master': 'Master volume', 'audio.master.desc': 'Everything.',
  'audio.music': 'Radio and score', 'audio.music.desc': 'Car radio and the dynamic score.',
  'audio.sfx': 'Sound effects', 'audio.sfx.desc': 'Engines, tires, impacts and the world.',
  'audio.ambience': 'Ambience', 'audio.ambience.desc': 'Gulls, surf, cicadas, rain and crowds.',
  'audio.ui': 'Interface', 'audio.ui.desc': 'Menu and phone sounds.',
  'audio.barks': 'Voices', 'audio.barks.desc': 'Dialogue blips and street chatter.',
  'audio.defaultStation': 'Favorite station',
  'audio.defaultStation.desc': 'What plays when you start the car.',
  'audio.defaultStation.sunset': 'Sunset FM', 'audio.defaultStation.calle': 'Calle Ocho Static',
  'audio.defaultStation.haze': 'Palm Haze', 'audio.defaultStation.bass': 'Gulf Bass', 'audio.defaultStation.off': 'Radio off',
  'audio.muteOnBlur': 'Mute in background',
  'audio.muteOnBlur.desc': 'Silence the game when you switch tabs or windows.',

  'controls.mouseSensitivity': 'Mouse sensitivity', 'controls.mouseSensitivity.desc': 'Camera speed with the mouse.',
  'controls.padSensitivity': 'Stick sensitivity', 'controls.padSensitivity.desc': 'Camera speed with the right stick.',
  'controls.invertY': 'Invert vertical look', 'controls.invertY.desc': 'Push up to look down.',
  'controls.vibration': 'Vibration', 'controls.vibration.desc': 'Rumble on crashes, drifts and deals.',
  'controls.glyphs': 'Button icons', 'controls.glyphs.desc': 'Which controller art to show in prompts.',
  'controls.glyphs.auto': 'Auto-detect', 'controls.glyphs.xbox': 'Xbox', 'controls.glyphs.playstation': 'PlayStation', 'controls.glyphs.switch': 'Switch',

  'game.difficulty': 'Difficulty',
  'game.difficulty.desc': 'Change any time. It never locks content.',
  'game.difficulty.chill': 'Chill', 'game.difficulty.classic': 'Classic', 'game.difficulty.sweaty': 'Sweaty',
  'game.aimAssist': 'Aim assist', 'game.aimAssist.desc': 'How strongly aiming snaps toward targets on a controller.',
  'game.assistTraction': 'Traction help', 'game.assistTraction.desc': 'Tames wheelspin and keeps slides catchable.',
  'game.assistSteering': 'Steering help', 'game.assistSteering.desc': 'Softens steering at speed so the car stays planted.',
  'game.assistCountersteer': 'Auto counter-steer', 'game.assistCountersteer.desc': 'Helps hold a drift without spinning.',
  'game.autoTend': 'Auto-tend plants', 'game.autoTend.desc': 'Walking past a plant tends it without holding Interact.',
  'game.timing': 'Timing games',
  'game.timing.desc': 'Easy widens every timing window. Auto succeeds for you.',
  'game.timing.normal': 'Normal', 'game.timing.easy': 'Easy', 'game.timing.auto': 'Auto-success',
  'game.phoneTime': 'While the phone is open',
  'game.phoneTime.desc': 'What the world does while you read.',
  'game.phoneTime.pause': 'Pause', 'game.phoneTime.slow': 'Slow motion', 'game.phoneTime.realtime': 'Keep going',
  'game.holdToToggle': 'Tap instead of hold', 'game.holdToToggle.desc': 'Every hold action becomes a single tap.',
  'game.units': 'Speed units', 'game.units.desc': 'For the speedometer and distances.',
  'game.units.mph': 'Miles', 'game.units.kmh': 'Kilometres',
  'game.clock24': '24-hour clock', 'game.clock24.desc': 'Show 18:40 instead of 6:40 PM.',
  'game.hints': 'Hints', 'game.hints.desc': 'Short tips the first time something new comes up.',

  'a11y.uiScale': 'Interface size', 'a11y.uiScale.desc': 'Scales menus, the phone and all text.',
  'a11y.hudScale': 'HUD size', 'a11y.hudScale.desc': 'Scales the on-screen display during play.',
  'a11y.hudOpacity': 'HUD opacity', 'a11y.hudOpacity.desc': 'Fade the on-screen display.',
  'a11y.subtitleSize': 'Subtitle size', 'a11y.subtitleSize.desc': 'For dialogue, radio chatter and captions.',
  'a11y.subtitleSize.small': 'Small', 'a11y.subtitleSize.medium': 'Medium', 'a11y.subtitleSize.large': 'Large',
  'a11y.subtitleBackground': 'Subtitle background', 'a11y.subtitleBackground.desc': 'A dark plate behind subtitles.',
  'a11y.colorblind': 'Color-blind friendly', 'a11y.colorblind.desc': 'Swaps the heat ramp and map markers for a safe palette with shapes.',
  'a11y.colorblind.off': 'Off', 'a11y.colorblind.safe': 'On',
  'a11y.highContrast': 'High-contrast text', 'a11y.highContrast.desc': 'Solid panels, brighter text and outlines.',
  'a11y.reducedMotion': 'Reduce motion', 'a11y.reducedMotion.desc': 'Calmer menus and camera: fades instead of movement.',
  'a11y.reduceFlashing': 'Reduce flashing', 'a11y.reduceFlashing.desc': 'Softens police lights, lightning and camera flashes.',
  'a11y.screenShake': 'Camera shake', 'a11y.screenShake.desc': 'How much the camera reacts to speed and impacts.',
  'a11y.dyslexiaFont': 'Dyslexia-friendly font', 'a11y.dyslexiaFont.desc': 'Uses OpenDyslexic for all interface text.',
});
