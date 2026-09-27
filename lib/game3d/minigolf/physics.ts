// Pure 2D (XZ-plane) mini golf ball physics — no three.js, so it's unit tested directly.
//
// Feel notes: a real putt slows at a nearly constant rate (rolling resistance) with a little
// drag on top, so the ball rolls out and settles smoothly instead of gliding forever and then
// stopping dead. Shot power maps to *distance* (not speed), so the aim line can promise how far
// the ball will go. The cup catches slow balls, and a fast ball lips out instead of vanishing.
import type { HoleDef, Vec2, Zone } from "./courses";

export const BALL_R = 0.18;
export const CUP_R = 0.3;
/** how far a full-power putt rolls on open grass */
export const MAX_SHOT_DIST = 13;
const ROLL_DECEL = 1.9; // units/s² of rolling resistance on grass
const DRAG = 0.35; // per second, on top of rolling resistance
const SAND_DECEL = 9;
const ICE_DECEL = 0.35;
const REST_SPEED = 0.05;
const WALL_BOUNCE = 0.72;
const WALL_GRIP = 0.94; // a bounce also scrubs a little speed along the wall
const BUMPER_BOUNCE = 1.1;
const SINK_SPEED = 2.8; // slower than this over the cup and it drops
const CUP_PULL = 2.2; // the cup's rim slopes in a touch, helping near misses
const MAX_SPEED = 14;
const SUBSTEPS = 8;

export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface BallState extends Ball {
  /** portal index the ball is still sitting on (so it doesn't bounce straight back) */
  inPortal?: number;
}

export interface StepResult {
  sunk: boolean;
  moving: boolean;
  /** a bounce happened this step (for a little "tock") */
  hit: boolean;
  /** the ball rolled into water this step: the caller adds a stroke and replaces it */
  splash: boolean;
  /** went through a portal this step */
  teleported: boolean;
  /** hit a boost pad this step */
  boosted: boolean;
}

export function segments(outline: Vec2[]): [Vec2, Vec2][] {
  return outline.map((p, i) => [p, outline[(i + 1) % outline.length]]);
}

function polylineSegments(line: Vec2[]): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i + 1 < line.length; i++) out.push([line[i], line[i + 1]]);
  return out;
}

/** Everything solid that doesn't move: the outer wall plus any inner walls. */
export function staticWalls(hole: HoleDef): [Vec2, Vec2][] {
  return [...segments(hole.outline), ...(hole.walls ?? []).flatMap(polylineSegments)];
}

export function bladeSegments(hole: HoleDef, t: number): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (const b of hole.blades ?? []) {
    for (const off of [0, Math.PI / 2]) {
      const a = t * b.speed + off;
      const dx = (Math.cos(a) * b.length) / 2;
      const dz = (Math.sin(a) * b.length) / 2;
      out.push([
        { x: b.at.x - dx, z: b.at.z - dz },
        { x: b.at.x + dx, z: b.at.z + dz },
      ]);
    }
  }
  return out;
}

/** Where a sliding block's centre is at time t. */
export function moverOffset(m: NonNullable<HoleDef["movers"]>[number], t: number): Vec2 {
  const s = Math.sin(t * m.speed + (m.phase ?? 0));
  return { x: m.at.x + m.travel.x * s, z: m.at.z + m.travel.z * s };
}

export function moverSegments(hole: HoleDef, t: number): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (const m of hole.movers ?? []) {
    const c = moverOffset(m, t);
    const hx = m.size.x / 2;
    const hz = m.size.z / 2;
    out.push(
      ...segments([
        { x: c.x - hx, z: c.z - hz },
        { x: c.x + hx, z: c.z - hz },
        { x: c.x + hx, z: c.z + hz },
        { x: c.x - hx, z: c.z + hz },
      ]),
    );
  }
  return out;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function inZone(p: Vec2, z: Zone): boolean {
  if ("r" in z) return Math.hypot(p.x - z.at.x, p.z - z.at.z) < z.r;
  return p.x > z.min.x && p.x < z.max.x && p.z > z.min.z && p.z < z.max.z;
}

function collideSegment(ball: Ball, a: Vec2, b: Vec2, bounce: number): boolean {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  const tt = Math.max(0, Math.min(1, ((ball.x - a.x) * abx + (ball.z - a.z) * abz) / len2));
  const px = a.x + abx * tt;
  const pz = a.z + abz * tt;
  const dx = ball.x - px;
  const dz = ball.z - pz;
  const d = Math.hypot(dx, dz);
  if (d >= BALL_R || d === 0) return false;
  const nx = dx / d;
  const nz = dz / d;
  ball.x = px + nx * BALL_R;
  ball.z = pz + nz * BALL_R;
  const vn = ball.vx * nx + ball.vz * nz;
  if (vn < 0) {
    // reflect the part going into the wall, keep most of the part sliding along it
    const tx = ball.vx - vn * nx;
    const tz = ball.vz - vn * nz;
    ball.vx = tx * WALL_GRIP - bounce * vn * nx;
    ball.vz = tz * WALL_GRIP - bounce * vn * nz;
  }
  return true;
}

