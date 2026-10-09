// Cucaino Park's floating islands in the sky: big floating mountains (a rocky peak rising off
// one side of a wide walkable meadow, cliffs, pines, a waterfall, a grotto, park buildings on flat
// pads) and smaller meadow / ruins / crystal / garden islands, some joined by rope bridges. Kids fly
// up on a dragon or a manta, land on a top and explore on foot: every island hides a treasure chest
// and 2–4 things to discover (a dragon egg nest, rune-stone puzzles, telescopes, sky launchers ...).
//
// Pure + deterministic (no three.js) so the engine, the renderer (world/fantasy/sky.ts), the Star
// Shards (quests3d via fantasy/placement.ts) and the tests all read the same numbers:
//   - each top is a gentle heightfield sampled on a fixed triangle grid (SKY_GRID) — the mesh uses
//     the very same triangles, so skyTopY() is exactly where the grass is (feet sit on it);
//     building pads, hot springs and rune circles are flattened into it
//   - islands only bob up and down (skyBob, never rotate), so standing on one is easy; a bridge
//     deck blends the bob of its two ends
//   - peaks are not walkable (skyTopY → null there); they, trees, rocks, ruins, crystals and the
//     solid bits of the discoveries are in SKY_OBSTACLES
// One entry in DEFS = one island; move it and the mesh, obstacles, treasure, pads, spots, bridges
// and shard follow. NOTE: must not import places.ts (places.ts imports this file).

export type SkyIslandKind = "mountain" | "meadow" | "ruins" | "crystal" | "garden";

export interface SkyIsland {
  id: string;
  name: string;
  x: number;
  z: number;
  /** base height of the walkable top (the heightfield wobbles gently around it) */
  y: number;
  /** top radius: the walkable disc */
  r: number;
  kind: SkyIslandKind;
  /** where the treasure chest sits on the walkable top (world x/z) */
  treasure: { x: number; z: number };
  // ── extras for the renderer / engine ──
  /** the rocky peak (mountains): world x/z centre, base radius r (not walkable), height h above y */
  peak?: { x: number; z: number; r: number; h: number };
  /** how far the rocky underside hangs below y (to its tip) */
  depth: number;
  /** the waterfall: a spring on the top (world x/z) that runs off the edge at angle `fall`
   *  (radians, atan2(dx, dz) like the rest of the park) */
  spring: { x: number; z: number };
  fall: number;
  /** a good open landing spot on the top, clear of obstacles (world x/z; Star Shards go here) */
  landing: { x: number; z: number };
  /** a seed for the geometry's little irregularities */
  seed: number;
}

/** heightfield grid spacing (m) — the renderer triangulates the top on exactly this grid */
export const SKY_GRID = 2.5;
/** the top mesh runs this far past the walkable radius before the grassy lip rolls over */
export const SKY_LIP = 1.2;

export type SpotKind = "cave" | "nest" | "stones" | "telescope" | "launcher" | "hotspring" | "bell" | "swing" | "garden" | "lookout" | "shrine" | "treehouse" | "cloudling" | "mushroomring";

type SpotDef = [SpotKind, string, string, string?];

interface Def {
  id: string;
  name: string;
  kind: SkyIslandKind;
  x: number;
  z: number;
  y: number;
  r: number;
  /** mountains: peak base radius + height; its centre sits `off` * r out towards `peakA` */
  peak?: { r: number; h: number; off: number; a?: number };
  /** treasure: polar offset (angle, fraction of r) from the island centre (or the peak foot) */
  tr: [number, number];
  /** waterfall edge angle (relative to the island's outward direction) */
  fallA: number;
  amp: number;
  seed: number;
  /** things to discover: [kind, name, text, target island?] */
  spots: SpotDef[];
}

/**
 * Where the whole archipelago floats: out in the Wildlands, over the Great Lake beside Lake Station
 * (it used to hang right over the park). Every island below is laid out round this point — move it
 * and all of them, with everything on them, follow. Keep it a multiple of SKY_GRID.
 */
export const SKY_HOME = { x: 1420, z: -330 } as const;

