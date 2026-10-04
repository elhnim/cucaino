// Sunnybrook: the Sunflower Folk's cheerful market town, out on the Sunny Plains near Sunny Plains
// Station — the Wildlands trade network's hub. Written exactly like Lakeside/Treetop/Highstone
// (registry/settlements.ts): a deterministic site search on the REAL, unlevelled ground
// (registry/landform.ts), then a generate<Style>() that returns the SettlementDef's huts/props/
// nodes/edges/work/roster/activities from a seed. Kept in its own file (not inline in
// settlements.ts) so the parallel village-makeover work only has to touch settlements.ts for the
// one-line hook-up (pushing generateTown() onto SETTLEMENTS) — see that file for the push.
//
// A TOWN, not a village: buildings line a cobbled square shoulder-to-shoulder in three short
// terraced streets, not scattered rings — see `placeArcRow`/`placeStreetPairs` below. Scale is real
// (the engine's own: a kid is 2.26 units ≈ 1.4 m, so ~1.6 units/metre — `M` below): a 2-storey
// townhouse stands ~7.5 m to its ridge, the clock tower ~18 m, the windmill ~14 m.
//
// Pure data + maths, deterministic, no three.js (the renderer is
// world/settlements/styles/town.ts).
import { seaDist } from "./island";
import { nearRail, STATIONS } from "./railway";
import { wildWaterSdf } from "./wildWater";
import { footprintStats } from "./landform";
import {
  settlePadHeight,
  type SettlementAct,
  type SettlementActivitySpot,
  type SettlementDef,
  type SettlementHut,
  type SettlementNode,
  type SettlementObstacle,
  type SettlementProp,
  type SettlementSlot,
  type SettlementTalkLines,
  type SettlementVillagerDef,
  type SettlementWorkSpot,
} from "./settlements";

const TAU = Math.PI * 2;
/** units per metre (the engine's own scale: a kid stands 2.26 units ≈ 1.4 m tall) */
const M = 1.6;
/** every hut's `size` is relative to this one reference width (units) — the renderer
 *  (world/settlements/styles/town.ts) multiplies it straight back out, so the two files can't drift */
export const TOWN_BUILDING_REF_W = 6.6 * M;

/** a seeded xorshift rng (0..1) — the same little generator settlements.ts uses, copied here so
 *  this file has no need to import anything private from it (keeps the two files decoupled: the
 *  makeover work on settlements.ts never has to worry about this one) */
function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** the town's own footprint radius (kept in step with generateTown's `radius`) — bigger than a
 *  village's, and bigger than the first draft of this file too: real-scale buildings plus the
 *  fields outside the built-up area need real room, and the Sunny Plains genuinely offer a wide
 *  gentle clearing within an easy walk of the station */
export const TOWN_RADIUS = 66;

const PLAINS_STATION = STATIONS.find((s) => s.id === "plains-station")!;
if (!PLAINS_STATION) throw new Error("town: no plains-station in the railway registry");

export interface TownAvoid {
  x: number;
  z: number;
}

/** a deterministic search on the Sunny Plains near the station: dry, clear of the rail and every
 *  other settlement, inside the island, somewhere the REAL ground is gentle the whole way out to
 *  the town's own (larger) radius */
export function findTownSite(avoid: TownAvoid[]): { x: number; z: number } {
  let best: { x: number; z: number; score: number } | null = null;
  for (let a = 0; a < TAU; a += 0.025) {
    for (let rad = 60; rad <= 220; rad += 4) {
      const x = PLAINS_STATION.x + Math.sin(a) * rad;
      const z = PLAINS_STATION.z + Math.cos(a) * rad;
      if (seaDist(x, z) > -40) continue;
      if (nearRail(x, z, 12)) continue;
      if (wildWaterSdf(x, z) < 14) continue; // dry, with a healthy margin (no stream wanders this close)
      // well clear of every other settlement's own build radius (world/settlements/index.ts's
      // BUILD_R = 550; settlements.test.ts requires every pair stay over 560 apart) — a generous
      // 620 here so the search never has to hug that line
      if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < 620)) continue;
      // a real, flat plain the whole way out to the town's own (larger) radius — not a levelled
      // patch of ground that would otherwise roll (one footprintStats call does for both the
      // pass/fail check and the score — computing it twice cost real startup time, see the fix
      // below in the comment history)
      const stats = footprintStats(x, z, TOWN_RADIUS);
      if (stats.maxSlope > 0.4 || stats.relief > 9) continue;
      // prefer a comfortable, not-too-far walk from the station, and the flattest ground on offer
      const score = -Math.abs(rad - 120) * 0.05 - stats.relief * 0.6 - stats.maxSlope * 20;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (!best) throw new Error("town: no site found near Sunny Plains Station");
  return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10 };
}

