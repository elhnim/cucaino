// Cucaino Karts: the race itself — who's in what position, who's on what lap, who's finished and
// in what order, best laps. Pure state machine: feed it each kart's running distance as the race
// goes, read positions/results back out. No three.js, no timers (the caller supplies `nowMs`, so
// this is exactly as testable with a fake clock as with Date.now()).
export interface RaceKartState {
  id: string;
  /** the kart's own KartPhysState.distTotal, last reported */
  distTotal: number;
  /** the kart's own KartPhysState.lap, last reported */
  lap: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  /** when this kart crossed the line for its CURRENT lap (epoch ms) */
  lapStartMs: number;
  finished: boolean;
  /** epoch ms it finished (null until it has) */
  finishMs: number | null;
  /** did it drop out mid-race (a live peer disconnecting) — still shown, just not raced against */
  dropped: boolean;
}

export interface RaceState {
  laps: number;
  trackLength: number;
  startMs: number;
  karts: Record<string, RaceKartState>;
  /** grid order (also the fallback finish order for a kart that never moves) */
  order: string[];
}

export function createRace(ids: string[], laps: number, trackLength: number, startMs: number): RaceState {
  const karts: Record<string, RaceKartState> = {};
  for (const id of ids) {
    karts[id] = { id, distTotal: 0, lap: 1, lastLapMs: null, bestLapMs: null, lapStartMs: startMs, finished: false, finishMs: null, dropped: false };
  }
  return { laps, trackLength, startMs, karts, order: [...ids] };
}

/** call whenever a kart's distance/lap has moved on (every physics tick is fine — it's idempotent
 *  if nothing changed). Detects a completed lap (and, on the last lap, the finish) itself from the
 *  rise in `lap`, so the caller never has to special-case "is this the last lap". */
export function updateKartProgress(race: RaceState, id: string, distTotal: number, lap: number, nowMs: number): void {
  const k = race.karts[id];
  if (!k || k.finished) return;
  k.distTotal = Math.max(k.distTotal, distTotal); // never go backwards (a rescue pop-back, a bump)
  if (lap > k.lap) {
    // one call can only ever see a single lap tick over (laps complete far slower than a frame),
    // but guard it anyway so a dropped frame can't silently award two
    const lapMs = nowMs - k.lapStartMs;
    k.lastLapMs = lapMs;
    if (k.bestLapMs === null || lapMs < k.bestLapMs) k.bestLapMs = lapMs;
    k.lapStartMs = nowMs;
    k.lap = lap;
    if (k.lap > race.laps) {
      k.finished = true;
      k.finishMs = nowMs;
    }
  }
}

/** a kart that's left the race (a live peer disconnecting mid-race) pulls over — it keeps its
 *  place in the results (DNF), the race carries on for everyone else */
export function dropKart(race: RaceState, id: string): void {
  const k = race.karts[id];
  if (k) k.dropped = true;
}

/** every kart, ranked: finished karts first (by finish time), then still-racing karts by distance
 *  covered, then dropped karts last (by how far they got) */
export function positions(race: RaceState): string[] {
  const all = race.order.map((id) => race.karts[id]).filter((k): k is RaceKartState => !!k);
  return all
    .slice()
    .sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return (a.finishMs ?? 0) - (b.finishMs ?? 0);
      if (a.dropped !== b.dropped) return a.dropped ? 1 : -1;
      return b.distTotal - a.distTotal;
    })
    .map((k) => k.id);
}

/** this kart's current 1-based place (recomputed from `positions`, so always consistent with it) */
export function positionOf(race: RaceState, id: string): number {
  return positions(race).indexOf(id) + 1;
}

export interface RaceResult {
  id: string;
  position: number;
  totalMs: number | null;
  bestLapMs: number | null;
  finished: boolean;
}

/** are all (non-dropped) karts either finished or dropped — the race is over */
export function isRaceOver(race: RaceState): boolean {
  return Object.values(race.karts).every((k) => k.finished || k.dropped);
}

/** the final results table, in finishing order */
export function raceResults(race: RaceState): RaceResult[] {
  return positions(race).map((id, i) => {
    const k = race.karts[id];
    return { id, position: i + 1, totalMs: k.finishMs !== null ? k.finishMs - race.startMs : null, bestLapMs: k.bestLapMs, finished: k.finished };
  });
}
