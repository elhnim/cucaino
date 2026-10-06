// One painted building (plan: registry/paintedBuildings.ts): four walls, a hipped roof with
// overhanging eaves, a plinth and a doorstep — plain shapes, finished in real painted artwork. The
// front wall carries the whole front elevation (door, windows, awning, sign); the sides and back
// carry the side wall; the roof its covering, tiled across each slope.
// Built about its own centre on the ground, the front facing +z (buildPark turns it to the plaza).
import * as THREE from "three";
import type { PaintedBuilding } from "../registry/paintedBuildings";

const ART = "/park-assets/buildings/";

export interface PaintedBuildingModel {
  group: THREE.Group;
  /** the paint glows a little after dark, the windows and lamps with it */
  setGlow(glow: number): void;
  dispose(): void;
}

export function buildPaintedBuilding(def: PaintedBuilding, opts: { lowQuality?: boolean } = {}): PaintedBuildingModel {
  const group = new THREE.Group();
  group.name = `painted-${def.place}`;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const loader = new THREE.TextureLoader();
  const tex = (file: string, rx = 1, ry = 1) => {
    if (typeof document === "undefined") return null;
    const t = keep(loader.load(ART + file));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = opts.lowQuality ? 2 : 8;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  };
  const painted: THREE.MeshStandardMaterial[] = [];
  const paint = (map: THREE.Texture | null, fallback: string, rough = 0.7) => {
    const m = keep(new THREE.MeshStandardMaterial({ map: map ?? undefined, color: map ? "#ffffff" : fallback, roughness: rough, emissive: "#ffffff", emissiveMap: map ?? undefined, emissiveIntensity: map ? 0.24 : 0 }));
    if (map) painted.push(m);
    return m;
  };
  const trim = keep(new THREE.MeshStandardMaterial({ color: def.trim ?? "#f3ecdc", roughness: 0.75 }));
  const { w, h, d } = def;
  const mFront = paint(tex(`${def.art}-${def.front ?? "front"}.webp`), "#e9c9c9");
  const mSide = paint(tex(`${def.art}-side.webp`), "#e2d6c2");
  // (the back is the side wall again, repeated so it isn't stretched across a wider wall)
  const mBack = paint(tex(`${def.art}-side.webp`, Math.max(1, Math.round(w / d)), 1), "#e2d6c2");
  const add = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(keep(g), m);
    o.position.set(x, y, z);
    o.castShadow = !opts.lowQuality;
    o.receiveShadow = true;
    group.add(o);
    return o;
  };
  const PLINTH = 0.14;
  // (BoxGeometry's faces: +x, -x, +y, -y, +z front, -z back)
  add(new THREE.BoxGeometry(w + 0.24, PLINTH, d + 0.24), trim, 0, PLINTH / 2, 0);
  add(new THREE.BoxGeometry(w, h, d), [mSide, mSide, trim, trim, mFront, mBack], 0, PLINTH + h / 2, 0);

  const top = PLINTH + h;
  const EAVE = 0.34;
  if (def.roofRise > 0.05) {
    // a hipped roof: four slopes up to a ridge along the building's length (no gable ends to fill)
    const hw = w / 2 + EAVE;
    const hd = d / 2 + EAVE;
    const ridge = Math.max(0, hw - hd); // half the ridge's length
    const y0 = top;
    const y1 = top + def.roofRise;
    const P = {
      a: [-hw, y0, hd], // front left
      b: [hw, y0, hd], // front right
      c: [hw, y0, -hd], // back right
      e: [-hw, y0, -hd], // back left
      r0: [-ridge, y1, 0],
      r1: [ridge, y1, 0],
    } as const;
    const pos: number[] = [];
    const uv: number[] = [];
    const TILE = 2.6; // one repeat of the roof covering, in world units
    const face = (pts: readonly (readonly number[])[], along: readonly number[]) => {
      // u runs along the eave, v up the slope (so the tiles lie the right way on every side)
      const o = pts[0];
      const ax = along[0];
      const az = along[2];
      const slope = Math.hypot(def.roofRise, hd);
      for (const [i, j, k] of pts.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]]) {
        for (const p of [pts[i], pts[j], pts[k]]) {
          pos.push(p[0], p[1], p[2]);
          const u = ((p[0] - o[0]) * ax + (p[2] - o[2]) * az) / TILE;
          const v = (((p[1] - y0) / (def.roofRise || 1)) * slope) / TILE;
          uv.push(u, v);
        }
      }
    };
    face([P.a, P.b, P.r1, P.r0], [1, 0, 0]); // front slope
    face([P.c, P.e, P.r0, P.r1], [-1, 0, 0]); // back slope
    face([P.b, P.c, P.r1], [0, 0, -1]); // right hip
    face([P.e, P.a, P.r0], [0, 0, 1]); // left hip
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mRoof = paint(tex(`${def.art}-roof.webp`), "#b5574a", 0.85);
    mRoof.side = THREE.DoubleSide;
    add(g, mRoof);
    // a painted fascia board under the eaves, and a ridge cap
    add(new THREE.BoxGeometry(w + EAVE * 2, 0.16, d + EAVE * 2), trim, 0, top - 0.02, 0);
    if (ridge > 0.05) add(new THREE.BoxGeometry(ridge * 2 + 0.2, 0.12, 0.2), trim, 0, y1, 0);
  } else {
    // a flat roof behind a low parapet
    add(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2), trim, 0, top + 0.15, 0);
    add(new THREE.BoxGeometry(w - 0.3, 0.06, d - 0.3), paint(tex(`${def.art}-roof.webp`, w / 2.6, d / 2.6), "#8d8f96", 0.9), 0, top + 0.31, 0);
  }
  // a doorstep
  add(new THREE.BoxGeometry(Math.min(2.2, w * 0.4), 0.1, 0.5), trim, 0, 0.05, d / 2 + 0.3);

  return {
    group,
    setGlow(glow) {
      for (const m of painted) m.emissiveIntensity = 0.22 + glow * 0.36;
    },
    dispose() {
      for (const x of disposables) x.dispose();
    },
  };
}
