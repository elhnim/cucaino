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
  /** the ground under it (filled in by ../index.ts, unless `fixedY`) */
  y: number;
  /** `y` is already right (a hut standing in the shallows at the lake's own level) */
  fixedY?: boolean;
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
  /**
   * a ROUND house (a reed hut, a treehouse cabin, a dome tent) instead of a box: `w` is then its
   * diameter and `d` is unused. Its wall wears two strips like the label round a tin — `front`
   * (the door in its middle) across the side that faces `yaw`, and `side` (the plain back strip)
   * round the rest, repeated `backRepeat` times (default 1: each strip covers half the wall).
   *  "cone": an upright wall under a conical roof whose eaves reach `roofR` (default 1.3 x the wall's radius);
   *  "dome": the two strips over a flattened dome `h` high (a tent) — no separate roof.
   */
  round?: "cone" | "dome";
  backRepeat?: number;
  roofR?: number;
  /** a round wall leaning in a little towards the top (0.9 = its top is 0.9 of its foot), default 1 */
  taper?: number;
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
    const lift = hs.lift ?? 0;
    const H = lift + hs.h;
    if (hs.round) {
      const r0 = hs.w / 2;
      const k = Math.max(1, hs.backRepeat ?? 1);
      const SEG = 8 * (1 + k); // (so every strip starts and ends on a segment's edge)
      /** the wall's picture at angle a (0 = straight ahead, growing to the house's left): which
       *  strip, and how far along it */
      const at = (j: number): { r: Rect; u: number }[] => {
        // segment j runs from unit j / 8 to (j + 1) / 8, in strips: strip 0 is the front, centred on a = 0
        const s0 = Math.floor(j / 8);
        return [
          { r: s0 === 0 ? hs.front : hs.side, u: (j % 8) / 8 },
          { r: s0 === 0 ? hs.front : hs.side, u: ((j % 8) + 1) / 8 },
        ];
      };
      const span = (Math.PI * 2) / (1 + k); // the angle one strip covers
      const ang = (j: number) => -span / 2 + (j / 8) * span; // (the front strip is centred on 0)
      const ring = (rad: number, y: number, j: number) => [Math.sin(ang(j)) * rad, y, Math.cos(ang(j)) * rad];
      const rows = hs.round === "dome" ? 5 : 1;
      const B = lift > 0 ? lift : hs.round === "dome" ? -0.1 : -0.6;
      for (let j = 0; j < SEG; j++) {
        const [ua, ub] = at(j);
        for (let i = 0; i < rows; i++) {
          // (a dome: rings up a flattened quarter-circle; a wall: straight up, leaning in by `taper`)
          const f0 = i / rows;
          const f1 = (i + 1) / rows;
          const rad = (f: number) => (hs.round === "dome" ? r0 * Math.cos((f * Math.PI) / 2) : r0 * (1 + ((hs.taper ?? 1) - 1) * f));
          const hy = (f: number) => (hs.round === "dome" ? B + (H - B) * Math.sin((f * Math.PI) / 2) : B + (H - B) * f);
          // (seen from outside, the picture reads left to right as the angle FALLS)
          const a = ring(rad(f0), hy(f0), j + 1);
          const b = ring(rad(f0), hy(f0), j);
          const c = ring(rad(f1), hy(f1), j);
          const d = ring(rad(f1), hy(f1), j + 1);
          const ta = uvOf(ua.r, 1 - ub.u, f0);
          const tb = uvOf(ua.r, 1 - ua.u, f0);
          const tc = uvOf(ua.r, 1 - ua.u, f1);
          const td = uvOf(ua.r, 1 - ub.u, f1);
          put(a, ta);
          put(b, tb);
          put(c, tc);
          put(a, ta);
          put(c, tc);
          put(d, td);
        }
        if (hs.round === "cone") {
          // the conical roof, a slice per wall segment, each wearing the roofing once (its strands
          // run down the slope); the eaves hang a little below the wall's top
          const rr = hs.roofR ?? r0 * 1.3;
          const e0 = ring(rr, H - 0.12 * hs.roofRise, j + 1);
          const e1 = ring(rr, H - 0.12 * hs.roofRise, j);
          put(e0, uvOf(hs.roof, 0, 0));
          put(e1, uvOf(hs.roof, 1, 0));
          put([0, H + hs.roofRise, 0], uvOf(hs.roof, 0.5, 1));
          // (and its underside, in trim)
          put(e1, uvOf(atlas.trim, 0, 0));
          put(e0, uvOf(atlas.trim, 1, 0));
          put([0, H - 0.02, 0], uvOf(atlas.trim, 0.5, 1));
        }
      }
      continue;
    }
    const hw = hs.w / 2;
    const hd = hs.d / 2;
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
