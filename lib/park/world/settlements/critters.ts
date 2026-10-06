// Small life, shared by every settlement: chickens pecking, a cat asleep on a step, ducks paddling
// (Lakeside's water only), a dog trotting a loop who ambles over when the kid's close, and
// butterflies looping over the flowers. One geometry (five variants merged, the same "aVar
// collapse" trick crowd.ts's hand tools use), ONE instanced mesh per settlement (shares the
// village's own folk material — no new draw call type, just one more instanced mesh, same as the
// fauna/canoes already do), pure allocation-free stepping (index.ts owns the THREE.Matrix4/Vector3
// scratch and writes the instances, same pattern as its canoe/fauna loops).
import * as THREE from "three";
import type { SettlementDef } from "../../registry/settlements";
import { SETTLE_WATER_Y } from "../../registry/settlements";
import { groundY } from "../../registry/terrain";
import { ball, box, cyl, fp, lump, mergeAll, place, stick, v3 } from "../village/kit";

export const CRITTER_KIND = { chicken: 0, cat: 1, duck: 2, dog: 3, butterfly: 4 } as const;
export type CritterKind = (typeof CRITTER_KIND)[keyof typeof CRITTER_KIND];

/** one critter's live state (mutated in place every frame — never reallocated) */
export interface CritterState {
  kind: CritterKind;
  x: number;
  z: number;
  yaw: number;
  /** home spot it wanders near (or, the dog, its patrol centre) */
  hx: number;
  hz: number;
  scale: number;
  seed: number;
  /** a little per-instance colour variety (feathers/fur), applied via the instance colour slot */
  color: THREE.Color;
  /** this frame's extra vertical offset (pecking bob, wing flap lift) — index.ts adds it to groundY */
  bob: number;
  /** this frame's extra roll (butterflies banking, ducks waddling) */
  roll: number;
  /** on water (ducks): index.ts uses the lake level instead of groundY */
  afloat: boolean;
}

const CHICKEN_COLORS = ["#f2ede0", "#c98a4a", "#5a4a3a", "#e8d9a8"];
const CAT_COLORS = ["#3a342e", "#c98a4a", "#e8d9a8", "#8a8478"];
const DUCK_COLORS = ["#4a3a28", "#e8d9a8", "#2a2a2a"];
const DOG_COLORS = ["#c98a4a", "#8a6238", "#3a342e", "#e8d9a8"];
const BUTTERFLY_COLORS = ["#ff8a3c", "#4fb4e8", "#e03c8a", "#ffd24a"];

/** every variant, built small (a real chicken/cat/duck/dog/butterfly is TRUE-ish size here, not a
 *  toy), in its own local "feet at y=0, facing +z" space, tagged with its own aVar so one instanced
 *  mesh can show any of them (non-matching vertices collapse to nothing per instance) */
