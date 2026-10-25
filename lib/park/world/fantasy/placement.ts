// Where everything in the fantasy kit goes: groves of trees clustered by noise, scattered rocks
// and boulders, crystal spots, ancient ruin sites, the Glow Forest's giant trees and the
// floating islands in the sky. Pure + deterministic (no three.js) so it's unit tested: nothing
// lands on trails, the stream, the pond, the plaza, places or the Dream Park (via `free`), and
// everything sits on the terrain (groundY).
import { ISLAND_R, TRAIL_WIDTH, nearStream, nearTrail, seaDist } from "../../registry/island";
import { LANDS, PLACES, GROUND_KEEPOUTS } from "../../registry/places";
import { groundY, slopeAt } from "../../registry/terrain";
import { zoneBounds } from "../../builder/rules";
import { SKY_ISLANDS, skyBaseY } from "../../registry/skyIslands";
import { fbm2, noise2, rngOf, type Rng } from "./noise";

export type FreeFn = (x: number, z: number, pad: number) => boolean;

export type Species = "oak" | "pine" | "birch" | "spirit";
export const SPECIES: Species[] = ["oak", "pine", "birch", "spirit"];

export interface TreeSpot {
  species: Species;
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  /** 0..1 colour variation (warm .. cool) */
  tint: number;
}
export interface RockSpot {
  x: number;
  y: number;
  z: number;
  /** overall size + squash */
  s: number;
  sx: number;
  sy: number;
  sz: number;
  rot: number;
  tilt: number;
  big: boolean;
}
export interface CrystalSpot {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  tiltX: number;
  tiltZ: number;
  /** 0 cyan, 1 violet, 2 gold */
  hue: 0 | 1 | 2;
}
export type RuinPartKind = "pillar" | "broken" | "toppled" | "stone" | "arch" | "steps" | "altar" | "block";
export interface RuinPart {
  kind: RuinPartKind;
  x: number;
  y: number;
  z: number;
  rot: number;
  /** height (pillars, stones) or size multiplier */
  h: number;
  /** a free seed for the geometry's little irregularities */
  seed: number;
  /** stones and altars carry glowing runes */
  runes: boolean;
}
export type RuinKind = "ring" | "arch" | "colonnade" | "shrine";
export interface RuinSite {
  kind: RuinKind;
  x: number;
  y: number;
  z: number;
  r: number;
  rot: number;
  parts: RuinPart[];
}
export interface GiantSpot {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
}
export interface MushroomSpot {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  /** 0 cyan, 1 violet, 2 amber */
  hue: 0 | 1 | 2;
}
export interface ShaftSpot {
  x: number;
  y: number;
  z: number;
  h: number;
  r: number;
  rot: number;
}
/** a floating island, as the rest of the kit sees it (derived from registry/skyIslands.ts):
 *  x/y/z is an open spot on its walkable top (the landing spot, where a Star Shard waits) */
export interface IslandSpot {
  /** the sky island's id (registry/skyIslands.ts) */
  id: string;
  x: number;
  y: number;
  z: number;
  r: number;
  rot: number;
  seed: number;
  /** which side the waterfall pours off (radians, atan2(dx, dz)) */
  fall: number;
  /** what stands on top */
  top: "tree" | "ruin" | "crystals";
}
export interface Obstacle {
  x: number;
  z: number;
  r: number;
}
export interface FantasyPlan {
  trees: TreeSpot[];
  rocks: RockSpot[];
  crystals: CrystalSpot[];
  ruins: RuinSite[];
  giants: GiantSpot[];
  mushrooms: MushroomSpot[];
  shafts: ShaftSpot[];
  islands: IslandSpot[];
  obstacles: Obstacle[];
}

const FOREST = LANDS.find((l) => l.id === "forest")!;

/** An equivalent of the park's placement predicate, built from island.ts / places.ts / rules.ts
 * (the park passes its own; the harness and tests use this). */
export function defaultFantasyFree(): FreeFn {
  const zb = zoneBounds();
  return (x, z, pad) => {
    const r = Math.hypot(x, z);
    if (r < 12 + pad) return false; // the plaza and its benches
    if (seaDist(x, z) > -6 - pad) return false; // the beach
    if (x > zb.minX - pad - 1 && x < zb.maxX + pad + 1 && z > zb.minZ - pad - 1 && z < zb.maxZ + pad + 1) return false;
    if (nearTrail(x, z, TRAIL_WIDTH / 2 + pad + 0.6)) return false;
    if (nearStream(x, z, pad + 1.2)) return false;
    if (GROUND_KEEPOUTS.some((p) => Math.hypot(x - p.x, z - p.z) < Math.max(p.radius, 1.5) + pad + 1.5)) return false;
    // lands have their own furniture; the Glow Forest is ours to fill
    if (LANDS.some((l) => l.id !== "forest" && Math.hypot(x - l.x, z - l.z) < l.radius + pad)) return false;
    return true;
  };
}

