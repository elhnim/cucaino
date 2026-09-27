// Deterministic seeded 2D value noise for terrain height/biome sampling.
// No external dependency — same spirit as the mulberry32-style PRNG already
// used for texture generation in textures.ts, just hashed on a 2D lattice
// instead of a 1D stream so the same (seed, x, y) always yields the same value.

function hashLattice(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) / 4294967296) * 2 - 1; // [-1, 1]
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Seeded 2D value-noise sampler; same seed + coordinates always returns the same value in roughly [-1, 1]. */
export function createNoise2D(seed: number): (x: number, y: number) => number {
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const sx = fade(x - x0);
    const sy = fade(y - y0);
    const n00 = hashLattice(x0, y0, seed);
    const n10 = hashLattice(x1, y0, seed);
    const n01 = hashLattice(x0, y1, seed);
    const n11 = hashLattice(x1, y1, seed);
    return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
  };
}

/** Fractal Brownian motion: layers several octaves of the given noise sampler into one richer signal, roughly [-1, 1]. */
export function fbm2D(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2.0,
  gain = 0.5,
): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * frequency, y * frequency) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Turns an arbitrary string (e.g. a kid id) into a stable 32-bit seed, so each kid's world is consistent across sessions. */
export function seedFromString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