export function buildCrittersGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const V = CRITTER_KIND;

  // chicken: a round body, a small head, a comb, two thin legs — slot 1 (instance colour) for the
  // body/head feathers, slot 0 (fixed) for the comb and beak
  parts.push(fp(lump(0.16, 0, 0.17, 0, 2, 1.15, 1, 1, 0.22), "#fff", 1, V.chicken));
  parts.push(fp(ball(0.09, 0, 0.27, 0.15, 0, 1, 1, 1), "#fff", 1, V.chicken));
  parts.push(fp(place(new THREE.ConeGeometry(0.035, 0.07, 4), 0, 0.26, 0.23, Math.PI / 2), "#e8a23c", 0, V.chicken));
  parts.push(fp(place(new THREE.ConeGeometry(0.03, 0.06, 4), 0, 0.35, 0.16, 0), "#d8394a", 0, V.chicken));
  for (const s of [-0.05, 0.05]) parts.push(fp(cyl(0.012, 0.012, 0.16, 4, s, 0, 0), "#d8a23c", 0, V.chicken));

  // cat: a curled, flattened lump for the sleeping body, a small head tucked in, a curled tail —
  // all at ground level (it's asleep)
  parts.push(fp(lump(0.22, 0, 0.11, 0, 5, 1.3, 0.78, 1.0, 0.2), "#fff", 1, V.cat));
  parts.push(fp(ball(0.11, 0.16, 0.14, 0.05, 0, 1, 0.95, 1), "#fff", 1, V.cat));
  for (const s of [-0.055, 0.055]) parts.push(fp(place(new THREE.ConeGeometry(0.035, 0.06, 4), 0.2 + s * 0.3, 0.21, 0.02, 0), "#fff", 1, V.cat));
  parts.push(fp(stick(v3(-0.18, 0.1, -0.08), v3(-0.3, 0.2, -0.2), 0.035), "#fff", 1, V.cat));

  // duck: a teardrop body, a round head, an orange bill — rides the water, so no legs needed
  parts.push(fp(lump(0.15, 0, 0.12, 0, 7, 1.2, 1.05, 1.5, 0.2), "#fff", 1, V.duck));
  parts.push(fp(ball(0.08, 0, 0.2, 0.18, 0, 1, 1, 1), "#fff", 1, V.duck));
  parts.push(fp(place(new THREE.ConeGeometry(0.032, 0.09, 4), 0, 0.19, 0.27, Math.PI / 2), "#e8a23c", 0, V.duck));

  // dog: an elongated body on four legs, a head, two ears, a wagging-shaped tail
  parts.push(fp(lump(0.2, 0, 0.26, 0, 3, 1.5, 1, 1, 0.2), "#fff", 1, V.dog));
  parts.push(fp(ball(0.13, 0, 0.34, 0.26, 0, 1, 0.95, 1.05), "#fff", 1, V.dog));
  parts.push(fp(place(new THREE.ConeGeometry(0.04, 0.08, 4), 0, 0.43, 0.33, Math.PI / 2), "#2a2420", 0, V.dog));
  for (const s of [-0.09, 0.09]) parts.push(fp(place(box(0.05, 0.1, 0.03), s, 0.44, 0.2, 0), "#fff", 1, V.dog));
  for (const [sx, sz] of [[0.1, 0.18], [-0.1, 0.18], [0.1, -0.18], [-0.1, -0.18]]) parts.push(fp(cyl(0.028, 0.032, 0.26, 5, sx, 0, sz), "#fff", 1, V.dog));
  parts.push(fp(stick(v3(0, 0.34, -0.26), v3(0.08, 0.5, -0.4), 0.03), "#fff", 1, V.dog));

  // butterfly: two flat wing pairs in a bright colour, a tiny dark body
  parts.push(fp(stick(v3(0, 0, 0), v3(0, 0.02, 0.1), 0.012), "#2a2420", 0, V.butterfly));
  const wing = (sx: number) =>
    place(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute([0, 0, 0, sx * 0.01, 0.01, 0.16, sx * 0.22, 0.03, 0.08, 0, 0, 0, sx * 0.22, 0.03, 0.08, sx * 0.18, 0.01, -0.06], 3)
      ),
      0,
      0.02,
      0.02
    );
  parts.push(fp(wing(1), "#fff", 1, V.butterfly));
  parts.push(fp(wing(-1), "#fff", 1, V.butterfly));

  return mergeAll(parts);
}

/** a tiny seeded PRNG (xorshift), matching registry/settlements.ts's own — deterministic per village */
function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** this village's own critters, picked to fit its style — home spots read straight off its huts,
 *  props and pier (no new registry fields needed): Lakeside gets chickens + a cat by the land huts,
 *  ducks out past the pier, and a dog; Highstone gets chickens + a cat by the cottages and a
 *  sheepdog; Treetop (no ground-floor doors to peck round) gets butterflies over its garden and a
 *  dog, plus a cat curled at a tree's foot */
