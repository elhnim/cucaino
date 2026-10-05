// Every piece of "drawn, not photographed" storybook art the map is made of — the coastline, the
// rivers and lakes, the rainforest's crowns, the meadow's little trees, the far islands' shapes,
// and the shaded-relief ground pictures — computed once, deterministically, straight off the same
// registries the 3D park itself reads (lib/park/registry/**), so the map can never drift out of
// step with the island. Ported out of the old components/park/MiniMap.tsx (the geometry was
// already pure; only the SVG-vs-canvas choice of *how* to draw it changes) so it's testable without
// React or a browser, and reusable by both the big map and the little HUD map.
//
// Every shape is both an SVG path string (`d`, handy for `new Path2D(d)` on a <canvas> — Canvas2D
// accepts SVG path data directly) and, where something needs raw points (trees, world-shape
// anchors), a plain array.
import { LANDS, PLACES, type LandDef } from "../registry/places";
import { BRIDGES, HILLS, ISLAND_R, TRAIL_POINTS, coastR, nearStream, nearTrail, parkCoastR, type P2 } from "../registry/island";
import { FALLS, JETTY, LAKE_OUTLINE, MESA, OUTLET_HALF, OUTLET_POINTS, RIVER_LENGTH, mesaEdgeDist, mesaRadius, riverHalfWidth, riverPointAt } from "../registry/waterways";
import { underCanopy } from "../registry/jungle";
import { groundYFar } from "../registry/terrain";
import { ISLAND_CENTER, ISLAND_VIEW, WORLD_PLACES, type WorldPlace } from "../registry/worldMap";
import { RAIL_POINTS } from "../registry/railway";
import { WILD_FALLS, WILD_LAKE_OUTLINE, WILD_OUTLET_POINTS, WILD_RIVER_POINTS, wildRainforestK, wildRiverHalfWidth } from "../registry/wildWater";
import { CART_ROAD } from "../registry/cartRoad";
import { FOOTPATHS } from "../registry/footpaths";
import { EVEREST_SUMMIT, LONE_PEAK } from "../registry/landform";
// kartTrack.ts (and its own geometry source, karts/track.ts) are plain 2D maths — verified three.js
// -free the same way every other value import into this module is (see the harbours.ts/trade.ts
// comment below): safe to import directly, no "copy the number" workaround needed here.
import { kartTrackWorld, KART_SITE } from "../registry/kartTrack";
// NOT importing registry/trade.ts's BOAT_ROUTE here: that module reaches into registry/harbours.ts
// (docks/moorings), which reaches into characters/mounts.ts for boat/sub rig geometry — i.e. three.js
// — same reasoning as planner.ts's module comment. The sea route was only ever a faint decorative
// line; the moving trade-boat dots (components/park/map/MapCanvas.tsx's `movers.tradeDots`) carry
// the "a boat's out there" feeling without it.

/** the shaded relief covers the park's own land (the whole island's relief is a separate, lazier picture) */
export const TERRAIN_EXTENT = 260;

export const d = (pts: P2[], close = false) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + (close ? " Z" : "");
const ring = (extra: number) =>
  d(
    Array.from({ length: 140 }, (_, i) => {
      const a = (i / 140) * Math.PI * 2;
      const r = coastR(a) + extra;
      return [Math.sin(a) * r, Math.cos(a) * r] as P2;
    }),
    true,
  );
export const COAST = ring(0);
export const BEACH = ring(13);
/** the park's own coastline (the old little island, the south-west end of the big island), drawn
 *  as a highlighted area so a kid can tell the park from the wider Wildlands */
