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
    par: 2,
    color: "#ff5fa8",
    outline: rect(1.6, 5),
    tee: v(0, 4),
    cup: v(0, -3.8),
    bumpers: [{ at: v(0.7, 0), r: 0.35 }],
  },
  {
    name: "Windmill",
    par: 2,
    color: "#36b8ff",
    outline: rect(2, 6),
    tee: v(0, 5),
    cup: v(0, -4.8),
    blades: [{ at: v(0, 0), length: 3.2, speed: 1.2 }],
  },
  {
    name: "Round the Bend",
    par: 3,
    color: "#f5b400",
    outline: [v(-1.6, 6), v(-1.6, -4.6), v(6.4, -4.6), v(6.4, -1.4), v(1.6, -1.4), v(1.6, 6)],
    tee: v(0, 5),
    cup: v(5.2, -3),
    bumpers: [{ at: v(0, -3), r: 0.4 }],
  },
  {
    name: "Bumper Party",
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
    par: 3,
    color: "#1fa6ff",
    outline: rect(3, 7),
    tee: v(0, 6),
    cup: v(1.5, -5.5),
    water: [box(-3, -1.5, -0.6, 1.5), box(0.6, -1.5, 3, 1.5)],
  },
  {
    name: "Zig Zag",
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

/** Where hole i sits in the mini golf scene: a 6 x 3 grid of holes. */
export function holeOrigin(i: number): Vec2 {
  return { x: (i % 6) * 22, z: Math.floor(i / 6) * -30 };
}
