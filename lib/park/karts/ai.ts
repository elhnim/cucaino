// Cucaino Karts: the computer drivers. They drive the SAME kart with the same physics as the kid —
// they just look down the road: aim at a point a little way ahead on their own racing line, read
// how tight the road gets, and dab the brake so they arrive at each bend at a speed the kart can
// actually turn at. Each has a personality (a favourite side of the road, a skill) and they steer
// round a kart that's in the way. A gentle rubber band keeps the race close: a driver well ahead
// of the kid eases off a little, one well behind tries a little harder (never by cheating the
// physics — only through its kart's `power`, see aiPower).
//
// Pure function of (state, track, profile, context): no three.js, no Math.random.
import { tightestAhead, trackAt, type KartTrack } from "./track";
import { cornerSpeed, type KartInput, type KartPhysState } from "./physics";

export interface AiProfile {
  /** 0 (easy) .. 1 (hard): looks further ahead, brakes later, carries more speed */
  skill: number;
  /** picks this driver's own line across the road — any integer */
  seed: number;
}

export interface AiContext {
  /** this AI's race distance minus the kid's own (metres): positive = the AI is ahead */
  deltaToKid: number;
  /** the other karts (to steer round one that's just ahead) */
  others?: { x: number; z: number }[];
}

const NO_CONTEXT: AiContext = { deltaToKid: 0 };

function hash01(seed: number, bucket: number): number {
  let h = (seed * 374761393 + bucket * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const wrapPi = (a: number) => {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** this driver's top-speed multiplier right now: its own skill, nudged by the rubber band so the
 *  race stays close to the kid (well ahead -> eases off up to 10%; well behind -> up to 6% more) */
export function aiPower(profile: AiProfile, ctx: AiContext = NO_CONTEXT): number {
  const skill = Math.max(0, Math.min(1, profile.skill));
  const base = 0.84 + skill * 0.1; // 0.84 (easy) .. 0.94 (hard): the kid's own kart (1.0) is the fastest
  const d = ctx.deltaToKid;
  const band = d > 12 ? -Math.min(0.1, (d - 12) / 400) : d < -18 ? Math.min(0.06, (-d - 18) / 500) : 0;
  return base + band;
}

/** drives one AI kart for a tick */
export function aiInput(state: KartPhysState, track: KartTrack, profile: AiProfile, ctx: AiContext = NO_CONTEXT): KartInput {
  const skill = Math.max(0, Math.min(1, profile.skill));
  const half = track.width / 2;
  const speed = Math.max(0, state.speed);

  // ── where to aim: a point down the road on this driver's own line ──
  const look = 6 + speed * (0.5 + skill * 0.16);
  // (its favourite side, steady for a whole stretch of road so it never twitches)
  const lane = (hash01(profile.seed, Math.floor((state.sLocal + look) / 60)) - 0.5) * 2 * (half - 2.2) * 0.75;
  let targetLat = lane;
  // steer round a kart that's just ahead in our lane
  if (ctx.others) {
    const fx = Math.sin(state.yaw);
    const fz = Math.cos(state.yaw);
    for (const o of ctx.others) {
      const dx = o.x - state.x;
      const dz = o.z - state.z;
      const ahead = dx * fx + dz * fz;
      const side = dx * fz - dz * fx; // + = it's to our right
      if (ahead > 0.5 && ahead < 9 && Math.abs(side) < 2.6) {
        targetLat += (side >= 0 ? -1 : 1) * 2.8;
        break;
      }
    }
  }
  targetLat = Math.max(-(half - 1.6), Math.min(half - 1.6, targetLat));
  const at = trackAt(track, state.sLocal + look);
  const tx = at.x + at.dz * targetLat;
  const tz = at.z - at.dx * targetLat;
  const diff = wrapPi(Math.atan2(tx - state.x, tz - state.z) - state.yaw);
  const steer = Math.max(-1, Math.min(1, diff * (2.1 + skill * 0.9)));

  // ── how fast can we take what's coming? brake to arrive at the bend at that speed ──
  // (look as far ahead as it takes to shed the extra speed: v^2 / (2 * braking) plus a margin)
  const brakeDist = 5 + (speed * speed) / (2 * 22);
  const tight = tightestAhead(track, state.sLocal + 2, brakeDist);
  // the road's own width lets a kart take a bend wider than the centreline's radius
  const usable = tight + half * (0.45 + skill * 0.35);
  const safe = cornerSpeed(usable) * (0.9 + skill * 0.1);
  let brake = speed > safe + 1.2;
  // off the road: no braking — get back on
  if (state.offTrack) brake = false;
  // badly off line (about to run wide): lift
  if (!brake && Math.abs(diff) > 0.7 && speed > 12) brake = true;
  return { steer, brake };
}
