// Project rules the type checker cannot enforce:
//  - no file over ~800 lines,
//  - no unfinished-work markers or filler text in shipped source,
//  - no console calls outside core/log.ts and debug/,
//  - module import direction (sim/content stay headless; render never reaches into gameplay).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const MAX_LINES = 850;

const BANNED = [
  [/\bTODO\b/, 'unfinished-work marker'],
  [/\bFIXME\b/, 'unfinished-work marker'],
  [/\bTBD\b/, 'unfinished-work marker'],
  [/\bXXX\b/, 'unfinished-work marker'],
  [/lorem ipsum/i, 'filler text'],
  [/coming soon/i, 'dead-end copy'],
  [/not implemented/i, 'stub'],
];

/** module → modules it must not import from (by top-level folder under src/). */
const FORBIDDEN_IMPORTS = {
  core: ['input', 'physics', 'save', 'render', 'world', 'vehicles', 'characters', 'ai', 'sim', 'content', 'audio', 'ui', 'game', 'debug'],
  sim: ['input', 'physics', 'render', 'world', 'vehicles', 'characters', 'ai', 'audio', 'ui', 'game', 'debug'],
  content: ['input', 'physics', 'render', 'world', 'vehicles', 'characters', 'ai', 'sim', 'audio', 'ui', 'game', 'debug'],
  render: ['sim', 'ui', 'game', 'ai', 'audio'],
  audio: ['render', 'world', 'vehicles', 'characters', 'ai', 'sim', 'ui', 'game'],
  save: ['render', 'world', 'vehicles', 'characters', 'ai', 'sim', 'ui', 'game', 'audio'],
  input: ['render', 'world', 'vehicles', 'characters', 'ai', 'sim', 'ui', 'game', 'audio', 'save'],
  physics: ['render', 'world', 'vehicles', 'characters', 'ai', 'sim', 'ui', 'game', 'audio', 'save', 'input'],
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css|glsl)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).replaceAll('\\', '/');
  const top = rel.split('/')[0];
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  if (lines.length > MAX_LINES) problems.push(`${rel}: ${lines.length} lines (max ${MAX_LINES}); split it`);
  lines.forEach((line, i) => {
    for (const [re, why] of BANNED) if (re.test(line)) problems.push(`${rel}:${i + 1}: ${why}: ${line.trim().slice(0, 80)}`);
    if (/\bconsole\.(log|warn|error|info|debug|trace)\b/.test(line) && rel !== 'core/log.ts' && top !== 'debug') {
      problems.push(`${rel}:${i + 1}: console call outside core/log.ts`);
    }
    const m = line.match(/from\s+['"]@\/([a-z]+)/);
    if (m && FORBIDDEN_IMPORTS[top]?.includes(m[1])) problems.push(`${rel}:${i + 1}: ${top}/ must not import from ${m[1]}/`);
  });
}

if (problems.length) {
  console.error(`project-lint: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('project-lint: clean');
