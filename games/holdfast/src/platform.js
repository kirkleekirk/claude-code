// Device detection shared by UI modules.
export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