// angle convention: atan2(x, z) — 0 = +z (south on the map), π = north (the mountain range)
// (x / z below are measured from SKY_HOME)
const DEFS: Def[] = [
  // ── the floating mountains ──
  {
    id: "thunder-peak", name: "Thunder Peak", kind: "mountain", x: 0, z: -132, y: 100, r: 34, peak: { r: 12.5, h: 25, off: 0.47 }, tr: [1.05, 0.62], fallA: -1.1, amp: 1.1, seed: 11,
    spots: [
      ["cave", "Thunder Grotto", "A secret grotto full of glowing crystals! It's cosy and warm in here."],
      ["nest", "Dragon Egg Nest", "A dragon egg! It's warm... something's wiggling inside!"],
      ["telescope", "Sky Telescope", "Peek through! You can see all the way to Dragon's Crown.", "dragons-crown"],
      ["bell", "Wishing Bell", "Ding-dong! Make a wish — the bell sings it to the clouds."],
    ],
  },
  {
    id: "cloudtop", name: "Cloudtop Mountain", kind: "mountain", x: -102, z: 14, y: 82, r: 30, peak: { r: 10, h: 18, off: 0.5 }, tr: [-1.2, 0.6], fallA: 1.3, amp: 1.0, seed: 23,
    spots: [
      ["cave", "Echo Cave", "Hellooo... hellooo... The cave sings your name back!"],
      ["stones", "Cloudtop Rune Circle", "Magic stepping stones! Stand on every one to wake the altar."],
      ["lookout", "Cloudtop Lookout", "What a view! You can see the whole park from up here."],
      ["launcher", "Bouncy Mushroom", "Boing! Jump on to bounce all the way to Crystal Spire!", "crystal-spire"],
    ],
  },
  {
    id: "dragons-crown", name: "Dragon's Crown", kind: "mountain", x: 122, z: 124, y: 66, r: 25, peak: { r: 8.5, h: 20, off: 0.5 }, tr: [1.25, 0.6], fallA: -1.4, amp: 0.9, seed: 37,
    spots: [
      ["cave", "Dragon's Den", "The dragons' old den — their shiny treasure still glitters inside!"],
      ["nest", "Crown Nest", "A giant nest with a speckled egg. It's rocking... hatch time soon!"],
      ["hotspring", "Steamy Spring", "A warm bubbly pool! Dragons love a soak after a long flight."],
      ["telescope", "Crown Telescope", "Look! Thunder Peak's snowy top is way over there.", "thunder-peak"],
    ],
  },
  {
    id: "eagle-rock", name: "Eagle Rock", kind: "mountain", x: 152, z: -40, y: 86, r: 24, peak: { r: 7.5, h: 14, off: 0.5 }, tr: [-1.3, 0.58], fallA: 1.5, amp: 0.9, seed: 41,
    spots: [
      ["cave", "Glimmer Cave", "Crystals twinkle like stars in this little cave. Ooooh!"],
      ["nest", "Eagle Rock Nest", "Who left this egg up here? It's speckled like a rainbow!"],
      ["lookout", "Eagle Lookout", "Eagles watch the whole island from this rail. Can you spot the Glow Forest?"],
      ["launcher", "Sky Cannon", "3... 2... 1... WHOOSH! It fires you to the Cloud Garden!", "cloud-garden"],
    ],
  },
  // ── the little sky islands ──
  {
    id: "buttercup-meadow", name: "Buttercup Meadow", kind: "meadow", x: -12, z: 74, y: 56, r: 12, tr: [2.4, 0.45], fallA: 0.4, amp: 0.55, seed: 53,
    spots: [
      ["swing", "Sky Swing", "Whee! A swing that goes right out over the clouds!"],
      ["garden", "Glowbloom Patch", "Giant flowers that glow! They hum when you walk past."],
      ["launcher", "Bouncy Mushroom", "Boing! Bounce over to the Sky Temple!", "sky-temple"],
    ],
  },
  {
    id: "sky-temple", name: "Sky Temple", kind: "ruins", x: 46, z: -52, y: 62, r: 14, tr: [0.2, 0.05], fallA: 2.2, amp: 0.4, seed: 67,
    spots: [
      ["stones", "Temple Rune Stones", "Five rune stones round an old altar. Step on them all!"],
      ["shrine", "Moonstone Shrine", "A floating moonstone spins in the little shrine. So shiny!"],
    ],
  },
  {
    id: "crystal-spire", name: "Crystal Spire", kind: "crystal", x: -50, z: -42, y: 72, r: 11, tr: [2.8, 0.4], fallA: -2.2, amp: 0.5, seed: 71,
    spots: [
      ["shrine", "Crystal Shrine", "A crystal floats all by itself! It tingles when you get close."],
      ["cloudling", "Sleepy Cloudling", "Shhh! A little cloud creature is snoozing... Zzz."],
    ],
  },
  {
    id: "cloud-garden", name: "Cloud Garden", kind: "garden", x: 58, z: 32, y: 56, r: 13, tr: [-2.5, 0.5], fallA: 1.9, amp: 0.45, seed: 83,
    spots: [
      ["garden", "Giant Glowflowers", "These flowers are taller than you — and they glow at night!"],
      ["hotspring", "Bubble Pool", "Bloop bloop! A warm pool full of tickly bubbles."],
      ["bell", "Garden Bell", "Ring the bell and the flowers wave hello!"],
    ],
  },
  {
    id: "sunset-ruins", name: "Sunset Ruins", kind: "ruins", x: -132, z: 108, y: 72, r: 14, tr: [0.3, 0.05], fallA: -1.9, amp: 0.45, seed: 97,
    spots: [
      ["stones", "Sunset Rune Ring", "A ring of sleepy rune stones. Can you wake them all up?"],
      ["telescope", "Old Brass Telescope", "Through the telescope you can see Cloudtop Mountain!", "cloudtop"],
      ["cloudling", "Dozy Cloudling", "A fluffy cloud creature curled up in the sun. It's purring!"],
    ],
  },
  {
    id: "lantern-isle", name: "Lantern Isle", kind: "garden", x: -62, z: -150, y: 94, r: 13, tr: [2.6, 0.5], fallA: 1.2, amp: 0.45, seed: 101,
    spots: [
      ["treehouse", "Lantern Treehouse", "A secret treehouse with glowing lanterns! Who lives here?"],
      ["mushroomring", "Fairy Ring", "A ring of giant mushrooms. Fairies dance here at night!"],
    ],
  },
  // ── stepping-stone islets between the big ones (rope bridges join the close ones) ──
  {
    id: "puffball-isle", name: "Puffball Isle", kind: "meadow", x: 50, z: -156, y: 97, r: 11, tr: [2.2, 0.45], fallA: -0.6, amp: 0.5, seed: 113,
    spots: [
      ["cloudling", "Puffball the Cloudling", "Puffball is fast asleep. Tiptoe... don't wake it up!"],
      ["launcher", "Sky Cannon", "Hop in! It launches you to Crystal Spire!", "crystal-spire"],
    ],
  },
  {
    id: "rainbow-rock", name: "Rainbow Rock", kind: "garden", x: -124, z: 66, y: 78, r: 11, tr: [-2.2, 0.45], fallA: 2.6, amp: 0.45, seed: 127,
    spots: [
      ["garden", "Rainbow Flowers", "Every flower is a different colour of the rainbow!"],
      ["swing", "Rainbow Swing", "Swing high! Your toes can touch the clouds."],
    ],
  },
  {
    id: "cloud-hop", name: "Cloud Hop", kind: "meadow", x: 88, z: 162, y: 68, r: 11, tr: [2.5, 0.45], fallA: -2.4, amp: 0.5, seed: 131,
    spots: [
      ["treehouse", "Cloud Hop Treehouse", "Climb up! There's a comfy lookout nest in the branches."],
      ["launcher", "Bouncy Mushroom", "Boing! Bounce all the way to the Cloud Garden!", "cloud-garden"],
    ],
  },
  {
    id: "windy-knoll", name: "Windy Knoll", kind: "meadow", x: 158, z: 12, y: 82, r: 11, tr: [-2.4, 0.45], fallA: 0.7, amp: 0.5, seed: 139,
    spots: [
      ["mushroomring", "Whistling Mushrooms", "The wind whistles tunes through these giant mushrooms!"],
      ["lookout", "Windy Lookout", "Hold on to your hat! You can see the sea from here."],
    ],
  },
];

/** rope bridges between close islands (island ids) */
const BRIDGE_PAIRS: [string, string][] = [
  ["thunder-peak", "lantern-isle"],
  ["thunder-peak", "puffball-isle"],
  ["cloudtop", "rainbow-rock"],
  ["rainbow-rock", "sunset-ruins"],
  ["dragons-crown", "cloud-hop"],
  ["eagle-rock", "windy-knoll"],
];

/** park places that move up onto the big mountains: [placeId, island, pad radius] */
const PAD_DEFS: [string, string, number][] = [
  ["arcade", "thunder-peak", 6],
  ["retro-arcade", "eagle-rock", 5.5],
  ["story-theatre", "dragons-crown", 6],
  ["library", "cloudtop", 6],
  ["learning-tree", "cloudtop", 4],
];

// ── tiny deterministic noise (same family as terrain.ts) ──
function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// ── build the islands ──
for (const d of DEFS) {
  d.x += SKY_HOME.x;
  d.z += SKY_HOME.z;
}
// (outward = away from the middle of the archipelago)
const outward = (d: Def) => Math.atan2(d.x - SKY_HOME.x, d.z - SKY_HOME.z);
const polar = (a: number, dist: number) => ({ x: Math.sin(a) * dist, z: Math.cos(a) * dist });

