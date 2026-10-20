# Asset pipeline

The game ships ready-to-run models in `assets/models/`. You only need these tools to rebuild them, for example from a newer download of a model. Run on the original downloads, the two steps below reproduce the shipped files. In Chromium the result is byte for byte; other browsers may re-encode textures slightly differently.

## 1. Convert (browser)

`convert-models.html` loads the original FBX/glTF files, cleans them up and exports a single GLB:

- **Invincible:** collapses the nested duplicate bones that FBXLoader creates and keeps the hand-made outline hull. The hull is hidden in game and replaced by a shader outline.
- **Atom Eve:** applies the diffuse and normal maps and strips the helper objects left over from the source game.
- **Omni-Man:** rebuilds smooth normals, because the source glTF's normals are broken and render him dark. It also names the meshes so the optimizer can target them.
- **All three:** scales each model to its in-game height (Invincible 1.85 m, Eve 1.74 m, Omni-Man 1.98 m).

Steps:

1. Unpack the downloads. Two of them nest a second archive inside `source/`:
   - `invincible.zip`: unzip `source/Mark_Invincible.zip`, which holds `Mark_Invincible.fbx`, `Invincible Suit.png` and `Hair.png`.
   - `atom-eve.zip`: unpack `source/ATOM-EVE.rar` (7-Zip, unar, etc.). The `Model_AtomEve/` folder inside holds `Model_AtomEve.fbx`, `atomeve_df.png` and `atomeve_nm.png`.
   - `invincible-vs-omniman.zip`: `source/Nuevo Proyecto 3.gltf` has its textures embedded.
2. From the game folder, run `npm start` and open <http://localhost:5173/tools/convert-models.html>. The page loads three.js r169 from jsDelivr.
3. Pick the hero and the folder (or files) from step 1, then click **Convert and download**. The page saves `<hero>.raw.glb`.

## 2. Optimize (Node 18+)

`optimize.mjs` welds and dedups the geometry. It then re-encodes textures as WebP, quantizes the vertex attributes and applies meshopt compression, which `vendor/three/addons/libs/meshopt_decoder.module.js` decodes at load time.

```sh
cd tools
npm install
node optimize.mjs invincible.raw.glb ../assets/models/invincible.glb
node optimize.mjs eve.raw.glb        ../assets/models/atom-eve.glb
node optimize.mjs omniman.raw.glb    ../assets/models/omni-man.glb 0.45 "Eyes|Brows|Head"
```

The optional last two arguments simplify the meshes whose names match the regex to the given triangle ratio. Omni-Man's head meshes are far denser than the rest of the model, so they are simplified to 45%.

| Model | Raw GLB | Shipped GLB | Triangles |
| --- | --- | --- | --- |
| Invincible | 5.8 MB | 0.6 MB | 33k |
| Atom Eve | 1.4 MB | 0.2 MB | 4k |
| Omni-Man | 19.6 MB | 1.4 MB | 94k |
