/**
 * The only place allowed to touch `console`. Normal play must produce zero console output, so
 * entries are kept in a ring buffer (read by the QA harness) and only echoed to the console when
 * the build is a dev build or the page was opened with `?debug=1`.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly tag: string;
  readonly message: string;
  readonly time: number;
  readonly count: number;
}

const MAX_ENTRIES = 200;
const entries: LogEntry[] = [];
let echo = false;

function push(level: LogLevel, tag: string, message: string, data: unknown): void {
  const last = entries[entries.length - 1];
  if (last && last.level === level && last.tag === tag && last.message === message) {
    entries[entries.length - 1] = { ...last, count: last.count + 1 };
  } else {
    entries.push({ level, tag, message, time: Date.now(), count: 1 });
    if (entries.length > MAX_ENTRIES) entries.shift();
  }
  if (!echo) return;
  const line = `[${tag}] ${message}`;
  /* eslint-disable no-console */
  if (level === 'error') console.error(line, data ?? '');
  else if (level === 'warn') console.warn(line, data ?? '');
  else console.info(line, data ?? '');
  /* eslint-enable no-console */
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

export const log = {
  /** Echo entries to the browser console (dev builds and `?debug=1`). */
  setEcho(on: boolean): void {
    echo = on;
  },
  info(tag: string, message: string, data?: unknown): void {
    push('info', tag, message, data);
  },
  warn(tag: string, message: string, data?: unknown): void {
    push('warn', tag, message, data);
  },
  error(tag: string, message: string, err?: unknown): void {
    push('error', tag, err === undefined ? message : `${message}: ${describe(err)}`, err);
  },
  /** Warnings and errors recorded so far. QA asserts this stays empty. */
  problems(): readonly LogEntry[] {
    return entries.filter((e) => e.level !== 'info');
  },
  all(): readonly LogEntry[] {
    return entries;
  },
  clear(): void {
    entries.length = 0;
  },
};
