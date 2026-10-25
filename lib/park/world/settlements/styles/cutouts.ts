// Painted cut-out stands (market stalls): each is a real painted picture on a clear ground — its
// counter, posts, goods and striped awning — standing in front and again behind, with plain panels
// closing the counter's sides and a canopy overhead in its own awning cloth. All of a village's
// stands are ONE mesh wearing ONE picture (public/park-assets/buildings/<name>-atlas.webp, packed
// with its transparency by scripts/village-atlas.mjs), so they cost a single draw call.
import * as THREE from "three";
import type { Rect } from "./paintedHouses";

export interface CutoutStand {
  x: number;
  /** the ground under it (filled in by ../index.ts) */
  y: number;
  z: number;
  /** which way its front faces */
  yaw: number;
  w: number;
  h: number;
  /** front to back */
  d: number;
  /** its picture's cell */
  cell: Rect;
}

export interface Cutouts {
  mesh: THREE.Mesh;
  setGlow(glow: number): void;
  dispose(): void;
}

export function buildCutouts(stands: CutoutStand[], atlas: { name: string; w: number; h: number }, opts: { lowQuality?: boolean } = {}): Cutouts {
  const pos: number[] = [];
  const uv: number[] = [];
  const v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const st of stands) {
    const [cx, cy, cw, ch] = st.cell;
    /** (u, v) inside the stand's own cell, v up from its feet */
    const t = (u: number, vv: number): [number, number] => [(cx + 2 + u * (cw - 4)) / atlas.w, 1 - (cy + 2 + (1 - vv) * (ch - 4)) / atlas.h];
    const put = (p: number[], q: [number, number]) => {
      v.set(p[0], p[1], p[2]).applyAxisAngle(up, st.yaw);
      pos.push(st.x + v.x, st.y + v.y, st.z + v.z);
      uv.push(q[0], q[1]);
    };
    const quad = (a: number[], b: number[], c: number[], d: number[], u0: number, v0: number, u1: number, v1: number) => {
      put(a, t(u0, v0));
      put(b, t(u1, v0));
      put(c, t(u1, v1));
      put(a, t(u0, v0));
      put(c, t(u1, v1));
      put(d, t(u0, v1));
    };
    const hw = st.w / 2;
    const hd = st.d / 2;
    const H = st.h;
    // the picture in front, and again behind (turned round so it reads the right way from there)
    quad([-hw, 0, hd], [hw, 0, hd], [hw, H, hd], [-hw, H, hd], 0, 0, 1, 1);
    quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, H, -hd], [hw, H, -hd], 0, 0, 1, 1);
    // the counter's two ends and its top, in the counter's own panelled wood (a patch from the
    // middle of the picture's counter, which is always solid)
    const cH = H * 0.36;
    const cw2 = hw * 0.86;
    for (const s of [-1, 1]) quad([s * cw2, 0, s * hd], [s * cw2, 0, -s * hd], [s * cw2, cH, -s * hd], [s * cw2, cH, s * hd], 0.38, 0.08, 0.62, 0.3);
    quad([-cw2, cH, hd], [cw2, cH, hd], [cw2, cH, -hd], [-cw2, cH, -hd], 0.38, 0.3, 0.62, 0.34);
    // the canopy overhead, in the awning's own stripes (a band from the middle of the awning)
    const aY = H * 0.9;
    const aw = hw * 0.96;
    quad([-aw, aY, hd + 0.25], [aw, aY, hd + 0.25], [aw, aY, -hd - 0.25], [-aw, aY, -hd - 0.25], 0.14, 0.9, 0.86, 0.94);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  let map: THREE.Texture | null = null;
  if (typeof document !== "undefined") {
    map = new THREE.TextureLoader().load(`/park-assets/buildings/${atlas.name}-atlas.webp`);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = opts.lowQuality ? 2 : 8;
  }
  const mat = new THREE.MeshStandardMaterial({ map: map ?? undefined, color: map ? "#ffffff" : "#b98a55", roughness: 0.8, emissive: "#ffffff", emissiveMap: map ?? undefined, emissiveIntensity: map ? 0.24 : 0, side: THREE.DoubleSide, alphaTest: map ? 0.5 : 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `${atlas.name}-cutouts`;
  mesh.castShadow = !opts.lowQuality;
  mesh.receiveShadow = true;
  return {
    mesh,
    setGlow(glow) {
      if (map) mat.emissiveIntensity = 0.22 + glow * 0.36;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      map?.dispose();
    },
  };
}