export const SKY_ISLANDS: SkyIsland[] = DEFS.map((d) => {
  const out = outward(d);
  let peak: SkyIsland["peak"];
  let treasureLocal: { x: number; z: number };
  if (d.peak) {
    // the peak rises off the far side (away from the park), so the meadow faces the view
    const pa = d.peak.a ?? out;
    const pc = polar(pa, d.r * d.peak.off);
    peak = { x: d.x + pc.x, z: d.z + pc.z, r: d.peak.r, h: d.peak.h };
    // the treasure is tucked at the peak's foot, round to one side
    const ta = pa + Math.PI + d.tr[0];
    const t = polar(ta, d.peak.r + 3.2);
    treasureLocal = { x: pc.x + t.x, z: pc.z + t.z };
  } else {
    treasureLocal = polar(out + d.tr[0], d.r * d.tr[1]);
  }
  // the waterfall runs off the edge at fallA from the outward direction; the spring sits inward
  const fall = out + d.fallA;
  const springD = d.peak ? d.r * 0.35 : d.r * 0.32;
  let spring = polar(fall, springD);
  if (d.peak) {
    // mountains: the spring bubbles up at the peak's foot, on the waterfall's side
    const pc = { x: peak!.x - d.x, z: peak!.z - d.z };
    const toward = Math.atan2(Math.sin(fall) * d.r - pc.x, Math.cos(fall) * d.r - pc.z);
    const s = polar(toward, d.peak.r + 1.6);
    spring = { x: pc.x + s.x, z: pc.z + s.z };
  }
  // landing: an open spot ~7 m from the treasure, towards the middle of the meadow
  const tl = treasureLocal;
  const towardMid = d.peak ? Math.atan2(-(peak!.x - d.x), -(peak!.z - d.z)) : Math.atan2(-tl.x, -tl.z);
  let landing = polar(towardMid, 7.5);
  landing = { x: tl.x + landing.x, z: tl.z + landing.z };
  if (Math.hypot(landing.x, landing.z) > d.r - 3) {
    const k = (d.r - 3) / Math.hypot(landing.x, landing.z);
    landing = { x: landing.x * k, z: landing.z * k };
  }
  return {
    id: d.id,
    name: d.name,
    x: d.x,
    z: d.z,
    y: d.y,
    r: d.r,
    kind: d.kind,
    treasure: { x: d.x + tl.x, z: d.z + tl.z },
    peak,
    depth: d.peak ? d.r * 1.25 + 6 : d.r * 1.55,
    spring: { x: d.x + spring.x, z: d.z + spring.z },
    fall,
    landing: { x: d.x + landing.x, z: d.z + landing.z },
    seed: d.seed,
  };
});

const DEF_OF = new Map(DEFS.map((d) => [d.id, d]));
const ISL_OF = new Map(SKY_ISLANDS.map((s) => [s.id, s]));

export function skyIslandById(id: string): SkyIsland | undefined {
  return ISL_OF.get(id);
}

/** where the waterfall's top stream runs: spring → the lip (world x/z) */
export function skyStreamEnd(s: SkyIsland): { x: number; z: number } {
  return { x: s.x + Math.sin(s.fall) * (s.r + SKY_LIP), z: s.z + Math.cos(s.fall) * (s.r + SKY_LIP) };
}

// ── rope bridges ──
export interface SkyBridge {
  id: string;
  /** island ids at each end */
  a: string;
  b: string;
  /** deck end points (world x/z), each 1 m inside its island's walkable rim */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** walkable half-width of the deck (m) */
  half: number;
  /** how far the middle of the deck droops (m) */
  sag: number;
}

export const SKY_BRIDGES: SkyBridge[] = BRIDGE_PAIRS.map(([ia, ib]) => {
  const a = ISL_OF.get(ia)!;
  const b = ISL_OF.get(ib)!;
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const ux = (b.x - a.x) / L;
  const uz = (b.z - a.z) / L;
  const len = L - a.r - b.r + 2;
  return { id: `${ia}~${ib}`, a: ia, b: ib, ax: a.x + ux * (a.r - 1), az: a.z + uz * (a.r - 1), bx: b.x - ux * (b.r - 1), bz: b.z - uz * (b.r - 1), half: 1.0, sag: Math.min(1.2, len * 0.045) };
});

/** a bridge's deck height at t (0 = end a .. 1 = end b), time `time` (both ends' bob blended) */
export function skyBridgeY(br: SkyBridge, u: number, time: number): number {
  const a = ISL_OF.get(br.a)!;
  const b = ISL_OF.get(br.b)!;
  const ya = skyBaseY(a, br.ax, br.az) + skyBob(a.id, time);
  const yb = skyBaseY(b, br.bx, br.bz) + skyBob(b.id, time);
  return ya + (yb - ya) * u - br.sag * 4 * u * (1 - u);
}

/** is (x, z) on a bridge deck? → the bridge and where along it (u 0..1) */
export function skyBridgeAt(x: number, z: number): { bridge: SkyBridge; u: number } | null {
  for (const br of SKY_BRIDGES) {
    const dx = br.bx - br.ax;
    const dz = br.bz - br.az;
    const L2 = dx * dx + dz * dz;
    const u = ((x - br.ax) * dx + (z - br.az) * dz) / L2;
    if (u < 0 || u > 1) continue;
    const side = Math.abs((x - br.ax) * dz - (z - br.az) * dx) / Math.sqrt(L2);
    if (side <= br.half) return { bridge: br, u };
  }
  return null;
}

// ── reserved room on each top (the renderer and tests read these too) ──
interface Room {
  x: number;
  z: number;
  r: number;
}
/** a bridge's head on an island: the patch of meadow just inside its end */
function bridgeHeads(s: SkyIsland): Room[] {
  const out: Room[] = [];
  for (const br of SKY_BRIDGES) {
    if (br.a !== s.id && br.b !== s.id) continue;
    const [ex, ez] = br.a === s.id ? [br.ax, br.az] : [br.bx, br.bz];
    const k = (s.r - 3.2) / (s.r - 1);
    out.push({ x: s.x + (ex - s.x) * k, z: s.z + (ez - s.z) * k, r: 3 });
    out.push({ x: ex, z: ez, r: 2 });
  }
  return out;
}

/** ruins: the great broken arch over the chest and the altar behind it (fixed by treasure + landing) */
function ruinsCentre(s: SkyIsland): { arch: { x: number; z: number; rot: number }; altar: { x: number; z: number; rot: number } } | null {
  if (s.kind !== "ruins") return null;
  const a = Math.atan2(s.treasure.x - s.landing.x, s.treasure.z - s.landing.z);
  return {
    arch: { x: s.treasure.x + Math.sin(a) * 1.2, z: s.treasure.z + Math.cos(a) * 1.2, rot: a },
    altar: { x: s.treasure.x + Math.sin(a) * 4.4, z: s.treasure.z + Math.cos(a) * 4.4, rot: a },
  };
}