interface Taken {
  x: number;
  z: number;
  r: number;
}

function clear(taken: Taken[], x: number, z: number, r: number) {
  for (const t of taken) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + r) ** 2) return false;
  return true;
}

function onIsland(r: Rng, minR: number, maxR: number): [number, number] {
  const a = r() * Math.PI * 2;
  const d = Math.sqrt(minR * minR + r() * (maxR * maxR - minR * minR));
  return [Math.sin(a) * d, Math.cos(a) * d];
}

/** how level a spot is over a radius (max slope sampled on a ring) */
function roughness(x: number, z: number, rad: number) {
  let m = slopeAt(x, z);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    m = Math.max(m, slopeAt(x + Math.sin(a) * rad, z + Math.cos(a) * rad));
  }
  return m;
}

// ── ruins: each kind is a little recipe of parts in site-local coordinates ──
function ruinParts(kind: RuinKind, r: Rng): { parts: Omit<RuinPart, "y">[]; radius: number } {
  const parts: Omit<RuinPart, "y">[] = [];
  const P = (kind: RuinPartKind, x: number, z: number, rot: number, h: number, runes = false) => parts.push({ kind, x, z, rot, h, seed: Math.floor(r() * 1e6), runes });
  if (kind === "ring") {
    // a ring of standing stones with glowing runes around a rune altar; one stone has fallen
    const n = 9;
    const rad = 7.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.12;
      const x = Math.sin(a) * rad;
      const z = Math.cos(a) * rad;
      if (i === 4) P("block", x * 1.08, z * 1.08, a + 1.2, 1.6);
      else P("stone", x, z, a, 4.2 + r() * 2.2, true);
    }
    P("altar", 0, 0, r() * Math.PI, 1, true);
    P("steps", 0, -rad - 2.6, 0, 1);
    return { parts, radius: rad + 3.2 };
  }
  if (kind === "arch") {
    // a great broken arch over mossy steps, a toppled pillar and scattered blocks
    P("arch", 0, 0, 0, 1);
    P("steps", 0, 3.4, Math.PI, 1.1);
    P("toppled", 6.5, -2.5, 0.5 + r() * 0.4, 1);
    P("broken", -6, 2, r() * 3, 3.2 + r());
    P("block", 3.5, 4.2, r() * 3, 1);
    P("block", -3.6, -3.4, r() * 3, 0.8);
    P("block", 7.4, 1.6, r() * 3, 0.7);
    return { parts, radius: 9 };
  }
  if (kind === "colonnade") {
    // two rows of pillars, most broken, one fallen across
    for (let i = 0; i < 5; i++) {
      for (const side of [-1, 1]) {
        const x = side * 3.4;
        const z = (i - 2) * 4.2;
        const k = (i * 2 + (side > 0 ? 1 : 0)) % 5;
        if (k === 3 && side > 0) P("toppled", x + 2.8, z + 0.6, 0.2 + r() * 0.3, 1);
        else if (k === 1 || k === 4) P("pillar", x, z, r() * 3, 6.4 + r() * 0.6);
        else P("broken", x, z, r() * 3, 1.6 + r() * 3.2);
      }
    }
    P("steps", 0, -11.2, 0, 1.3);
    P("block", -1.2, 3.8, r() * 3, 0.9);
    return { parts, radius: 11.5 };
  }
  // shrine: steps up to a rune altar between two pillars and two little rune stones
  P("steps", 0, 2.6, Math.PI, 1.2);
  P("altar", 0, -0.4, 0, 1.2, true);
  P("pillar", -3.4, -1.2, r() * 3, 5.6);
  P("broken", 3.4, -1.2, r() * 3, 2.8);
  P("stone", -2.2, -3.6, 0.2, 2.4, true);
  P("stone", 2.4, -3.8, -0.3, 2.1, true);
  P("block", 4.6, 1.8, r() * 3, 0.8);
  return { parts, radius: 6.5 };
}