export function speed(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vz);
}

/** How far a ball starting at speed v rolls on open grass (closed form of v' = -(a + k·v)). */
export function rollDistance(v: number): number {
  return v / DRAG - (ROLL_DECEL / (DRAG * DRAG)) * Math.log(1 + (DRAG * v) / ROLL_DECEL);
}

/** The starting speed that rolls exactly `d` units on open grass. */
export function speedForDistance(d: number): number {
  let lo = 0;
  let hi = MAX_SPEED;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rollDistance(mid) < d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Putt: power 0..1 is the fraction of MAX_SHOT_DIST the ball should roll on flat grass. */
export function shoot(ball: Ball, dirX: number, dirZ: number, power: number) {
  const len = Math.hypot(dirX, dirZ) || 1;
  const p = Math.max(0, Math.min(1, power));
  const v = speedForDistance(p * MAX_SHOT_DIST);
  ball.vx = (dirX / len) * v;
  ball.vz = (dirZ / len) * v;
}

function clampSpeed(ball: Ball) {
  const sp = speed(ball);
  if (sp > MAX_SPEED) {
    ball.vx *= MAX_SPEED / sp;
    ball.vz *= MAX_SPEED / sp;
  }
}

/** Advance the ball by dt seconds on `hole` at course time t (blades and movers use t). */
export function stepBall(ball: BallState, hole: HoleDef, dt: number, t: number): StepResult {
  const walls = staticWalls(hole);
  const res: StepResult = { sunk: false, moving: false, hit: false, splash: false, teleported: false, boosted: false };
  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    const ts = t + s * h;
    // hills keep pushing even a resting ball, so check them before the "at rest" early-out
    let ax = 0;
    let az = 0;
    for (const sl of hole.slopes ?? []) {
      if (inZone(ball, sl.zone)) {
        ax += sl.push.x;
        az += sl.push.z;
      }
    }
    const onHill = ax !== 0 || az !== 0;
    if (speed(ball) === 0 && !onHill) break;
    ball.vx += ax * h;
    ball.vz += az * h;

    const prevX = ball.x;
    const prevZ = ball.z;
    ball.x += ball.vx * h;
    ball.z += ball.vz * h;

    for (const [a, b] of walls) res.hit = collideSegment(ball, a, b, WALL_BOUNCE) || res.hit;
    for (const [a, b] of bladeSegments(hole, ts)) res.hit = collideSegment(ball, a, b, WALL_BOUNCE) || res.hit;
    for (const [a, b] of moverSegments(hole, ts)) res.hit = collideSegment(ball, a, b, WALL_BOUNCE) || res.hit;
    for (const bump of hole.bumpers ?? []) {
      const dx = ball.x - bump.at.x;
      const dz = ball.z - bump.at.z;
      const d = Math.hypot(dx, dz);
      const min = bump.r + BALL_R;
      if (d < min && d > 0) {
        const nx = dx / d;
        const nz = dz / d;
        ball.x = bump.at.x + nx * min;
        ball.z = bump.at.z + nz * min;
        const vn = ball.vx * nx + ball.vz * nz;
        if (vn < 0) {
          ball.vx -= (1 + BUMPER_BOUNCE) * vn * nx;
          ball.vz -= (1 + BUMPER_BOUNCE) * vn * nz;
        }
        clampSpeed(ball);
        res.hit = true;
      }
    }
    // safety net: a fast blade or block can occasionally shove the ball through a wall — undo that step
    if (!pointInPolygon(ball, hole.outline)) {
      ball.x = prevX;
      ball.z = prevZ;
      ball.vx *= -0.5;
      ball.vz *= -0.5;
    }

    // boost pads: a zoom arrow that fires the ball along it
    for (const bp of hole.boosts ?? []) {
      if (Math.hypot(ball.x - bp.at.x, ball.z - bp.at.z) < bp.r) {
        const len = Math.hypot(bp.dir.x, bp.dir.z) || 1;
        const along = (ball.vx * bp.dir.x + ball.vz * bp.dir.z) / len;
        if (along < bp.speed) {
          ball.vx = (bp.dir.x / len) * bp.speed;
          ball.vz = (bp.dir.z / len) * bp.speed;
          res.boosted = true;
        }
      }
    }

    // portals: roll into one, pop out of its partner still rolling the same way
    let onPortal: number | undefined;
    (hole.portals ?? []).forEach((pt, i) => {
      if (Math.hypot(ball.x - pt.from.x, ball.z - pt.from.z) < pt.r) onPortal = i;
    });
    if (onPortal !== undefined && ball.inPortal !== onPortal) {
      const pt = hole.portals![onPortal];
      ball.x = pt.to.x;
      ball.z = pt.to.z;
      // if we popped out on top of another portal's mouth, don't take that one straight away
      const landed = (hole.portals ?? []).findIndex((q) => Math.hypot(ball.x - q.from.x, ball.z - q.from.z) < q.r);
      ball.inPortal = landed >= 0 ? landed : onPortal;
      res.teleported = true;
      // don't let the exit itself count as touching the entry of a return portal this step
      continue;
    }
    if (onPortal === undefined) ball.inPortal = undefined;

    // water: splash! (the caller puts the ball back where it was last hit from)
    if ((hole.water ?? []).some((w) => inZone(ball, w))) {
      ball.vx = 0;
      ball.vz = 0;
      res.splash = true;
      return res;
    }

    // rolling resistance: constant deceleration + a little drag (sand grabs, ice glides)
    const inSand = (hole.sand ?? []).some((sd) => inZone(ball, sd));
    const onIce = (hole.ice ?? []).some((z) => inZone(ball, z));
    const decel = inSand ? SAND_DECEL : onIce ? ICE_DECEL : ROLL_DECEL;
    const sp = speed(ball);
    if (sp > 0) {
      const drop = (decel + (onIce ? DRAG * 0.3 : DRAG) * sp) * h;
      const k = Math.max(0, sp - drop) / sp;
      ball.vx *= k;
      ball.vz *= k;
    }

    // the cup: slow balls drop in, the rim nudges near misses inwards, fast balls lip out
    const cdx = hole.cup.x - ball.x;
    const cdz = hole.cup.z - ball.z;
    const dc = Math.hypot(cdx, cdz);
    if (dc < CUP_R * 2.2 && dc > 0.001) {
      ball.vx += (cdx / dc) * CUP_PULL * h;
      ball.vz += (cdz / dc) * CUP_PULL * h;
    }
    if (dc < CUP_R - BALL_R * 0.3) {
      if (speed(ball) < SINK_SPEED) {
        ball.x = hole.cup.x;
        ball.z = hole.cup.z;
        ball.vx = 0;
        ball.vz = 0;
        res.sunk = true;
        return res;
      }
      // too fast: rattles over the hole and loses some pace
      ball.vx *= 0.97;
      ball.vz *= 0.97;
    }

    if (speed(ball) < REST_SPEED && !onHill) {
      ball.vx = 0;
      ball.vz = 0;
    }
  }
  res.moving = speed(ball) > 0;
  return res;
}

