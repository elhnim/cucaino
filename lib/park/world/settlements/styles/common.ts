// Shared helpers for every settlement style (lakeside.ts / treetop.ts / mountain.ts): the little
// cosy-detail kit (windows, flower boxes, door lamps, washing lines, welcome signposts, path
// stones) plus a few builders every village uses as-is (the fire pit, a bench, a lantern). Kept
// here so three styles don't re-invent the same 15 lines of "a box with a glowing gem on it" —
// see props.ts's old 594-line single file for why this file exists.
import * as THREE from "three";
import type { SettlementDef, SettlementProp } from "../../../registry/settlements";
import { STATIONS } from "../../../registry/railway";
import { groundY } from "../../../registry/terrain";
import { ball, box, cyl, flat, gem, place, pp, stick, v3, type Fx } from "../../village/kit";

export const _c = new THREE.Color();
export const SWAY: Fx = [0, 0.25, 0];
export const GLOW: Fx = [0, 0, 1];
/** a hanging part that both sways in the wind and glows at night (lantern gems, wind chimes) */
export const SWAY_GLOW: Fx = [0, 0.22, 1];
/** a lit window: warm but gentle — a window is a much bigger flat face than a lantern's little
 *  gem, so at the SAME glow strength it blooms into a far bigger halo than a flame ever would;
 *  dialled back so a lit window reads as cosy, not as a second bonfire */
export const WINDOW_GLOW: Fx = [0, 0, 0.4];

export const shade = (hex: string, k: number) => _c.set(hex).multiplyScalar(k).clone();

/** every part, moved up (or down) to the REAL ground at (x, z) — Treetop and Highstone sit much
 *  higher than Lakeside's lake shore, so (unlike Lakeside's props, built assuming y=0 is ~ground)
 *  their own builders are written in local "ground = 0" space and footed here, each at its own
 *  spot's true height, so a cottage never ends up buried in a hillside or a tree floating over one */
export function footed(parts: THREE.BufferGeometry[], x: number, z: number): THREE.BufferGeometry[] {
  const gy = groundY(x, z);
  for (const g of parts) g.translate(0, gy, 0);
  return parts;
}

// ── shared palette bits (every village's own styles/*.ts adds its own on top) ──
export const WOOD = "#8a6238";
export const WOOD_D = "#5e3f22";
export const GLASS_LIT = "#ffdb8a";

/** the fire pit: a ring of stones, charred logs, dancing flames (bright by day, aglow by night)
 *  and a drift of smoke, with a crossbar for the cooking pot — every village's own hearth */
export function buildFirepit(x: number, z: number, stone = "#9a8f7c"): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(1.35, 1.5, 0.3, 10, x, 0, z, true), stone));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(pp(stick(v3(x + Math.sin(a) * 0.4, 0.16, z + Math.cos(a) * 0.4), v3(x - Math.sin(a) * 0.4, 0.16, z - Math.cos(a) * 0.4), 0.22), "#4a3426"));
  }
  const flameAt = (fx: number, fz: number, h: number, r: number, hue: string) => pp(place(new THREE.ConeGeometry(r, h, 5), fx, h / 2 + 0.2, fz, 0, v3(1, 1, 1)), hue, GLOW);
  parts.push(flameAt(x, z, 0.75, 0.28, "#ff8a2a"));
  parts.push(flameAt(x + 0.22, z + 0.1, 0.5, 0.2, "#ffcf4a"));
  parts.push(flameAt(x - 0.2, z - 0.15, 0.55, 0.2, "#ff5a2a"));
  parts.push(...buildSmokePuff(x + 0.1, 1.5, z - 0.1, 0.45));
  parts.push(...buildSmokePuff(x - 0.15, 1.95, z + 0.1, 0.3));
  parts.push(pp(stick(v3(x - 1.1, 1.0, z), v3(x + 1.1, 1.0, z), 0.07), WOOD_D));
  return parts;
}

/** a drift of two soft smoke puffs from a chimney top or a pot (the upper one sways) */
export function buildSmokePuff(x: number, y: number, z: number, r: number): THREE.BufferGeometry[] {
  return [pp(ball(r, x, y, z, 0, 1, 0.8, 1), "#cfcac2"), pp(ball(r * 0.78, x + r * 0.3, y + r, z - r * 0.2, 0, 1, 0.8, 1), "#dedad2", SWAY)];
}

