// Mini golf course registry — the 18 holes of Cucaino Candy Golf. To add or change a hole, edit a
// HoleDef below: the green, walls, cup, flag and every obstacle are generated from it, the
// physics (physics.ts) reads the same data, and physics.test.ts checks every hole can be sunk.
// Coordinates are local to the hole, in world units; the tee sits at +z and the camera looks
// towards -z.

export interface Vec2 {
  x: number;
  z: number;
}

/** An area on the green: a circle or an axis-aligned box. */
export type Zone = { at: Vec2; r: number } | { min: Vec2; max: Vec2 };

export interface HoleDef {
  name: string;
  par: number;
  /** candy colour for the walls and flag */
  color: string;
  /** closed outline of the green (walls run along every edge) */
  outline: Vec2[];
  tee: Vec2;
  cup: Vec2;
  /** extra inner walls, each an open polyline */
  walls?: Vec2[][];
  bumpers?: { at: Vec2; r: number }[];
  /** windmill: two crossed spinning blades of `length` centred at `at` */
  blades?: { at: Vec2; length: number; speed: number }[];
  /** sliding candy blocks: centre `at`, box `size`, slides ±`travel` with sin(t·speed + phase) */
  movers?: { at: Vec2; size: Vec2; travel: Vec2; speed: number; phase?: number }[];
  /** sand traps: much higher rolling resistance inside */
  sand?: Zone[];
  /** slippery ice: the ball glides much further */
  ice?: Zone[];
  /** water: splash! +1 stroke and the ball goes back to where it was hit from */
  water?: Zone[];
  /** hills: a steady push (units/s²) while the ball is on them */
  slopes?: { zone: Zone; push: Vec2 }[];
  /** humps in the green: `h` high in the middle, `r` across — the ball rolls down off them */
  mounds?: { at: Vec2; r: number; h: number }[];
  /** zoom pads: fire the ball along `dir` at `speed` */
  boosts?: { at: Vec2; r: number; dir: Vec2; speed: number }[];
  /** one-way portals: roll into `from`, pop out of `to` still rolling */
  portals?: { from: Vec2; to: Vec2; r: number }[];
}

const v = (x: number, z: number): Vec2 => ({ x, z });
const rect = (hx: number, hz: number): Vec2[] => [v(-hx, -hz), v(hx, -hz), v(hx, hz), v(-hx, hz)];
const box = (x1: number, z1: number, x2: number, z2: number): Zone => ({ min: v(x1, z1), max: v(x2, z2) });
const octagon = (r: number): Vec2[] => Array.from({ length: 8 }, (_, i) => v(r * Math.cos((i * Math.PI) / 4 + Math.PI / 8), r * Math.sin((i * Math.PI) / 4 + Math.PI / 8)));