export const PARK_AREA = d(
  Array.from({ length: 100 }, (_, i) => {
    const a = (i / 100) * Math.PI * 2;
    const r = parkCoastR(a) + 7;
    return [Math.sin(a) * r, Math.cos(a) * r] as P2;
  }),
  true,
);
const blob = (l: LandDef) => {
  const seed = l.x * 0.13 + l.z * 0.07;
  return d(
    Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2;
      const r = l.radius + 3 + Math.sin(a * 3 + seed) * 1.8 + Math.sin(a * 5 + seed * 2) * 1.1;
      return [l.x + Math.sin(a) * r, l.z + Math.cos(a) * r] as P2;
    }),
    true,
  );
};
// "karts" gets its own track-shaped art (below), not a generic land blob — a huge grey disc next
// to the park read as an unexplained blank spot; the real circuit outline tells a kid what it is.
export const LAND_SHAPES = LANDS.filter((l) => l.id !== "gate" && l.id !== "karts").map((l) => ({ l, path: blob(l) }));

/** the go-kart circuit: its real track outline (lib/park/registry/kartTrack.ts), not a blob — drawn
 *  as a little dark ribbon with a 🏎️ pin, the same way the park draws its river instead of a blue
 *  disc. `KART_TRACK_WIDTH` sizes the ribbon's stroke so it reads as a track, not a thin wire. */
const kartWorld = kartTrackWorld();
export const KART_TRACK_PATH = d(
  kartWorld.points.map((p) => [p.x, p.z] as P2),
  true,
);
export const KART_TRACK_WIDTH = kartWorld.width;
export const KART_PIN = { x: KART_SITE.x, z: KART_SITE.z, name: "Cucaino Karts", emoji: "🏎️" };
export const TRAIL_PATHS = TRAIL_POINTS.map((pts) => d(pts));

const riverEdge = (side: number, extra: number): P2[] =>
  Array.from({ length: Math.ceil(RIVER_LENGTH / 2) + 1 }, (_, i) => {
    const s = Math.min(RIVER_LENGTH, i * 2);
    const [x, z] = riverPointAt(s);
    const [nx, nz] = riverPointAt(Math.min(RIVER_LENGTH, s + 0.5));
    const [px, pz] = riverPointAt(Math.max(0, s - 0.5));
    const h = Math.atan2(nx - px, nz - pz);
    const w = (riverHalfWidth(s) + extra) * side;
    return [x + Math.cos(h) * w, z - Math.sin(h) * w] as P2;
  });
const riverShape = (extra: number) => d([...riverEdge(1, extra), ...riverEdge(-1, extra).reverse()], true);
export const RIVER_BANK = riverShape(1.6);
export const RIVER = riverShape(0);
export const LAKE_PATH = d(LAKE_OUTLINE, true);
export const OUTLET_PATH = d(OUTLET_POINTS);
export const MESA_PATH = d(
  Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r = mesaRadius(a) + 1.5;
    return [MESA.x + Math.sin(a) * r, MESA.z + Math.cos(a) * r] as P2;
  }),
  true,
);

const wildRiverLen = (() => {
  let acc = 0;
  const out = [0];
  for (let i = 1; i < WILD_RIVER_POINTS.length; i++) {
    acc += Math.hypot(WILD_RIVER_POINTS[i][0] - WILD_RIVER_POINTS[i - 1][0], WILD_RIVER_POINTS[i][1] - WILD_RIVER_POINTS[i - 1][1]);
    out.push(acc);
  }
  return out;
})();
const wildRiverEdge = (side: number, extra: number): P2[] =>
  WILD_RIVER_POINTS.map((p, i) => {
    const a = WILD_RIVER_POINTS[Math.max(0, i - 1)];
    const b = WILD_RIVER_POINTS[Math.min(WILD_RIVER_POINTS.length - 1, i + 1)];
    const h = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const w = (wildRiverHalfWidth(wildRiverLen[i]) + extra) * side;
    return [p[0] + Math.cos(h) * w, p[1] - Math.sin(h) * w] as P2;
  });
const wildRiverShape = (extra: number) => d([...wildRiverEdge(1, extra), ...wildRiverEdge(-1, extra).reverse()], true);
export const WILD_RIVER_BANK = wildRiverShape(3.2);
export const WILD_RIVER = wildRiverShape(0);
export const WILD_LAKE_PATH = d(WILD_LAKE_OUTLINE, true);
export const WILD_OUTLET_PATH = d(WILD_OUTLET_POINTS);
export const RAIL_PATH = d(RAIL_POINTS, true);
/** little perpendicular ticks across the track every ~18 units, like a real railway's sleepers —
 *  drawn as short line segments on top of the rail's dashed centreline */
