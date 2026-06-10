// Dream Life — seeded RNG. All randomness flows through here so games are
// deterministic given (seed, cursor): replay- and save-safe.

export function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Draw `count` values starting at `cursor` for a base seed (replay-stable). */
export function drawsAt(seed: number, cursor: number, count: number): number[] {
  const rand = mulberry32(seed)
  for (let i = 0; i < cursor; i++) rand()
  return Array.from({ length: count }, () => rand())
}

/** Weighted pick: weights need not sum to 1. */
export function weightedPick<T>(items: T[], weightOf: (t: T) => number, roll: number): T {
  const total = items.reduce((s, it) => s + weightOf(it), 0)
  let acc = 0
  for (const it of items) {
    acc += weightOf(it) / total
    if (roll < acc) return it
  }
  return items[items.length - 1]
}