export const COURSE: HoleDef[] = [
  {
    name: "Hello Hole",
    mounds: [{ at: v(-0.5, 1.6), r: 1.1, h: 0.3 }],
    par: 2,
    color: "#ff5fa8",
    outline: rect(1.6, 5),
    tee: v(0, 4),
    cup: v(0, -3.8),
    bumpers: [{ at: v(0.7, 0), r: 0.35 }],
  },
  {
    name: "Windmill",
    mounds: [{ at: v(0, 2.9), r: 1.3, h: 0.35 }, { at: v(0, -3), r: 1.2, h: 0.3 }],
    par: 2,
    color: "#36b8ff",
    outline: rect(2, 6),
    tee: v(0, 5),
    cup: v(0, -4.8),
    blades: [{ at: v(0, 0), length: 3.2, speed: 1.2 }],
  },
  {
    name: "Round the Bend",
    mounds: [{ at: v(0, 1.6), r: 1.3, h: 0.4 }, { at: v(3.6, -3), r: 1.1, h: 0.3 }],
    par: 3,
    color: "#f5b400",
    outline: [v(-1.6, 6), v(-1.6, -4.6), v(6.4, -4.6), v(6.4, -1.4), v(1.6, -1.4), v(1.6, 6)],
    tee: v(0, 5),
    cup: v(5.2, -3),
    bumpers: [{ at: v(0, -3), r: 0.4 }],
  },
  {
    name: "Bumper Party",
    mounds: [{ at: v(0, 3.8), r: 1.3, h: 0.35 }, { at: v(0, -4), r: 1.2, h: 0.3 }],
    par: 3,
    color: "#a96bff",
    outline: rect(2.6, 6),
    tee: v(0, 5),
    cup: v(0, -5),
    bumpers: [
      { at: v(-1.1, 2.2), r: 0.4 },
      { at: v(1.1, 0.6), r: 0.4 },
      { at: v(-1, -1.2), r: 0.4 },
      { at: v(1, -2.6), r: 0.4 },
      { at: v(0, -0.3), r: 0.35 },
    ],
  },
  {
    name: "Sandy Island",
    mounds: [{ at: v(-1.6, 4), r: 1.2, h: 0.35 }, { at: v(0.6, -1.4), r: 1.1, h: 0.3 }],
    par: 3,
    color: "#2fcf8f",
    outline: rect(3, 7),
    tee: v(0, 6),
    cup: v(1.6, -5.8),
    sand: [
      { at: v(0, 1.2), r: 1.6 },
      { at: v(-1.6, -3), r: 1.1 },
    ],
    blades: [{ at: v(1.1, -3.6), length: 2, speed: -1.6 }],
  },
  {
    name: "Zoom Pad",
    mounds: [{ at: v(0, -4), r: 1.3, h: 0.35 }],
    par: 2,
    color: "#ff7a3d",
    outline: rect(1.8, 7),
    tee: v(0, 6),
    cup: v(0, -6),
    boosts: [{ at: v(0, 3.2), r: 0.6, dir: v(0, -1), speed: 8 }],
    sand: [box(-1.8, -2.2, -0.7, 0.4), box(0.7, -2.2, 1.8, 0.4)],
  },
  {
    name: "Portal Pop",
    mounds: [{ at: v(-1.75, 2), r: 1.2, h: 0.35 }, { at: v(1.75, -2.6), r: 1.1, h: 0.3 }],
    par: 2,
    color: "#7a5cff",
    outline: rect(3.5, 6),
    walls: [[v(0, 6), v(0, -6)]],
    tee: v(-1.75, 5),
    cup: v(1.75, -4.8),
    // roll into the left portal, pop out in the right lane still rolling towards the cup
    portals: [{ from: v(-1.75, -1.2), to: v(1.75, 0), r: 0.5 }],
    sand: [box(-3.5, -6, 0, -3.8)],
    bumpers: [{ at: v(2.5, -3), r: 0.35 }],
  },
  {
    name: "Hill Climb",
    par: 3,
    color: "#e84a8a",
    outline: rect(2.2, 7),
    tee: v(0, 6),
    cup: v(0, -5.6),
    // a hill in the middle rolls weak putts back down towards you
    slopes: [{ zone: box(-2.2, -2, 2.2, 2), push: v(0, 2.8) }],
    bumpers: [
      { at: v(-1.1, -3.6), r: 0.35 },
      { at: v(1.1, -3.6), r: 0.35 },
    ],
  },
  {
    name: "Ice Rink",
    mounds: [{ at: v(1.4, 3), r: 1.1, h: 0.3 }, { at: v(-1.4, -2), r: 1.1, h: 0.3 }],
    par: 2,
    color: "#5ad0ff",
    outline: rect(3, 6.5),
    tee: v(0, 5.6),
    cup: v(0, -5.4),
    ice: [box(-3, -4, 3, 4)],
    bumpers: [
      { at: v(-1.5, 1.2), r: 0.3 },
      { at: v(1.5, -0.6), r: 0.3 },
      { at: v(-0.6, -2.6), r: 0.3 },
    ],
  },
  {
    name: "Splash Bridge",
    mounds: [{ at: v(0, 3.8), r: 1.3, h: 0.35 }, { at: v(-0.8, -3.6), r: 1.3, h: 0.4 }],
    par: 3,
    color: "#1fa6ff",
    outline: rect(3, 7),
    tee: v(0, 6),
    cup: v(1.5, -5.5),
    water: [box(-3, -1.5, -0.6, 1.5), box(0.6, -1.5, 3, 1.5)],
  },
  {
    name: "Zig Zag",
    mounds: [{ at: v(2, 5.8), r: 0.9, h: 0.3 }, { at: v(-2, 2), r: 0.9, h: 0.3 }, { at: v(2, -2), r: 0.9, h: 0.3 }],
    par: 5,
    color: "#ffb020",
    outline: rect(3, 8),
    walls: [
      [v(-3, 4), v(1.3, 4)],
      [v(3, 0), v(-1.3, 0)],
      [v(-3, -4), v(1.3, -4)],
    ],
    tee: v(-2, 7),
    cup: v(-1.8, -6.6),
  },
  {
    name: "Sliding Doors",
    mounds: [{ at: v(0, 4), r: 1.2, h: 0.3 }, { at: v(0, -0.5), r: 1.2, h: 0.35 }],
    par: 3,
    color: "#ff4f6d",
    outline: rect(2.4, 7),
    tee: v(0, 6),
    cup: v(0, -6),
    movers: [
      { at: v(0, 1.5), size: v(2.6, 0.5), travel: v(1.1, 0), speed: 1.3 },
      { at: v(0, -2.5), size: v(2.6, 0.5), travel: v(1.1, 0), speed: 1.3, phase: Math.PI },
    ],
  },
  {
    name: "Cookie Forest",
    mounds: [{ at: v(0, 1.6), r: 1.0, h: 0.3 }, { at: v(0, -4.6), r: 1.4, h: 0.4 }],
    par: 3,
    color: "#c47a3a",
    outline: rect(3.5, 7),
    tee: v(0, 6.2),
    cup: v(0, -6.2),
    // staggered rows of cookies to weave through
    bumpers: [
      ...[-2.3, 0, 2.3].map((x) => ({ at: v(x, 3), r: 0.45 })),
      ...[-1.15, 1.15].map((x) => ({ at: v(x, 0.2), r: 0.45 })),
      ...[-2.3, 0, 2.3].map((x) => ({ at: v(x, -2.6), r: 0.45 })),
    ],
  },
  {
    name: "Portal Party",
    mounds: [{ at: v(0, 3.8), r: 1.2, h: 0.3 }, { at: v(0.8, -3.4), r: 1.1, h: 0.3 }],
    par: 2,
    color: "#b05cff",
    outline: rect(4, 6),
    walls: [[v(-4, -0.5), v(4, -0.5)]],
    tee: v(0, 5),
    cup: v(2.2, -4.4),
    portals: [
      { from: v(-2.6, 1.2), to: v(-3, -4.8), r: 0.5 },
      { from: v(0, 2), to: v(0, -1.6), r: 0.5 },
      { from: v(2.6, 1.2), to: v(3.2, -1.6), r: 0.5 },
    ],
    sand: [{ at: v(-2.4, -3.6), r: 0.9 }],
  },
  {
    name: "Volcano",
    par: 2,
    color: "#ff5a36",
    outline: octagon(5.6),
    tee: v(0, 4.6),
    cup: v(0, 0),
    // up the near side, a flat top with the cup, and down the far side
    slopes: [
      { zone: box(-2.6, 0.9, 2.6, 3), push: v(0, 2.6) },
      { zone: box(-2.6, -3, 2.6, -0.9), push: v(0, -2.4) },
    ],
    bumpers: [
      { at: v(-3.4, -2.6), r: 0.4 },
      { at: v(3.4, -2.6), r: 0.4 },
    ],
  },
  {
    name: "Roller Hills",
    par: 3,
    color: "#4fd16b",
    outline: rect(2, 8.5),
    tee: v(0, 7.5),
    cup: v(0, -7.2),
    slopes: [
      { zone: box(-2, 2.5, 2, 5), push: v(0, -2.2) },
      { zone: box(-2, -1.5, 2, 1), push: v(0, 2.6) },
      { zone: box(-2, -5.5, 2, -3), push: v(0, -2) },
    ],
    sand: [{ at: v(0, -1.5 - 0.1), r: 0.5 }],
  },
  {
    name: "Candy Canyon",
    mounds: [{ at: v(0, 5), r: 1.2, h: 0.35 }, { at: v(4.4, -4.6), r: 0.9, h: 0.25 }],
    par: 3,
    color: "#ff6fcf",
    outline: [v(-1.6, 9), v(1.6, 9), v(1.6, 3.2), v(6, 3.2), v(6, -9), v(2.8, -9), v(2.8, -0.2), v(-1.6, -0.2)],
    tee: v(0, 8),
    cup: v(4.4, -7.6),
    water: [{ at: v(4.6, 1.6), r: 0.9 }],
    boosts: [{ at: v(4.4, -2.2), r: 0.6, dir: v(0, -1), speed: 6.5 }],
    sand: [{ at: v(3.6, -5.2), r: 0.7 }],
  },
  {
    name: "Grand Finale",
    mounds: [{ at: v(-1.6, 5.4), r: 1.2, h: 0.3 }, { at: v(2.4, 0.4), r: 1.1, h: 0.3 }],
    par: 3,
    color: "#ffd000",
    outline: rect(4, 8),
    tee: v(0, 7),
    cup: v(0, -6.6),
    water: [box(-4, 2, -1.2, 4)],
    boosts: [{ at: v(1.8, 3.4), r: 0.6, dir: v(0, -1), speed: 7 }],
    blades: [{ at: v(0, -1.6), length: 3.4, speed: 1.4 }],
    movers: [{ at: v(0, -4.6), size: v(2.2, 0.45), travel: v(1.6, 0), speed: 1.1 }],
    bumpers: [
      { at: v(-2.6, -4.2), r: 0.4 },
      { at: v(2.6, -4.2), r: 0.4 },
    ],
  },
];