export function buildBench(p: SettlementProp, wood = WOOD): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(place(new THREE.CylinderGeometry(0.18, 0.2, 1.6, 7).rotateZ(Math.PI / 2), p.x, 0.22, p.z, p.yaw), wood));
  for (const s of [-0.6, 0.6]) parts.push(pp(cyl(0.08, 0.08, 0.22, 5, p.x + Math.sin(p.yaw) * s, 0, p.z + Math.cos(p.yaw) * s), WOOD_D));
  return parts;
}

/** a post lantern — now with a touch of sway on the hanging gem, so it reads as gently swinging */
export function buildLantern(p: SettlementProp, hue = "#ffc569"): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(stick(v3(p.x, 0, p.z), v3(p.x, 1.7, p.z), 0.05), WOOD_D));
  parts.push(pp(gem(0.14, p.x, 1.82, p.z, 0.9, 1.4, 0.9), hue, SWAY_GLOW));
  return parts;
}

/** a small lamp mounted right on a wall beside a door — same glow, no post */
export function buildDoorLamp(x: number, z: number, yaw: number, hue = "#ffc569"): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const ax = x + Math.sin(yaw + Math.PI / 2) * 0.1;
  const az = z + Math.cos(yaw + Math.PI / 2) * 0.1;
  parts.push(pp(stick(v3(ax, 1.3, az), v3(ax, 1.55, az), 0.04), WOOD_D));
  parts.push(pp(gem(0.11, ax, 1.55, az, 1, 1.3, 1), hue, SWAY_GLOW));
  return parts;
}

/** a little window: a dark frame, warm amber glass that glows gently at night (saturated enough to
 *  read as "glass catching the light" by day too, same trick the fire pit's own flames use), two
 *  shutters in the clan's trim colour either side */
export function buildWindow(x: number, y: number, z: number, yaw: number, trim: string, w = 0.55, h = 0.6): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  parts.push(pp(box(w + 0.16, h + 0.16, 0.08, x, y, z, yaw), WOOD_D));
  parts.push(pp(box(w, h, 0.1, x + nx * 0.02, y, z + nz * 0.02, yaw), (pt, n) => shade(GLASS_LIT, 0.78 + 0.3 * Math.max(0, n.y)), WINDOW_GLOW));
  const sx = Math.sin(yaw + Math.PI / 2);
  const sz = Math.cos(yaw + Math.PI / 2);
  for (const s of [-1, 1]) {
    const bx = x + sx * s * (w * 0.5 + 0.12) + nx * 0.05;
    const bz = z + sz * s * (w * 0.5 + 0.12) + nz * 0.05;
    parts.push(pp(box(0.14, h + 0.06, 0.07, bx, y, bz, yaw), trim));
  }
  return parts;
}

/** a flower box under a window: a little wooden trough with a row of bright gem blooms */
export function buildFlowerBox(x: number, y: number, z: number, yaw: number, blooms: string[], seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const sx = Math.sin(yaw + Math.PI / 2);
  const sz = Math.cos(yaw + Math.PI / 2);
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  parts.push(pp(box(0.7, 0.16, 0.22, x + nx * 0.14, y, z + nz * 0.14, yaw), WOOD_D));
  for (let i = 0; i < 4; i++) {
    const t = (i - 1.5) * 0.17;
    parts.push(pp(gem(0.08, x + sx * t + nx * 0.16, y + 0.16, z + sz * t + nz * 0.16, 1, 1.3, 1), blooms[(seed + i) % blooms.length]));
  }
  parts.push(pp(flat([[-0.2, 0], [0.2, 0], [0, 0.22]]).rotateX(-Math.PI / 2 + 0.3), "#4a8a3a"));
  return parts;
}

/** a washing line strung between two posts, a few squares of cloth flapping in the wind (vertex
 *  sway) — one or two lines is plenty of life for very little geometry */