export const RAIL_SLEEPERS: { x1: number; z1: number; x2: number; z2: number }[] = (() => {
  const out: { x1: number; z1: number; x2: number; z2: number }[] = [];
  for (let i = 0; i < RAIL_POINTS.length; i += 6) {
    const a = RAIL_POINTS[i];
    const b = RAIL_POINTS[(i + 1) % RAIL_POINTS.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const half = 3.4;
    out.push({ x1: a[0] + nx * half, z1: a[1] + nz * half, x2: a[0] - nx * half, z2: a[1] - nz * half });
  }
  return out;
})();
export const CART_ROAD_PATH = d(CART_ROAD.points);
/** a settlement's own walk to its station (registry/footpaths.ts): dotted brown lines, same family
 *  as the cart road, so every dry-land trade/travel route reads as one coherent "paths" language */
export const FOOTPATH_PATHS = FOOTPATHS.map((f) => d(f.points));

export { FALLS, JETTY, OUTLET_HALF, WILD_FALLS, BRIDGES };

/** the rainforest's crowns: big dark-green rounds packed over the canopy */
export const JUNGLE_TREES: { x: number; z: number; s: number; c: string }[] = (() => {
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { x: number; z: number; s: number; c: string }[] = [];
  const cols = ["#2f8a4a", "#3f9a46", "#2a7a52", "#4aa850"];
  for (let z = -160; z < 160; z += 5.5)
    for (let x = -160; x < 160; x += 5.5) {
      const jx = x + (rnd() - 0.5) * 4;
      const jz = z + (rnd() - 0.5) * 4;
      if (!underCanopy(jx, jz) || nearTrail(jx, jz, 3) || nearStream(jx, jz, 1)) continue;
      out.push({ x: jx, z: jz, s: 3.4 + rnd() * 1.6, c: cols[out.length % cols.length] });
    }
  return out;
})();

/** little trees scattered in the open meadows (none on trails, the stream or in lands) */
export const TREES: { x: number; z: number; s: number; c: string }[] = (() => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { x: number; z: number; s: number; c: string }[] = [];
  const cols = ["#5fcf8a", "#7fdc9c", "#4fbf9a", "#9ee07a"];
  for (let tries = 0; tries < 1400 && out.length < 110; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = 14 + Math.sqrt(rnd()) * (ISLAND_R - 20);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (nearTrail(x, z, 3.5) || nearStream(x, z, 2) || underCanopy(x, z) || mesaEdgeDist(x, z) < 4 || LANDS.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius + 4)) continue;
    if (HILLS.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + 2)) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 7)) continue;
    out.push({ x, z, s: 2.4 + rnd() * 1.6, c: cols[out.length % cols.length] });
  }
  return out;
})();

const forest = LANDS.find((l) => l.id === "forest")!;
export const GLOW_TREES = Array.from({ length: 16 }, (_, i) => {
  const a = i * 2.39996;
  const r = Math.sqrt((i + 0.5) / 16) * (forest.radius - 3);
  return { x: forest.x + Math.sin(a) * r, z: forest.z + Math.cos(a) * r, c: ["#8f7bff", "#6fe0ff", "#ff8ae0", "#7fffc4"][i % 4] };
});

/** the Wildlands' own forests, as the same kind of little tree-crown clusters the park's rainforest
 *  already gets (JUNGLE_TREES above) — sampled over the whole island on a coarse grid (registry/
 *  wildWater.ts's wildRainforestK tells us where the canopy actually is), so "forests as tree
 *  clusters" reads at Island zoom instead of only as a raster tint. The park's own canopy (already
 *  covered by JUNGLE_TREES) is skipped so the two don't double up. */
