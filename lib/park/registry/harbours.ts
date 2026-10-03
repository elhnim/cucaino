// Where the boats and submarines are moored round Cucaino Park's ocean, and the docks they're
// moored at. Kids FIND them (walk out along a jetty, tap "Hop on"):
//   - Candy Harbour on the main island's south beach: a new jetty with a T-head, where the Duck
//     Pedalos, the Candy Sailboat, the Rocket Boat, the Bubble Sub and the Pirate Ship wait
//   - Coralcove Isle's jetty (VILLAGE_DECKS): a sailboat and a pedalo
//   - Dino Isle's jetty (DINO_DECKS): a Rocket Boat (the quick way home) and a sailboat
//   - Frostpeak Isle: a new little ice-dock off its south beach (clear of the penguins' swim
//     routes), with a Rocket Boat and a Bubble Sub for peeking under the floes
//   - the Rift Dock: a floating pontoon with a beacon buoy on the lip of the Midnight Rift, where
//     the Deep Explorer waits (and a Rocket Boat to get home)
// Boats moor nose-in to the jetties (the ship lies alongside the T-head).
//
// Pure data + maths, deterministic (no three.js). The engine walks on the new decks
// (harbourDeckY, folded into worldFloorY), the fleet draws them (world/rideables/fleet.ts), the
// rideables registry turns the moorings into RIDEABLE_SPOTS. Tested in harbours.test.ts.
import type { BoatKind, SubKind } from "../characters/mounts";
import { MOUNT_BODY, BOAT_CAPS, SUB_CAPS } from "../characters/mounts";
import { WATER_Y, groundY } from "./terrain";
import { bridgeDeckY, coastR } from "./island";
import { JETTY, fordStoneY } from "./waterways";
import { seaFloorY } from "../world/sea/wander";
import { VILLAGE_DECKS, villageGroundY, villageSeaFloorY } from "./villageIsland";
import { FROST_BERGS, FROST_FLOES, FROST_ISLAND, FROST_OBSTACLES, FROST_SWIMS, FROST_SLIDES, frostCoastR, frostGroundY } from "./frostIsland";
import { DINO_DECKS, dinoGroundY } from "./dinoIsland";
import { ABYSS } from "./abyss";
import { STATIONS } from "./railway";
import { WILD_LAKE } from "./wildWater";
import { settlementDeckY } from "./settlements";
import { boatClearance } from "../world/rideables/craft";

/** a walkable plank deck: a straight walk from a to b (half = half its width) sloping ya -> yb, or a round deck (r) */
export interface HarbourDeck {
  id: string;
  dock: string;
  kind: "ramp" | "jetty" | "head" | "pontoon";
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
  ya: number;
  yb: number;
  r?: number;
}

export interface Dock {
  id: string;
  name: string;
  /** a point to show on maps / walk to (the jetty's seaward end) */
  x: number;
  z: number;
  /** "ice" docks are pale blue-white; "rift" is the pontoon with the beacon */
  style: "candy" | "ice" | "rift" | "village" | "dino";
}

export interface Mooring {
  id: string;
  kind: BoatKind | SubKind;
  dock: string;
  x: number;
  z: number;
  /** heading (radians about +Y; forward = (sin yaw, cos yaw)) */
  yaw: number;
}

type P = { x: number; z: number };
const W = (x: number, z: number): P => ({ x, z });

// ── the sea floor + walkable ground everywhere (the engine's worldFloor, without our own decks) ──

/** the ground / sea floor under (x, z) from the islands' registries (no harbour decks) */
function baseFloorY(x: number, z: number): number {
  const v = villageGroundY(x, z);
  if (v !== null) return v;
  const fr = frostGroundY(x, z);
  if (fr !== null) return fr;
  const dn = dinoGroundY(x, z);
  if (dn !== null) return dn;
  const f = seaFloorY(x, z);
  const vf = villageSeaFloorY(x, z);
  return vf !== null ? Math.max(f, vf) : f;
}

// ── the new docks ──

const decks: HarbourDeck[] = [];
const docks: Dock[] = [];

/**
 * A jetty from the beach straight out to sea along heading `a` (radians about +Y): a ramp up from
 * the sand, a level walk, a T-head across the end. Returns the T-head's centre and directions.
 */