// ── things to discover ──
export interface SkySpot {
  id: string;
  island: string;
  kind: SpotKind;
  name: string;
  text: string;
  /** world x/z of the feature's centre (always on walkable ground) */
  x: number;
  z: number;
  /** discovery radius: stand within r of (x, z) */
  r: number;
  /** the island a telescope looks at / a launcher sends you to */
  target?: string;
  /** which way it faces (yaw; local +z points to (sin rot, cos rot)) */
  rot: number;
}

const SPOT_R: Record<SpotKind, number> = { cave: 4.5, nest: 4.2, stones: 5.2, telescope: 2.6, launcher: 1.7, hotspring: 2.8, bell: 2.8, swing: 3.4, garden: 3.8, lookout: 3.2, shrine: 3, treehouse: 3.6, cloudling: 3.6, mushroomring: 3.6 };
/** the footprint a spot needs clear round it (m) */
const SPOT_ROOM: Record<SpotKind, number> = { cave: 4.6, nest: 3.1, stones: 4.4, telescope: 1.7, launcher: 2, hotspring: 2.9, bell: 2.1, swing: 2.6, garden: 3.3, lookout: 2.7, shrine: 1.9, treehouse: 3.1, cloudling: 2.2, mushroomring: 3.5 };
/** spots that live out at the rim, facing out over the edge */
const EDGE_IN: Partial<Record<SpotKind, number>> = { swing: 1.9, lookout: 2.4, telescope: 2.2, launcher: 2.6 };

export interface SkyPad {
  placeId: string;
  island: string;
  x: number;
  z: number;
  r: number;
  /** yaw the building's door faces (towards the island's landing spot) */
  face: number;
}

/** plan one island's pads + spots (deterministic) */
function planIsland(s: SkyIsland): { pads: SkyPad[]; spots: SkySpot[] } {
  const d = DEF_OF.get(s.id)!;
  const r = rng(s.seed * 3301 + 17);
  const end = skyStreamEnd(s);
  const heads = bridgeHeads(s);
  const ruins = ruinsCentre(s);
  const pads: SkyPad[] = [];
  const spots: SkySpot[] = [];
  const dCentre = (x: number, z: number) => Math.hypot(x - s.x, z - s.z);
  const clearOf = (x: number, z: number, need: number) => {
    if (s.peak && Math.hypot(x - s.peak.x, z - s.peak.z) < s.peak.r + need + 0.6) return false;
    if (Math.hypot(x - s.treasure.x, z - s.treasure.z) < need + 2.4) return false;
    if (Math.hypot(x - s.landing.x, z - s.landing.z) < need + 3.4) return false;
    if (distToSeg(x, z, s.spring.x, s.spring.z, end.x, end.z) < need + 1.3) return false;
    if (distToSeg(x, z, s.landing.x, s.landing.z, s.treasure.x, s.treasure.z) < need * 0.8 + 0.9) return false;
    for (const h of heads) if (Math.hypot(x - h.x, z - h.z) < h.r + need) return false;
    if (ruins && (Math.hypot(x - ruins.arch.x, z - ruins.arch.z) < 4.2 + need || Math.hypot(x - ruins.altar.x, z - ruins.altar.z) < 2.6 + need)) return false;
    for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < p.r + need + 1.8) return false;
    for (const o of spots) if (Math.hypot(x - o.x, z - o.z) < SPOT_ROOM[o.kind] + need + 0.8) return false;
    return true;
  };
  const defs = d.spots.map((sd, k) => ({ sd, k }));
  const placeSpot = ({ sd: [kind, name, text, target], k }: { sd: SpotDef; k: number }) => {
    const need = SPOT_ROOM[kind];
    const id = `${s.id}:${kind}${defs.filter((o) => o.sd[0] === kind && o.k < k).length || ""}`;
    const push = (x: number, z: number, rot: number) => spots.push({ id, island: s.id, kind, name, text, x, z, r: SPOT_R[kind], target, rot });
    if (kind === "cave" && s.peak) {
      // a grotto set into the foot of the peak, its mouth facing the meadow
      const toMid = Math.atan2(s.x - s.peak.x, s.z - s.peak.z);
      for (const da of [-0.9, 0.9, -0.5, 0.5, -1.3, 1.3, 0, -1.7, 1.7]) {
        const a = toMid + da;
        const x = s.peak.x + Math.sin(a) * (s.peak.r + 3.4);
        const z = s.peak.z + Math.cos(a) * (s.peak.r + 3.4);
        if (dCentre(x, z) > s.r - 5) continue;
        if (Math.hypot(x - s.treasure.x, z - s.treasure.z) < 6) continue;
        if (Math.hypot(x - s.spring.x, z - s.spring.z) < 5.5) continue;
        if (distToSeg(x, z, s.spring.x, s.spring.z, end.x, end.z) < 4) continue;
        return push(x, z, a);
      }
      throw new Error(`sky islands: no room for a cave on ${s.id}`);
    }
    const edge = EDGE_IN[kind];
    const aim = target ? Math.atan2(ISL_OF.get(target)!.x - s.x, ISL_OF.get(target)!.z - s.z) : r() * Math.PI * 2;
    for (let tries = 0; tries < 900; tries++) {
      let x: number;
      let z: number;
      let rot: number;
      if (edge !== undefined) {
        // out at the rim; aimed spots start from the direction of their target
        const a = aim + (tries === 0 ? 0 : (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 0.09);
        const dd = s.r - edge;
        x = s.x + Math.sin(a) * dd;
        z = s.z + Math.cos(a) * dd;
        rot = target ? Math.atan2(ISL_OF.get(target)!.x - x, ISL_OF.get(target)!.z - z) : a;
        if (!clearOf(x, z, need * 0.8)) continue;
      } else {
        const a = r() * Math.PI * 2;
        const dd = Math.sqrt(0.04 + r() * 0.96) * (s.r - need - 1);
        x = s.x + Math.sin(a) * dd;
        z = s.z + Math.cos(a) * dd;
        rot = Math.atan2(s.landing.x - x, s.landing.z - z);
        if (dCentre(x, z) + need > s.r - 0.6) continue;
        if (!clearOf(x, z, need)) continue;
      }
      return push(x, z, rot);
    }
    throw new Error(`sky islands: no room for ${kind} on ${s.id}`);
  };
  // caves first (they're fixed to the peak), then the building pads, then everything else
  for (const def of defs) if (def.sd[0] === "cave") placeSpot(def);
  for (const [placeId, isl, pr] of PAD_DEFS) {
    if (isl !== s.id) continue;
    const pa = s.peak ? Math.atan2(s.peak.x - s.x, s.peak.z - s.z) : 0;
    let done = false;
    for (const f of [0.5, 0.42, 0.6, 0.34, 0.68, 0.26]) {
      for (let k = 0; k < 36 && !done; k++) {
        const a = pa + Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.17;
        const dd = s.r * f;
        const x = s.x + Math.sin(a) * dd;
        const z = s.z + Math.cos(a) * dd;
        if (dd + pr > s.r - 2.5) continue;
        if (!clearOf(x, z, pr + 0.6)) continue;
        if (Math.hypot(x - s.landing.x, z - s.landing.z) < pr + 5.5) continue;
        pads.push({ placeId, island: s.id, x, z, r: pr, face: Math.atan2(s.landing.x - x, s.landing.z - z) });
        done = true;
      }
      if (done) break;
    }
    if (!done) throw new Error(`sky islands: no room for the ${placeId} pad on ${s.id}`);
  }
  for (const def of defs) if (def.sd[0] !== "cave") placeSpot(def);
  return { pads, spots };
}

