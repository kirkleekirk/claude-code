export default [
  { run: `FS.newGame(); for (let i=0;i<60;i++){ await wait(100); step(1); if (FS.phase==='play' && !FS.busy) break; }
    const w = FS.world, t = w.terrain, p = w.def.pois.vaultTides; let best = 1e9, bx=0,bz=0;
    for (let a=0;a<360;a+=3) for (let d=30; d<400; d+=4) { const x = p.x + Math.cos(a*Math.PI/180)*d, z = p.z + Math.sin(a*Math.PI/180)*d; if (t.heightAt(x,z) > 1.5 && d > 62) { if (d < best) { best = d; bx=x; bz=z; } break; } }
    const pods = w.nodes.list.filter(n=>n.type==='pod').map(n=>Math.hypot(n.x-w.base.x,n.z-w.base.z)).sort((a,b)=>a-b).slice(0,5).map(v=>Math.round(v));
    const eg = w.nodes.list.filter(n=>n.type==='emberglass').map(n=>Math.hypot(n.x-w.base.x,n.z-w.base.z)).sort((a,b)=>a-b).slice(0,3).map(v=>Math.round(v));
    const counts = {}; for (const n of w.nodes.list) counts[n.type] = (counts[n.type]||0)+1;
    const stackTop = t.heightAt(p.x, p.z);
    const hs = []; for (const k of ['vaultEchoes','vaultEmbers','spire','landing']) { const q = w.def.pois[k]; hs.push(k+':'+t.heightAt(q.x,q.z).toFixed(1)); }
    // walk the stair path and report max slope
    const path = w.def.paths[0].pts; let maxRise = 0; for (let i=0;i<path.length-1;i++){ const A=path[i],B=path[i+1]; for (let k=0;k<40;k++){ const x1=A[0]+(B[0]-A[0])*k/40, z1=A[1]+(B[1]-A[1])*k/40, x2=A[0]+(B[0]-A[0])*(k+1)/40, z2=A[1]+(B[1]-A[1])*(k+1)/40; const r=(t.heightAt(x2,z2)-t.heightAt(x1,z1))/Math.hypot(x2-x1,z2-z1); maxRise=Math.max(maxRise,r);} }
    return {stackNearestLand: Math.round(best), at:[Math.round(bx),Math.round(bz)], stackTop, pods, eg, counts, hs, stairMaxSlope: +maxRise.toFixed(2), flora: w.flora.instanceCount};` },
];