const RUIN_OBSTACLE: Partial<Record<RuinPartKind, number>> = { pillar: 0.95, broken: 0.95, stone: 1, altar: 1.5, toppled: 0.9 };

export interface PlanOptions {
  lowQuality?: boolean;
  seed?: number;
}

/** Plan the whole kit. `free(x, z, pad)` is the park's "is this spot clear?" predicate. */
export function planFantasy(free: FreeFn, opts: PlanOptions = {}): FantasyPlan {
  const r = rngOf(opts.seed ?? 20261001);
  const low = !!opts.lowQuality;
  const taken: Taken[] = [];
  const obstacles: Obstacle[] = [];

  // ── ruins first (they need the most room) ──
  const ruins: RuinSite[] = [];
  const ruinKinds: RuinKind[] = ["ring", "arch", "colonnade", "shrine", "ring"];
  for (const kind of ruinKinds) {
    for (let tries = 0; tries < 400; tries++) {
      const rot = r() * Math.PI * 2;
      const { parts, radius } = ruinParts(kind, rngOf(Math.floor(r() * 1e9)));
      const [x, z] = onIsland(r, 34, ISLAND_R - 18);
      if (!free(x, z, radius)) continue;
      if (!clear(taken, x, z, radius + 2)) continue;
      if (ruins.some((s) => Math.hypot(s.x - x, s.z - z) < 48)) continue;
      if (Math.hypot(x - FOREST.x, z - FOREST.z) < FOREST.radius + radius + 6) continue; // the forest has its giants
      if (roughness(x, z, radius * 0.8) > 0.28) continue;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const site: RuinSite = {
        kind,
        x,
        z,
        y: groundY(x, z),
        r: radius,
        rot,
        parts: parts.map((p) => {
          const px = x + p.x * cos + p.z * sin;
          const pz = z - p.x * sin + p.z * cos;
          return { ...p, x: px, z: pz, rot: p.rot + rot, y: groundY(px, pz) };
        }),
      };
      ruins.push(site);
      taken.push({ x, z, r: radius });
      for (const p of site.parts) {
        const or = RUIN_OBSTACLE[p.kind];
        if (p.kind === "arch") {
          // the arch's two legs (local x = ±3.2)
          for (const lx of [-3.2, 3.2]) obstacles.push({ x: p.x + lx * Math.cos(p.rot), z: p.z - lx * Math.sin(p.rot), r: 1.1 });
        } else if (p.kind === "toppled") {
          // a fallen pillar: three circles along its length
          for (const u of [-2.4, 0, 2.4]) obstacles.push({ x: p.x + u * Math.cos(p.rot), z: p.z - u * Math.sin(p.rot), r: or! });
        } else if (or) obstacles.push({ x: p.x, z: p.z, r: or * (p.kind === "altar" ? p.h : 1) });
      }
      break;
    }
  }

  // ── the Glow Forest: a few huge ancient trees ──
  const giants: GiantSpot[] = [];
  const nGiants = low ? 3 : 4;
  for (let tries = 0; tries < 3000 && giants.length < nGiants; tries++) {
    const a = r() * Math.PI * 2;
    const d = 6 + Math.sqrt(r()) * (FOREST.radius + 6);
    const x = FOREST.x + Math.sin(a) * d;
    const z = FOREST.z + Math.cos(a) * d;
    if (!free(x, z, 7)) continue;
    if (!clear(taken, x, z, 8)) continue;
    if (giants.some((g) => Math.hypot(g.x - x, g.z - z) < 21)) continue;
    const s = 0.85 + r() * 0.3;
    giants.push({ x, z, y: groundY(x, z), s, rot: r() * Math.PI * 2 });
    taken.push({ x, z, r: 7.5 * s });
    obstacles.push({ x, z, r: 3.6 * s });
  }
  // glowing mushroom clusters nestled in the roots, plus more across the forest floor
  const mushrooms: MushroomSpot[] = [];
  const hueOf = (): 0 | 1 | 2 => (r() < 0.45 ? 0 : r() < 0.6 ? 1 : 2);
  for (const g of giants) {
    const n = low ? 5 : 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.5;
      const d = (3.6 + r() * 3.6) * g.s;
      const x = g.x + Math.sin(a) * d;
      const z = g.z + Math.cos(a) * d;
      if (!free(x, z, 0.8)) continue;
      mushrooms.push({ x, z, y: groundY(x, z), s: 0.8 + r() * 0.8, rot: r() * Math.PI * 2, hue: hueOf() });
    }
  }
  for (let tries = 0, made = 0; tries < 800 && made < (low ? 10 : 22); tries++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * (FOREST.radius + 10);
    const x = FOREST.x + Math.sin(a) * d;
    const z = FOREST.z + Math.cos(a) * d;
    if (!free(x, z, 1) || !clear(taken, x, z, 1)) continue;
    mushrooms.push({ x, z, y: groundY(x, z), s: 0.6 + r() * 0.7, rot: r() * Math.PI * 2, hue: hueOf() });
    made++;
  }
  // light shafts falling through gaps in the giants' canopies, between the trunks
  const shafts: ShaftSpot[] = [];
  for (const g of giants) {
    for (let k = 0, tries = 0; k < (low ? 2 : 3) && tries < 40; tries++) {
      const a = r() * Math.PI * 2;
      const d = (5.5 + r() * 5) * g.s;
      const x = g.x + Math.sin(a) * d;
      const z = g.z + Math.cos(a) * d;
      if (shafts.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
      shafts.push({ x, z, y: groundY(x, z), h: 23 * g.s, r: 1.3 + r() * 1.3, rot: r() * Math.PI * 2 });
      k++;
    }
  }

  // ── crystal spots: one in the forest, one at each rune ring, the rest out on the hills ──
  const crystals: CrystalSpot[] = [];
  const crystalSite = (cx: number, cz: number, n: number, spread: number, hue: 0 | 1 | 2) => {
    for (let k = 0, tries = 0; k < n && tries < n * 30; tries++) {
      const a = r() * Math.PI * 2;
      const d = r() * spread;
      const x = cx + Math.sin(a) * d;
      const z = cz + Math.cos(a) * d;
      const s = 0.7 + r() * 0.9;
      if (!free(x, z, 1.2 * s) || !clear(taken, x, z, 1.1 * s)) continue;
      crystals.push({ x, z, y: groundY(x, z) - 0.15, s, rot: r() * Math.PI * 2, tiltX: (r() - 0.5) * 0.35, tiltZ: (r() - 0.5) * 0.35, hue: r() < 0.75 ? hue : (((hue + 1) % 3) as 0 | 1 | 2) });
      taken.push({ x, z, r: 1.1 * s });
      if (s > 1.2) obstacles.push({ x, z, r: 0.9 * s });
      k++;
    }
  };
  const sites: [number, number, 0 | 1 | 2][] = [];
  // forest glade (away from the giants' trunks)
  for (let tries = 0; tries < 400; tries++) {
    const [x, z] = [FOREST.x + (r() - 0.5) * FOREST.radius * 1.4, FOREST.z + (r() - 0.5) * FOREST.radius * 1.4];
    if (free(x, z, 3) && clear(taken, x, z, 3)) {
      sites.push([x, z, 0]);
      break;
    }
  }
  for (const ring of ruins.filter((s) => s.kind === "ring")) {
    const a = r() * Math.PI * 2;
    sites.push([ring.x + Math.sin(a) * (ring.r + 3.5), ring.z + Math.cos(a) * (ring.r + 3.5), 1]);
  }
  const nOpen = low ? 3 : 4;
  for (let tries = 0, made = 0; tries < 1500 && made < nOpen; tries++) {
    const [x, z] = onIsland(r, 40, ISLAND_R - 14);
    if (!free(x, z, 4) || !clear(taken, x, z, 4)) continue;
    if (sites.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 40)) continue;
    // crystals like high ground and the foot of the mountains
    if (groundY(x, z) < 1.5 && r() < 0.7) continue;
    sites.push([x, z, (made % 3) as 0 | 1 | 2]);
    made++;
  }
  for (const [x, z, hue] of sites) crystalSite(x, z, low ? 4 : 6, 3.6, hue);

  // ── groves of trees: clustered by noise, species by altitude + a second noise ──
  const trees: TreeSpot[] = [];
  const nTrees = low ? 64 : 110;
  const canopyR: Record<Species, number> = { oak: 4.2, pine: 2.8, birch: 2.8, spirit: 4 };
  for (let tries = 0; tries < 14000 && trees.length < nTrees; tries++) {
    const [x, z] = onIsland(r, 22, ISLAND_R - 6);
    const grove = fbm2(x / 42 + 3.1, z / 42 - 1.7, 3, 5);
    if (r() > Math.pow(Math.max(0, (grove - 0.38) / 0.3), 1.5)) continue;
    const h = groundY(x, z);
    const slope = slopeAt(x, z);
    if (slope > 0.5) continue;
    const dForest = Math.hypot(x - FOREST.x, z - FOREST.z);
    const sp = noise2(x / 55 + 9, z / 55 - 4, 11);
    let species: Species = h > 10 || slope > 0.3 ? "pine" : sp < 0.36 ? "birch" : sp > 0.64 ? "pine" : "oak";
    if (dForest < FOREST.radius + 4) continue; // the giants' forest: only they stand inside
    if (dForest < FOREST.radius + 24 ? r() < 0.5 : r() < 0.05) species = "spirit";
    if (ruins.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 14) && r() < 0.35) species = "spirit";
    const s = species === "pine" ? 0.9 + r() * 0.55 : 0.85 + r() * 0.45;
    const trunkPad = 2.2 * s;
    if (!free(x, z, trunkPad)) continue;
    if (!clear(taken, x, z, trunkPad)) continue;
    const cr = canopyR[species] * s;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < (canopyR[t.species] * t.s + cr) * 0.72)) continue;
    trees.push({ species, x, z, y: groundY(x, z), s, rot: r() * Math.PI * 2, tint: r() });
    obstacles.push({ x, z, r: (species === "pine" ? 0.55 : 0.75) * s });
  }
  for (const t of trees) taken.push({ x: t.x, z: t.z, r: 1.4 * t.s });

  // ── boulders (obstacles) and small scattered rocks ──
  const rocks: RockSpot[] = [];
  const nBig = low ? 12 : 18;
  for (let tries = 0; tries < 4000 && rocks.length < nBig; tries++) {
    const [x, z] = onIsland(r, 20, ISLAND_R - 8);
    const s = 1.6 + r() * 1.8;
    if (!free(x, z, s * 1.2 + 0.5) || !clear(taken, x, z, s * 1.2)) continue;
    if (rocks.some((b) => Math.hypot(b.x - x, b.z - z) < 14) && r() < 0.8) continue;
    rocks.push({ x, z, y: groundY(x, z) - 0.25 * s, s, sx: 1 + r() * 0.5, sy: 0.65 + r() * 0.4, sz: 0.8 + r() * 0.4, rot: r() * Math.PI * 2, tilt: (r() - 0.5) * 0.25, big: true });
    taken.push({ x, z, r: s * 1.2 });
    obstacles.push({ x, z, r: s * 1.05 });
  }
  const nSmall = low ? 90 : 190;
  for (let tries = 0, made = 0; tries < 8000 && made < nSmall; tries++) {
    // cluster small rocks around the big things: boulders, ruins, cliffs, tree roots
    let x: number;
    let z: number;
    const pick = r();
    if (pick < 0.3 && rocks.length) {
      const b = rocks[Math.floor(r() * nBig) % rocks.length];
      const a = r() * Math.PI * 2;
      const d = b.s * 1.4 + r() * 4;
      x = b.x + Math.sin(a) * d;
      z = b.z + Math.cos(a) * d;
    } else if (pick < 0.45 && ruins.length) {
      const s = ruins[Math.floor(r() * ruins.length)];
      const a = r() * Math.PI * 2;
      const d = r() * (s.r + 4);
      x = s.x + Math.sin(a) * d;
      z = s.z + Math.cos(a) * d;
    } else [x, z] = onIsland(r, 16, ISLAND_R - 5);
    const s = 0.25 + r() * r() * 0.9;
    if (!free(x, z, s + 0.3) || !clear(taken, x, z, s * 0.8)) continue;
    rocks.push({ x, z, y: groundY(x, z) - 0.2 * s, s, sx: 0.8 + r() * 0.6, sy: 0.5 + r() * 0.5, sz: 0.7 + r() * 0.5, rot: r() * Math.PI * 2, tilt: (r() - 0.5) * 0.5, big: false });
    made++;
  }

  // ── floating islands: the registry's sky islands (registry/skyIslands.ts); each spot is the
  // island's open landing spot on its top (Star Shards go there, a few steps from the treasure) ──
  const islands: IslandSpot[] = SKY_ISLANDS.map((s) => ({
    id: s.id,
    x: s.landing.x,
    z: s.landing.z,
    y: skyBaseY(s, s.landing.x, s.landing.z),
    r: s.r,
    rot: 0,
    seed: s.seed,
    fall: s.fall,
    top: s.kind === "crystal" ? "crystals" : s.kind === "ruins" ? "ruin" : "tree",
  }));

  return { trees, rocks, crystals, ruins, giants, mushrooms, shafts, islands, obstacles };
}
