// Cucaino Karts: the computer drivers. A simple pure-pursuit autopilot (aim a little way down the
// centerline, steer towards it) with a personality wobble so four AI karts don't drive in an
// identical single-file line, braking a little early into the sharp stuff, and a gentle rubber
// band so a kid wins often but not always. Pure function of (state, track, profile, context): no
// three.js, no Math.random — any "personality" noise is a deterministic hash of the kart's own
// seed and where it is on the lap, so the same race always plays out the same way.
import { cornerAt, nearestOnTrack, trackAt, type KartTrack } from "./track";
import { CORNER_SPEED_CAP, type KartInput, type KartPhysState } from "./physics";

export interface AiProfile {
  /** 0 (easy) .. 1 (hard): longer lookahead, tighter steering, brakes later and less often */
  skill: number;
  /** picks this driver's own personality wobble (and racing line bias) — any integer */
  seed: number;
}

export interface AiContext {
  /** this AI's track distance minus the kid's own (metres): positive = the AI is ahead. Only used
   *  to rubber-band how often it dabs the brake into corners — never changes its top speed. */
  deltaToKid: number;
}

const NO_CONTEXT: AiContext = { deltaToKid: 0 };

/** a tiny deterministic hash (0..1), the same little trick rngOf()-style seeds use elsewhere in
 *  the registry, but stateless: same (seed, bucket) always gives the same number */
function hash01(seed: number, bucket: number): number {
  let h = (seed * 374761393 + bucket * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** drives one AI kart for a tick: aims a little way down the track (with a small, steady personal
 *  offset so four AI karts spread across the road rather than stacking single-file), brakes a
 *  touch early for the sharp stuff, and eases off the throttle a little when well clear of the
 *  kid out front (the rubber band — it only ever costs it a little speed, never stops it racing). */
export function aiInput(state: KartPhysState, track: KartTrack, profile: AiProfile, ctx: AiContext = NO_CONTEXT): KartInput {
  const skill = Math.max(0, Math.min(1, profile.skill));
  const near = nearestOnTrack(track, state.x, state.z);
  const lookahead = 7 + skill * 7 + state.speed * 0.35;
  // a steady per-corner lane offset (not time-based, so it doesn't twitch frame to frame): this
  // driver's own line drifts towards the inside of whatever corner is coming up, like a real
  // racing line, scaled down for a lower-skill driver (who hugs the centre more nervously)
  const bucket = Math.floor((state.sLocal + lookahead) / 10);
  const wobble = (hash01(profile.seed, bucket) - 0.5) * 2; // -1..1, steady across a ~10 m stretch
  const laneBias = wobble * (track.width / 2 - 3) * (0.35 + skill * 0.35);
  const aheadCorner = cornerAt(track, state.sLocal + lookahead);
  const insideSign = aheadCorner ? Math.sign(wobble || 1) : 0;
  const targetLateral = aheadCorner ? insideSign * Math.abs(laneBias) * -1 : laneBias * 0.3;

  const at = trackAt(track, state.sLocal + lookahead);
  const nx = at.dz;
  const nz = -at.dx;
  const targetX = at.x + nx * targetLateral;
  const targetZ = at.z + nz * targetLateral;

  const toTargetYaw = Math.atan2(targetX - state.x, targetZ - state.z);
  let diff = toTargetYaw - state.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steerGain = 1.5 + skill * 1.1;
  const steer = Math.max(-1, Math.min(1, diff * steerGain));

  // brake a touch early for a sharp corner coming up, if carrying too much speed into it — a
  // higher-skill driver brakes later and less (it judges the corner better)
  let brake = false;
  const soonCorner = cornerAt(track, state.sLocal + 4 + state.speed * 0.25);
  if (soonCorner) {
    const safe = CORNER_SPEED_CAP[soonCorner.kind] * (1.05 + skill * 0.35);
    if (state.speed > safe) brake = true;
  }
  // off the road: steer harder back towards the track instead of braking (a brake with no grip to
  // bite does nothing useful; getting back on the tarmac is what actually matters)
  if (Math.abs(near.lateral) > track.width / 2) brake = false;

  // the rubber band: well clear of the kid out front, this driver dabs the brake now and then
  // (never while actually mid-corner-correction above, and never below a speed where tapping the
  // brake would just stall it dead in one spot forever — the ease is a trim off the top, not a
  // way to get stuck) so a confident kid can pull away for real
  if (!brake && ctx.deltaToKid > 25 && state.speed > CORNER_SPEED_CAP.hairpin * 1.2) {
    const easeChance = Math.min(0.3, (ctx.deltaToKid - 25) / 200);
    if (hash01(profile.seed + 7919, Math.floor(state.sLocal / 6)) < easeChance) brake = true;
  }

  return { steer, brake };
}