const PLANNED = SKY_ISLANDS.map(planIsland);

/** flat, clear, walkable building pads on the big mountains (the engine puts park places here) */
export const SKY_PADS: SkyPad[] = PLANNED.flatMap((p) => p.pads);
/** the things to discover on the tops */
export const SKY_SPOTS: SkySpot[] = PLANNED.flatMap((p) => p.spots);

// ── rune stones: 5 round each "stones" altar; each lights when stood on ──
export interface RuneStone {
  spot: string;
  i: number;
  x: number;
  z: number;
  r: number;
}
export const RUNE_STONE_RING = 3.3;
export const SKY_RUNE_STONES: RuneStone[] = SKY_SPOTS.filter((s) => s.kind === "stones").flatMap((s) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = s.rot + (i / 5) * Math.PI * 2 + Math.PI / 5;
    return { spot: s.id, i, x: s.x + Math.sin(a) * RUNE_STONE_RING, z: s.z + Math.cos(a) * RUNE_STONE_RING, r: 0.85 };
  }),
);
/** the rune stone under (x, z), if any */
export function runeStoneAt(x: number, z: number): RuneStone | null {
  for (const st of SKY_RUNE_STONES) if ((x - st.x) ** 2 + (z - st.z) ** 2 <= st.r * st.r) return st;
  return null;
}
/** how many of a rune circle's stones are lit, given the stones stood on (keys `${spot}#${i}`) */
export function stonesLit(spotId: string, visited: Iterable<string>): { lit: number; total: number; done: boolean } {
  const total = SKY_RUNE_STONES.filter((s) => s.spot === spotId).length;
  let lit = 0;
  for (const k of new Set(visited)) if (k.startsWith(`${spotId}#`)) lit++;
  return { lit, total, done: total > 0 && lit >= total };
}

// ── the rim: each top's outline is a lobed, bay-and-promontory polygon, not a circle ──
/** vertices round each island's walkable outline (math angle φ_k = 2πk/N, x = cos φ, z = sin φ) */
export const SKY_RIM_N = 96;
const RIM_STEP = (Math.PI * 2) / SKY_RIM_N;

function planRim(s: SkyIsland): Float64Array {
  const N = SKY_RIM_N;
  const R = new Float64Array(N);
  const seed = s.seed;
  // bays and promontories: a few big lobes + smaller wiggles
  for (let k = 0; k < N; k++) {
    const a = k * RIM_STEP;
    const f = 1 + 0.1 * Math.sin(3 * a + seed) + 0.07 * Math.sin(5 * a + seed * 1.7) + 0.045 * Math.sin(9 * a + seed * 0.3) + (vnoise(k * 0.45, seed, seed + 5) - 0.5) * 0.14;
    R[k] = s.r * Math.min(1.16, Math.max(0.8, f));
  }
  // light smoothing so the outline stays chunky, not spiky
  const sm = Float64Array.from(R, (v, k) => (R[(k + N - 1) % N] + v * 2 + R[(k + 1) % N]) / 4);
  R.set(sm);
  const dAng = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  // pins: where the old circle's edge matters (waterfall lip, bridge ends, rim-side discoveries)
  const pins: { a: number; half: number }[] = [{ a: Math.atan2(Math.cos(s.fall), Math.sin(s.fall)), half: 2.6 / s.r }];
  for (const br of SKY_BRIDGES) {
    if (br.a !== s.id && br.b !== s.id) continue;
    const [ex, ez] = br.a === s.id ? [br.ax, br.az] : [br.bx, br.bz];
    pins.push({ a: Math.atan2(ez - s.z, ex - s.x), half: 2.4 / s.r });
  }
  for (const sp of SKY_SPOTS) if (sp.island === s.id && EDGE_IN[sp.kind] !== undefined) pins.push({ a: Math.atan2(sp.z - s.z, sp.x - s.x), half: 3.2 / s.r });
  for (const pin of pins)
    for (let k = 0; k < N; k++) {
      const d = dAng(k * RIM_STEP, pin.a);
      if (d < pin.half * 2.2) R[k] = s.r + (R[k] - s.r) * smooth(pin.half, pin.half * 2.2, d);
    }
  // protections: everything already placed on the top stays on it
  const keep: { x: number; z: number; r: number }[] = [
    { x: s.treasure.x, z: s.treasure.z, r: 2.6 },
    { x: s.landing.x, z: s.landing.z, r: 3.4 },
    ...SKY_PADS.filter((p) => p.island === s.id).map((p) => ({ x: p.x, z: p.z, r: p.r + 1.5 })),
    ...SKY_SPOTS.filter((p) => p.island === s.id).map((p) => ({ x: p.x, z: p.z, r: EDGE_IN[p.kind] !== undefined ? 1.2 : SPOT_ROOM[p.kind] })),
    ...bridgeHeads(s).filter((h) => h.r > 2.5).map((h) => ({ x: h.x, z: h.z, r: 2 })),
  ];
  if (s.peak) keep.push({ x: s.peak.x, z: s.peak.z, r: s.peak.r + 1.5 });
  const ruins = ruinsCentre(s);
  if (ruins) keep.push({ x: ruins.arch.x, z: ruins.arch.z, r: 4.2 }, { x: ruins.altar.x, z: ruins.altar.z, r: 2.4 });
  const end = skyStreamEnd(s);
  for (let u = 0; u <= 1; u += 0.1) {
    const x = s.spring.x + (end.x - s.spring.x) * u;
    const z = s.spring.z + (end.z - s.spring.z) * u;
    if (Math.hypot(x - s.x, z - s.z) <= s.r - 2.5) keep.push({ x, z, r: 1.4 });
  }
  for (const c of keep) {
    const dx = c.x - s.x;
    const dz = c.z - s.z;
    const d = Math.hypot(dx, dz);
    const ca = Math.atan2(dz, dx);
    for (let k = 0; k < N; k++) {
      const da = dAng(k * RIM_STEP, ca);
      const off = d * Math.sin(da);
      if (Math.abs(off) > c.r + 1 || (Math.cos(da) < 0 && d > c.r)) continue;
      // furthest point of the circle along this ray (+ a margin for the polygon's straight edges)
      const need = d * Math.cos(da) + Math.sqrt(Math.max(0, (c.r + 1) ** 2 - off * off)) + 0.3;
      R[k] = Math.max(R[k], need);
    }
  }
  return R;
}
const RIMS = new Map(SKY_ISLANDS.map((s) => [s.id, planRim(s)]));

