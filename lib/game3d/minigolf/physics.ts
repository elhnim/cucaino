// Pure 2D (XZ-plane) mini golf ball physics — no three.js, so it's unit tested directly.
import type { HoleDef, Vec2 } from "./courses";

export const BALL_R = 0.18;
export const CUP_R = 0.3;
export const MAX_SHOT_SPEED = 9;
const REST_SPEED = 0.08;
const WALL_BOUNCE = 0.78;
const BUMPER_BOUNCE = 1.15;
const FRICTION = 0.55; // per second, fraction of speed lost on grass (rolls ~16 units at full power)
const SAND_FRICTION = 4.2;
const MAX_SINK_SPEED = 4.5;
const SUBSTEPS = 6;

export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface StepResult {
  sunk: boolean;
  moving: boolean;
  /** a bounce happened this step (for a little "tock" / camera shake) */
  hit: boolean;
}

export function segments(outline: Vec2[]): [Vec2, Vec2][] {
  return outline.map((p, i) => [p, outline[(i + 1) % outline.length]]);
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

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
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
    ball.vx -= (1 + bounce) * vn * nx;
    ball.vz -= (1 + bounce) * vn * nz;
  }
  return true;
}

export function speed(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vz);
}

export function shoot(ball: Ball, dirX: number, dirZ: number, power: number) {
  const len = Math.hypot(dirX, dirZ) || 1;
  const p = Math.max(0, Math.min(1, power));
  ball.vx = (dirX / len) * p * MAX_SHOT_SPEED;
  ball.vz = (dirZ / len) * p * MAX_SHOT_SPEED;
}

/** Advance the ball by dt seconds on `hole` at course time t (blades spin with t). */
export function stepBall(ball: Ball, hole: HoleDef, dt: number, t: number): StepResult {
  const walls = segments(hole.outline);
  let hit = false;
  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    if (speed(ball) === 0) break;
    const prevX = ball.x;
    const prevZ = ball.z;
    ball.x += ball.vx * h;
    ball.z += ball.vz * h;

    for (const [a, b] of walls) hit = collideSegment(ball, a, b, WALL_BOUNCE) || hit;
    for (const [a, b] of bladeSegments(hole, t + s * h)) hit = collideSegment(ball, a, b, WALL_BOUNCE) || hit;
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
        const sp = speed(ball);
        if (sp > MAX_SHOT_SPEED) {
          ball.vx *= MAX_SHOT_SPEED / sp;
          ball.vz *= MAX_SHOT_SPEED / sp;
        }
        hit = true;
      }
    }
    // safety net: a fast blade can occasionally shove the ball through a wall — undo that step
    if (!pointInPolygon(ball, hole.outline)) {
      ball.x = prevX;
      ball.z = prevZ;
      ball.vx *= -0.5;
      ball.vz *= -0.5;
    }

    const inSand = (hole.sand ?? []).some((sd) => Math.hypot(ball.x - sd.at.x, ball.z - sd.at.z) < sd.r);
    const k = Math.max(0, 1 - (inSand ? SAND_FRICTION : FRICTION) * h);
    ball.vx *= k;
    ball.vz *= k;
    if (speed(ball) < REST_SPEED) {
      ball.vx = 0;
      ball.vz = 0;
    }

    const dc = Math.hypot(ball.x - hole.cup.x, ball.z - hole.cup.z);
    if (dc < CUP_R && speed(ball) < MAX_SINK_SPEED) {
      ball.x = hole.cup.x;
      ball.z = hole.cup.z;
      ball.vx = 0;
      ball.vz = 0;
      return { sunk: true, moving: false, hit };
    }
  }
  return { sunk: false, moving: speed(ball) > 0, hit };
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