function jetty(dock: string, base: P, a: number, len: number, headHalf: number, deckY: number, half = 1.3) {
  const dx = Math.sin(a);
  const dz = Math.cos(a);
  const startY = baseFloorY(base.x, base.z) + 0.03;
  const rampL = Math.max(2.5, Math.min(6, (deckY - startY) * 4.5));
  const r1 = W(base.x + dx * rampL, base.z + dz * rampL);
  const end = W(base.x + dx * len, base.z + dz * len);
  decks.push({ id: `${dock}-ramp`, dock, kind: "ramp", ax: base.x, az: base.z, bx: r1.x, bz: r1.z, half, ya: startY, yb: deckY });
  decks.push({ id: `${dock}-jetty`, dock, kind: "jetty", ax: r1.x, az: r1.z, bx: end.x, bz: end.z, half, ya: deckY, yb: deckY });
  // (the T-head: a little wider, centred on the end)
  const px = Math.cos(a);
  const pz = -Math.sin(a);
  const hc = W(end.x + dx * (half + 0.05), end.z + dz * (half + 0.05));
  decks.push({ id: `${dock}-head`, dock, kind: "head", ax: hc.x - px * headHalf, az: hc.z - pz * headHalf, bx: hc.x + px * headHalf, bz: hc.z + pz * headHalf, half: half + 0.15, ya: deckY, yb: deckY });
  return { base, end, head: hc, dir: { x: dx, z: dz }, side: { x: px, z: pz }, half, headHalf, headW: half + 0.15, deckY };
}
type Jetty = ReturnType<typeof jetty>;

/** the first point out along heading a (from the island centre cx, cz) where the land meets the sea */
function shoreAlong(cx: number, cz: number, a: number, r0: number, r1: number): number {
  for (let r = r0; r <= r1; r += 0.25) {
    const x = cx + Math.sin(a) * r;
    const z = cz + Math.cos(a) * r;
    if (baseFloorY(x, z) < WATER_Y - 0.02) return r;
  }
  return r1;
}
/** how far out along a heading until the water is `depth` deep */
function depthAlong(x0: number, z0: number, a: number, depth: number, max: number): number {
  for (let d = 0; d <= max; d += 0.5) if (WATER_Y - baseFloorY(x0 + Math.sin(a) * d, z0 + Math.cos(a) * d) >= depth) return d;
  return max;
}

// Candy Harbour: off the main island's south beach (south-south-west, clear of the wreck reef)
const HARBOUR_A = -0.3;
const main: Jetty = (() => {
  const shore = shoreAlong(0, 0, HARBOUR_A, coastR(HARBOUR_A) - 10, coastR(HARBOUR_A) + 30);
  const r0 = shore - 4; // the ramp starts up on the sand
  const base = W(Math.sin(HARBOUR_A) * r0, Math.cos(HARBOUR_A) * r0);
  // out to where it's deep enough for the Pirate Ship to lie alongside the head
  const len = 4 + depthAlong(Math.sin(HARBOUR_A) * shore, Math.cos(HARBOUR_A) * shore, HARBOUR_A, 4.2, 40);
  return jetty("candy-harbour", base, HARBOUR_A, len, 17, 1.15, 1.4);
})();
docks.push({ id: "candy-harbour", name: "Candy Harbour", x: main.head.x, z: main.head.z, style: "candy" });

// Rainbow Lake's jetty: from the beach below the park gate out over the clear water (no boats moor
// here: it's for looking at the fish, the lily pads and the ducks)
jetty("lake-jetty", W(JETTY.ax, JETTY.az), Math.atan2(JETTY.bx - JETTY.ax, JETTY.bz - JETTY.az), Math.hypot(JETTY.bx - JETTY.ax, JETTY.bz - JETTY.az), JETTY.headHalf, JETTY.y, JETTY.half);