/**
 * The second course: Storybook Kingdom Golf — 18 holes through a fairy-tale park (a castle gate, a
 * pirate cove, a jungle idol, a rocket, spinning teacups, a friendly haunted manor …). It leans on
 * real HILLS (`mounds`): every hole has ground that rises and falls, so a putt curls round a hump
 * or has to be hit hard enough to climb over one.
 */
export const KINGDOM: HoleDef[] = [
  {
    name: "Castle Gate",
    par: 2,
    color: "#4f7bd9",
    outline: rect(2, 6),
    tee: v(0, 5),
    cup: v(0, -4.8),
    // a hump right in the way: over it, or round it off a wall
    mounds: [{ at: v(0, 0.3), r: 1.7, h: 0.55 }],
  },
  {
    name: "Pirate Cove",
    par: 3,
    color: "#1fa6a0",
    outline: rect(3, 7),
    tee: v(0, 6),
    cup: v(-1.4, -5.6),
    water: [box(-3, 0.4, -0.9, 2.6), box(0.9, 0.4, 3, 2.6)],
    sand: [{ at: v(1.5, -3.2), r: 1.1 }],
    mounds: [{ at: v(0.2, -2.2), r: 1.3, h: 0.4 }],
  },
  {
    name: "Jungle Idol",
    par: 3,
    color: "#3fa34d",
    outline: [v(-1.8, 6.5), v(1.8, 6.5), v(1.8, -1.2), v(6.2, -1.2), v(6.2, -5), v(-1.8, -5)],
    tee: v(0, 5.5),
    cup: v(5, -3.1),
    bumpers: [
      { at: v(0, -3.2), r: 0.45 },
      { at: v(2.6, -2.2), r: 0.35 },
    ],
    mounds: [{ at: v(0, 1.6), r: 1.5, h: 0.45 }],
  },
  {
    name: "Rocket Launch",
    par: 2,
    color: "#e0483c",
    outline: rect(1.9, 8),
    tee: v(0, 7),
    cup: v(0, -6.8),
    boosts: [{ at: v(0, 4.4), r: 0.6, dir: v(0, -1), speed: 8.5 }],
    // the launch ramp: a long climb the boost carries you up
    slopes: [{ zone: box(-1.9, -2.4, 1.9, 1.6), push: v(0, 2.6) }],
    mounds: [{ at: v(0, -4.6), r: 1.2, h: 0.3 }],
  },
  {
    name: "Spinning Teacups",
    par: 3,
    color: "#e86aa6",
    outline: octagon(5.2),
    tee: v(0, 4.2),
    cup: v(0, -4),
    blades: [
      { at: v(-1.7, 0.4), length: 2.4, speed: 1.3 },
      { at: v(1.7, -0.6), length: 2.4, speed: -1.5 },
    ],
    mounds: [
      { at: v(-3, -2.4), r: 1.2, h: 0.35 },
      { at: v(3, 2.2), r: 1.2, h: 0.35 },
    ],
  },
  {
    name: "Haunted Manor",
    par: 2,
    color: "#7a5cc4",
    outline: rect(3.6, 6.2),
    walls: [[v(0, 6.2), v(0, -6.2)]],
    tee: v(-1.8, 5.2),
    cup: v(1.8, -5),
    // through the secret door on the left, out in the right-hand hall
    portals: [{ from: v(-1.8, -2.2), to: v(1.8, 2.4), r: 0.5 }],
    sand: [box(-3.6, -6.2, 0, -4.4)],
    mounds: [
      { at: v(-1.8, 1.6), r: 1.1, h: 0.3 },
      { at: v(1.8, -1.6), r: 1.2, h: 0.4 },
    ],
  },
  {
    name: "Mine Train",
    par: 4,
    color: "#b5651d",
    outline: rect(3, 8),
    walls: [
      [v(-3, 3.6), v(1.2, 3.6)],
      [v(3, -0.4), v(-1.2, -0.4)],
      [v(-3, -4.2), v(1.2, -4.2)],
    ],
    tee: v(-2, 6.8),
    cup: v(-1.8, -6.8),
    mounds: [
      { at: v(2.1, 1.6), r: 0.85, h: 0.3 },
      { at: v(-2.1, -2.3), r: 0.85, h: 0.3 },
    ],
  },
  {
    name: "Carousel",
    par: 3,
    color: "#f2a13b",
    outline: octagon(5.4),
    tee: v(0, 4.4),
    cup: v(0, -4.2),
    // a ring of posts round a raised turntable in the middle
    bumpers: Array.from({ length: 6 }, (_, i) => ({ at: v(Math.cos((i * Math.PI) / 3 + 0.52) * 2.6, Math.sin((i * Math.PI) / 3 + 0.52) * 2.6), r: 0.32 })),
    mounds: [{ at: v(0, 0), r: 1.9, h: 0.6 }],
  },
  {
    name: "Clock Tower",
    par: 3,
    color: "#3d8fd1",
    outline: rect(2.3, 7.5),
    tee: v(0, 6.5),
    cup: v(0, -6.4),
    blades: [
      { at: v(0, 2.6), length: 3.2, speed: 1.1 },
      { at: v(0, -2.6), length: 3.2, speed: -1.4 },
    ],
    mounds: [{ at: v(0, 0), r: 1.2, h: 0.35 }],
  },
  {
    name: "Dragon's Hill",
    par: 3,
    color: "#3fbf6f",
    outline: rect(3.2, 7.5),
    tee: v(0, 6.5),
    cup: v(0, -6),
    // the dragon's back: two big humps with a dip between
    mounds: [
      { at: v(-0.9, 2.6), r: 2, h: 0.7 },
      { at: v(1, -1.8), r: 2.1, h: 0.75 },
    ],
    bumpers: [
      { at: v(-2.2, -4.2), r: 0.35 },
      { at: v(2.2, -4.2), r: 0.35 },
    ],
  },
  {
    name: "Treasure Island",
    par: 3,
    color: "#e8b923",
    outline: rect(3.4, 7.2),
    tee: v(0, 6.2),
    cup: v(0, -5.6),
    // a causeway out to the island: water either side, sand on the beach
    water: [box(-3.4, 0.2, -1, 3.6), box(1, 0.2, 3.4, 3.6)],
    sand: [box(-3.4, -1.4, 3.4, 0.2)],
    mounds: [
      { at: v(-1.7, -3.6), r: 1.3, h: 0.45 },
      { at: v(1.7, -3.6), r: 1.3, h: 0.45 },
    ],
  },
  {
    name: "Mushroom Glen",
    par: 3,
    color: "#d9534f",
    outline: rect(3.4, 7),
    tee: v(0, 6),
    cup: v(0, -6),
    bumpers: [
      ...[-2.1, 0, 2.1].map((x) => ({ at: v(x, 3.2), r: 0.4 })),
      ...[-1.05, 1.05].map((x) => ({ at: v(x, 0.6), r: 0.4 })),
    ],
    mounds: [
      { at: v(-1.6, -2.6), r: 1.3, h: 0.45 },
      { at: v(1.6, -2.6), r: 1.3, h: 0.45 },
    ],
  },
  {
    name: "Wishing Well",
    par: 3,
    color: "#5aa9a0",
    outline: octagon(5.2),
    tee: v(0, 4.2),
    cup: v(0, 0),
    // the well stands on a knoll: hit too soft and you roll back down
    mounds: [{ at: v(0, 0), r: 2.6, h: 0.5 }],
    bumpers: [
      { at: v(-3.2, -2.4), r: 0.4 },
      { at: v(3.2, -2.4), r: 0.4 },
    ],
  },
  {
    name: "Drawbridge",
    par: 3,
    color: "#8d6e4a",
    outline: rect(2.5, 7.5),
    tee: v(0, 6.5),
    cup: v(0, -6.4),
    water: [box(-2.5, -0.8, -0.8, 1.2), box(0.8, -0.8, 2.5, 1.2)],
    movers: [{ at: v(0, 3.2), size: v(2.4, 0.5), travel: v(1.1, 0), speed: 1.2 }],
    mounds: [{ at: v(0, -3.4), r: 1.5, h: 0.45 }],
  },
  {
    name: "Ferris Wheel",
    par: 3,
    color: "#e85d9a",
    outline: octagon(5.6),
    tee: v(0, 4.6),
    cup: v(0, -4.4),
    blades: [{ at: v(0, 0), length: 5, speed: 0.8 }],
    mounds: [
      { at: v(-3.2, 1.2), r: 1.2, h: 0.35 },
      { at: v(3.2, -1.2), r: 1.2, h: 0.35 },
    ],
  },
  {
    name: "Balloon Fair",
    par: 3,
    color: "#5ad0ff",
    outline: rect(3, 7),
    tee: v(0, 6),
    cup: v(0, -5.8),
    ice: [box(-3, -1, 3, 3)],
    bumpers: [
      { at: v(-1.4, 1.8), r: 0.32 },
      { at: v(1.4, 0.2), r: 0.32 },
    ],
    mounds: [{ at: v(0, -3.2), r: 1.6, h: 0.5 }],
  },
  {
    name: "Royal Fountain",
    par: 3,
    color: "#3aa0d8",
    outline: octagon(5.8),
    tee: v(0, 4.8),
    cup: v(0, -4.6),
    water: [{ at: v(0, 0), r: 1.5 }],
    mounds: [
      { at: v(-3.1, 0), r: 1.4, h: 0.45 },
      { at: v(3.1, 0), r: 1.4, h: 0.45 },
    ],
  },
  {
    name: "Crown Finale",
    par: 4,
    color: "#ffcc33",
    outline: rect(4, 8.5),
    tee: v(0, 7.5),
    cup: v(0, -7.2),
    water: [box(1.4, 2.6, 4, 4.6)],
    boosts: [{ at: v(-2, 4), r: 0.6, dir: v(0, -1), speed: 7 }],
    blades: [{ at: v(0, -0.6), length: 3.6, speed: 1.3 }],
    movers: [{ at: v(0, -4.2), size: v(2.2, 0.45), travel: v(1.6, 0), speed: 1.1 }],
    mounds: [
      { at: v(2.4, -1.2), r: 1.2, h: 0.4 },
      { at: v(-2.4, -5.6), r: 1.2, h: 0.4 },
      { at: v(2.4, -5.6), r: 1.2, h: 0.4 },
    ],
  },
];