export function makeCritters(def: SettlementDef): CritterState[] {
  const rnd = rngOf(def.x * 131 + def.z * 977 + 17);
  const out: CritterState[] = [];
  const add = (kind: CritterKind, hx: number, hz: number, colors: string[], scale = 1) => {
    out.push({ kind, x: hx, z: hz, yaw: rnd() * Math.PI * 2, hx, hz, scale, seed: rnd() * 1000, color: new THREE.Color(colors[Math.floor(rnd() * colors.length)]), bob: 0, roll: 0, afloat: kind === CRITTER_KIND.duck });
  };

  if (def.style === "lakeside") {
    const land = def.huts.filter((h) => !h.shore);
    for (let i = 0; i < Math.min(4, land.length * 2); i++) {
      const h = land[i % land.length];
      add(CRITTER_KIND.chicken, h.x + (rnd() - 0.5) * 3, h.z + (rnd() - 0.5) * 3, CHICKEN_COLORS, 0.85 + rnd() * 0.3);
    }
    if (land[0]) add(CRITTER_KIND.cat, land[0].x + Math.sin(land[0].yaw) * (land[0].size * 1.3 + 0.4), land[0].z + Math.cos(land[0].yaw) * (land[0].size * 1.3 + 0.4), CAT_COLORS, 0.9);
    if (def.pier) {
      const mx = (def.pier.ax + def.pier.bx) / 2;
      const mz = (def.pier.az + def.pier.bz) / 2;
      const sideX = Math.cos(Math.atan2(def.pier.bx - def.pier.ax, def.pier.bz - def.pier.az));
      for (let i = 0; i < 3; i++) add(CRITTER_KIND.duck, mx + sideX * (3 + i * 1.6), mz - sideX * 0 + (rnd() - 0.5) * 4, DUCK_COLORS, 0.9 + rnd() * 0.2);
    }
    add(CRITTER_KIND.dog, def.x, def.z, DOG_COLORS, 1);
  } else if (def.style === "mountain") {
    for (let i = 0; i < Math.min(4, def.huts.length); i++) {
      const h = def.huts[i];
      add(CRITTER_KIND.chicken, h.x + (rnd() - 0.5) * 3.5, h.z + (rnd() - 0.5) * 3.5, CHICKEN_COLORS, 0.85 + rnd() * 0.3);
    }
    if (def.huts[1]) add(CRITTER_KIND.cat, def.huts[1].x + Math.sin(def.huts[1].yaw) * (def.huts[1].size * 1.3 + 0.4), def.huts[1].z + Math.cos(def.huts[1].yaw) * (def.huts[1].size * 1.3 + 0.4), CAT_COLORS, 0.9);
    add(CRITTER_KIND.dog, def.x, def.z, DOG_COLORS, 1.05);
  } else if (def.style === "treehouse") {
    const flowers = def.props.filter((p) => p.kind === "gardenleaf");
    for (let i = 0; i < Math.min(5, Math.max(2, flowers.length)); i++) {
      const f = flowers[i % Math.max(1, flowers.length)] ?? { x: def.x, z: def.z };
      add(CRITTER_KIND.butterfly, f.x + (rnd() - 0.5) * 2, f.z + (rnd() - 0.5) * 2, BUTTERFLY_COLORS, 0.8 + rnd() * 0.4);
    }
    const tree = def.huts[0];
    if (tree) add(CRITTER_KIND.cat, tree.x + Math.sin(tree.yaw + 1) * 1.6, tree.z + Math.cos(tree.yaw + 1) * 1.6, CAT_COLORS, 0.85);
    add(CRITTER_KIND.dog, def.x, def.z, DOG_COLORS, 1);
  } else if (def.style === "town") {
    // Sunnybrook: chickens scratching round the grocer's and the general store, a cat asleep on the
    // bakery's step, a dog ambling the square
    const yards = def.huts.filter((h) => h.kind === "shop-grocer" || h.kind === "shop-general");
    for (let i = 0; i < Math.min(4, yards.length * 2); i++) {
      const h = yards[i % Math.max(1, yards.length)] ?? def.huts[0];
      add(CRITTER_KIND.chicken, h.x + (rnd() - 0.5) * 3.2, h.z + (rnd() - 0.5) * 3.2, CHICKEN_COLORS, 0.85 + rnd() * 0.3);
    }
    const bakery = def.huts.find((h) => h.kind === "shop-bakery");
    if (bakery) add(CRITTER_KIND.cat, bakery.x + Math.sin(bakery.yaw) * (bakery.size * 1.3 + 0.5), bakery.z + Math.cos(bakery.yaw) * (bakery.size * 1.3 + 0.5), CAT_COLORS, 0.9);
    add(CRITTER_KIND.dog, def.x, def.z, DOG_COLORS, 1);
  } else if (def.style === "basecamp") {
    // a camp dog patrolling the tents — real expedition base camps always have one; no chickens or
    // a sleeping cat this high up the mountain
    add(CRITTER_KIND.dog, def.x, def.z, DOG_COLORS, 1.05);
  } else if (def.style === "farm") {
    // Dionisio's farmyard: chickens scratching round the farmhouse and barn, a cat asleep on the
    // farmhouse step, a farm dog patrolling — the classic farmyard trio
    for (let i = 0; i < Math.min(4, def.huts.length * 2); i++) {
      const h = def.huts[i % def.huts.length];
      add(CRITTER_KIND.chicken, h.x + (rnd() - 0.5) * 3.4, h.z + (rnd() - 0.5) * 3.4, CHICKEN_COLORS, 0.85 + rnd() * 0.3);
    }
    const farmhouse = def.huts.find((h) => h.kind === "farmhouse") ?? def.huts[0];
    if (farmhouse) add(CRITTER_KIND.cat, farmhouse.x + Math.sin(farmhouse.yaw) * (farmhouse.size * 1.3 + 0.4), farmhouse.z + Math.cos(farmhouse.yaw) * (farmhouse.size * 1.3 + 0.4), CAT_COLORS, 0.9);
    add(CRITTER_KIND.dog, def.x, def.z, DOG_COLORS, 1);
  }
  return out;
}