/** the rim's vertex radii for an island (walkable outline; the grass runs SKY_LIP further out) */
export function skyRim(s: SkyIsland): Float64Array {
  return RIMS.get(s.id)!;
}
/** how far the walkable outline reaches from the island centre along the direction (dx, dz) */
export function skyRimRadius(s: SkyIsland, dx: number, dz: number, extra = 0): number {
  const R = RIMS.get(s.id)!;
  let a = Math.atan2(dz, dx);
  if (a < 0) a += Math.PI * 2;
  const k = Math.min(SKY_RIM_N - 1, Math.floor(a / RIM_STEP));
  const k1 = (k + 1) % SKY_RIM_N;
  const r0 = R[k] + extra;
  const r1 = R[k1] + extra;
  // where the ray meets the polygon edge between vertices k and k+1
  const px = Math.cos(k * RIM_STEP) * r0;
  const pz = Math.sin(k * RIM_STEP) * r0;
  const ex = Math.cos(k1 * RIM_STEP) * r1 - px;
  const ez = Math.sin(k1 * RIM_STEP) * r1 - pz;
  const cx = Math.cos(a);
  const cz = Math.sin(a);
  const den = cx * ez - cz * ex;
  return Math.abs(den) < 1e-9 ? r0 : (px * ez - pz * ex) / den;
}
/** the largest reach of an island's walkable outline */
export function skyRimMax(s: SkyIsland): number {
  return Math.max(...RIMS.get(s.id)!);
}

// ── the heightfield (flattened under pads, hot springs and rune circles) ──
interface Flat {
  x: number;
  z: number;
  r: number;
  h: number;
}
function rawNodeH(isl: SkyIsland, i: number, j: number): number {
  const d = DEF_OF.get(isl.id)!;
  const lx = i * SKY_GRID;
  const lz = j * SKY_GRID;
  // distance measured against the rim (so the shoulder follows the bays and promontories)
  const dist = Math.hypot(lx, lz) === 0 ? 0 : (Math.hypot(lx, lz) * isl.r) / skyRimRadius(isl, lx, lz);
  // rolling hummocks
  let h = (vnoise(lx / 11 + d.seed * 1.7, lz / 11 - d.seed, d.seed) - 0.5) * 2 * d.amp;
  h += (vnoise(lx / 5 + 3, lz / 5 + d.seed, d.seed + 7) - 0.5) * 0.35 * d.amp;
  // a gentle dome, and the shoulder rolling down towards the lip
  h += (1 - Math.min(1, (dist / (isl.r + SKY_LIP)) ** 2)) * (0.5 + isl.r * 0.02);
  h -= smooth(isl.r * 0.72, isl.r + SKY_LIP, dist) * 0.55;
  // foothills rising towards the peak (walkable, gentle)
  if (isl.peak) {
    const dp = Math.hypot(isl.x + lx - isl.peak.x, isl.z + lz - isl.peak.z);
    h += (1 - smooth(isl.peak.r * 0.8, isl.peak.r * 2.1, dp)) * 2.2;
  }
  return h;
}
function triInterp(f: (i: number, j: number) => number, lx: number, lz: number): number {
  const gx = lx / SKY_GRID;
  const gz = lz / SKY_GRID;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  if (fx + fz <= 1) {
    const h00 = f(i, j);
    return h00 + (f(i + 1, j) - h00) * fx + (f(i, j + 1) - h00) * fz;
  }
  const h11 = f(i + 1, j + 1);
  return h11 + (f(i, j + 1) - h11) * (1 - fx) + (f(i + 1, j) - h11) * (1 - fz);
}
/** flat until r + FLAT_FULL (so every grid triangle over the disc is flat), blending out by r + FLAT_OUT */
const FLAT_FULL = SKY_GRID * 1.5;
const FLAT_OUT = SKY_GRID * 1.5 + 5.5;
const FLATS = new Map<string, Flat[]>(
  SKY_ISLANDS.map((s) => {
    const list: { x: number; z: number; r: number }[] = [
      ...SKY_PADS.filter((p) => p.island === s.id),
      ...SKY_SPOTS.filter((p) => p.island === s.id && (p.kind === "hotspring" || p.kind === "stones")).map((p) => ({ x: p.x, z: p.z, r: p.kind === "stones" ? RUNE_STONE_RING + 1 : 2.4 })),
    ];
    const flats = list.map((f) => ({ ...f, h: triInterp((i, j) => rawNodeH(s, i, j), f.x - s.x, f.z - s.z) }));
    // flats close enough to share grid nodes share one height (so each stays exactly flat)
    for (let pass = 0; pass < 3; pass++)
      for (const a of flats)
        for (const b of flats) if (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + FLAT_FULL * 2 + 0.5) b.h = a.h = Math.min(a.h, b.h);
    return [s.id, flats];
  }),
);

/** the top's heightfield at a grid node (island-local grid indices), relative to island.y */
function nodeH(isl: SkyIsland, i: number, j: number): number {
  let h = rawNodeH(isl, i, j);
  let best = 0;
  let target = h;
  for (const f of FLATS.get(isl.id) ?? []) {
    const d = Math.hypot(isl.x + i * SKY_GRID - f.x, isl.z + j * SKY_GRID - f.z);
    const w = 1 - smooth(f.r + FLAT_FULL, f.r + FLAT_OUT, d);
    if (w > best) {
      best = w;
      target = f.h;
    }
  }
  h += (target - h) * best;
  return h;
}

const nodeCache = new Map<string, number>();
function nodeHC(isl: SkyIsland, i: number, j: number): number {
  const k = `${isl.id}:${i}:${j}`;
  let v = nodeCache.get(k);
  if (v === undefined) {
    v = nodeH(isl, i, j);
    nodeCache.set(k, v);
  }
  return v;
}

/**
 * The top's height (relative to island.y, no bob) at island-local (lx, lz), linearly
 * interpolated on the SKY_GRID triangles: every square cell (i..i+1, j..j+1) is split along its
 * (i+1, j)–(i, j+1) diagonal. The renderer builds the grass on exactly these triangles.
 */
export function skyLocalHeight(isl: SkyIsland, lx: number, lz: number): number {
  return triInterp((i, j) => nodeHC(isl, i, j), lx, lz);
}

/** height of a grid node (for the renderer) */
export function skyNodeHeight(isl: SkyIsland, i: number, j: number): number {
  return nodeHC(isl, i, j);
}

/** small vertical bob (≤ 0.45 m, one slow swell every ~20 s) — islands never rotate */
export function skyBob(id: string, t: number): number {
  const isl = ISL_OF.get(id);
  const ph = isl ? isl.seed * 1.37 : 0;
  return Math.sin(t * 0.31 + ph) * 0.45;
}

