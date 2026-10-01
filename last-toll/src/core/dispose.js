// Frees what a scene graph holds on the GPU: geometries, materials, their textures and
// skinned meshes' bone textures. Anything flagged userData.shared (caches kept across
// raids, like the characters' looks) is left alone. Freeing something another scene
// still uses is safe, only slower: three.js uploads it again the next time it's drawn.

export function disposeTree(root) {
  if (!root) return;
  const seen = new Set();
  const tex = (t) => {
    if (!t || !t.isTexture || seen.has(t)) return;
    seen.add(t);
    if (!t.userData.shared) t.dispose();
  };
  root.traverse((o) => {
    // a shadow-casting light keeps its shadow map until the light itself is disposed
    if (o.isLight) { o.dispose(); return; }
    if (o.skeleton && !seen.has(o.skeleton)) { seen.add(o.skeleton); o.skeleton.dispose(); }
    if (o.isInstancedMesh && !seen.has(o)) { seen.add(o); o.dispose(); }
    const g = o.geometry;
    if (g && !seen.has(g)) { seen.add(g); if (!g.userData.shared) g.dispose(); }
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (m.userData.shared) continue;
      for (const k in m) { const v = m[k]; if (v && v.isTexture) tex(v); }
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) tex(u.value);
      m.dispose();
    }
  });
}
