import type { CSSProperties } from 'preact';
import type { IconName } from './names';
import { ICON_PATHS } from './paths';

export interface IconProps {
  name: IconName;
  /** Rendered size; defaults to 1.25em so icons scale with surrounding text. */
  size?: number | string;
  /** Accessible name. Without it the icon is decorative and hidden from assistive tech. */
  label?: string;
  class?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export function Icon({ name, size = '1.25em', label, class: cls, style, strokeWidth = 2 }: IconProps) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <svg
      class={cls ? `hh-icon ${cls}` : 'hh-icon'}
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
      style={style}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