/** the park's mini golf courses */
export const COURSES = { candy: COURSE, kingdom: KINGDOM } as const;
export type CourseId = keyof typeof COURSES;

// ── the lie of the land ──
/** how hard a slope pulls: acceleration (units/s²) per unit of gradient */
export const SLOPE_G = 7;
/** a mound's height at distance d from its middle: a smooth hump, flat at its edge */
const moundH = (m: { r: number; h: number }, d: number) => (d >= m.r ? 0 : m.h * (1 - (d / m.r) ** 2) ** 2);

/** the downhill pull of every mound at (x, z) */
export function moundPush(hole: HoleDef, x: number, z: number): Vec2 {
  let ax = 0;
  let az = 0;
  for (const m of hole.mounds ?? []) {
    const dx = x - m.at.x;
    const dz = z - m.at.z;
    const d = Math.hypot(dx, dz);
    if (d >= m.r || d < 1e-6) continue;
    // dh/dd = -4 h d / r² (1 - d²/r²); downhill is outward on a hump
    const k = (SLOPE_G * 4 * m.h * (1 - (d / m.r) ** 2)) / (m.r * m.r);
    ax += dx * k;
    az += dz * k;
  }
  return { x: ax, z: az };
}

/**
 * How high the green stands at (x, z): its mounds, and each hill zone drawn as the ramp its push
 * comes from (rising against the push, easing back to the flat at the zone's edges). The scene
 * draws the ground and sits the ball on it with this; the rolling itself uses the pushes.
 */