const _tmp = { x: 0, z: 0 };
const TAU = Math.PI * 2;
/** steer `from` toward `target` by the shortest way round (never the "long way", which an
 *  unwrapped angle subtraction would occasionally take, spiralling a chaser wide of its target) */
function turnToward(from: number, target: number, k: number): number {
  let d = (target - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return from + d * k;
}

/** step every critter (pure, allocation-free): chickens/cats stay near home with a tiny idle
 *  wander; ducks paddle a slow loop; the dog patrols near its home and ambles toward the kid when
 *  they're close (never all the way — it still "belongs" to the village); butterflies loop over
 *  their flower */
export function stepCritters(list: CritterState[], dt: number, t: number, kid: { x: number; z: number }): void {
  for (const c of list) {
    const ph = t * 0.6 + c.seed;
    switch (c.kind) {
      case CRITTER_KIND.chicken: {
        const wx = c.hx + Math.sin(ph * 0.5) * 0.9;
        const wz = c.hz + Math.cos(ph * 0.7) * 0.9;
        c.yaw = turnToward(c.yaw, Math.atan2(wx - c.x, wz - c.z), Math.min(1, dt * 2));
        c.x += Math.sin(c.yaw) * dt * 0.35;
        c.z += Math.cos(c.yaw) * dt * 0.35;
        c.bob = Math.max(0, Math.sin(ph * 3)) * 0.05;
        c.roll = 0;
        break;
      }
      case CRITTER_KIND.cat: {
        c.bob = Math.sin(ph * 1.1) * 0.012; // breathing
        c.roll = 0;
        break;
      }
      case CRITTER_KIND.duck: {
        const a = ph * 0.35;
        c.x = c.hx + Math.sin(a) * 1.6;
        c.z = c.hz + Math.cos(a) * 1.6 * 0.6;
        c.yaw = a + Math.PI / 2;
        c.bob = Math.sin(ph * 4) * 0.015;
        c.roll = Math.sin(ph * 2.2) * 0.08;
        break;
      }
      case CRITTER_KIND.dog: {
        const dKid = Math.hypot(kid.x - c.hx, kid.z - c.hz);
        if (dKid < 26) {
          _tmp.x = kid.x + Math.sin(c.seed) * 2.2;
          _tmp.z = kid.z + Math.cos(c.seed) * 2.2;
        } else {
          _tmp.x = c.hx + Math.sin(ph * 0.4) * 5;
          _tmp.z = c.hz + Math.cos(ph * 0.55) * 5;
        }
        const toX = _tmp.x - c.x;
        const toZ = _tmp.z - c.z;
        const d = Math.hypot(toX, toZ);
        if (d > 0.05) {
          c.yaw = turnToward(c.yaw, Math.atan2(toX, toZ), Math.min(1, dt * 3));
          const speed = Math.min(1.8, d * 0.8);
          c.x += Math.sin(c.yaw) * speed * dt;
          c.z += Math.cos(c.yaw) * speed * dt;
        }
        c.bob = Math.abs(Math.sin(ph * 5)) * 0.03;
        c.roll = 0;
        break;
      }
      case CRITTER_KIND.butterfly: {
        const a = ph * 1.3;
        c.x = c.hx + Math.sin(a) * 0.7;
        c.z = c.hz + Math.cos(a * 1.3) * 0.7;
        c.bob = 0.45 + Math.sin(ph * 2.4) * 0.12;
        c.yaw = a + Math.PI / 2;
        c.roll = Math.sin(ph * 9) * 0.5;
        break;
      }
    }
  }
}

/** the ground (or water) height a critter should sit at right now */
export function critterGroundY(c: CritterState): number {
  return (c.afloat ? SETTLE_WATER_Y : groundY(c.x, c.z)) + c.bob;
}
