import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Collapses the build into one self-contained HTML file (JS, CSS and fonts inlined) so the game
 * runs from a double-click with no server. Used by `vite build --mode singlefile`.
 */
function singleFile(outName: string): Plugin {
  return {
    name: 'hothouse-single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          const tag = new RegExp(`<script[^>]*src="[^"]*${escapeRe(basename(name))}"[^>]*></script>`);
          source = source.replace(tag, () => `<script type="module">\n${code}\n</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${escapeRe(basename(name))}"[^>]*>`);
          source = source.replace(tag, () => `<style>\n${String(file.source)}\n</style>`);
          delete bundle[name];
        }
      }
      source = source.replace(/<link rel="modulepreload"[^>]*>\s*/g, '');
      html.source = source;
      html.fileName = outName;
    },
  };
}
const basename = (p: string) => p.split('/').pop() ?? p;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig(({ mode }) => {
  const single = mode === 'singlefile';
  return {
    base: './',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    server: { port: 5173, strictPort: false, host: '127.0.0.1' },
    preview: { port: 4173, host: '127.0.0.1' },
    build: {
      target: 'es2022',
      outDir: 'dist',
      emptyOutDir: !single,
      assetsInlineLimit: single ? Number.MAX_SAFE_INTEGER : 4096,
      cssCodeSplit: false,
      chunkSizeWarningLimit: 6000,
      rollupOptions: single ? { output: { inlineDynamicImports: true } } : {},
    },
    plugins: single ? [singleFile('hothouse.html')] : [],
  };
});