export const WILD_FOREST_CLUSTERS: { x: number; z: number; s: number; c: string }[] = (() => {
  let s = 13;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { x: number; z: number; s: number; c: string }[] = [];
  const cols = ["#2f8a4a", "#3f9a46", "#2a7a52", "#4aa850"];
  const x0 = ISLAND_CENTER.x - ISLAND_VIEW;
  const z0 = ISLAND_CENTER.z - ISLAND_VIEW;
  const span = ISLAND_VIEW * 2;
  const step = 30;
  for (let z = z0; z < z0 + span; z += step)
    for (let x = x0; x < x0 + span; x += step) {
      const jx = x + (rnd() - 0.5) * 18;
      const jz = z + (rnd() - 0.5) * 18;
      if (Math.hypot(jx, jz) < ISLAND_R + 60) continue; // the park's own canopy already has JUNGLE_TREES
      if (wildRainforestK(jx, jz) < 0.4) continue;
      out.push({ x: jx, z: jz, s: 4 + rnd() * 3, c: cols[out.length % cols.length] });
    }
  return out;
})();

/** named regions a kid can read at Island zoom — Great Lake/Sunny Plains/the Great Falls already
 *  get a name from their own station pin; these are the two that don't have one of their own */
export const REGION_LABELS: { id: string; name: string; emoji: string; x: number; z: number }[] = (() => {
  const riverMid = WILD_RIVER_POINTS[Math.floor(WILD_RIVER_POINTS.length * 0.55)];
  let fx = 900;
  let fz = -800;
  if (WILD_FOREST_CLUSTERS.length) {
    let sx = 0;
    let sz = 0;
    for (const t of WILD_FOREST_CLUSTERS) {
      sx += t.x;
      sz += t.z;
    }
    fx = sx / WILD_FOREST_CLUSTERS.length;
    fz = sz / WILD_FOREST_CLUSTERS.length;
  }
  return [
    { id: "wild-river", name: "Wild River", emoji: "💧", x: riverMid[0], z: riverMid[1] },
    { id: "wildlands-forest", name: "The Wildlands", emoji: "🌲", x: fx, z: fz },
  ];
})();

/** a little peak glyph (a triangle + snow cap) at the island's two named summits — not a text
 *  label (their names already show via the "Great Ridge" landmark / the Everest wonder pin), just
 *  the "this is a mountain" mark the Island view was missing */
export const MOUNTAIN_PEAKS: { id: string; x: number; z: number }[] = [
  { id: "lone-peak", x: LONE_PEAK.x, z: LONE_PEAK.z },
  { id: "everest-summit", x: EVEREST_SUMMIT.x, z: EVEREST_SUMMIT.z },
];

export const SEA_LIFE = [
  { e: "🐋", a: 0.6 },
  { e: "🐬", a: 2.2 },
  { e: "🪼", a: 3.3 },
  { e: "🐢", a: 4.4 },
  { e: "🐬", a: 5.4 },
].map((s) => ({ ...s, x: Math.sin(s.a) * (ISLAND_R + 24), z: Math.cos(s.a) * (ISLAND_R + 24) }));

/** every building icon (big-map only — too fiddly to read when zoomed out) */
export const PLACE_ICONS = PLACES.filter((p) => p.land !== "plaza" && p.land !== "gate");

const islandBlob = (w: WorldPlace, extra: number) => {
  const seed = w.x * 0.011 + w.z * 0.017;
  return d(
    Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      const r = (w.r + extra) * (1 + Math.sin(a * 3 + seed) * 0.08 + Math.sin(a * 5 + seed * 2) * 0.05);
      return [w.x + Math.sin(a) * r, w.z + Math.cos(a) * r] as P2;
    }),
    true,
  );
};
const shapeOf = (pts: { x: number; z: number }[]) => d(pts.map((p) => [p.x, p.z] as P2), true);
export const WORLD_SHAPES = WORLD_PLACES.map((w) => ({
  w,
  beach: w.kind === "island" ? (w.shore ? shapeOf(w.shore) : islandBlob(w, 8)) : "",
  land: w.outline ? shapeOf(w.outline) : islandBlob(w, 0),
  crack: w.path ? d(w.path.map((p) => [p.x, p.z] as P2)) : "",
}));

