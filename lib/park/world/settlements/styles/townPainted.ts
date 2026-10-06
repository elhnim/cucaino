// Sunnybrook's painted houses and shops: every one of them in ONE mesh wearing ONE picture
// (public/park-assets/buildings/town-atlas.webp, packed by scripts/town-atlas.mjs from the
// townhouse artwork in codex-world-art/villages/) — so a whole street of real painted fronts costs
// the town a single extra draw call. Each house is four walls (its front picture on the wall that
// faces the square, its side wall on the other three) under a hipped roof in tile or slate.
import * as THREE from "three";

export interface TownHouse {
  x: number;
  /** the ground under it */
  y: number;
  z: number;
  yaw: number;
  /** the front wall's width, the walls' height, the depth front to back, the roof's rise */
  w: number;
  h: number;
  d: number;
  roofRise: number;
  /** which front it wears: 0 pink bakery, 1 blue florist, 2 yellow toy shop, 3 timbered bookshop */
  art: number;
  /** its roof covering: 0 red tile, 1 slate */
  roof: number;
}

export interface TownPainted {
  mesh: THREE.Mesh;
  setGlow(glow: number): void;
  dispose(): void;
}

// the atlas's layout (pixels; scripts/town-atlas.mjs writes the same)
const AW = 2048;
const AH = 1024;
type Rect = [x: number, y: number, w: number, h: number];
const FRONT = (i: number): Rect => [i * 512, 0, 512, 768];
const SIDE = (i: number): Rect => [i * 192, 768, 192, 256];
const ROOF = (i: number): Rect => [768 + i * 256, 768, 256, 256];
/** a rectangle's corner in texture space, kept a couple of pixels inside so neighbours never bleed in */
const uvOf = (r: Rect, u: number, v: number): [number, number] => [(r[0] + 3 + u * (r[2] - 6)) / AW, 1 - (r[1] + 3 + (1 - v) * (r[3] - 6)) / AH];

export function buildTownPainted(houses: TownHouse[], opts: { lowQuality?: boolean } = {}): TownPainted {
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
    /** a wall: its four corners (bottom left, bottom right, top right, top left, seen from outside) */
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
    const H = hs.h;
    // (a little down into the ground, so a house on a slope never shows a gap under its walls)
    const B = -0.6;
    quad([-hw, B, hd], [hw, B, hd], [hw, H, hd], [-hw, H, hd], [FRONT(hs.art)[0], FRONT(hs.art)[1], 512, 768]);
    quad([hw, B, hd], [hw, B, -hd], [hw, H, -hd], [hw, H, hd], SIDE(hs.art));
    quad([hw, B, -hd], [-hw, B, -hd], [-hw, H, -hd], [hw, H, -hd], SIDE(hs.art));
    quad([-hw, B, -hd], [-hw, B, hd], [-hw, H, hd], [-hw, H, -hd], SIDE(hs.art));
    // the hipped roof: eaves a little past the walls, a ridge along the house's depth (it is a
    // narrow townhouse: deeper than wide), each slope covered once by the roofing picture
    const E = 0.4;
    const ew = hw + E;
    const ed = hd + E;
    const ridge = Math.max(0, ed - ew);
    const y1 = H + hs.roofRise;
    const R = ROOF(hs.roof);
    const fl = [-ew, H, ed];
    const fr = [ew, H, ed];
    const br = [ew, H, -ed];
    const bl = [-ew, H, -ed];
    const rf = [0, y1, ridge];
    const rb = [0, y1, -ridge];
    const tri = (a: number[], b: number[], c: number[]) => {
      put(a, uvOf(R, 0, 0));
      put(b, uvOf(R, 1, 0));
      put(c, uvOf(R, 0.5, 1));
    };
    tri(fl, fr, rf); // the front hip
    tri(br, bl, rb); // the back hip
    quad(fr, br, rb, rf, R); // the right slope
    quad(bl, fl, rf, rb, R); // the left slope
    // (a cream fascia under the eaves: the underside of the overhang)
    const trim: Rect = [1280, 768, 128, 128];
    quad([-ew, H - 0.02, -ed], [ew, H - 0.02, -ed], [ew, H - 0.02, ed], [-ew, H - 0.02, ed], trim);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  let map: THREE.Texture | null = null;
  if (typeof document !== "undefined") {
    map = new THREE.TextureLoader().load("/park-assets/buildings/town-atlas.webp");
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = opts.lowQuality ? 2 : 8;
  }
  const mat = new THREE.MeshStandardMaterial({ map: map ?? undefined, color: map ? "#ffffff" : "#e9d9b8", roughness: 0.75, emissive: "#ffffff", emissiveMap: map ?? undefined, emissiveIntensity: map ? 0.24 : 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "town-painted";
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