// Frostpeak's ice dock: on a gentle south beach, away from the penguins' slides, swims and floes
const frost: Jetty = (() => {
  let best: { a: number; s: number } | null = null;
  for (let a = -1.0; a <= 1.2; a += 0.05) {
    const cr = frostCoastR(a);
    let ok = true;
    let s = 0;
    for (let k = 0.9; k <= 1.45 && ok; k += 0.05) {
      const x = FROST_ISLAND.x + Math.sin(a) * cr * k;
      const z = FROST_ISLAND.z + Math.cos(a) * cr * k;
      for (const route of FROST_SWIMS) for (const p of route) if (Math.hypot(p.x - x, p.z - z) < 14) ok = false;
      for (const sl of FROST_SLIDES) for (const p of sl.path) if (Math.hypot(p.x - x, p.z - z) < 12) ok = false;
      for (const f of FROST_FLOES) if (Math.hypot(f.x - x, f.z - z) < f.r * 1.6 + 12) ok = false;
      for (const b of FROST_BERGS) if (Math.hypot(b.x - x, b.z - z) < b.r + 14) ok = false;
      for (const o of FROST_OBSTACLES) if (Math.hypot(o.x - x, o.z - z) < o.r + 4) ok = false;
    }
    if (!ok) continue;
    // a gentle shelf: not a cliff (deep right at the shore)
    const sx = FROST_ISLAND.x + Math.sin(a) * cr * 1.05;
    const sz = FROST_ISLAND.z + Math.cos(a) * cr * 1.05;
    const d = WATER_Y - baseFloorY(sx, sz);
    if (d > 2.2) continue;
    s = Math.abs(a - 0.1);
    if (!best || s < best.s) best = { a, s };
  }
  if (!best) throw new Error("harbours: no beach for the Frostpeak dock");
  const a = best.a;
  const shore = shoreAlong(FROST_ISLAND.x, FROST_ISLAND.z, a, frostCoastR(a) * 0.85, frostCoastR(a) * 1.3);
  const r0 = shore - 3.5;
  const base = W(FROST_ISLAND.x + Math.sin(a) * r0, FROST_ISLAND.z + Math.cos(a) * r0);
  const sx = FROST_ISLAND.x + Math.sin(a) * shore;
  const sz = FROST_ISLAND.z + Math.cos(a) * shore;
  const len = 3.5 + depthAlong(sx, sz, a, 3.6, 30);
  return jetty("frost-dock", base, a, len, 5.5, 1.3, 1.25);
})();
docks.push({ id: "frost-dock", name: "Frostpeak Ice Dock", x: frost.head.x, z: frost.head.z, style: "ice" });

// the Great Lake's jetty, out in the Wildlands: from the beach below Great Lake Station straight
// out over the water to where the boats float (pedalos and a sailboat to potter about the lake in)
const greatLake: Jetty = (() => {
  const st = STATIONS.find((s) => s.id === "lake-station")!;
  const a = Math.atan2(WILD_LAKE.x - st.x, WILD_LAKE.z - st.z);
  const shore = shoreAlong(st.x, st.z, a, 4, 260);
  const base = W(st.x + Math.sin(a) * (shore - 4), st.z + Math.cos(a) * (shore - 4));
  const len = 4 + depthAlong(st.x + Math.sin(a) * shore, st.z + Math.cos(a) * shore, a, 2.6, 60);
  return jetty("great-lake", base, a, len, 6, 1.15, 1.3);
})();
docks.push({ id: "great-lake", name: "Great Lake Jetty", x: greatLake.head.x, z: greatLake.head.z, style: "candy" });

// the Rift Dock: a floating pontoon on the Midnight Rift's near lip (the side facing home)
export const RIFT_DOCK = (() => {
  // the deep stretch of the rift nearest the main island
  let best: { x: number; z: number; d: number } | null = null;
  for (const p of ABYSS.path) {
    if (seaFloorY(p.x, p.z) > -95) continue;
    const d = Math.hypot(p.x, p.z);
    if (!best || d < best.d) best = { x: p.x, z: p.z, d };
  }
  if (!best) throw new Error("harbours: no deep rift for the dock");
  // walk from the rift's middle towards home to its lip (where the plain begins)
  const a = Math.atan2(-best.x, -best.z);
  let lip = 0;
  for (let s = 0; s < 80; s += 0.5)
    if (seaFloorY(best.x + Math.sin(a) * s, best.z + Math.cos(a) * s) > -30) {
      lip = s;
      break;
    }
  const r = 4.6;
  const c = { x: best.x + Math.sin(a) * (lip + 2), z: best.z + Math.cos(a) * (lip + 2) };
  return { x: c.x, z: c.z, r, y: WATER_Y + 0.6, a, rift: { x: best.x, z: best.z } };
})();
decks.push({ id: "rift-pontoon", dock: "rift-dock", kind: "pontoon", ax: RIFT_DOCK.x, az: RIFT_DOCK.z, bx: RIFT_DOCK.x, bz: RIFT_DOCK.z, half: 0, ya: RIFT_DOCK.y, yb: RIFT_DOCK.y, r: RIFT_DOCK.r });
docks.push({ id: "rift-dock", name: "Rift Dock", x: RIFT_DOCK.x, z: RIFT_DOCK.z, style: "rift" });