/** the island (if any) whose top footprint (walkable outline, incl. the peak) contains (x, z) */
export function skyIslandAt(x: number, z: number): SkyIsland | null {
  for (const s of SKY_ISLANDS) {
    const d2 = (x - s.x) ** 2 + (z - s.z) ** 2;
    if (d2 > (s.r * 1.2) ** 2) continue;
    if (Math.sqrt(d2) <= skyRimRadius(s, x - s.x, z - s.z)) return s;
  }
  return null;
}

/** is (x, z) on the walkable part of this island's top (inside its rim, off the peak)? */
export function skyWalkable(s: SkyIsland, x: number, z: number): boolean {
  if (Math.hypot(x - s.x, z - s.z) > skyRimRadius(s, x - s.x, z - s.z)) return false;
  if (s.peak && (x - s.peak.x) ** 2 + (z - s.peak.z) ** 2 < s.peak.r * s.peak.r) return false;
  return true;
}

/** the top's height at (x, z) with no bob (props, chests, shards) */
export function skyBaseY(s: SkyIsland, x: number, z: number): number {
  return s.y + skyLocalHeight(s, x - s.x, z - s.z);
}

/** walkable surface height at (x, z) at time t (includes the gentle bob), or null if (x, z) is
 *  not over a walkable top (off every island and bridge, or on a peak). On a rope bridge `id` is
 *  the island at the nearer end and `bridge` the bridge's id. */
export function skyTopY(x: number, z: number, t: number): { y: number; id: string; bridge?: string } | null {
  const s = skyIslandAt(x, z);
  if (s) {
    if (!skyWalkable(s, x, z)) return null;
    return { y: skyBaseY(s, x, z) + skyBob(s.id, t), id: s.id };
  }
  const on = skyBridgeAt(x, z);
  if (!on) return null;
  return { y: skyBridgeY(on.bridge, on.u, t), id: on.u < 0.5 ? on.bridge.a : on.bridge.b, bridge: on.bridge.id };
}

// ── what stands on the tops ──
export type SkyPropKind = "pine" | "round" | "birch" | "blossom" | "bush" | "rock" | "pillar" | "broken" | "arch" | "altar" | "crystal" | "shrine" | "sign" | "flowers" | "lantern" | "mushroom";
export interface SkyProp {
  island: string;
  kind: SkyPropKind;
  /** world x/z */
  x: number;
  z: number;
  /** size (trees: scale of the unit tree; rocks/crystals: metres) */
  s: number;
  rot: number;
}

/** obstacle radius of a prop at s = 1 (0 = walk through) */
const PROP_R: Record<SkyPropKind, number> = { pine: 0.9, round: 1.05, birch: 0.7, blossom: 1.1, bush: 1.0, rock: 0.95, pillar: 0.95, broken: 0.95, arch: 0, altar: 1.6, crystal: 1.0, shrine: 2.1, sign: 0.35, flowers: 0, lantern: 0.3, mushroom: 0 };
/** the space a prop needs from others (m, at s = 1) */
const PROP_ROOM: Record<SkyPropKind, number> = { pine: 2.6, round: 4, birch: 2.6, blossom: 4, bush: 1.3, rock: 1.1, pillar: 1.3, broken: 1.3, arch: 4.6, altar: 2.2, crystal: 1.4, shrine: 2.8, sign: 0.8, flowers: 2.2, lantern: 0.6, mushroom: 1.2 };
const IS_TREE = new Set<SkyPropKind>(["pine", "round", "birch", "blossom"]);

/** tree scale → metres (trees are built at unit scale ~11–13 m tall) */
const TREE_S: Partial<Record<SkyPropKind, [number, number]>> = { pine: [0.5, 0.78], round: [0.5, 0.7], birch: [0.5, 0.7], blossom: [0.5, 0.66] };

type Recipe = [SkyPropKind, number][];
const RECIPES: Record<SkyIslandKind, (s: SkyIsland) => Recipe> = {
  mountain: (s) => [
    ["pine", Math.round(s.r * 0.55)],
    ["round", 2],
    ["birch", s.r > 25 ? 2 : 1],
    ["bush", Math.round(s.r * 0.16)],
    ["rock", Math.round(s.r * 0.2)],
    ["flowers", Math.round(s.r * 0.12)],
    ["mushroom", 3],
    ["sign", 1],
  ],
  meadow: () => [["round", 2], ["birch", 1], ["bush", 3], ["rock", 2], ["flowers", 3], ["mushroom", 2], ["sign", 1]],
  ruins: () => [["blossom", 1], ["round", 1], ["pillar", 2], ["broken", 3], ["rock", 3], ["bush", 2], ["flowers", 2]],
  crystal: () => [["crystal", 5], ["pine", 2], ["rock", 3], ["flowers", 1]],
  garden: () => [["blossom", 3], ["bush", 4], ["flowers", 4], ["mushroom", 2], ["lantern", 4]],
};

/** round obstacles of a discovery (world x/z) */
function spotObstacles(sp: SkySpot): { x: number; z: number; r: number }[] {
  const at = (lx: number, lz: number, r: number) => ({ x: sp.x + lx * Math.cos(sp.rot) + lz * Math.sin(sp.rot), z: sp.z - lx * Math.sin(sp.rot) + lz * Math.cos(sp.rot), r });
  switch (sp.kind) {
    case "cave": {
      // the grotto's rocky shell round the back and sides (its mouth faces local +z)
      const out = [];
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * 0.34 + (k / 8) * Math.PI * 1.32;
        out.push(at(Math.sin(a) * 3.9, Math.cos(a) * 3.9, 0.9));
      }
      return out;
    }
    case "nest":
      return [at(0, 0, 2.0)];
    case "stones":
      return [at(0, 0, 1.1)];
    case "launcher":
      // the sky cannon behind its launch pad
      return sp.name.includes("Cannon") ? [at(0, -2.4, 0.9)] : [];
    case "telescope":
      return [at(0, 0, 0.45)];
    case "bell":
      return [at(-1.35, 0, 0.3), at(1.35, 0, 0.3)];
    case "swing":
      return [at(0, -0.6, 0.9)];
    case "lookout": {
      const out = [];
      for (let k = 0; k < 7; k++) {
        const a = -1.1 + (k / 6) * 2.2;
        out.push(at(Math.sin(a) * 2.3, Math.cos(a) * 2.3, 0.28));
      }
      return out;
    }
    case "shrine":
      return [at(0, -0.4, 1.1)];
    case "treehouse":
      return [at(0, -0.8, 1.1)];
    case "cloudling":
      return [at(0, 0, 1.4)];
    case "mushroomring": {
      const out = [];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        out.push(at(Math.sin(a) * 2.9, Math.cos(a) * 2.9, 0.45));
      }
      return out;
    }
    default:
      return [];
  }
}