// ── shaded-relief ground pictures: built once, lazily (the first time a band that needs them is
// actually drawn), cached as plain <canvas> elements so MapCanvas.tsx can `drawImage` them straight
// in — no base64 round-trip. One shared colour ramp (`biomeColor` below) for every band, so the
// park's close-up raster, the whole-island raster and the moving local tile never disagree about
// what colour a given height/biome is — zooming between them should never show a seam. ──
let reliefCanvas: HTMLCanvasElement | null = null;
let islandReliefCanvas: HTMLCanvasElement | null = null;
let localReliefCanvas: HTMLCanvasElement | null = null;
let localReliefKey = "";

/** one height (+ position, for the rainforest tint and the park's own mesa) -> one colour, shared
 *  by every relief raster this module bakes */
function biomeColor(h: number, wx: number, wz: number): [number, number, number] {
  let r = 230;
  let gr = 210;
  let b = 165; // sand
  if (h > 4) [r, gr, b] = [124, 204, 132]; // grass
  if (h > 13) [r, gr, b] = [100, 170, 106]; // forested hills
  if (h > 40) [r, gr, b] = [150, 142, 124]; // rock
  if (h > 76) [r, gr, b] = [236, 238, 250]; // snow
  if (h > 0.2 && h <= 40) {
    const jk = wildRainforestK(wx, wz);
    if (jk > 0.1) {
      r += (46 - r) * jk * 0.8;
      gr += (120 - gr) * jk * 0.8;
      b += (58 - b) * jk * 0.8;
    }
  }
  // Rainbow Falls' mesa is warm rock with a mossy top, not a snowy peak (only ever true near the
  // park, but mesaEdgeDist is cheap everywhere so every band can share this one function)
  const med = mesaEdgeDist(wx, wz);
  if (med < 4) [r, gr, b] = med < -1.5 ? [104, 150, 92] : [140, 108, 88];
  return [r, gr, b];
}

/** `feather`: this raster is drawn ON TOP of another one (the whole-island raster — see
 *  islandRelief()/the MapCanvas.tsx call site), not as the only layer, so its own edges fade to
 *  transparent over their outer 10% instead of cutting off hard — the coarser raster underneath
 *  shows through smoothly instead of a seam. The island raster itself never feathers: it's the one
 *  layer that has to give full, opaque coverage everywhere a kid can zoom to. */
function paintRelief(cv: HTMLCanvasElement, S: number, x0: number, z0: number, span: number, feather: boolean) {
  const c = cv.getContext("2d");
  if (!c) return;
  const g = new Float32Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) g[j * S + i] = groundYFar(x0 + (i / (S - 1)) * span, z0 + (j / (S - 1)) * span);
  const img = c.createImageData(S, S);
  const at = (i: number, j: number) => g[Math.min(S - 1, Math.max(0, j)) * S + Math.min(S - 1, Math.max(0, i))];
  const half = (S - 1) / 2;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const h = at(x, y);
      const shade = Math.max(-1, Math.min(1, (at(x - 1, y - 1) - at(x + 1, y + 1)) * 0.32));
      const wx = x0 + (x / (S - 1)) * span;
      const wz = z0 + (y / (S - 1)) * span;
      const [r, gr, b] = biomeColor(h, wx, wz);
      const k = 1 + shade * 0.35;
      const o = (y * S + x) * 4;
      img.data[o] = Math.min(255, r * k);
      img.data[o + 1] = Math.min(255, gr * k);
      img.data[o + 2] = Math.min(255, b * k);
      let a = h > 0.2 ? 200 : 0;
      if (feather) {
        // radial distance from the tile's own centre, normalised so the inscribed circle's edge = 1
        const d = Math.hypot(x - half, y - half) / half;
        const fade = d < 0.9 ? 1 : Math.max(0, 1 - (d - 0.9) / 0.1);
        a = Math.round(a * fade);
      }
      img.data[o + 3] = a;
    }
  c.putImageData(img, 0, 0);
}

