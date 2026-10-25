// Habitats of the Wildlands: where each kind of country lies, so the trees, the ground's colour
// and the animals that live there all agree. A leaf module — pure maths, no imports from the
// terrain — so the ground colour, the tree streamer and the wildlife can all ask it.
//
// So far: the Savanna, an African plain on the island's flat south — golden grass, flat-topped
// acacias standing well apart, and the safari herds (zebras, antelope, giraffes, elephants). The
// deer and the kangaroos keep to the green country outside it, the goats to the ridge.

/** the Savanna: an ellipse on the southern plains (clear of Parícutin to the north-east and the
 *  market town to the east; savanna.test.ts checks it lies on dry, gentle ground) */
export const SAVANNA = { x: 850, z: 310, rx: 380, rz: 185 } as const;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0..1: how much (x, z) is savanna — 1 well inside, fading out over its last fifth */
export function savannaK(x: number, z: number): number {
  const d = Math.hypot((x - SAVANNA.x) / SAVANNA.rx, (z - SAVANNA.z) / SAVANNA.rz);
  return 1 - smoothstep(0.8, 1, d);
}
