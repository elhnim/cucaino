"use client";

// The park map, drawn like a storybook: a wobbly island in a wavy sea, sandy beach, grassy hills,
// Rainbow Falls on its mesa, the river winding through the rainforest into Rainbow Lake, the trails, little trees, and every land as a soft coloured blob with its
// buildings. Everything comes from lib/park/registry/island.ts, so it always matches the 3D park.
// The little map (top-left) follows you and turns with the camera — up is the way you're looking.
// Tap it for the big map (north-up): tap a land or a pin and your animal walks there along the trails.
// Rides kids can find (dragons, manta reefs, docks, unicorn glades) get their own little pins, read
// from the engine once the park has loaded (so none of the ride registries load before it).
import { useEffect, useMemo, useRef, useState } from "react";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import type { RidePin } from "@/lib/park/world/rideables";
import { LANDS, PLACES, type LandDef } from "@/lib/park/registry/places";
import { BRIDGES, HILLS, ISLAND_R, POND, TRAIL_POINTS, coastR, nearStream, nearTrail, parkCoastR, routeBetween, type P2 } from "@/lib/park/registry/island";
import { FALLS, JETTY, LAKE_OUTLINE, MESA, OUTLET_HALF, OUTLET_POINTS, RIVER_LENGTH, mesaEdgeDist, mesaRadius, riverHalfWidth, riverPointAt } from "@/lib/park/registry/waterways";
import { underCanopy } from "@/lib/park/registry/jungle";
import { playSfx } from "@/lib/audio/sound-manager";
import { groundYFar } from "@/lib/park/registry/terrain";
/** the shaded relief covers the park's own land (the whole island's relief is a separate, lazier picture) */
const TERRAIN_EXTENT = 200;
import { ISLAND_CENTER, ISLAND_DESTINATIONS, ISLAND_LANDMARKS, ISLAND_VIEW, WORLD_EDGE, WORLD_PLACES, type MapDestination, type WorldPlace } from "@/lib/park/registry/worldMap";
import { RAIL_POINTS, STATIONS } from "@/lib/park/registry/railway";
import { WILD_FALLS, WILD_LAKE_OUTLINE, WILD_OUTLET_POINTS, WILD_RIVER_POINTS, wildRainforestK, wildRiverHalfWidth } from "@/lib/park/registry/wildWater";
import { CART_ROAD } from "@/lib/park/registry/cartRoad";
import { BOAT_ROUTE } from "@/lib/park/registry/trade";
import { TRADERS, allTraderStates } from "@/lib/park/world/trade/plan";
import { allFishingBoatStates } from "@/lib/park/world/sea/fishingBoatsPlan";

type Pose = NonNullable<ReturnType<ParkWorld["getPose"]>>;

/** A marker for an important place, e.g. the Quest Board with how many quests are left. */
export interface MapPin {
  id: string;
  x: number;
  z: number;
  emoji: string;
  label: string;
  /** red count bubble (e.g. quests left); 0/undefined hides it */
  badge?: number;
  /** pulse to draw the eye */
  pulse?: boolean;
  /** up on a floating mountain: tapping it can't walk you there (onSkyPin explains how to fly) */
  sky?: boolean;
  /** far out at sea (shown on the map's edge, pointing the way; onSkyPin explains how to get there) */
  far?: boolean;
  /** what to tell a kid who taps it (how to get there) */
  how?: string;
}

const NEAR_VIEW = 44;
/** the little map zooms out when you're out at sea, so the islands round about show */
const SEA_VIEW = 150;
/** the little map zooms out wider still when you're out walking the Wildlands (the park is tiny
 *  from way out there, but the island's relief, water and railway keep it from looking empty) */
const WILD_VIEW = 160;
const WORLD_VIEW = ISLAND_R + 34;
/** the big map's Island view: the whole ~3 km island, north-up */
const BIG_ISLAND_VIEW = ISLAND_VIEW;
/** the big map's World view: the whole ocean, out to the edge of the world */
const GLOBE_VIEW = WORLD_EDGE + 36;

function landAt(x: number, z: number): LandDef | undefined {
  return LANDS.find((l) => Math.hypot(x - l.x, z - l.z) < l.radius + 3);
}

/** Walk route to a land, along the trails. */
export function routeTo(pose: { x: number; z: number }, to: LandDef): [number, number][] {
  if (landAt(pose.x, pose.z)?.id === to.id) return [[to.x, to.z]];
  return routeBetween(pose, { x: to.x, z: to.z });
}

/** Walk route to a spot (e.g. just in front of the Quest Board or a wizard), along the trails. */
export function routeToSpot(pose: { x: number; z: number }, x: number, z: number): [number, number][] {
  return routeBetween(pose, { x, z });
}

// ── map artwork, computed once ──
const d = (pts: P2[], close = false) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + (close ? " Z" : "");
const ring = (extra: number) =>
  d(
    Array.from({ length: 140 }, (_, i) => {
      const a = (i / 140) * Math.PI * 2;
      const r = coastR(a) + extra;
      return [Math.sin(a) * r, Math.cos(a) * r] as P2;
    }),
    true,
  );
const COAST = ring(0);
const BEACH = ring(13);
/** the park's own coastline (just the old little island, the south-west end of the big island):
 *  drawn as a highlighted "Cucaino Park" area on the Island tab, so a kid can tell the park from
 *  the wider Wildlands */
const PARK_AREA = d(
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
const LAND_SHAPES = LANDS.filter((l) => l.id !== "gate").map((l) => ({ l, path: blob(l) }));
const TRAIL_PATHS = TRAIL_POINTS.map((pts) => d(pts));
/** the river as a filled ribbon (its true width all the way), the lake, the outlet, the mesa */
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
const RIVER_BANK = riverShape(1.6);
const RIVER = riverShape(0);
const LAKE_PATH = d(LAKE_OUTLINE, true);
const OUTLET_PATH = d(OUTLET_POINTS);
const MESA_PATH = d(
  Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r = mesaRadius(a) + 1.5;
    return [MESA.x + Math.sin(a) * r, MESA.z + Math.cos(a) * r] as P2;
  }),
  true,
);
// ── the Wildlands' own waterway (lib/park/registry/wildWater.ts): the Wild River as a true-width
// ribbon (same technique as the park's own river above), the Great Lake, and the outlet (drawn as
// a simple wide band — its exact half-width isn't exported, and a kid's map doesn't need it to the
// metre) ──
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
const WILD_RIVER_BANK = wildRiverShape(3.2);
const WILD_RIVER = wildRiverShape(0);
const WILD_LAKE_PATH = d(WILD_LAKE_OUTLINE, true);
const WILD_OUTLET_PATH = d(WILD_OUTLET_POINTS);
/** the railway loop, drawn as a dashed track on the Island tab */
const RAIL_PATH = d(RAIL_POINTS, true);
/** the traders' own routes, drawn faintly on the Island tab: a dirt cart road, a boat route */
const CART_ROAD_PATH = d(CART_ROAD.points);
const BOAT_ROUTE_PATH = d(BOAT_ROUTE);
/** the destinations a kid can tap on the Island tab (the five stations), plus the mountains it
 *  just labels (the Great Ridge, the Lone Peak's summit) */