export function buildWashingLine(ax: number, az: number, bx: number, bz: number, cloths: string[], seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const y = 1.7;
  for (const [px, pz] of [[ax, az], [bx, bz]] as [number, number][]) parts.push(pp(stick(v3(px, 0, pz), v3(px, y + 0.1, pz), 0.05), WOOD_D));
  parts.push(pp(stick(v3(ax, y, az), v3(bx, y, bz), 0.018), "#cfc3a0"));
  const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 1.1));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const cloth = flat([[-0.26, -0.02], [0.26, -0.02], [0.3, -0.55], [-0.3, -0.55]]);
    parts.push(pp(place(cloth, x, y - 0.02, z), cloths[(seed + i) % cloths.length], SWAY));
  }
  return parts;
}

/** a few flat scattered stepping-stones for a path or the square (cheap way to break up a bare
 *  packed-earth disc into something a kid's eye reads as cobbled/paved) */
export function buildPathStones(cx: number, cz: number, r: number, count: number, seed: number, stone = "#9a8f7c"): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = Math.sqrt(rnd()) * r;
    const x = cx + Math.sin(a) * rad;
    const z = cz + Math.cos(a) * rad;
    const sr = 0.4 + rnd() * 0.35;
    parts.push(pp(cyl(sr, sr * 1.05, 0.08, 6, x, -0.03, z), (pt, n) => shade(stone, 0.82 + 0.28 * Math.max(0, n.y) + rnd() * 0.1 - 0.05)));
  }
  return parts;
}

/** a barrel — storybook-chunky, a cheap bit of market-town/yard dressing every village can use */
export function buildBarrel(x: number, z: number, yaw: number, wood = WOOD, band = WOOD_D, scale = 1): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const r = 0.34 * scale;
  const h = 0.62 * scale;
  parts.push(pp(place(new THREE.CylinderGeometry(r * 0.88, r * 0.88, h, 10), x, h / 2, z, yaw), (pt, n) => shade(wood, 0.82 + 0.22 * Math.max(0, n.y))));
  for (const t of [0.22, 0.5, 0.78]) parts.push(pp(cyl(r * 0.92, r * 0.92, 0.05 * scale, 10, x, h * t, z), band));
  return parts;
}

/** a crate — a simple slatted box, stacked crates/barrels read as "goods" at a glance */
export function buildCrate(x: number, z: number, yaw: number, wood = WOOD, scale = 1): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const s = 0.5 * scale;
  parts.push(pp(place(box(s, s, s), x, s / 2, z, yaw), (pt, n) => shade(wood, 0.8 + 0.25 * Math.max(0, n.y) + 0.2 * Math.max(0, n.x))));
  for (const dy of [0.2, 0.5, 0.8]) parts.push(pp(place(box(s * 1.02, 0.04 * scale, s * 1.02), x, dy * s, z, yaw), WOOD_D));
  return parts;
}

/** a little ground-level flower bed (not under a window): a low ring of mixed blooms, cheap life
 *  to scatter between yards so the ground is never just bare dirt */
export function buildFlowerBed(x: number, z: number, blooms: string[], seed: number, r = 0.5): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(r, r * 1.05, 0.14, 8, x, 0, z), "#4a3a28"));
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const rr = r * 0.62 * (0.6 + 0.4 * Math.sin(i * 3.1 + seed));
    parts.push(pp(gem(0.09, x + Math.sin(a) * rr, 0.22 + 0.05 * (i % 2), z + Math.cos(a) * rr, 1, 1.2, 1), blooms[(seed + i) % blooms.length]));
  }
  return parts;
}

/** a hanging basket of flowers, slung from a bracket on a wall */
export function buildHangingBasket(x: number, y: number, z: number, yaw: number, blooms: string[], seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  parts.push(pp(stick(v3(x, y + 0.22, z), v3(x + nx * 0.22, y + 0.1, z + nz * 0.22), 0.025), WOOD_D));
  parts.push(pp(cyl(0.14, 0.1, 0.14, 8, x + nx * 0.22, y - 0.08, z + nz * 0.22), WOOD_D));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(pp(gem(0.08, x + nx * 0.22 + Math.sin(a) * 0.1, y + 0.03, z + nz * 0.22 + Math.cos(a) * 0.1, 1, 1.1, 1), blooms[(seed + i) % blooms.length], SWAY));
  }
  return parts;
}

