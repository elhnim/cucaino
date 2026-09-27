// Mini golf course registry. To add a hole: append a HoleDef below — the green, walls,
// cup, flag, windmill blades, bumpers and sand are all generated from it, and the physics
// (physics.ts) reads the same data. Coordinates are local to the hole, in world units;
// the tee sits at +z and the camera looks towards -z.

export interface Vec2 {
  x: number;
  z: number;
}

export interface HoleDef {
  name: string;
  par: number;
  /** closed outline of the green (walls run along every edge) */
  outline: Vec2[];
  tee: Vec2;
  cup: Vec2;
  bumpers?: { at: Vec2; r: number }[];
  /** windmill: two crossed spinning blades of `length` centred at `at` */
  blades?: { at: Vec2; length: number; speed: number }[];
  /** sand traps: much higher rolling friction inside */
  sand?: { at: Vec2; r: number }[];
}

const rect = (hx: number, hz: number): Vec2[] => [
  { x: -hx, z: -hz },
  { x: hx, z: -hz },
  { x: hx, z: hz },
  { x: -hx, z: hz },
];

export const COURSE: HoleDef[] = [
  {
    name: "Hello Hole",
    par: 2,
    outline: rect(1.6, 5),
    tee: { x: 0, z: 4 },
    cup: { x: 0, z: -3.8 },
    bumpers: [{ at: { x: 0.7, z: 0 }, r: 0.35 }],
  },
  {
    name: "Windmill",
    par: 3,
    outline: rect(2, 6),
    tee: { x: 0, z: 5 },
    cup: { x: 0, z: -4.8 },
    blades: [{ at: { x: 0, z: 0 }, length: 3.2, speed: 1.2 }],
  },
  {
    name: "Round the Bend",
    par: 3,
    outline: [
      { x: -1.6, z: 6 },
      { x: -1.6, z: -4.6 },
      { x: 6.4, z: -4.6 },
      { x: 6.4, z: -1.4 },
      { x: 1.6, z: -1.4 },
      { x: 1.6, z: 6 },
    ],
    tee: { x: 0, z: 5 },
    cup: { x: 5.2, z: -3 },
    bumpers: [{ at: { x: 0, z: -3 }, r: 0.4 }],
  },
  {
    name: "Bumper Party",
    par: 3,
    outline: rect(2.6, 6),
    tee: { x: 0, z: 5 },
    cup: { x: 0, z: -5 },
    bumpers: [
      { at: { x: -1.1, z: 2.2 }, r: 0.4 },
      { at: { x: 1.1, z: 0.6 }, r: 0.4 },
      { at: { x: -1, z: -1.2 }, r: 0.4 },
      { at: { x: 1, z: -2.6 }, r: 0.4 },
      { at: { x: 0, z: -0.3 }, r: 0.35 },
    ],
  },
  {
    name: "Sandy Island",
    par: 4,
    outline: rect(3, 7),
    tee: { x: 0, z: 6 },
    cup: { x: 1.6, z: -5.8 },
    sand: [
      { at: { x: 0, z: 1.2 }, r: 1.6 },
      { at: { x: -1.6, z: -3 }, r: 1.1 },
    ],
    blades: [{ at: { x: 1.1, z: -3.6 }, length: 2, speed: -1.6 }],
  },
];

/** Where hole i sits in the mini golf scene (holes are laid out side by side). */
export function holeOrigin(i: number): Vec2 {
  return { x: i * 18, z: 0 };
}