/** the park's own close relief (±260 units — a bit past the old ±200 so a tall phone screen's
 *  extra vertical reach at the default zoom still finds shaded ground, not a flat colour past the
 *  raster's edge): built synchronously the first time it's asked for. 420² (~1.2 units/px) — the
 *  old 260² (~2 units/px) read noticeably soft once the rest of the map got crisper. */
export function parkRelief(): HTMLCanvasElement | null {
  if (reliefCanvas || typeof document === "undefined") return reliefCanvas;
  const S = 420;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  paintRelief(cv, S, -TERRAIN_EXTENT, -TERRAIN_EXTENT, TERRAIN_EXTENT * 2, true);
  reliefCanvas = cv;
  return cv;
}

/** the whole ~3 km island's relief: 640² (~6 units/px — the old 320²/~12 units/px read as visible
 *  square pixels once you zoomed into the Island band). Still one synchronous paint: `groundYFar`
 *  is cheap and this only runs once, the first time the Island/World view is opened. */
export function islandRelief(): HTMLCanvasElement | null {
  if (islandReliefCanvas || typeof document === "undefined") return islandReliefCanvas;
  const S = 640;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  paintRelief(cv, S, ISLAND_CENTER.x - ISLAND_VIEW, ISLAND_CENTER.z - ISLAND_VIEW, ISLAND_VIEW * 2, false);
  islandReliefCanvas = cv;
  return cv;
}
export const islandReliefBounds = { x0: ISLAND_CENTER.x - ISLAND_VIEW, z0: ISLAND_CENTER.z - ISLAND_VIEW, span: ISLAND_VIEW * 2 };
export const parkReliefBounds = { x0: -TERRAIN_EXTENT, z0: -TERRAIN_EXTENT, span: TERRAIN_EXTENT * 2 };

/** a small relief tile that follows the camera when it's zoomed in close on a Wildlands spot (the
 *  park has its own fine close-up raster above; out in the Wildlands, the whole-island raster alone
 *  is far too coarse at a close zoom — this is what used to read as a "green mush" around the Great
 *  Falls). 300² over a span that scales with the camera's own view, clamped so it never shrinks to
 *  nothing or balloons out needlessly — it no longer has to cover the *whole* visible canvas on its
 *  own: MapCanvas.tsx always draws the whole-island raster first, full coverage, and blends this
 *  one on top of it feathered (paintRelief's `feather` flag), so whatever this tile *doesn't* reach
 *  just shows the coarser island raster instead of a flat gap — see MapCanvas.tsx's relief-drawing
 *  comment for the seam that used to cause. Rebuilt only when the camera drifts far enough from
 *  where it was last baked, or the required span changes band (snapped grids on both), so pan/zoom
 *  never re-bakes every frame. */
const LOCAL_RELIEF_S = 300;
export function localRelief(cx: number, cz: number, view: number): { img: HTMLCanvasElement; x0: number; z0: number; span: number } | null {
  if (typeof document === "undefined") return null;
  const span = Math.min(900, Math.max(220, view * 2.2));
  const grid = Math.max(30, span / 6);
  const rx = Math.round(cx / grid) * grid;
  const rz = Math.round(cz / grid) * grid;
  const spanBucket = Math.round(span / 40) * 40;
  const key = `${rx},${rz},${spanBucket}`;
  if (!localReliefCanvas || localReliefKey !== key) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = LOCAL_RELIEF_S;
    paintRelief(cv, LOCAL_RELIEF_S, rx - spanBucket / 2, rz - spanBucket / 2, spanBucket, true);
    localReliefCanvas = cv;
    localReliefKey = key;
  }
  return { img: localReliefCanvas, x0: rx - spanBucket / 2, z0: rz - spanBucket / 2, span: spanBucket };
}