const ISLAND_PINS: MapDestination[] = ISLAND_DESTINATIONS;
/** the rainforest's crowns: big dark-green rounds packed over the canopy */
const JUNGLE_TREES: { x: number; z: number; s: number; c: string }[] = (() => {
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
const TREES: { x: number; z: number; s: number; c: string }[] = (() => {
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
/** a shaded-relief picture of the terrain (hills, valleys, mountains, snow), drawn once */
let reliefUrl: string | null = null;
function relief(): string | null {
  if (reliefUrl || typeof document === "undefined") return reliefUrl;
  const S = 200;
  const N = S;
  const g = new Float32Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) g[j * S + i] = groundYFar(-TERRAIN_EXTENT + (i / (S - 1)) * TERRAIN_EXTENT * 2, -TERRAIN_EXTENT + (j / (S - 1)) * TERRAIN_EXTENT * 2);
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d");
  if (!c) return null;
  const img = c.createImageData(S, S);
  const at = (i: number, j: number) => g[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = Math.round((x / (S - 1)) * (N - 1));
      const j = Math.round((y / (S - 1)) * (N - 1));
      const h = at(i, j);
      // light from the north-west
      const shade = Math.max(-1, Math.min(1, (at(i - 1, j - 1) - at(i + 1, j + 1)) * 0.35));
      let r = 124, gr = 204, b = 132;
      if (h > 6) [r, gr, b] = [110, 178, 112];
      if (h > 12) [r, gr, b] = [150, 142, 124];
      if (h > 22) [r, gr, b] = [236, 238, 250];
      // (Rainbow Falls' mesa is warm rock with a mossy top, not a snowy peak)
      const wx = -TERRAIN_EXTENT + (x / (S - 1)) * TERRAIN_EXTENT * 2;
      const wz = -TERRAIN_EXTENT + (y / (S - 1)) * TERRAIN_EXTENT * 2;
      if (mesaEdgeDist(wx, wz) < 4) [r, gr, b] = mesaEdgeDist(wx, wz) < -1.5 ? [104, 150, 92] : [140, 108, 88];
      const k = 1 + shade * 0.35;
      const o = (y * S + x) * 4;
      img.data[o] = Math.min(255, r * k);
      img.data[o + 1] = Math.min(255, gr * k);
      img.data[o + 2] = Math.min(255, b * k);
      img.data[o + 3] = h > 0.2 ? 200 : 0;
    }
  c.putImageData(img, 0, 0);
  reliefUrl = cv.toDataURL();
  return reliefUrl;
}

/** a shaded-relief picture of the WHOLE island (the park and the Wildlands, ~3 km across): sand,
 *  grass, forest, rock and snow by height and slope, the rainforest darker green — drawn once,
 *  lazily, the first time either the Island tab or the HUD's wide Wildlands view needs it (a
 *  modest 180 px square covers the whole island, light enough to build on the spot) */
let islandReliefUrl: string | null = null;
function islandRelief(): string | null {
  if (islandReliefUrl || typeof document === "undefined") return islandReliefUrl;
  const S = 180;
  const x0 = ISLAND_CENTER.x - ISLAND_VIEW;
  const z0 = ISLAND_CENTER.z - ISLAND_VIEW;
  const span = ISLAND_VIEW * 2;
  const g = new Float32Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) g[j * S + i] = groundYFar(x0 + (i / (S - 1)) * span, z0 + (j / (S - 1)) * span);
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d");
  if (!c) return null;
  const img = c.createImageData(S, S);
  const at = (i: number, j: number) => g[Math.min(S - 1, Math.max(0, j)) * S + Math.min(S - 1, Math.max(0, i))];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const h = at(x, y);
      // light from the north-west
      const shade = Math.max(-1, Math.min(1, (at(x - 1, y - 1) - at(x + 1, y + 1)) * 0.3));
      let r = 230, gr = 210, b = 165; // sand
      if (h > 4) [r, gr, b] = [124, 204, 132]; // grass
      if (h > 16) [r, gr, b] = [96, 160, 100]; // forested hills
      if (h > 42) [r, gr, b] = [150, 142, 124]; // rock
      if (h > 78) [r, gr, b] = [236, 238, 250]; // snow
      // the rainforest reads darker green, round the Great Falls and along the upper Wild River
      if (h > 0.2 && h <= 42) {
        const wx = x0 + (x / (S - 1)) * span;
        const wz = z0 + (y / (S - 1)) * span;
        const jk = wildRainforestK(wx, wz);
        if (jk > 0.1) {
          r = r + (46 - r) * jk * 0.8;
          gr = gr + (120 - gr) * jk * 0.8;
          b = b + (58 - b) * jk * 0.8;
        }
      }
      const k = 1 + shade * 0.35;
      const o = (y * S + x) * 4;
      img.data[o] = Math.min(255, r * k);
      img.data[o + 1] = Math.min(255, gr * k);
      img.data[o + 2] = Math.min(255, b * k);
      img.data[o + 3] = h > 0.2 ? 200 : 0;
    }
  c.putImageData(img, 0, 0);
  islandReliefUrl = cv.toDataURL();
  return islandReliefUrl;
}

const forest = LANDS.find((l) => l.id === "forest")!;
const GLOW_TREES = Array.from({ length: 16 }, (_, i) => {
  const a = i * 2.39996;
  const r = Math.sqrt((i + 0.5) / 16) * (forest.radius - 3);
  return { x: forest.x + Math.sin(a) * r, z: forest.z + Math.cos(a) * r, c: ["#8f7bff", "#6fe0ff", "#ff8ae0", "#7fffc4"][i % 4] };
});
const SEA_LIFE = [
  { e: "🐋", a: 0.6 },
  { e: "🐬", a: 2.2 },
  { e: "🪼", a: 3.3 },
  { e: "🐢", a: 4.4 },
  { e: "🐬", a: 5.4 },
].map((s) => ({ ...s, x: Math.sin(s.a) * (ISLAND_R + 24), z: Math.cos(s.a) * (ISLAND_R + 24) }));

/** far islands as rim pins on the island map (they're beyond its edge) */
const FAR_PINS: MapPin[] = WORLD_PLACES.filter((w) => w.kind === "island").map((w) => ({ id: `far:${w.id}`, x: w.x, z: w.z, emoji: w.emoji, label: w.name, far: true, how: w.how }));
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
/** (an island with a real outline — a long one, like Dino Isle — draws that; round ones a blob) */
const shapeOf = (pts: { x: number; z: number }[]) => d(pts.map((p) => [p.x, p.z] as P2), true);
const WORLD_SHAPES = WORLD_PLACES.map((w) => ({
  w,
  beach: w.kind === "island" ? (w.shore ? shapeOf(w.shore) : islandBlob(w, 8)) : "",
  land: w.outline ? shapeOf(w.outline) : islandBlob(w, 0),
  crack: w.path ? d(w.path.map((p) => [p.x, p.z] as P2)) : "",
}));

export function MiniMap({
  world,
  hidden,
  pins = [],
  onSkyPin,
  onToast,
}: {
  world: React.RefObject<ParkWorld | null>;
  hidden?: boolean;
  pins?: MapPin[];
  onSkyPin?: (p: MapPin) => void;
  /** a short line shown on screen (e.g. "Flying to the Great Falls!"); falls back to onSkyPin's
   *  toast-ish hints when left out (the smoke harness doesn't pass one) */
  onToast?: (text: string) => void;
}) {
  const [pose, setPose] = useState<Pose | null>(null);
  const [big, setBig] = useState(false);
  const [tab, setTab] = useState<"park" | "island" | "world">("park");
  const [rides, setRides] = useState<RidePin[]>([]);
  const [tradeDots, setTradeDots] = useState<{ id: string; x: number; z: number; mode: "cart" | "boat" }[]>([]);
  const [fishDots, setFishDots] = useState<{ id: string; x: number; z: number }[]>([]);
  const last = useRef("");

  // poll the engine ~8x a second; only re-render when something visibly moved
  useEffect(() => {
    if (hidden && !big) return;
    const id = window.setInterval(() => {
      const p = world.current?.getPose() ?? null;
      if (p && !rides.length) {
        const rp = world.current?.ridePins ?? [];
        if (rp.length) setRides(rp);
      }
      const key = p ? `${p.x.toFixed(1)},${p.z.toFixed(1)},${p.facing.toFixed(2)},${p.yaw.toFixed(2)},${p.pet?.x.toFixed(0)},${p.pet?.z.toFixed(0)}` : "";
      if (key !== last.current) {
        last.current = key;
        setPose(p);
      }
      // travelling traders: cheap (a handful of pure function calls) — small moving dots on the
      // Island tab, same clock the 3D world runs on so they never drift out of step with it
      const clockT = world.current?.getClockT();
      if (clockT !== undefined) {
        const dots = allTraderStates(clockT)
          .filter((s) => s.atPostId === null)
          .map((s) => ({ id: s.id, x: s.x, z: s.z, mode: TRADERS.find((t) => t.id === s.id)!.mode }));
        setTradeDots(dots);
        // fishing boats: little dots out at sea, on the World tab only (also cheap: a dozen pure
        // function calls, same clock)
        setFishDots(allFishingBoatStates(clockT).map((s) => ({ id: s.id, x: s.x, z: s.z })));
      }
    }, 125);
    return () => window.clearInterval(id);
  }, [world, hidden, big, rides.length]);

  if (!pose || (hidden && !big)) return null;
  const here = landAt(pose.x, pose.z);

  const goTo = (land: LandDef) => {
    playSfx("tap");
    world.current?.walkKidPath(routeTo(pose, land));
    setBig(false);
  };
  const goToPin = (pin: MapPin) => {
    playSfx("tap");
    if (pin.sky || pin.far || pin.how) {
      onSkyPin?.(pin);
      setBig(false);
      return;
    }
    world.current?.walkKidPath(routeToSpot(pose, pin.x, pin.z + 4));
    setBig(false);
  };
  /** a ride pin: walk up beside it (land rides), or say how to get there (sea / sky) */
  const goToRide = (r: RidePin) => {
    if (r.sky || r.sea || r.how) {
      playSfx("tap");
      onSkyPin?.({ id: r.id, x: r.x, z: r.z, emoji: r.emoji, label: r.label, sky: r.sky, how: r.how });
      setBig(false);
      return;
    }
    playSfx("tap");
    // stop just short of it, on the side facing the middle of the island (where the trails are)
    const d = Math.hypot(r.x, r.z) || 1;
    const k = r.kind === "dragon" ? 5 : 3;
    world.current?.walkKidPath(routeToSpot(pose, r.x - (r.x / d) * k, r.z - (r.z / d) * k));
    setBig(false);
  };
  /** a station on the Island tab (Park Station, the Great Falls, the Great Lake, the Lone Peak,
   *  the Sunny Plains): riding a flier, the dragon flies straight there; otherwise, a hint about
   *  the train (and, if the kid's still in the park, a walk to Park Station to catch it) */
  const goToDestination = (dest: MapDestination) => {
    playSfx("tap");
    if (world.current?.canFlyTo) {
      world.current.flyTo(dest.x, dest.z, dest.name);
      setBig(false);
      onToast?.(`🐉 Flying to ${dest.name}! Touch the joystick to take over`);
      return;
    }
    const parkStation = STATIONS.find((s) => s.id === "park-station")!;
    const how = dest.id === "park-station" ? "🚂 Hop on the train here to explore the Wildlands — or ride a dragon!" : `🚂 Take the train from 🎡 Park Station — or ride a dragon there!`;
    onSkyPin?.({ id: dest.id, x: dest.x, z: dest.z, emoji: dest.emoji, label: dest.name, how });
    if (Math.hypot(pose.x, pose.z) < ISLAND_R + 60) world.current?.walkKidPath(routeToSpot(pose, parkStation.x, parkStation.z));
    setBig(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          playSfx("tap");
          setBig(true);
        }}
        style={miniBtn}
        aria-label="Open the park map"
      >
        <MapSvg pose={pose} size={typeof window !== "undefined" && window.innerWidth < 520 ? 96 : 128} pins={pins} rides={rides} tradeDots={tradeDots} fishDots={fishDots} />
        <span style={hereTag}>{here ? `${here.emoji} ${here.name}` : "🍭 Park trails"}</span>
      </button>
      {big && (
        <div style={bigWrap} onClick={() => setBig(false)}>
          <div style={bigCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={mapTitle}>{tab === "world" ? "🌍 Map of the World" : "🗺️ Map of Cucaino Island"}</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "rgba(226,230,255,0.74)", marginTop: 2 }}>
                  {tab === "world" ? "Tap an island to find out how to get there" : tab === "island" ? "Tap a station or a Wildlands spot to visit it!" : "Tap a place and I'll walk you there!"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["park", "island", "world"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setTab(v)} style={{ ...tabBtn, ...(v === tab ? tabOn : null) }}>
                    {v === "park" ? "🍭 Park" : v === "island" ? "🏝️ Island" : "🌍 World"}
                  </button>
                ))}
              </div>
              <button type="button" style={closeBtn} onClick={() => setBig(false)} aria-label="Close map">
                ✕
              </button>
            </div>
            <MapSvg pose={pose} size={0} labels tab={tab} onLand={goTo} onPin={goToPin} onDest={goToDestination} onRide={goToRide} hereId={here?.id} pins={pins} rides={rides} tradeDots={tradeDots} fishDots={fishDots} />
          </div>
        </div>
      )}
    </>
  );
}