function planProps(s: SkyIsland): SkyProp[] {
  const r = rng(s.seed * 7717 + 3);
  const out: SkyProp[] = [];
  const room: Room[] = [
    { x: s.treasure.x, z: s.treasure.z, r: 2.6 },
    { x: s.landing.x, z: s.landing.z, r: s.r > 15 ? 5 : 3.4 },
    ...bridgeHeads(s),
    ...SKY_PADS.filter((p) => p.island === s.id).map((p) => ({ x: p.x, z: p.z, r: p.r + 1.2 })),
    ...SKY_SPOTS.filter((p) => p.island === s.id).map((p) => ({ x: p.x, z: p.z, r: SPOT_ROOM[p.kind] + 0.4 })),
  ];
  const pads = SKY_PADS.filter((p) => p.island === s.id);
  const put = (kind: SkyPropKind, x: number, z: number, sz: number, rot: number) => {
    out.push({ island: s.id, kind, x, z, s: sz, rot });
    room.push({ x, z, r: PROP_ROOM[kind] * (IS_TREE.has(kind) ? sz * 1.3 : kind === "rock" || kind === "crystal" ? sz : 1) });
  };
  const end = skyStreamEnd(s);
  const ok = (x: number, z: number, need: number, edgePad: number, byLanding = false) => {
    if (!skyWalkable(s, x, z)) return false;
    if (Math.hypot(x - s.x, z - s.z) > skyRimRadius(s, x - s.x, z - s.z) - edgePad) return false;
    if (s.peak && Math.hypot(x - s.peak.x, z - s.peak.z) < s.peak.r + 0.8 + need * 0.5) return false;
    if (distToSeg(x, z, s.spring.x, s.spring.z, end.x, end.z) < 1.6 + need * 0.6) return false;
    // keep the stepping-stone paths (landing → treasure, pad doors → landing) clear
    if (!byLanding && distToSeg(x, z, s.landing.x, s.landing.z, s.treasure.x, s.treasure.z) < 1.3 + need * 0.6) return false;
    for (const p of pads) if (distToSeg(x, z, p.x, p.z, s.landing.x, s.landing.z) < 1.6 + need * 0.6) return false;
    for (const o of room) if (!(byLanding && o === room[1]) && Math.hypot(o.x - x, o.z - z) < o.r + need) return false;
    return true;
  };
  // ruins: a great broken arch in the middle and an altar under it (the treasure is by the altar)
  const ruins = ruinsCentre(s);
  if (ruins) {
    // the chest waits under the arch, in front of the altar; you land facing them
    out.push({ island: s.id, kind: "arch", x: ruins.arch.x, z: ruins.arch.z, s: 0.9, rot: ruins.arch.rot });
    room.push({ x: ruins.arch.x, z: ruins.arch.z, r: 3.6 });
    put("altar", ruins.altar.x, ruins.altar.z, 0.8, ruins.altar.rot);
  }
  // crystal: one great crystal in the middle
  if (s.kind === "crystal" && ok(s.x, s.z, 1.2, 2)) put("crystal", s.x, s.z, 2.3, r() * 6);
  for (const [kind, n] of RECIPES[s.kind](s)) {
    for (let k = 0, tries = 0; k < n && tries < 600; tries++) {
      const a = r() * Math.PI * 2;
      // trees and rocks like the peak's foot and the rim; signs stand by the landing spot
      let x: number;
      let z: number;
      if (kind === "sign") {
        const b = r() * Math.PI * 2;
        x = s.landing.x + Math.sin(b) * 3.2;
        z = s.landing.z + Math.cos(b) * 3.2;
      } else if (kind === "lantern") {
        const b = r() * Math.PI * 2;
        x = s.x + Math.sin(b) * s.r * (0.4 + r() * 0.4);
        z = s.z + Math.cos(b) * s.r * (0.4 + r() * 0.4);
      } else if (s.peak && (kind === "pine" || kind === "rock") && r() < 0.55) {
        const dd = s.peak.r + 1.5 + r() * 5;
        x = s.peak.x + Math.sin(a) * dd;
        z = s.peak.z + Math.cos(a) * dd;
      } else {
        const dd = Math.sqrt(r()) * (s.r * 1.1 - 1.5);
        x = s.x + Math.sin(a) * dd;
        z = s.z + Math.cos(a) * dd;
      }
      const tr = TREE_S[kind];
      const sz = tr ? tr[0] + r() * (tr[1] - tr[0]) : kind === "rock" ? 0.9 + r() * 1.1 : kind === "crystal" ? 0.9 + r() * 0.7 : kind === "bush" ? 0.8 + r() * 0.5 : 1;
      const need = PROP_ROOM[kind] * (tr ? sz : kind === "rock" || kind === "crystal" ? sz : 1) * 0.5;
      const edgePad = IS_TREE.has(kind) ? 2.2 : kind === "flowers" ? 0.8 : 1.4;
      if (!ok(x, z, need, edgePad, kind === "sign")) continue;
      put(kind, x, z, sz, kind === "sign" ? Math.atan2(s.landing.x - x, s.landing.z - z) : r() * Math.PI * 2);
      k++;
    }
  }
  return out;
}

/** everything standing on the tops (world x/z), for the renderer */
export const SKY_PROPS: SkyProp[] = SKY_ISLANDS.flatMap(planProps);

/** round things to walk around on the tops (peaks, trees, rocks, ruins, crystals, the solid
 *  parts of the discoveries, bridge posts), world x/z; `id` = the island they stand on */
export const SKY_OBSTACLES: { x: number; z: number; r: number; id: string }[] = [
  ...SKY_ISLANDS.filter((s) => s.peak).map((s) => ({ x: s.peak!.x, z: s.peak!.z, r: s.peak!.r, id: s.id })),
  ...SKY_PROPS.flatMap((p) => {
    if (p.kind === "arch") {
      // the arch's two legs (local x = ±3.2 at scale 1)
      return [-3.2, 3.2].map((lx) => ({ x: p.x + lx * p.s * Math.cos(p.rot), z: p.z - lx * p.s * Math.sin(p.rot), r: 1.0, id: p.island }));
    }
    const base = PROP_R[p.kind];
    if (!base) return [];
    const k = IS_TREE.has(p.kind) || p.kind === "bush" ? p.s : p.kind === "rock" || p.kind === "crystal" ? p.s : 1;
    return [{ x: p.x, z: p.z, r: Math.max(0.3, base * k), id: p.island }];
  }),
  ...SKY_SPOTS.flatMap((sp) => spotObstacles(sp).map((o) => ({ ...o, id: sp.island }))),
  // the rope bridges' end posts, either side of the deck
  ...SKY_BRIDGES.flatMap((br) => {
    const L = Math.hypot(br.bx - br.ax, br.bz - br.az);
    const px = -(br.bz - br.az) / L;
    const pz = (br.bx - br.ax) / L;
    return [
      [br.ax, br.az, br.a],
      [br.bx, br.bz, br.b],
    ].flatMap(([x, z, id]) => [1, -1].map((sd) => ({ x: (x as number) + px * sd * (br.half + 0.45), z: (z as number) + pz * sd * (br.half + 0.45), r: 0.3, id: id as string })));
  }),
];