/**
 * Predict where a putt goes, for the aim guide: the path (sampled points) until it stops,
 * sinks, splashes or `maxLen` of travel. Moving obstacles are taken at time t.
 */
export function predictPath(from: Ball, hole: HoleDef, dirX: number, dirZ: number, power: number, t: number, maxLen = 99): { points: Vec2[]; bounces: number; firstBounce: number } {
  const b: BallState = { x: from.x, z: from.z, vx: 0, vz: 0 };
  shoot(b, dirX, dirZ, power);
  const points: Vec2[] = [{ x: b.x, z: b.z }];
  let travelled = 0;
  let bounces = 0;
  let firstBounce = -1;
  let lastX = b.x;
  let lastZ = b.z;
  for (let f = 0; f < 60 * 12; f++) {
    const r = stepBall(b, hole, 1 / 60, t + f / 60);
    travelled += Math.hypot(b.x - lastX, b.z - lastZ);
    if (r.hit) {
      if (!bounces) firstBounce = points.length;
      bounces++;
    }
    if (Math.hypot(b.x - points[points.length - 1].x, b.z - points[points.length - 1].z) > 0.35 || r.teleported) points.push({ x: b.x, z: b.z });
    lastX = b.x;
    lastZ = b.z;
    if (r.sunk || r.splash || !r.moving || travelled > maxLen) break;
  }
  return { points, bounces, firstBounce };
}

/** Friendly score name for a finished hole. */
export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return "HOLE IN ONE! 🏆";
  const d = strokes - par;
  if (d <= -2) return "Eagle! 🦅";
  if (d === -1) return "Birdie! 🐦";
  if (d === 0) return "Par! 👍";
  if (d === 1) return "Bogey — nice try! 😊";
  return "You did it! 🎉";
}

/** After this many strokes on a hole we pick the ball up and move on (kids never get stuck). */
export function maxStrokes(par: number): number {
  return par + 4;
}