// the islands' own jetties
const vj = VILLAGE_DECKS.find((d) => d.id === "jetty")!;
const vt = VILLAGE_DECKS.find((d) => d.id === "jetty-t")!;
docks.push({ id: "coralcove", name: "Shellharbour Jetty", x: (vt.ax + vt.bx) / 2, z: (vt.az + vt.bz) / 2, style: "village" });
const dj = DINO_DECKS.find((d) => d.id === "jetty")!;
const dt = DINO_DECKS.find((d) => d.id === "jetty-t")!;
docks.push({ id: "dino", name: "Dino Isle Jetty", x: (dt.ax + dt.bx) / 2, z: (dt.az + dt.bz) / 2, style: "dino" });

export const HARBOUR_DECKS: HarbourDeck[] = decks;
/** round things to walk around on the docks (the Rift Dock's beacon) */
export const HARBOUR_OBSTACLES: { x: number; z: number; r: number }[] = [
  { x: RIFT_DOCK.x + Math.sin(RIFT_DOCK.a) * (RIFT_DOCK.r - 1.0), z: RIFT_DOCK.z + Math.cos(RIFT_DOCK.a) * (RIFT_DOCK.r - 1.0), r: 0.75 },
];
/** (for placing moorings before the exported helpers below exist) */
const floorWithDecks = (x: number, z: number) => worldFloorY(x, z);
export const DOCKS: Dock[] = docks;

/** a jetty description for an island's own deck pair (walk + T-head) */
function jettyOf(walk: { ax: number; az: number; bx: number; bz: number; half: number; ya: number }, head: { ax: number; az: number; bx: number; bz: number; half: number }): Jetty {
  const L = Math.hypot(walk.bx - walk.ax, walk.bz - walk.az);
  const dx = (walk.bx - walk.ax) / L;
  const dz = (walk.bz - walk.az) / L;
  const hc = W((head.ax + head.bx) / 2, (head.az + head.bz) / 2);
  return {
    base: W(walk.ax, walk.az),
    end: W(walk.bx, walk.bz),
    head: hc,
    dir: { x: dx, z: dz },
    side: { x: dz, z: -dx },
    half: walk.half,
    headHalf: Math.hypot(head.bx - head.ax, head.bz - head.az) / 2,
    headW: head.half,
    deckY: walk.ya,
  };
}
const coral = jettyOf(vj, vt);
const dinoJ = jettyOf(dj, dt);

// ── moorings ──

