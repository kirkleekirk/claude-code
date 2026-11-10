// Bundles the game into two single-file pages:
//   index.html          - standalone, open directly in any browser
//   dist/artifact.html  - same page without the document skeleton (for hosted embedding)
import { build } from 'esbuild';
import fs from 'node:fs';

const dev = process.argv.includes('--dev');
const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  write: false,
  target: 'es2020',
  legalComments: 'none',
  define: { __DEV__: JSON.stringify(dev) },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/ui/style.css', 'utf8');
const body = fs.readFileSync('src/ui/body.html', 'utf8');
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Syncopate:wght@400;700&family=Share+Tech+Mono&display=swap">';
const head = `<title>Far Signal</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${css}\n</style>`;
const content = `${head}\n${body}\n<script>\n${js}\n</script>\n`;

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/artifact.html', content);
fs.writeFileSync('index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#05060f">
${head}
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`);
console.log(`built: index.html ${(fs.statSync('index.html').size / 1024).toFixed(0)} KB${dev ? ' (dev)' : ''}`);
