// Cucaino Karts: ghosts — a sibling's best lap, recorded at ~10 Hz and played back as a see-through
// kart. Recording and replay are both pure/stateless (an array of samples in, a pose out), so
// KartStore (Agent N's lib/park/karts/store.ts) can save/load the plain samples array as-is.
import type { GhostLap, KartPose } from "./types";

export const GHOST_SAMPLE_HZ = 10;
const GHOST_SAMPLE_MS = 1000 / GHOST_SAMPLE_HZ;
/** the spec's own cap (lib/actions/karts.ts validates against the same number) */
export const MAX_GHOST_SAMPLES = 1500;

/** records a kart's own run at ~10 Hz. Call `push` every physics tick; it only actually keeps a
 *  sample often enough to hit the target rate, however fast the caller ticks. */
export class GhostRecorder {
  readonly samples: KartPose[] = [];
  private lastMs = -Infinity;

  push(pose: KartPose): void {
    if (pose.t - this.lastMs < GHOST_SAMPLE_MS - 1) return;
    if (this.samples.length >= MAX_GHOST_SAMPLES) return;
    this.lastMs = pose.t;
    this.samples.push({ ...pose, t: Math.round(pose.t) });
  }

  reset(): void {
    this.samples.length = 0;
    this.lastMs = -Infinity;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** the ghost's pose at time `t` (ms since the lap/race started), holding at the ends — so a ghost
 *  that finished its lap early just waits on the line, and one that hasn't started yet sits on the
 *  grid, rather than ever returning an out-of-range sample */
export function replayAt(ghost: Pick<GhostLap, "samples">, t: number): KartPose | null {
  const s = ghost.samples;
  if (s.length === 0) return null;
  if (t <= s[0].t) return s[0];
  if (t >= s[s.length - 1].t) return s[s.length - 1];
  // the samples are recorded in order at a steady rate, so a linear scan from a binary search
  // start is overkill for ~a few hundred points — binary search anyway, it's cheap and exact
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (s[m].t <= t) lo = m;
    else hi = m;
  }
  const a = s[lo];
  const b = s[hi];
  const span = b.t - a.t || 1;
  const u = (t - a.t) / span;
  return {
    t,
    x: lerp(a.x, b.x, u),
    z: lerp(a.z, b.z, u),
    yaw: lerpAngle(a.yaw, b.yaw, u),
    speed: lerp(a.speed, b.speed, u),
    lap: u < 0.5 ? a.lap : b.lap,
    progress: lerp(a.progress, b.progress, u),
  };
}

/** this lap's total time (the last sample's t — recording starts at t=0) */
export function ghostLapMs(ghost: Pick<GhostLap, "samples">): number {
  const s = ghost.samples;
  return s.length ? s[s.length - 1].t : 0;
}

/** trims a recorder's samples down to the cap evenly (keeps the shape of the lap, just coarser) —
 *  used if a very long/slow lap somehow runs past MAX_GHOST_SAMPLES before GhostRecorder's own
 *  guard kicks in (it won't, at 10 Hz that's 150 s, but belt and braces for whatever calls this
 *  directly with a hand-built sample list, e.g. a test or an imported ghost) */
export function capSamples(samples: KartPose[], max = MAX_GHOST_SAMPLES): KartPose[] {
  if (samples.length <= max) return samples;
  const out: KartPose[] = [];
  for (let i = 0; i < max; i++) out.push(samples[Math.round((i * (samples.length - 1)) / (max - 1))]);
  return out;
}