// ── goods' crate colours (duplicated from registry/trade.ts's GOODS, just the ones Sunnybrook's
// stalls show — trade.ts can't be imported here, it would be circular: trade.ts reads SETTLEMENTS,
// which is built from this file) ──
const GOOD_COLOR: Record<string, string> = {
  bread: "#d9a85c",
  toys: "#7a5cff",
  fruit: "#e0503c",
  cheese: "#f0c457",
  wool: "#d9c9a8",
  fish: "#6fa8c9",
  shells: "#f0d9c0",
};
export const TOWN_STALL_GOODS = ["bread", "toys", "fruit", "cheese", "wool", "fish", "shells"];
export function townStallColor(goodId: string): string {
  return GOOD_COLOR[goodId] ?? "#d9a85c";
}

/** the shop fronts, grouped into the three terraces round the square (see generateTown) — read by
 *  the renderer to pick each one's front */
export const TOWN_SHOP_KINDS = ["shop-post", "shop-general", "shop-bakery", "shop-sweet", "shop-cafe", "shop-toy", "shop-grocer", "shop-cheesewool"];

interface RowSlot {
  x: number;
  z: number;
  yaw: number;
  width: number;
}
/** a straight-enough ROW of buildings along an ARC at fixed `radius` round (cx, cz), centred on
 *  `centerAngle`, each facing straight in towards the centre, packed shoulder-to-shoulder (just
 *  `gap` apart) — this (not a ring with even angular spacing) is what makes the square read as a
 *  terrace, not a scatter of separate buildings */
function placeArcRow(cx: number, cz: number, centerAngle: number, radius: number, widths: number[], gap: number): RowSlot[] {
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  let cum = -total / 2;
  const out: RowSlot[] = [];
  for (const w of widths) {
    const offset = cum + w / 2;
    const a = centerAngle + offset / radius;
    const x = cx + Math.sin(a) * radius;
    const z = cz + Math.cos(a) * radius;
    out.push({ x, z, yaw: a + Math.PI, width: w });
    cum += w + gap;
  }
  return out;
}
/** a short STREET leading off the square at heading `angle`: pairs of buildings facing each other
 *  across it, walking outward from `startDist`, each pair `halfWidth` off the centreline, packed
 *  shoulder-to-shoulder along the street the same way placeArcRow packs round the square */
function placeStreetPairs(cx: number, cz: number, angle: number, startDist: number, halfWidth: number, widths: number[], gap: number): RowSlot[] {
  const dirX = Math.sin(angle);
  const dirZ = Math.cos(angle);
  const perpX = Math.cos(angle);
  const perpZ = -Math.sin(angle);
  const out: RowSlot[] = [];
  let dist = startDist;
  for (const w of widths) {
    dist += w / 2;
    for (const side of [-1, 1]) {
      const x = cx + dirX * dist + perpX * side * halfWidth;
      const z = cz + dirZ * dist + perpZ * side * halfWidth;
      const yaw = Math.atan2(-side * perpX, -side * perpZ);
      out.push({ x, z, yaw, width: w });
    }
    dist += w / 2 + gap;
  }
  return out;
}

/** the site findTownSite() picks for Sunnybrook, worked out once and kept here: the search samples
 *  thousands of real ground heights (~2 s), far too slow to run on every park load. town.test.ts
 *  re-runs the search against the other settlements and checks it still lands exactly here — so if
 *  the land, the railway or another settlement moves, that test says to update these numbers. */
export const TOWN_SITE = { x: 1685.4, z: 352.5 };