function MapSvg({
  pose,
  size,
  labels,
  onLand,
  onPin,
  onDest,
  hereId,
  pins = [],
  rides = [],
  onRide,
  tab = "park",
  tradeDots = [],
  fishDots = [],
}: {
  pose: Pose;
  size: number;
  labels?: boolean;
  /** which big-map tab is open (ignored on the small HUD map, which picks its own zoom) */
  tab?: "park" | "island" | "world";
  onLand?: (l: LandDef) => void;
  onPin?: (p: MapPin) => void;
  /** tapping a station or a named Wildlands spot, on the Island tab */
  onDest?: (d: MapDestination) => void;
  hereId?: string;
  pins?: MapPin[];
  /** rides to find (dragons, manta reefs, docks, unicorns) */
  rides?: RidePin[];
  onRide?: (r: RidePin) => void;
  /** carts and boats on the move, read off plan.ts's pure traderStateAtTime() (Island tab only) */
  tradeDots?: { id: string; x: number; z: number; mode: "cart" | "boat" }[];
  /** fishing boats out at sea, read off fishingBoatsPlan.ts's pure fishingBoatStateAtTime() (World tab only) */
  fishDots?: { id: string; x: number; z: number }[];
}) {
  const globe = tab === "world";
  const island = tab === "island";
  // big map: north-up; small map: follows you and turns with the camera. Out in the Wildlands
  // (away from the park), the HUD zooms out wider so it's never an empty green disc.
  const deg = labels ? 0 : (pose.yaw * 180) / Math.PI;
  const atSea = Math.hypot(pose.x, pose.z) > ISLAND_R + 28;
  const wild = !labels && Math.hypot(pose.x, pose.z) > ISLAND_R + 40;
  const VIEW = labels ? (globe ? GLOBE_VIEW : island ? BIG_ISLAND_VIEW : WORLD_VIEW) : wild ? WILD_VIEW : atSea ? SEA_VIEW : NEAR_VIEW;
  /** icons and labels grow with the view so they stay the same size on screen */
  const u = VIEW / (labels ? WORLD_VIEW : NEAR_VIEW);
  const follow = labels ? (island ? ` translate(${-ISLAND_CENTER.x} ${-ISLAND_CENTER.z})` : "") : ` translate(${-pose.x} ${-pose.z})`;
  const upright = (x: number, z: number) => (labels ? "" : `rotate(${-deg} ${x} ${z})`);
  const clipId = `mm-clip-${size}`;
  const k = labels ? 1 : 0.8; // line weights on the small map
  const placeIcons = useMemo(() => PLACES.filter((p) => p.land !== "plaza" && p.land !== "gate"), []);
  // the whole-island picture (relief, water, railway): the Island tab, or the HUD out in the
  // Wildlands — never the Park tab or the World tab, which stay as they were
  const showWild = island || (!labels && wild);
  const showParkRelief = !showWild;

  return (
    <svg
      viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
      width={size || "100%"}
      height={size || undefined}
      style={{ display: "block", aspectRatio: "1", fontFamily: "inherit", maxHeight: size ? undefined : "min(72vh, 560px)", margin: "0 auto" }}
      role="img"
      aria-label="Map of Cucaino Island"
    >
      <defs>
        <clipPath id={clipId}>{labels ? <rect x={-VIEW} y={-VIEW} width={VIEW * 2} height={VIEW * 2} rx={VIEW * 0.12} /> : <circle r={VIEW} />}</clipPath>
        <clipPath id={`coast-${size}`}>
          <path d={COAST} />
        </clipPath>
        <pattern id={`waves-${size}`} width="18" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 6 q4.5 -5 9 0 t9 0" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
        </pattern>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x={-VIEW * 3} y={-VIEW * 3} width={VIEW * 6} height={VIEW * 6} fill="#8fd8f5" />
        <g transform={`rotate(${deg})${follow}`}>
          <rect x={-GLOBE_VIEW * 2} y={-GLOBE_VIEW * 2} width={GLOBE_VIEW * 4} height={GLOBE_VIEW * 4} fill={`url(#waves-${size})`} />
          {/* the edge of the world (sail on past it and you come back round) */}
          {globe && (
            <g pointerEvents="none">
              <circle r={WORLD_EDGE} fill="none" stroke="#ffffff" strokeOpacity={0.8} strokeWidth={3} strokeDasharray="14 10" />
              <text x={0} y={-WORLD_EDGE - 12} textAnchor="middle" fontSize={30} fontWeight={900} fill="#1f5f8a" stroke="#ffffff" strokeWidth={6} paintOrder="stroke">
                ✨ the edge of the world — sail on and you come back round ✨
              </text>
            </g>
          )}
          {/* little fishing boats out working the seas */}
          {globe &&
            fishDots.map((fd) => (
              <circle key={fd.id} cx={fd.x} cy={fd.z} r={2.2 * u} fill="#f2ede0" stroke="#4a4440" strokeWidth={0.7 * u} pointerEvents="none" />
            ))}
          {/* the far islands, the floating mountains and the Abyss (not on the Island tab: a couple
              sit close enough to the big island to land inside its frame, which would read as part
              of it — they belong on the World tab instead) */}
          {!island &&
            WORLD_SHAPES.map(({ w, beach, land, crack }) => (
            <g key={`w-${w.id}`} pointerEvents="none">
              {w.kind === "island" && (
                <>
                  <path d={beach} fill="#ffe7bf" stroke="#ffffff" strokeWidth={2 * k} />
                  <path d={land} fill={w.land ?? "#a6e8bd"} />
                </>
              )}
              {w.kind === "sky" && <path d={land} fill="#ffffff" fillOpacity={0.55} stroke="#b9a6ff" strokeWidth={1.4 * k} strokeDasharray="4 3" />}
              {w.kind === "abyss" && crack && (
                <>
                  <path d={crack} fill="none" stroke="#12305a" strokeOpacity={0.75} strokeWidth={w.r * 2} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={crack} fill="none" stroke="#050a1a" strokeOpacity={0.8} strokeWidth={w.r * 0.8} strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </g>
          ))}
          {(globe || (!labels && atSea)) &&
            WORLD_SHAPES.map(({ w }) => {
              const ax = w.path ? w.path[Math.floor(w.path.length / 2)].x : w.x;
              const az = w.path ? w.path[Math.floor(w.path.length / 2)].z : w.z;
              return (
                <g key={`wl-${w.id}`} transform={upright(ax, az)} onClick={onPin ? () => onPin({ id: w.id, x: w.x, z: w.z, emoji: w.emoji, label: w.name, how: w.how }) : undefined} style={{ cursor: onPin ? "pointer" : undefined }}>
                  <text x={ax} y={az + 4 * u} textAnchor="middle" fontSize={(w.kind === "sky" ? 7 : 15) * u}>
                    {w.emoji}
                  </text>
                  {labels && w.kind !== "sky" && (
                    <text x={ax} y={az + 16 * u} textAnchor="middle" fontSize={7.4 * u} fontWeight={900} fill="#5a2350" stroke="#ffffff" strokeWidth={2.4 * u} paintOrder="stroke">
                      {w.name}
                    </text>
                  )}
                </g>
              );
            })}
          {/* beach + island */}
          <path d={BEACH} fill="#ffe7bf" stroke="#ffffff" strokeWidth={2 * k} />
          <path d={COAST} fill="#a6e8bd" />
          {/* the terrain: hills, valleys and the snowy northern mountains (the park's own close-up
              relief, or — on the Island tab and out in the Wildlands — the whole island's) */}
          {showParkRelief
            ? relief() && <image href={relief()!} x={-TERRAIN_EXTENT} y={-TERRAIN_EXTENT} width={TERRAIN_EXTENT * 2} height={TERRAIN_EXTENT * 2} preserveAspectRatio="none" clipPath={`url(#coast-${size})`} pointerEvents="none" />
            : islandRelief() && <image href={islandRelief()!} x={ISLAND_CENTER.x - ISLAND_VIEW} y={ISLAND_CENTER.z - ISLAND_VIEW} width={ISLAND_VIEW * 2} height={ISLAND_VIEW * 2} preserveAspectRatio="none" clipPath={`url(#coast-${size})`} pointerEvents="none" />}
          {/* the Wildlands' own waterway: the Wild River, the Great Lake and its outlet to the sea,
              the Great Falls — and the railway loop with its five stations */}
          {showWild && (
            <g pointerEvents="none">
              <path d={WILD_RIVER_BANK} fill="#f5dcae" />
              <path d={WILD_LAKE_PATH} fill="#f5dcae" stroke="#f5dcae" strokeWidth={6 * u} />
              <path d={WILD_OUTLET_PATH} fill="none" stroke="#f5dcae" strokeWidth={Math.max(22, 3.6 * u)} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={WILD_FALLS.pool.x} cy={WILD_FALLS.pool.z} r={WILD_FALLS.pool.r + 3} fill="#f5dcae" />
              <path d={WILD_RIVER} fill="#5cbcef" />
              <path d={WILD_LAKE_PATH} fill="#5cbcef" />
              <path d={WILD_OUTLET_PATH} fill="none" stroke="#5cbcef" strokeWidth={Math.max(16, 2.4 * u)} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={WILD_FALLS.pool.x} cy={WILD_FALLS.pool.z} r={WILD_FALLS.pool.r} fill="#5cbcef" />
              {labels && (
                <text x={WILD_FALLS.lip.x} y={WILD_FALLS.lip.z - 14 * u} textAnchor="middle" fontSize={11 * u}>
                  💦
                </text>
              )}
              {/* the railway: a dashed track round the whole loop */}
              <path d={RAIL_PATH} fill="none" stroke="#8a5a34" strokeOpacity={0.85} strokeWidth={2.4 * u} strokeDasharray={`${3 * u} ${2.6 * u}`} strokeLinecap="round" />
              {/* the traders' own routes, faint: a dirt road and a boat route */}
              <path d={CART_ROAD_PATH} fill="none" stroke="#9a7a4a" strokeOpacity={0.55} strokeWidth={1.8 * u} strokeLinecap="round" strokeLinejoin="round" />
              <path d={BOAT_ROUTE_PATH} fill="none" stroke="#e8f0ea" strokeOpacity={0.6} strokeWidth={1.4 * u} strokeDasharray={`${1.2 * u} ${2 * u}`} strokeLinecap="round" />
              {/* carts and boats on the move */}
              {tradeDots.map((td) => (
                <circle key={td.id} cx={td.x} cy={td.z} r={2.6 * u} fill={td.mode === "cart" ? "#c97a3c" : "#3a7aa8"} stroke="#ffffff" strokeWidth={0.8 * u} />
              ))}
            </g>
          )}
          {/* the park, highlighted on the Island tab so it stands out from the wider Wildlands */}
          {island && (
            <g pointerEvents="none">
              <path d={PARK_AREA} fill="#ffe28a" fillOpacity={0.22} stroke="#ffe28a" strokeOpacity={0.85} strokeWidth={2.6 * u} strokeDasharray={`${1.5 * u} ${2.2 * u}`} />
              <text x={0} y={-ISLAND_R - 16 * u} textAnchor="middle" fontSize={9 * u} fontWeight={900} fill="#8a5a1a" stroke="#ffffff" strokeWidth={2.6 * u} paintOrder="stroke">
                🍭 Cucaino Park
              </text>
            </g>
          )}
          {/* mountains, labelled (not themselves destinations) */}
          {showWild &&
            ISLAND_LANDMARKS.map((lm) => (
              <g key={lm.id} pointerEvents="none">
                <text x={lm.x} y={lm.z + 4 * u} textAnchor="middle" fontSize={10 * u}>
                  {lm.emoji}
                </text>
                {labels && (
                  <text x={lm.x} y={lm.z + 15 * u} textAnchor="middle" fontSize={6.6 * u} fontWeight={900} fill="#3a4a66" stroke="#ffffff" strokeWidth={2.4 * u} paintOrder="stroke">
                    {lm.name}
                  </text>
                )}
              </g>
            ))}
          {/* stations: Park Station and the four named Wildlands stops — tap one to go there */}
          {showWild &&
            ISLAND_PINS.map((st) => (
              <g key={st.id} transform={upright(st.x, st.z)} onClick={onDest ? () => onDest(st) : undefined} style={{ cursor: onDest ? "pointer" : undefined }}>
                <circle cx={st.x} cy={st.z} r={7 * u} fill="#fff7e8" stroke="#8a5a34" strokeWidth={1.6 * u} />
                <text x={st.x} y={st.z + 3 * u} textAnchor="middle" fontSize={8.5 * u}>
                  {st.emoji}
                </text>
                {labels && (
                  <text x={st.x} y={st.z + 16 * u} textAnchor="middle" fontSize={6.6 * u} fontWeight={900} fill="#8a5a1a" stroke="#ffffff" strokeWidth={2.6 * u} paintOrder="stroke">
                    {st.name}
                  </text>
                )}
              </g>
            ))}
          {/* Rainbow Falls' mesa, the river, the plunge pool, Rainbow Lake and its outlet */}
          <path d={MESA_PATH} fill="#a88a70" stroke="#7a5e4a" strokeWidth={1.2 * k} pointerEvents="none" />
          <path d={RIVER_BANK} fill="#f5dcae" pointerEvents="none" />
          <path d={LAKE_PATH} fill="#f5dcae" stroke="#f5dcae" strokeWidth={3.2} pointerEvents="none" />
          <path d={OUTLET_PATH} fill="none" stroke="#f5dcae" strokeWidth={OUTLET_HALF * 2 + 3} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          <circle cx={FALLS.pool.x} cy={FALLS.pool.z} r={FALLS.pool.r + 1.6} fill="#f5dcae" pointerEvents="none" />
          <path d={RIVER} fill="#5cbcef" pointerEvents="none" />
          <path d={LAKE_PATH} fill="#5cbcef" pointerEvents="none" />
          <path d={OUTLET_PATH} fill="none" stroke="#5cbcef" strokeWidth={OUTLET_HALF * 2} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          <circle cx={FALLS.pool.x} cy={FALLS.pool.z} r={FALLS.pool.r} fill="#5cbcef" pointerEvents="none" />
          {/* the falls: a white cascade off the mesa's edge into the pool */}
          <path d={`M${FALLS.lip.x.toFixed(1)} ${(FALLS.lip.z - 3.5).toFixed(1)} L${(FALLS.lip.x + 3).toFixed(1)} ${(FALLS.lip.z - 5).toFixed(1)} L${(FALLS.lip.x + 3).toFixed(1)} ${(FALLS.lip.z + 5).toFixed(1)} L${FALLS.lip.x.toFixed(1)} ${(FALLS.lip.z + 3.5).toFixed(1)} Z`} fill="#ffffff" stroke="#bfe8ff" strokeWidth={0.8} pointerEvents="none" />
          <circle cx={POND.x - 2} cy={POND.z + 1} r={1.1} fill="#5fcf7a" pointerEvents="none" />
          <circle cx={POND.x + 2.2} cy={POND.z - 1.5} r={0.9} fill="#5fcf7a" pointerEvents="none" />
          <circle cx={POND.x + 0.4} cy={POND.z + 3} r={1} fill="#5fcf7a" pointerEvents="none" />
          {/* the footbridges and the jetty */}
          {BRIDGES.map((b, i) => (
            <line key={`br${i}`} x1={b.x - Math.sin(b.heading) * b.span * 0.5} y1={b.z - Math.cos(b.heading) * b.span * 0.5} x2={b.x + Math.sin(b.heading) * b.span * 0.5} y2={b.z + Math.cos(b.heading) * b.span * 0.5} stroke="#b07a44" strokeWidth={3.2} strokeLinecap="round" pointerEvents="none" />
          ))}
          <line x1={JETTY.ax} y1={JETTY.az} x2={JETTY.bx} y2={JETTY.bz} stroke="#b07a44" strokeWidth={2.6} pointerEvents="none" />
          {/* the rainforest */}
          {JUNGLE_TREES.map((t, i) => (
            <g key={`j${i}`} pointerEvents="none">
              <circle cx={t.x + 0.8} cy={t.z + 1} r={t.s} fill="#000" opacity={0.12} />
              <circle cx={t.x} cy={t.z} r={t.s} fill={t.c} stroke="#1f6a3a" strokeWidth={0.6} />
            </g>
          ))}
          {labels && (
            <text x={FALLS.lip.x + 1} y={FALLS.lip.z - 9} textAnchor="middle" fontSize={11} pointerEvents="none">
              🌈
            </text>
          )}
          {/* lands as soft blobs */}
          {LAND_SHAPES.map(({ l, path }) => (
            <path
              key={l.id}
              d={path}
              fill={l.ground}
              fillOpacity={0.92}
              stroke={l.id === hereId ? "#ff4f9e" : "#ffffff"}
              strokeWidth={(l.id === hereId ? 3 : 1.8) * k}
              strokeDasharray={l.id === hereId ? undefined : "4 3"}
              onClick={onLand ? () => onLand(l) : undefined}
              style={{ cursor: onLand ? "pointer" : undefined }}
            />
          ))}
          {/* trails: a darker edge with a light centre, like a drawn footpath */}
          {TRAIL_PATHS.map((p, i) => (
            <path key={`e${i}`} d={p} fill="none" stroke="#e98fbf" strokeWidth={4.2 * k} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          ))}
          {TRAIL_PATHS.map((p, i) => (
            <path key={`c${i}`} d={p} fill="none" stroke="#ffd3ea" strokeWidth={2.4 * k} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          ))}
          <circle r={9.5} fill="#ffe0ef" stroke="#e98fbf" strokeWidth={2 * k} pointerEvents="none" />
          {/* meadow trees */}
          {TREES.map((t, i) => (
            <g key={i} pointerEvents="none">
              <circle cx={t.x + 0.6} cy={t.z + 0.8} r={t.s} fill="#000" opacity={0.08} />
              <circle cx={t.x} cy={t.z} r={t.s} fill={t.c} stroke="#3faa70" strokeWidth={0.6} />
            </g>
          ))}
          {GLOW_TREES.map((t, i) => (
            <circle key={`g${i}`} cx={t.x} cy={t.z} r={3.6} fill={t.c} fillOpacity={0.85} stroke="#ffffff" strokeWidth={0.6} pointerEvents="none" />
          ))}
          {/* buildings (big map) */}
          {labels &&
            placeIcons.map((p) => (
              <text key={p.id} x={p.x} y={p.z + 2.5} textAnchor="middle" fontSize={7} pointerEvents="none">
                {p.emoji}
              </text>
            ))}
          {/* sea life (big map) */}
          {labels &&
            SEA_LIFE.map((s, i) => (
              <text key={i} x={s.x} y={s.z} textAnchor="middle" fontSize={11} opacity={0.85} pointerEvents="none">
                {s.e}
              </text>
            ))}
          {/* land icons + names */}
          {LAND_SHAPES.map(({ l }) => (
            <g key={`t-${l.id}`} transform={upright(l.x, l.z)} onClick={onLand ? () => onLand(l) : undefined} style={{ cursor: onLand ? "pointer" : undefined }}>
              <text x={l.x} y={l.z + (labels ? -1 : 4)} textAnchor="middle" fontSize={labels ? 15 : 11}>
                {l.emoji}
              </text>
              {labels && (
                <g>
                  <rect x={l.x - l.name.length * 2.35 - 4} y={l.z + 5} width={l.name.length * 4.7 + 8} height={11} rx={5.5} fill="#ffffff" stroke="#f0c2dc" strokeWidth={0.8} />
                  <text x={l.x} y={l.z + 13.2} textAnchor="middle" fontSize={7.4} fontWeight={900} fill="#5a2350">
                    {l.name}
                  </text>
                </g>
              )}
            </g>
          ))}
          {/* rides to find: dragons, manta reefs, docks and unicorn glades (only those in view —
              not on the Island tab, which keeps to stations, landmarks and the park itself) */}
          {!globe &&
            !island &&
            rides.map((r0) => {
              let r = r0;
              const dx = r.x - (labels ? 0 : pose.x);
              const dz = r.z - (labels ? 0 : pose.z);
              const dd = Math.hypot(dx, dz);
              if (labels && r.sea && dd > WORLD_VIEW - 10 && dd < WORLD_VIEW + 70) {
                // the reefs (and Candy Harbour) just off the beach: on the map's edge, pointing the way
                const k = (WORLD_VIEW - 10) / dd;
                r = { ...r, x: r.x * k, z: r.z * k };
              } else if (dd > (labels ? WORLD_VIEW - 6 : VIEW - 4 * u)) return null;
              // (unicorns only on the big map: the little one stays uncluttered)
              if (!labels && r.kind === "unicorn") return null;
              const big = r.kind === "dragon";
              const rr = (labels ? (big ? 6.4 : 5) : big ? 5 : 4) * (labels ? 1 : u);
              return (
                <g key={r.id} transform={upright(r.x, r.z)} onClick={onRide ? () => onRide(r0) : undefined} style={{ cursor: onRide ? "pointer" : undefined }}>
                  {big && (
                    <circle cx={r.x} cy={r.z} r={rr + 1.2 * (labels ? 1 : u)} fill="none" stroke="#e8475e" strokeWidth={1.4 * (labels ? 1 : u)} opacity={0.85} />
                  )}
                  <circle cx={r.x} cy={r.z} r={rr} fill={r.kind === "manta" || r.kind === "dock" ? "#e9fbff" : "#fff7e8"} stroke={r.kind === "dragon" ? "#e8475e" : r.kind === "manta" ? "#2b8fd6" : r.kind === "dock" ? "#2f6fa8" : "#c48ae8"} strokeWidth={1.2 * (labels ? 1 : u)} />
                  <text x={r.x} y={r.z + rr * 0.42} textAnchor="middle" fontSize={rr * 1.25}>
                    {r.emoji}
                  </text>
                  {labels && big && (
                    <text x={r.x} y={r.z + rr + 6.5} textAnchor="middle" fontSize={5.2} fontWeight={900} fill="#a3122f" stroke="#ffffff" strokeWidth={2} paintOrder="stroke">
                      {r.label}
                    </text>
                  )}
                </g>
              );
            })}
          {/* important places, e.g. the Quest Board and how many quests are left (not on the
              Island tab, which has its own stations and landmarks instead) */}
          {(globe || island ? [] : labels ? [...pins, ...FAR_PINS] : [...pins, ...(atSea ? [] : FAR_PINS)]).map((pin) => {
            // on the small map, a far-away pin sticks to the rim, pointing the way
            let p = pin;
            if (!labels) {
              const dx = pin.x - pose.x;
              const dz = pin.z - pose.z;
              const dd = Math.hypot(dx, dz);
              const max = VIEW - 9 * u;
              if (dd > max) p = { ...pin, x: pose.x + (dx / dd) * max, z: pose.z + (dz / dd) * max };
            } else {
              // the big map too: somewhere far out at sea (Coralcove Isle) sits on the edge, pointing the way
              const dd = Math.hypot(pin.x, pin.z);
              const max = WORLD_VIEW - 10;
              if (dd > max) p = { ...pin, x: (pin.x / dd) * max, z: (pin.z / dd) * max };
            }
            return (
              <g key={p.id} transform={upright(p.x, p.z)} onClick={onPin ? () => onPin(pin) : undefined} style={{ cursor: onPin ? "pointer" : undefined }}>
                {p.pulse && (
                  <circle cx={p.x} cy={p.z} r={labels ? 8 : 6} fill="none" stroke="#ff2f6d" strokeWidth={labels ? 2 : 1.6}>
                    <animate attributeName="r" values={labels ? "7;13;7" : "5;10;5"} dur="1.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={p.x} cy={p.z} r={labels ? 7.5 : 6} fill="#ffffff" stroke="#ff9fcd" strokeWidth={1.5} />
                <text x={p.x} y={p.z + (labels ? 3.6 : 3)} textAnchor="middle" fontSize={labels ? 10 : 8.5}>
                  {p.emoji}
                </text>
                {!!p.badge && (
                  <g>
                    <circle cx={p.x + (labels ? 6.5 : 5)} cy={p.z - (labels ? 6.5 : 5)} r={labels ? 4.6 : 4} fill="#ff2f6d" stroke="#fff" strokeWidth={1} />
                    <text x={p.x + (labels ? 6.5 : 5)} y={p.z - (labels ? 4.6 : 3.3)} textAnchor="middle" fontSize={labels ? 6 : 5.2} fontWeight={900} fill="#fff">
                      {p.badge}
                    </text>
                  </g>
                )}
                {labels && (
                  <text x={p.x} y={p.z + 15} textAnchor="middle" fontSize={6} fontWeight={900} fill="#c2185b" stroke="#ffffff" strokeWidth={2.2} paintOrder="stroke">
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
          {pose.pet && <circle pointerEvents="none" cx={pose.pet.x} cy={pose.pet.z} r={labels ? 3 : 2} fill="#ffb020" stroke="#fff" strokeWidth={1.2} />}
          {/* you are here: an arrow pointing the way your animal faces */}
          <g transform={`translate(${pose.x} ${pose.z}) rotate(${(-pose.facing * 180) / Math.PI}) scale(${globe ? u * 0.8 : island ? u * 0.9 : !labels && (atSea || wild) ? u * 0.7 : 1})`} pointerEvents="none">
            <circle r={labels ? 8 : 4.5} fill="#ff4f9e" opacity={0.25}>
              <animate attributeName="r" values={labels ? "7;12;7" : "4;7;4"} dur="1.6s" repeatCount="indefinite" />
            </circle>
            <path d={labels ? "M0 7 L-5 -4.6 L0 -1.8 L5 -4.6 Z" : "M0 4.2 L-3 -2.8 L0 -1.1 L3 -2.8 Z"} fill="#ff2f8a" stroke="#ffffff" strokeWidth={1.6} strokeLinejoin="round" />
          </g>
        </g>
        {/* compass (big map) */}
        {labels && (
          <g transform={`translate(${VIEW - 22} ${-VIEW + 22})`} pointerEvents="none">
            <circle r={13} fill="#ffffff" stroke="#f0c2dc" strokeWidth={1.5} />
            <path d="M0 -10 L3 0 L0 3 L-3 0 Z" fill="#ff4f9e" />
            <path d="M0 10 L3 0 L0 -3 L-3 0 Z" fill="#c9b8d8" />
            <text y={-15} textAnchor="middle" fontSize={7} fontWeight={900} fill="#5a2350">
              N
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}

// map chrome: a gold-rimmed compass frame + dark glass, matching the park HUD (components/park/ui)
const miniBtn: React.CSSProperties = {
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 88px)",
  left: "max(14px, env(safe-area-inset-left))",
  zIndex: 20,
  padding: 3,
  border: "none",
  borderRadius: 999,
  background: "conic-gradient(from 200deg, #ffe9a8, #e89a1c, #ffd36b, #fff2c2, #e89a1c, #ffe9a8)",
  boxShadow: "0 0 14px rgba(255,211,107,0.35), 0 8px 18px rgba(0,0,0,0.45)",
  cursor: "pointer",
};
const hereTag: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: -12,
  transform: "translateX(-50%)",
  whiteSpace: "nowrap",
  padding: "3px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,211,107,0.7)",
  background: "rgba(16,14,42,0.9)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
  fontWeight: 900,
  fontSize: 11.5,
  color: "#f5f3ff",
};
const mapTitle: React.CSSProperties = {
  fontFamily: "var(--font-park-display), 'Lilita One', system-ui, sans-serif",
  fontWeight: 400,
  fontSize: 22,
  letterSpacing: 0.4,
  color: "#f5f3ff",
  textShadow: "0 2px 0 rgba(0,0,0,0.35), 0 0 16px rgba(94,242,255,0.3)",
};
const bigWrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 45,
  background: "rgba(5,4,18,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};
const bigCard: React.CSSProperties = {
  width: "min(620px, 100%)",
  borderRadius: 22,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  border: "1.5px solid transparent",
  background: "linear-gradient(rgba(18,16,44,0.88), rgba(18,16,44,0.88)) padding-box, linear-gradient(135deg, rgba(255,233,168,0.95), rgba(232,154,28,0.6) 50%, rgba(94,242,255,0.7)) border-box",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 20px 40px rgba(0,0,0,0.5)",
  color: "#f5f3ff",
};
const tabBtn: React.CSSProperties = {
  minHeight: 40,
  padding: "0 12px",
  borderRadius: 999,
  border: "1.5px solid rgba(160,200,255,0.35)",
  background: "rgba(20,18,50,0.7)",
  color: "#f5f3ff",
  fontWeight: 900,
  fontSize: 13,
  cursor: "pointer",
};
const tabOn: React.CSSProperties = { border: "1.5px solid rgba(255,211,107,0.9)", background: "rgba(120,86,20,0.75)" };
const closeBtn: React.CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  border: "1.5px solid rgba(160,200,255,0.4)",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 17,
  color: "#f5f3ff",
  background: "radial-gradient(circle at 50% 30%, rgba(90,86,160,0.7), rgba(20,18,50,0.85))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 10px rgba(0,0,0,0.35)",
  cursor: "pointer",
};
