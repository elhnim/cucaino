// A village's painted houses: every one of them in ONE mesh wearing ONE picture
// (public/park-assets/buildings/<village>-atlas.webp, packed by scripts/village-atlas.mjs from the
// artwork in codex-world-art/villages/) — so a whole street of real painted fronts costs a village
// a single extra draw call. Each house is four walls (its front picture on the wall that faces the
// square, its side wall on the other three) under a hipped roof.
//
// A village's own style (town.ts, mountain.ts, farm.ts ...) says where each house stands, how big
// it is and which part of the picture each of its faces wears.
import * as THREE from "three";

/** a rectangle of the village's picture, in pixels */
export type Rect = readonly [x: number, y: number, w: number, h: number];

export interface PaintedHouse {
  x: number;
  /** the ground under it (filled in by ../index.ts) */
  y: number;
  z: number;
  yaw: number;
  /** the front wall's width, the walls' height, the depth front to back, the roof's rise */
  w: number;
  h: number;
  d: number;
  roofRise: number;
  /** how far its floor stands above the ground (a house on stilts), default 0 */
  lift?: number;
  front: Rect;
  side: Rect;
  roof: Rect;
}

export interface HouseAtlas {
  /** the picture's name: public/park-assets/buildings/<name>-atlas.webp */
  name: string;
  w: number;
  h: number;
  /** a block of plain trim colour in it (the underside of the eaves) */
  trim: Rect;
}

export interface PaintedHouses {
  mesh: THREE.Mesh;
  setGlow(glow: number): void;
  dispose(): void;
}

export function buildPaintedHouses(houses: PaintedHouse[], atlas: HouseAtlas, opts: { lowQuality?: boolean } = {}): PaintedHouses {
  /** a rectangle's corner in texture space, kept a few pixels inside so neighbours never bleed in */
  const uvOf = (r: Rect, u: number, v: number): [number, number] => [(r[0] + 3 + u * (r[2] - 6)) / atlas.w, 1 - (r[1] + 3 + (1 - v) * (r[3] - 6)) / atlas.h];
  const pos: number[] = [];
  const uv: number[] = [];
  const v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const hs of houses) {
    const put = (p: readonly number[], t: [number, number]) => {
      v.set(p[0], p[1], p[2]).applyAxisAngle(up, hs.yaw);
      pos.push(hs.x + v.x, hs.y + v.y, hs.z + v.z);
      uv.push(t[0], t[1]);
    };
    /** a face: its four corners (bottom left, bottom right, top right, top left, seen from outside) */
    const quad = (a: number[], b: number[], c: number[], d: number[], r: Rect) => {
      const ta = uvOf(r, 0, 0);
      const tb = uvOf(r, 1, 0);
      const tc = uvOf(r, 1, 1);
      const td = uvOf(r, 0, 1);
      put(a, ta);
      put(b, tb);
      put(c, tc);
      put(a, ta);
      put(c, tc);
      put(d, td);
    };
    const hw = hs.w / 2;
    const hd = hs.d / 2;
    const lift = hs.lift ?? 0;
    const H = lift + hs.h;
    // (on the ground: a little down into it, so a house on a slope never shows a gap under its
    //  walls; on stilts: the floor itself)
    const B = lift > 0 ? lift : -0.6;
    quad([-hw, B, hd], [hw, B, hd], [hw, H, hd], [-hw, H, hd], hs.front);
    quad([hw, B, hd], [hw, B, -hd], [hw, H, -hd], [hw, H, hd], hs.side);
    quad([hw, B, -hd], [-hw, B, -hd], [-hw, H, -hd], [hw, H, -hd], hs.side);
    quad([-hw, B, -hd], [-hw, B, hd], [-hw, H, hd], [-hw, H, -hd], hs.side);
    if (lift > 0) quad([-hw, B, hd], [hw, B, hd], [hw, B, -hd], [-hw, B, -hd], atlas.trim);
    // the hipped roof: eaves a little past the walls, the ridge along the house's longer side,
    // each slope covered once by the roofing picture
    const E = Math.min(0.4, hs.w * 0.08);
    const ew = hw + E;
    const ed = hd + E;
    const y1 = H + hs.roofRise;
    const R = hs.roof;
    const fl = [-ew, H, ed];
    const fr = [ew, H, ed];
    const br = [ew, H, -ed];
    const bl = [-ew, H, -ed];
    const tri = (a: number[], b: number[], c: number[]) => {
      put(a, uvOf(R, 0, 0));
      put(b, uvOf(R, 1, 0));
      put(c, uvOf(R, 0.5, 1));
    };
    if (ed >= ew) {
      const ridge = ed - ew;
      const rf = [0, y1, ridge];
      const rb = [0, y1, -ridge];
      tri(fl, fr, rf);
      tri(br, bl, rb);
      quad(fr, br, rb, rf, R);
      quad(bl, fl, rf, rb, R);
    } else {
      const ridge = ew - ed;
      const rl = [-ridge, y1, 0];
      const rr = [ridge, y1, 0];
      quad(fl, fr, rr, rl, R);
      quad(br, bl, rl, rr, R);
      tri(fr, br, rr);
      tri(bl, fl, rl);
    }
    // (the underside of the overhang)
    quad([-ew, H - 0.02, -ed], [ew, H - 0.02, -ed], [ew, H - 0.02, ed], [-ew, H - 0.02, ed], atlas.trim);
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
  const mat = new THREE.MeshStandardMaterial({ map: map ?? undefined, color: map ? "#ffffff" : "#e9d9b8", roughness: 0.75, emissive: "#ffffff", emissiveMap: map ?? undefined, emissiveIntensity: map ? 0.24 : 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `${atlas.name}-painted`;
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