/** a short post-and-rail fence panel from a to b — little yard fences between buildings, not the
 *  pasture's own tall fence posts */
export function buildFencePanel(ax: number, az: number, bx: number, bz: number, wood = WOOD_D): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(bx - ax, bz - az);
  const n = Math.max(2, Math.round(len / 1.1));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    parts.push(pp(cyl(0.045, 0.05, 0.62, 5, ax + (bx - ax) * t, 0, az + (bz - az) * t), wood));
  }
  for (const ry of [0.22, 0.46]) parts.push(pp(place(box(0.05, 0.05, len), (ax + bx) / 2, ry, (az + bz) / 2, yaw + Math.PI / 2), wood));
  return parts;
}

/** a simple two-wheeled market cart, a crate or two aboard — parked dressing for a trade corner */
export function buildCart(x: number, z: number, yaw: number, wood = WOOD): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(place(box(1.1, 0.4, 0.75), x, 0.5, z, yaw), (pt, n) => shade(wood, 0.82 + 0.2 * Math.max(0, n.y))));
  for (const s of [-1, 1]) parts.push(pp(place(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10).rotateX(Math.PI / 2), x + Math.sin(yaw + Math.PI / 2) * s * 0.42, 0.28, z + Math.cos(yaw + Math.PI / 2) * s * 0.42, yaw), WOOD_D));
  for (const s of [-1, 1]) parts.push(pp(stick(v3(x + Math.sin(yaw) * 0.7, 0.5, z + Math.cos(yaw) * 0.7), v3(x + Math.sin(yaw) * 1.3, 0.2 + s * 0.1, z + Math.cos(yaw) * 1.3), 0.05), WOOD_D));
  parts.push(...buildCrate(x + Math.sin(yaw) * -0.2, z + Math.cos(yaw) * -0.2, yaw, wood, 0.9));
  return parts;
}

/** a pennant flag on a simple post (not the two-post welcome arch) — for a lookout tower's flag,
 *  a market corner, or just more colour dotted through the square */
export function buildPennant(x: number, z: number, h: number, hue: string): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(stick(v3(x, 0, z), v3(x, h, z), 0.05), WOOD_D));
  const flag = flat([[0, 0], [0.5, -0.07], [0, -0.3]]);
  parts.push(pp(place(flag, x, h, z, 0), hue, SWAY));
  return parts;
}

/** the welcome arch at the path in from the station: two posts, a banner rail in the clan's
 *  colours, and a couple of hanging pennants (no literal text — the engine has no type renderer —
 *  the colour and the emoji-shaped pennant read as "this is the village sign" well enough) */
export function buildWelcomeArch(def: SettlementDef, trim: string[]): THREE.BufferGeometry[] {
  const station = STATIONS.find((s) => s.id === def.stationId);
  const yaw = station ? Math.atan2(def.x - station.x, def.z - station.z) : 0;
  const x = def.x + Math.sin(yaw) * (def.radius - 3);
  const z = def.z + Math.cos(yaw) * (def.radius - 3);
  const sideY = Math.sin(yaw + Math.PI / 2);
  const sideZ = Math.cos(yaw + Math.PI / 2);
  const half = 2.6;
  const h = 3.1;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const px = x + sideY * s * half;
    const pz = z + sideZ * s * half;
    parts.push(pp(cyl(0.14, 0.17, h, 7, px, 0, pz), WOOD_D));
  }
  parts.push(pp(place(box(half * 2 + 0.4, 0.22, 0.22), x, h, z, yaw), WOOD));
  for (let i = 0; i < 5; i++) {
    const t = (i / 4 - 0.5) * (half * 1.7);
    const px = x + sideY * t;
    const pz = z + sideZ * t;
    const sag = 0.18;
    const flag = flat([[0, 0], [0.26, 0], [0.13, -0.38]]);
    parts.push(pp(place(flag, px, h - 0.1 - sag, pz, yaw + Math.PI / 2), trim[i % trim.length], SWAY));
  }
  return footed(parts, x, z);
}