const GAP = 0.45;
const moorings: Mooring[] = [];
const yawOf = (x: number, z: number) => Math.atan2(x, z);
/** nose-in to the T-head's seaward face, `off` along it */
function headNose(j: Jetty, id: string, kind: Mooring["kind"], dock: string, off: number) {
  const L = MOUNT_BODY[kind][0] - MOUNT_BODY[kind][2];
  const c = W(j.head.x + j.side.x * off + j.dir.x * (j.headW + GAP + L), j.head.z + j.side.z * off + j.dir.z * (j.headW + GAP + L));
  moorings.push({ id, kind, dock, x: c.x, z: c.z, yaw: yawOf(-j.dir.x, -j.dir.z) });
}
/** nose-in to the side of the walk, `t` (0..1) along it, on side s (+1 / -1) */
function sideNose(j: Jetty, id: string, kind: Mooring["kind"], dock: string, t: number, s: number) {
  const L = MOUNT_BODY[kind][0] - MOUNT_BODY[kind][2];
  const px = j.base.x + (j.end.x - j.base.x) * t;
  const pz = j.base.z + (j.end.z - j.base.z) * t;
  moorings.push({ id, kind, dock, x: px + j.side.x * s * (j.half + GAP + L), z: pz + j.side.z * s * (j.half + GAP + L), yaw: yawOf(-j.side.x * s, -j.side.z * s) });
}
/** lying alongside the T-head's seaward face (bow towards side +1), `off` along it */
function headAlong(j: Jetty, id: string, kind: Mooring["kind"], dock: string, off = 0) {
  const w = MOUNT_BODY[kind][1];
  const c = W(j.head.x + j.side.x * off + j.dir.x * (j.headW + GAP + w), j.head.z + j.side.z * off + j.dir.z * (j.headW + GAP + w));
  moorings.push({ id, kind, dock, x: c.x - j.side.x * MOUNT_BODY[kind][2], z: c.z - j.side.z * MOUNT_BODY[kind][2], yaw: yawOf(j.side.x, j.side.z) });
}
/** clear of every craft moored so far (capsules, with a little gap) */
function clearOfMoored(kind: Mooring["kind"], x: number, z: number, yaw: number): boolean {
  const [hl, hw, off] = MOUNT_BODY[kind];
  for (const m of moorings) {
    const [ml, mw, mo] = MOUNT_BODY[m.kind];
    for (let u = -1; u <= 1; u += 0.25)
      for (let v = -1; v <= 1; v += 0.25) {
        const ax = x + Math.sin(yaw) * (off + u * hl);
        const az = z + Math.cos(yaw) * (off + u * hl);
        const bx = m.x + Math.sin(m.yaw) * (mo + v * ml);
        const bz = m.z + Math.cos(m.yaw) * (mo + v * ml);
        if (Math.hypot(ax - bx, az - bz) < hw + mw + 0.6) return false;
      }
  }
  return true;
}
/** nose-in beside the walk on side s, at the first spot (from t0 out) with water under the whole hull */
function sideNoseAuto(j: Jetty, id: string, kind: Mooring["kind"], dock: string, s: number, t0: number) {
  for (let t = t0; t <= 0.97; t += 0.01) {
    sideNose(j, id, kind, dock, t, s);
    const m = moorings.pop()!;
    const ok = kind === "sub" || kind === "deepsub" ? WATER_Y - baseFloorY(m.x, m.z) > 3.5 : boatClearance(kind, m.x, m.z, m.yaw, (x, z) => WATER_Y - floorWithDecks(x, z)) > 0.25;
    if (ok && clearOfMoored(kind, m.x, m.z, m.yaw)) {
      moorings.push(m);
      return;
    }
  }
  throw new Error(`harbours: no room to moor ${id}`);
}

// Candy Harbour: the ship alongside the head, the sub nose-in at the head's end, the pedalos,
// the sailboat and the Rocket Boat nose-in along the walk
// (the ship lies along the west of the T's seaward face, the Rocket Boat and the sub nose-in to
// its east end; the pedalos and the sailboat along the walk, with room to turn round)
headAlong(main, "ship-harbour", "ship", "candy-harbour", -6.5);
headNose(main, "speedboat-harbour", "speedboat", "candy-harbour", 11.6);
headNose(main, "sub-harbour", "sub", "candy-harbour", 15.5);
{
  sideNoseAuto(main, "pedalo-harbour-1", "pedalo", "candy-harbour", -1, 0.3);
  sideNoseAuto(main, "pedalo-harbour-2", "pedalo", "candy-harbour", -1, 0.3);
  sideNoseAuto(main, "sailboat-harbour", "sailboat", "candy-harbour", 1, 0.45);
}
// Coralcove: a sailboat nose-in at the T, a pedalo beside the walk
headNose(coral, "sailboat-coralcove", "sailboat", "coralcove", 2.4);
sideNose(coral, "pedalo-coralcove", "pedalo", "coralcove", 0.72, 1);
// Dino Isle: a Rocket Boat and a sailboat nose-in at the T
headNose(dinoJ, "speedboat-dino", "speedboat", "dino", -2.3);
headNose(dinoJ, "sailboat-dino", "sailboat", "dino", 2.4);
// the Great Lake: a sailboat and two pedalos (the lake's still, sheltered water)
headNose(greatLake, "sailboat-greatlake", "sailboat", "great-lake", 2.6);
headNose(greatLake, "pedalo-greatlake-1", "pedalo", "great-lake", -2.6);
sideNoseAuto(greatLake, "pedalo-greatlake-2", "pedalo", "great-lake", 1, 0.45);
// Frostpeak: a Rocket Boat and a Bubble Sub nose-in at the head
headNose(frost, "speedboat-frost", "speedboat", "frost-dock", -2.4);
headNose(frost, "sub-frost", "sub", "frost-dock", 2.2);
// the Rift Dock: the Deep Explorer nose-in on the rift side, a Rocket Boat on the home side
{
  const R = RIFT_DOCK;
  const toRift = { x: -Math.sin(R.a), z: -Math.cos(R.a) };
  const Ld = MOUNT_BODY.deepsub[0] - MOUNT_BODY.deepsub[2];
  moorings.push({ id: "deepsub-rift", kind: "deepsub", dock: "rift-dock", x: R.x + toRift.x * (R.r + GAP + Ld), z: R.z + toRift.z * (R.r + GAP + Ld), yaw: yawOf(-toRift.x, -toRift.z) });
  const Ls = MOUNT_BODY.speedboat[0] - MOUNT_BODY.speedboat[2];
  const side = { x: toRift.z, z: -toRift.x };
  moorings.push({ id: "speedboat-rift", kind: "speedboat", dock: "rift-dock", x: R.x + side.x * (R.r + GAP + Ls), z: R.z + side.z * (R.r + GAP + Ls), yaw: yawOf(-side.x, -side.z) });
}