export function greenHeight(hole: HoleDef, x: number, z: number): number {
  let h = 0;
  for (const m of hole.mounds ?? []) h += moundH(m, Math.hypot(x - m.at.x, z - m.at.z));
  for (const sl of hole.slopes ?? []) {
    const zn = sl.zone;
    const p = Math.hypot(sl.push.x, sl.push.z) || 1;
    const ux = -sl.push.x / p;
    const uz = -sl.push.z / p;
    let edge: number;
    let cx: number;
    let cz: number;
    let half: number;
    if ("r" in zn) {
      const d = Math.hypot(x - zn.at.x, z - zn.at.z);
      if (d >= zn.r) continue;
      edge = zn.r - d;
      cx = zn.at.x;
      cz = zn.at.z;
      half = zn.r;
    } else {
      if (x <= zn.min.x || x >= zn.max.x || z <= zn.min.z || z >= zn.max.z) continue;
      // (only the edges the slope runs ACROSS ease back down: its sides meet the walls)
      const ex = Math.abs(ux) > 0.5 ? Math.min(x - zn.min.x, zn.max.x - x) : 9;
      const ez = Math.abs(uz) > 0.5 ? Math.min(z - zn.min.z, zn.max.z - z) : 9;
      edge = Math.min(ex, ez);
      cx = (zn.min.x + zn.max.x) / 2;
      cz = (zn.min.z + zn.max.z) / 2;
      half = Math.abs(ux) * (zn.max.x - zn.min.x) * 0.5 + Math.abs(uz) * (zn.max.z - zn.min.z) * 0.5;
    }
    const along = (x - cx) * ux + (z - cz) * uz; // -half (the foot) .. +half (the top)
    const rise = ((along + half) * p) / SLOPE_G;
    const e = Math.min(1, edge / 0.55);
    h += rise * e * e * (3 - 2 * e);
  }
  return h;
}

/** Where hole i sits in the mini golf scene: a 6 x 3 grid of holes. */
export function holeOrigin(i: number): Vec2 {
  return { x: (i % 6) * 22, z: Math.floor(i / 6) * -30 };
}
