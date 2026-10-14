// The game's own files beside the page (local-assets/): fetched from there, or, in the download
// build (tools/build-download.mjs), taken from the copy packed into the page itself, since a page
// opened straight from disk can't fetch the files beside it.

const PACKED = globalThis.__SMZ_FILES__ || null;

function bytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// what a packed file holds, once (the text it was packed as is let go)
function body(f) {
  if (f.body == null) { f.body = f.b != null ? bytes(f.b) : f.s; f.b = f.s = null; }
  return f.body;
}

export function fileFetch(url) {
  if (!PACKED) return fetch(url);
  // a packed page has everything it's going to have (the friends' copy has none of it)
  const f = PACKED[url];
  if (!f) return Promise.resolve(new Response(null, { status: 404 }));
  return Promise.resolve(new Response(body(f), { headers: { 'Content-Type': f.t } }));
}

// a URL for something an element loads itself (an image)
export function fileUrl(url) {
  const f = PACKED?.[url];
  if (!f) return url;
  if (!f.url) f.url = URL.createObjectURL(new Blob([body(f)], { type: f.t }));
  return f.url;
}