export function generateTown(_avoid: TownAvoid[] = [], site: { x: number; z: number } = TOWN_SITE): SettlementDef {
  const cx = site.x;
  const cz = site.z;
  const radius = TOWN_RADIUS;
  const r = rngOf(50505);
  const padHeight = settlePadHeight("town", cx, cz);

  // the heading in from the station (where the footpath, registry/footpaths.ts, meets the town),
  // and "street 0" always runs straight out along it — everything else is laid out relative to
  // this one angle
  const A_IN = Math.atan2(PLAINS_STATION.x - cx, PLAINS_STATION.z - cz);
  const STREET_A = [A_IN, A_IN + TAU / 3, A_IN + (2 * TAU) / 3];
  // the three shop terraces sit on the bisectors BETWEEN streets, so each street opens between the
  // ends of two terraces, not through the middle of one
  const SEG_A = [A_IN + TAU / 6, A_IN + TAU / 2, A_IN + (5 * TAU) / 6];
  const SHOP_RING_R = 15.5 * M; // ≈ 24.8 units

  const props: SettlementProp[] = [];
  const huts: SettlementHut[] = [];

  // ── the shop terraces: 8 named fronts in 3 groups (post+general nearest the entrance, on one
  // side; the food quarter opposite; toy/grocer/cheese on the entrance's other side), each group
  // packed shoulder-to-shoulder (<= 0.5 m gap) along its own arc of the square ──
  const SHOP_GROUPS = [
    ["shop-post", "shop-general"],
    ["shop-bakery", "shop-sweet", "shop-cafe"],
    ["shop-toy", "shop-grocer", "shop-cheesewool"],
  ];
  const SHOP_GAP = 0.45 * M;
  SHOP_GROUPS.forEach((group, gi) => {
    const widths = group.map(() => (6.6 + (r() - 0.5) * 1.1) * M);
    const slots = placeArcRow(cx, cz, SEG_A[gi], SHOP_RING_R, widths, SHOP_GAP);
    slots.forEach((slot, i) => {
      huts.push({ x: slot.x, z: slot.z, yaw: slot.yaw, kind: group[i], size: slot.width / TOWN_BUILDING_REF_W });
    });
  });

  // ── the streets: short terraces of plain townhouses facing each other across each one, starting
  // just past the shop ring ──
  const STREET_HOUSES = [4, 2, 2]; // 8 plain townhouses total, in pairs
  const HOUSE_GAP = 0.5 * M;
  const HOUSE_HALF_W = 3.6 * M; // half the street's own width
  STREET_HOUSES.forEach((count, si) => {
    const pairs = count / 2;
    const widths = Array.from({ length: pairs }, () => (6.0 + (r() - 0.5) * 1.0) * M);
    const slots = placeStreetPairs(cx, cz, STREET_A[si], SHOP_RING_R + 3 * M, HOUSE_HALF_W, widths, HOUSE_GAP);
    for (const slot of slots) {
      huts.push({ x: slot.x, z: slot.z, yaw: slot.yaw, kind: "townhouse", size: slot.width / TOWN_BUILDING_REF_W });
    }
  });

  // ── the fountain, dead centre ──
  const fire = { x: cx, z: cz }; // kept as "fire" throughout: routine.ts's dance act looks up a
  // work spot literally named "fire" for every settlement (it's the village hub to dance round —
  // here, the fountain plaza)
  props.push({ kind: "fountain", x: fire.x, z: fire.z, yaw: 0, scale: 1.3 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    props.push({ kind: "bench", x: fire.x + Math.sin(a) * 4.3 * M, z: fire.z + Math.cos(a) * 4.3 * M, yaw: a + Math.PI, scale: 1 });
    props.push({ kind: "planter", x: fire.x + Math.sin(a + TAU / 16) * 5.4 * M, z: fire.z + Math.cos(a + TAU / 16) * 5.4 * M, yaw: a, scale: 1 });
  }

  // ── the bandstand, off to one side (not down the entrance lane, not down any shop terrace's own
  // angle, so it never competes for room with either) ──
  const bandA = A_IN + Math.PI / 2;
  const bandstand = { x: cx + Math.sin(bandA) * 9 * M, z: cz + Math.cos(bandA) * 9 * M };
  props.push({ kind: "bandstand", x: bandstand.x, z: bandstand.z, yaw: bandA + Math.PI, scale: 1.3 });

  // ── the clock tower, right beside the post office, flanking the entrance street's mouth — the
  // first landmark a kid sees walking in, towering well above every roof ──
  const postHut = huts.find((h) => h.kind === "shop-post")!;
  const clockA = Math.atan2(postHut.x - cx, postHut.z - cz);
  // set back far enough past the post office's own depth that the tower's base (radius ~3.4) never
  // overlaps it — it rises directly behind it, so the tower shows above its roof from the square
  const clockR = SHOP_RING_R + 9.5;
  const clock = { x: cx + Math.sin(clockA) * clockR, z: cz + Math.cos(clockA) * clockR };
  props.push({ kind: "clocktower", x: clock.x, z: clock.z, yaw: clockA + Math.PI, scale: 1 });

  // ── the market stalls: one neat curved row facing the entrance, one stall per good Sunnybrook
  // trades — in the clear annulus between the plaza furniture and the shop ring ──
  const stallSpots: { id: string; x: number; z: number; face: number }[] = [];
  const STALL_RING_R = 9 * M;
  const stallWidths = TOWN_STALL_GOODS.map(() => 1.8 * M);
  const stallSlots = placeArcRow(cx, cz, A_IN, STALL_RING_R, stallWidths, 0.3 * M);
  TOWN_STALL_GOODS.forEach((good, i) => {
    const slot = stallSlots[i];
    props.push({ kind: `stall-${good}`, x: slot.x, z: slot.z, yaw: slot.yaw, scale: 1 });
    stallSpots.push({ id: `stall-${good}`, x: slot.x, z: slot.z, face: slot.yaw });
  });

  // ── the windmill and its fields, OUTSIDE the built-up square, past the last street's houses ──
  const millA = clockA + Math.PI;
  const millR = radius - 7 * M;
  const mill = { x: cx + Math.sin(millA) * millR, z: cz + Math.cos(millA) * millR };
  props.push({ kind: "windmill", x: mill.x, z: mill.z, yaw: millA + Math.PI, scale: 1 });
  const fieldInner = 52; // well clear of every street's own houses (the longest run two pairs
  // deep, reaching ~50 units out) — a flat number, not derived from SHOP_RING_R, so it stays a
  // safe margin beyond the streets even if their own lengths change
  for (let i = 0; i < 70; i++) {
    const a = millA + (r() - 0.5) * 2.6;
    const rad = fieldInner + r() * (radius - fieldInner - 2 * M);
    const x = cx + Math.sin(a) * rad;
    const z = cz + Math.cos(a) * rad;
    props.push({ kind: i % 5 === 0 ? "sunflower" : "wheat", x, z, yaw: r() * TAU, scale: 1.1 + r() * 0.5 });
  }

  // ── lamp posts along every shopfront, bunting across each street's mouth, a couple of carts just
  // inside the entrance ──
  for (const h of huts) {
    if (h.kind === "townhouse") continue;
    const side = Math.sin(h.yaw + Math.PI / 2);
    const sideZ = Math.cos(h.yaw + Math.PI / 2);
    const lx = h.x + side * (h.size * TOWN_BUILDING_REF_W * 0.52 + 0.6 * M) - Math.sin(h.yaw) * 0.8 * M;
    const lz = h.z + sideZ * (h.size * TOWN_BUILDING_REF_W * 0.52 + 0.6 * M) - Math.cos(h.yaw) * 0.8 * M;
    props.push({ kind: "lamp-post", x: lx, z: lz, yaw: 0, scale: 1 });
  }
  const lampPositions = props.filter((p) => p.kind === "lamp-post");
  // bunting strung across each street's own mouth, between the first (innermost) pair of houses
  const firstPairByStreet: SettlementHut[][] = [[], [], []];
  {
    let idx = 8; // huts[0..7] are shops; townhouses start at 8
    for (let si = 0; si < STREET_HOUSES.length; si++) {
      if (STREET_HOUSES[si] >= 2) firstPairByStreet[si] = [huts[idx], huts[idx + 1]];
      idx += STREET_HOUSES[si];
    }
  }
  for (const pair of firstPairByStreet) {
    if (pair.length < 2) continue;
    const [a, b] = pair;
    props.push({ kind: "bunting", x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z), scale: Math.hypot(b.x - a.x, b.z - a.z) });
  }
  const cartA = A_IN;
  for (let i = 0; i < 2; i++) {
    const a = cartA + (i - 0.5) * 0.4;
    const x = cx + Math.sin(a) * (SHOP_RING_R + 1.5 * M);
    const z = cz + Math.cos(a) * (SHOP_RING_R + 1.5 * M);
    props.push({ kind: "cart-parked", x, z, yaw: a + Math.PI / 2, scale: 1 });
  }
  // (the welcome arch at the path in from the station is built straight off `def` by
  // world/settlements/styles/common.ts's buildWelcomeArch — no prop entry needed for it)

  // ── the chase play spot, right by the fountain ──
  const chaseA = bandA + Math.PI / 2;
  const chase = { x: cx + Math.sin(chaseA) * 5.6 * M, z: cz + Math.cos(chaseA) * 5.6 * M };

  // the lamplighter's own lamp (the first one placed) and the postmaster's spot (right at the post
  // office door)
  const lampSpot = lampPositions[0];
  const postDoorA = Math.atan2(cx - postHut.x, cz - postHut.z);
  const postSpot = { x: postHut.x + Math.sin(postDoorA) * (postHut.size * TOWN_BUILDING_REF_W * 0.5 + 1 * M), z: postHut.z + Math.cos(postDoorA) * (postHut.size * TOWN_BUILDING_REF_W * 0.5 + 1 * M) };
  const bakeryHut = huts.find((h) => h.kind === "shop-bakery")!;
  const bakeryDoorA = Math.atan2(cx - bakeryHut.x, cz - bakeryHut.z);
  const bakerySpot = { x: bakeryHut.x + Math.sin(bakeryDoorA) * (bakeryHut.size * TOWN_BUILDING_REF_W * 0.5 + 1 * M), z: bakeryHut.z + Math.cos(bakeryDoorA) * (bakeryHut.size * TOWN_BUILDING_REF_W * 0.5 + 1 * M) };
  const cafeHut = huts.find((h) => h.kind === "shop-cafe")!;
  const cafeDoorA = Math.atan2(cx - cafeHut.x, cz - cafeHut.z);
  const cafeSpot = { x: cafeHut.x + Math.sin(cafeDoorA) * (cafeHut.size * TOWN_BUILDING_REF_W * 0.5 + 1.6 * M), z: cafeHut.z + Math.cos(cafeDoorA) * (cafeHut.size * TOWN_BUILDING_REF_W * 0.5 + 1.6 * M) };

  // ── the path graph: a hub at the fountain, a spoke to every door, every stall, the bandstand, the
  // chase spot, the post office, the lamp, the café ──
  const nodes: SettlementNode[] = [{ id: "fire", x: fire.x, z: fire.z }];
  const edges: [number, number][] = [];
  const addNode = (id: string, x: number, z: number) => {
    nodes.push({ id, x, z });
    return nodes.length - 1;
  };
  huts.forEach((h, i) => {
    const w = TOWN_BUILDING_REF_W * h.size;
    const doorX = h.x - Math.sin(h.yaw) * (w * 0.5 + 0.5 * M);
    const doorZ = h.z - Math.cos(h.yaw) * (w * 0.5 + 0.5 * M);
    const idx = addNode(`home-${i}`, doorX, doorZ);
    edges.push([0, idx]);
  });
  for (const s of stallSpots) {
    const idx = addNode(s.id, s.x, s.z);
    edges.push([0, idx]);
  }
  const buskIdx = addNode("busk", bandstand.x, bandstand.z);
  edges.push([0, buskIdx]);
  const chaseIdx = addNode("chase", chase.x, chase.z);
  edges.push([0, chaseIdx]);
  const postIdx = addNode("post", postSpot.x, postSpot.z);
  edges.push([0, postIdx]);
  const lampIdx = addNode("lamp", lampSpot.x, lampSpot.z);
  edges.push([0, lampIdx]);
  const cafeIdx = addNode("cafe", cafeSpot.x, cafeSpot.z);
  edges.push([0, cafeIdx]);
  const bakeIdx = addNode("bake", bakerySpot.x, bakerySpot.z);
  edges.push([0, bakeIdx]);

  const work: SettlementWorkSpot[] = [
    { id: "fire", x: fire.x, z: fire.z, face: 0, sit: true },
    { id: "busk", x: bandstand.x, z: bandstand.z, face: bandA + Math.PI },
    { id: "chase", x: chase.x, z: chase.z, face: 0 },
    { id: "post", x: postSpot.x, z: postSpot.z, face: postDoorA },
    { id: "lamp", x: lampSpot.x, z: lampSpot.z, face: 0 },
    { id: "cafe", x: cafeSpot.x, z: cafeSpot.z, face: cafeDoorA, sit: true },
    { id: "bake", x: bakerySpot.x, z: bakerySpot.z, face: bakeryDoorA },
    ...stallSpots.map((s) => ({ id: s.id, x: s.x, z: s.z, face: s.face })),
  ];

  // ── the Sunflower Folk: ~20, bright yellows/sky blues/poppy reds/leaf greens ──
  const S = (from: number, act: SettlementAct, spot?: string): SettlementSlot => ({ from, act, spot });
  interface RosterEntry {
    id: string;
    name: string;
    kid?: boolean;
    elder?: boolean;
    talk?: boolean;
    home: number;
    sched: SettlementSlot[];
    pair?: number;
    look?: Partial<Pick<SettlementVillagerDef, "skin" | "hair" | "cloth" | "hairStyle" | "body">>;
  }
  const ROSTER: RosterEntry[] = [
    { id: "marigold", name: "Elder Marigold", elder: true, talk: true, home: 0, sched: [S(0, "home"), S(6.5, "sit", "fire"), S(10, "wander"), S(13, "sit", "fire"), S(16, "look", "post"), S(18.3, "sit", "fire"), S(23, "home")], look: { hairStyle: 2, body: 2 } },
    { id: "bramblebake", name: "Bramblebake the Baker", talk: true, home: 2, sched: [S(0, "home"), S(5, "cook", "bake"), S(9.5, "cook", "bake"), S(12.5, "wander"), S(14, "cook", "bake"), S(18.4, "dance", "fire"), S(22, "home")] },
    { id: "posy", name: "Posy", talk: true, home: 3, sched: [S(0, "home"), S(7, "sell", "stall-fruit"), S(11, "sell", "stall-fruit"), S(14, "sell", "stall-cheese"), S(17.5, "wander"), S(18.5, "dance", "fire"), S(22.2, "home")], look: { body: 3 } },
    { id: "pip", name: "Pip the Toymaker", talk: true, home: 5, sched: [S(0, "home"), S(7.5, "sell", "stall-toys"), S(12, "wander"), S(14.2, "sell", "stall-toys"), S(17.8, "wander"), S(18.6, "dance", "fire"), S(22.4, "home")] },
    { id: "fig", name: "Fig the Fiddler", talk: true, home: 4, sched: [S(0, "home"), S(9, "wander"), S(12, "busk", "busk"), S(15, "wander"), S(17.6, "busk", "busk"), S(22.6, "home")], look: { hairStyle: 1 } },
    { id: "daisy", name: "Daisy", kid: true, talk: true, pair: 0, home: 8, sched: [S(0, "home"), S(7.5, "chase", "chase"), S(11, "wander"), S(14, "chase", "chase"), S(18.2, "dance", "fire"), S(21, "home")] },
    { id: "sunny", name: "Sunny", kid: true, talk: true, pair: 1, home: 9, sched: [S(0, "home"), S(7.8, "chase", "chase"), S(11.2, "wander"), S(14.3, "chase", "chase"), S(18.3, "dance", "fire"), S(21.2, "home")], look: { hairStyle: 0 } },
    { id: "wheaton", name: "Wheaton", home: 1, sched: [S(0, "home"), S(6.4, "sell", "stall-bread"), S(10, "sell", "stall-bread"), S(13.4, "wander"), S(16, "sell", "stall-wool"), S(18.5, "dance", "fire"), S(22.5, "home")] },
    { id: "clover", name: "Clover", home: 7, sched: [S(0, "home"), S(7.2, "sell", "stall-cheese"), S(11.4, "sell", "stall-wool"), S(15, "wander"), S(17.4, "sell", "stall-cheese"), S(18.7, "dance", "fire"), S(22.7, "home")], look: { body: 1 } },
    { id: "bell", name: "Bell the Postmaster", home: 10, sched: [S(0, "home"), S(7, "look", "post"), S(11.5, "look", "post"), S(14.5, "wander"), S(16.6, "look", "post"), S(18.9, "dance", "fire"), S(22.8, "home")], look: { hairStyle: 1 } },
    { id: "ivy", name: "Ivy", home: 11, sched: [S(0, "home"), S(8, "sit", "cafe"), S(11, "wander"), S(13.6, "sit", "cafe"), S(17.3, "wander"), S(18.6, "dance", "fire"), S(22, "home")] },
    { id: "basil", name: "Basil", home: 6, sched: [S(0, "home"), S(7.3, "cook", "cafe"), S(10.8, "cook", "cafe"), S(13, "wander"), S(16, "cook", "cafe"), S(18.2, "dance", "fire"), S(22.1, "home")] },
    { id: "reed", name: "Reed the Lamplighter", home: 12, sched: [S(0, "home"), S(8, "wander"), S(12, "wander"), S(17.5, "light", "lamp"), S(19.5, "look", "lamp"), S(21.5, "dance", "fire"), S(22.9, "home")] },
    { id: "thistle", name: "Thistle", home: 13, sched: [S(0, "home"), S(6.9, "wander"), S(9.4, "sit", "fire"), S(13.3, "wander"), S(16.5, "sit", "fire"), S(18.4, "dance", "fire"), S(22.3, "home")] },
    { id: "clay", name: "Clay", home: 14, sched: [S(0, "home"), S(6.1, "sell", "stall-fish"), S(10.3, "sell", "stall-fish"), S(14.2, "wander"), S(16.8, "sell", "stall-fish"), S(18.1, "dance", "fire"), S(22.4, "home")] },
    { id: "rosemary", name: "Rosemary", home: 15, sched: [S(0, "home"), S(7.6, "sell", "stall-shells"), S(11.8, "wander"), S(14.6, "sell", "stall-shells"), S(17.2, "wander"), S(18.5, "dance", "fire"), S(22.6, "home")], look: { body: 1 } },
    { id: "juniper", name: "Juniper", home: 0, sched: [S(0, "home"), S(7.1, "wander"), S(9.9, "sit", "fire"), S(12.7, "wander"), S(16.1, "sit", "fire"), S(18.3, "dance", "fire"), S(22.2, "home")] },
    { id: "hazel", name: "Hazel", home: 8, sched: [S(0, "home"), S(7.4, "wander"), S(10.6, "sit", "fire"), S(13.9, "wander"), S(17.5, "wander"), S(18.6, "dance", "fire"), S(22.5, "home")] },
    { id: "wren", name: "Wren", home: 9, sched: [S(0, "home"), S(7.7, "wander"), S(10.9, "wander"), S(14.1, "sit", "cafe"), S(17.6, "wander"), S(18.7, "dance", "fire"), S(22.6, "home")] },
    { id: "otto", name: "Otto", home: 10, sched: [S(0, "home"), S(8.2, "sit", "fire"), S(11.3, "wander"), S(14.5, "sit", "fire"), S(17.9, "wander"), S(18.8, "dance", "fire"), S(22.7, "home")] },
  ];
  const SKINS_N = 7;
  const HAIRS_N = 8;
  const CLOTHS_N = 7;
  const roster: SettlementVillagerDef[] = ROSTER.map((e, i) => {
    const seed = 10000 + i * 151;
    const rnd = rngOf(seed);
    const jitter = e.talk ? 0 : (rnd() - 0.5) * 0.6;
    const schedule = e.sched.map((s, k) => ({ ...s, from: k === 0 ? s.from : Math.max(0, Math.min(23.9, s.from + jitter)) }));
    const look = e.look ?? {};
    return {
      id: e.id,
      name: e.name,
      home: e.home % Math.max(1, huts.length),
      kid: !!e.kid,
      elder: !!e.elder,
      seed,
      schedule,
      skin: look.skin ?? i % SKINS_N,
      hair: look.hair ?? (i * 3 + 2) % HAIRS_N,
      cloth: look.cloth ?? (i * 5 + 1) % CLOTHS_N,
      hairStyle: look.hairStyle ?? (e.kid ? i % 2 : i % 3),
      body: look.body ?? (e.elder ? 2 : 0),
      talk: e.talk ? e.id : undefined,
      pair: e.pair ?? i % 2,
    };
  });

  const talk: SettlementTalkLines[] = [
    {
      id: "marigold",
      name: "Elder Marigold",
      lines: [
        "Welcome to Sunnybrook! Traders from all over the island meet in our square.",
        "The first coins were made over 2,500 years ago, in a land called Lydia.",
        "Before coins, folk traded goods for goods — that's called bartering!",
        "Our clock tower's bell has rung the hour here longer than anyone can remember.",
      ],
    },
    {
      id: "bramblebake",
      name: "Bramblebake the Baker",
      lines: [
        "Fresh loaves every morning! Bread is baked from wheat — ground into flour at our mill.",
        "My oven's so hot you can see the chimney smoke from the station!",
        "A pretzel's twisted into a loop so bakers could hang them up to sell — true story!",
      ],
    },
    {
      id: "posy",
      name: "Posy",
      lines: ["My fruit comes in by cart, boat and train — the whole island trades through Sunnybrook!", "Apples float because they're a quarter air inside — try it in a bucket sometime!", "Cheese keeps well on a long cart ride — that's partly why traders love it."],
    },
    {
      id: "pip",
      name: "Pip the Toymaker",
      lines: ["I carve every toy by hand, right here in my shop.", "Spinning tops stay upright while they spin — that's a bit of science called gyroscopes!", "Come back at festival time — I set every toy in the window spinning at once."],
    },
    {
      id: "fig",
      name: "Fig the Fiddler",
      lines: ["I play by the bandstand every day — come dance when the sun goes down!", "A flute makes its note by splitting air over a sharp edge — that's what the whistling is!", "Market day's my favourite: everyone's in a dancing mood."],
    },
    {
      id: "daisy",
      name: "Daisy",
      lines: ["Race you round the fountain!", "Sunny always slows down to watch the ducks — that's how I win!", "The fountain's water comes from a spring under the square — it never runs dry!"],
    },
    {
      id: "sunny",
      name: "Sunny",
      lines: ["I'm not slow, I just like watching the water!", "Daisy says she's faster, but I know the shortcut past the stalls!", "Have you seen the windmill's sails? They spin fastest on a blowy day."],
    },
  ];

  const activities: SettlementActivitySpot[] = [{ id: "market", x: stallSpots[0].x, z: stallSpots[0].z, r: 7 * M, label: "Run a market stall", emoji: "\u{1F9FA}" }];

  const obstacles: SettlementObstacle[] = [
    ...huts.map((h) => ({ x: h.x, z: h.z, r: h.size * TOWN_BUILDING_REF_W * 0.62 })),
    { x: fire.x, z: fire.z, r: 4.3 },
    { x: clock.x, z: clock.z, r: 2.3 * M },
    { x: bandstand.x, z: bandstand.z, r: 4.2 },
    { x: mill.x, z: mill.z, r: 3.1 * M },
    ...stallSpots.map((s) => ({ x: s.x, z: s.z, r: 1.1 * M })),
  ];

  return {
    id: "town",
    name: "Sunnybrook",
    clan: "the Sunflower Folk",
    emoji: "\u{1F33B}",
    style: "town",
    x: cx,
    z: cz,
    radius,
    padHeight,
    stationId: "plains-station",
    huts,
    props,
    nodes,
    edges,
    work,
    roster,
    talk,
    activities,
    obstacles,
    pier: null,
    canoeLoops: [],
    fauna: [],
    decks: [],
    // the WHOLE built-up disc (square + every street) is levelled flush with the shared pad, not
    // just each hut/work spot's own small stamp — at this density a patchwork of separately-levelled
    // footprints would leave dips between buildings; the fields start only past `fieldInner` (52),
    // on the real (unlevelled) ground, by design
    levelPatches: [{ x: cx, z: cz, rIn: 4, rOut: 50 }],
    trade: { makes: ["bread", "toys"], wants: ["fish", "fruit", "wool", "cheese", "shells"] },
  };
}