export const MOORINGS: Mooring[] = moorings;

/** where a moored craft's root rides (boats: on the surface; subs: surfaced) */
export function mooredY(kind: Mooring["kind"]): number {
  return kind === "sub" || kind === "deepsub" ? WATER_Y + SUB_CAPS[kind].surf : WATER_Y;
}

// ── walking on the decks ──

/** the harbour deck under (x, z), if any: its height */
export function harbourDeckY(x: number, z: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < decks.length; i++) {
    const d = decks[i];
    // (quick reject: every deck is within 60 m of its start)
    if (Math.abs(x - d.ax) > 60 || Math.abs(z - d.az) > 60) continue;
    let y: number | null = null;
    if (d.r !== undefined) {
      if ((x - d.ax) ** 2 + (z - d.az) ** 2 <= d.r * d.r) y = d.ya;
    } else {
      const ux = d.bx - d.ax;
      const uz = d.bz - d.az;
      const L2 = ux * ux + uz * uz;
      const t = ((x - d.ax) * ux + (z - d.az) * uz) / L2;
      if (t >= 0 && t <= 1) {
        const px = d.ax + ux * t - x;
        const pz = d.az + uz * t - z;
        if (px * px + pz * pz <= d.half * d.half) y = d.ya + (d.yb - d.ya) * t;
      }
    }
    if (y !== null && (best === null || y > best)) best = y;
  }
  return best;
}

/**
 * The ground under (x, z) everywhere in the world: the harbour decks, the main island and the
 * far islands (land, decks, the knee-deep lagoons), or the sea floor (the reef, the deep blue,
 * the Midnight Rift). The engine walks, swims and steers boats on this.
 */
export function worldFloorY(x: number, z: number): number {
  const h = harbourDeckY(x, z);
  if (h !== null) return Math.max(h, baseFloorY(x, z));
  // the footbridges over the main island's river and the lake's outlet
  const b = bridgeDeckY(x, z) ?? fordStoneY(x, z);
  if (b !== null) return Math.max(b, baseFloorY(x, z));
  // a Wildlands settlement's own pier (registry/settlements.ts), walking out over real water
  const s = settlementDeckY(x, z);
  if (s !== null) return Math.max(s, baseFloorY(x, z));
  return baseFloorY(x, z);
}

/** how deep the sea is at (x, z) (<= 0 on land / decks) */
export const worldSeaDepth = (x: number, z: number) => WATER_Y - worldFloorY(x, z);

/** for the beach / tree placers: keep clear of the harbours' decks and moorings (true = keep out) */
export function harbourKeepOut(x: number, z: number, pad: number): boolean {
  for (const d of decks) {
    if (d.r !== undefined) {
      if (Math.hypot(x - d.ax, z - d.az) < d.r + pad + 1) return true;
      continue;
    }
    const ux = d.bx - d.ax;
    const uz = d.bz - d.az;
    const t = Math.max(0, Math.min(1, ((x - d.ax) * ux + (z - d.az) * uz) / (ux * ux + uz * uz)));
    if (Math.hypot(d.ax + ux * t - x, d.az + uz * t - z) < d.half + pad + 1.5) return true;
  }
  for (const m of moorings) if (Math.hypot(x - m.x, z - m.z) < MOUNT_BODY[m.kind][0] + pad) return true;
  return false;
}

/** the beach's height under the main jetty's base (for tests) */
export const HARBOUR_INFO = { main, frost, coral, dino: dinoJ, groundAtBase: groundY(main.base.x, main.base.z), draft: BOAT_CAPS };
