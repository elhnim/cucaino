// How the pet moves when it is simply being a pet beside its kid. Pure (no three.js): the engine
// feeds it where the kid is each frame and puts the pet where it says.
//
// It used to slide toward a point two steps behind the kid on a rubber band — it never quite
// stopped, never chose anything, and circled the kid like a moon when they stood still. Now it has
// a body (it speeds up, slows down and has to turn to change direction) and a little mind:
//   walking   it trots at heel on one side, swaps sides now and then, sometimes runs on ahead and
//             waits, hurries when it falls behind and sprints when it is left far back;
//   stopped   it comes up, settles and looks at the kid; after a while it potters off to sniff at
//             something nearby, comes back, and now and then tears round in a happy circle.
// A moment's reaction time before it sets off makes it read as a creature following, not a trailer.

export interface PetBrain {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** which way it is facing (radians about +Y; forward = (sin, cos)) */
  heading: number;
  mode: "heel" | "lead" | "settle" | "potter" | "sniff" | "zoom";
  /** time left in the current mode's own phase (seconds) */
  t: number;
  /** which side of the kid it walks on (+1 right, -1 left) */
  side: number;
  /** where it is pottering to / the centre and phase of a zoom */
  gx: number;
  gz: number;
  /** reaction time left before it notices the kid has set off */
  react: number;
  /** was the kid moving last frame */
  kidWasMoving: boolean;
}

export interface PetKid {
  x: number;
  z: number;
  facing: number;
  /** units a second the kid is covering right now */
  speed: number;
}

export interface PetStep {
  /** an expressive moment the engine may play (a happy hop) */
  emote?: "happy";
}

export function newPetBrain(x: number, z: number, heading = 0): PetBrain {
  return { x, z, vx: 0, vz: 0, heading, mode: "settle", t: 2, side: 1, gx: x, gz: z, react: 0, kidWasMoving: false };
}

const WALK = 2.4; // pottering about
const TROT = 6.5; // keeping up at heel
const SPRINT = 12.5; // left behind
const ACCEL = 16;
const TURN = 5.2; // radians a second at speed

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** move the body toward (gx, gz): never faster than `cap`, slowing to a stop as it arrives */
function seek(b: PetBrain, dt: number, gx: number, gz: number, cap: number, stopWithin: number) {
  const dx = gx - b.x;
  const dz = gz - b.z;
  const d = Math.hypot(dx, dz);
  let want = d <= stopWithin ? 0 : Math.min(cap, (d - stopWithin) * 2.6 + 0.6);
  const sp = Math.hypot(b.vx, b.vz);
  // it has to turn to change direction: the faster it runs, the wider the arc
  let dir = sp > 0.4 ? Math.atan2(b.vx, b.vz) : b.heading;
  if (want > 0) {
    const to = Math.atan2(dx, dz);
    const off = angDiff(to, dir);
    const turn = Math.sign(off) * Math.min(Math.abs(off), TURN * dt * (sp < 1.5 ? 3 : 1));
    dir += turn;
    // facing well away from where it wants to go, it slows to turn rather than running wide
    if (Math.abs(off) > 1.2) want = Math.min(want, 1.6);
  }
  const ns = sp + Math.max(-ACCEL * 1.4 * dt, Math.min(ACCEL * dt, want - sp));
  b.vx = Math.sin(dir) * ns;
  b.vz = Math.cos(dir) * ns;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  if (ns > 0.25) b.heading = dir;
  return d;
}

/** One frame. `rnd` is a 0..1 random source (the engine's; tests pass a seeded one). */
export function stepPetBrain(b: PetBrain, dt: number, kid: PetKid, rnd: () => number): PetStep {
  const out: PetStep = {};
  if (dt <= 0) return out;
  const kd = Math.hypot(kid.x - b.x, kid.z - b.z);
  // the kid was whisked away (a ride, the map, a door): be beside them, don't streak across the park
  if (kd > 45) {
    b.x = kid.x - Math.sin(kid.facing) * 1.6 + Math.cos(kid.facing) * b.side;
    b.z = kid.z - Math.cos(kid.facing) * 1.6 - Math.sin(kid.facing) * b.side;
    b.vx = b.vz = 0;
    b.mode = "settle";
    b.t = 1.5;
    return out;
  }
  const moving = kid.speed > 0.6;
  if (moving && !b.kidWasMoving) b.react = 0.12 + rnd() * 0.22;
  b.kidWasMoving = moving;

  if (moving) {
    // ── out for a walk ──
    if (b.react > 0) {
      b.react -= dt;
      // (it looks up, then goes)
      seek(b, dt, b.x, b.z, 0, 0.2);
      b.heading += angDiff(Math.atan2(kid.x - b.x, kid.z - b.z), b.heading) * Math.min(1, dt * 8);
      return out;
    }
    if (b.mode !== "heel" && b.mode !== "lead") {
      b.mode = "heel";
      b.t = 3 + rnd() * 4;
    }
    b.t -= dt;
    if (b.t <= 0) {
      // now and then: swap sides, or run on ahead for a bit
      const r = rnd();
      if (b.mode === "lead") {
        b.mode = "heel";
        b.t = 4 + rnd() * 5;
      } else if (r < 0.28 && kid.speed < 9) {
        b.mode = "lead";
        b.t = 2.5 + rnd() * 3;
      } else {
        if (r > 0.6) b.side = -b.side;
        b.t = 3.5 + rnd() * 5;
      }
    }
    const fx = Math.sin(kid.facing);
    const fz = Math.cos(kid.facing);
    const along = b.mode === "lead" ? 3.4 : -1.5;
    const gx = kid.x + fx * along + fz * b.side * 1.25;
    const gz = kid.z + fz * along - fx * b.side * 1.25;
    const gd = Math.hypot(gx - b.x, gz - b.z);
    // keep up: match the kid, a little faster to close a gap, flat out when left behind
    const cap = gd > 9 ? Math.max(SPRINT, kid.speed * 1.5) : gd > 3 ? Math.max(TROT, kid.speed * 1.35) : gd > 1 ? Math.max(WALK + 1, kid.speed * 1.2) : Math.max(WALK + 1, kid.speed * 1.05);
    seek(b, dt, gx, gz, cap, 0.25);
    return out;
  }

  // ── the kid has stopped ──
  if (b.mode === "heel" || b.mode === "lead") {
    b.mode = "settle";
    b.t = 2.5 + rnd() * 3.5;
    b.gx = b.gz = NaN;
  }
  const faceKid = () => {
    b.heading += angDiff(Math.atan2(kid.x - b.x, kid.z - b.z), b.heading) * Math.min(1, dt * 6);
  };
  if (b.mode === "settle") {
    // come up beside them (not on their feet), stop, and look at them
    if (kd > 2.6) {
      const k = (kd - 1.9) / kd;
      seek(b, dt, b.x + (kid.x - b.x) * k, b.z + (kid.z - b.z) * k, kd > 8 ? SPRINT : TROT, 0.2);
    } else {
      seek(b, dt, b.x, b.z, 0, 0.5);
      if (Math.hypot(b.vx, b.vz) < 0.3) faceKid();
      b.t -= dt;
      if (b.t <= 0) {
        const r = rnd();
        if (r < 0.2) {
          // zoomies: a happy lap or two round the kid
          b.mode = "zoom";
          b.t = 2.6 + rnd() * 1.6;
          b.gx = Math.atan2(b.x - kid.x, b.z - kid.z);
          b.gz = rnd() < 0.5 ? 1 : -1;
        } else if (r < 0.8) {
          // potter off to something interesting nearby
          const a = rnd() * Math.PI * 2;
          const rad = 2.6 + rnd() * 3.2;
          b.mode = "potter";
          b.gx = kid.x + Math.sin(a) * rad;
          b.gz = kid.z + Math.cos(a) * rad;
          b.t = 6;
        } else {
          out.emote = "happy";
          b.t = 3 + rnd() * 4;
        }
      }
    }
  } else if (b.mode === "potter") {
    b.t -= dt;
    const d = seek(b, dt, b.gx, b.gz, WALK, 0.3);
    if (d < 0.5 || b.t <= 0) {
      b.mode = "sniff";
      b.t = 1.4 + rnd() * 2.4;
    }
  } else if (b.mode === "sniff") {
    // nose down at whatever it found, then back to its kid
    seek(b, dt, b.x, b.z, 0, 0.5);
    b.t -= dt;
    if (b.t <= 0) {
      b.mode = "settle";
      b.t = 3 + rnd() * 4;
    }
  } else if (b.mode === "zoom") {
    b.t -= dt;
    b.gx += b.gz * dt * 2.3; // the angle it is chasing round the kid
    seek(b, dt, kid.x + Math.sin(b.gx) * 3.2, kid.z + Math.cos(b.gx) * 3.2, 9.5, 0);
    if (b.t <= 0) {
      b.mode = "settle";
      b.t = 3.5 + rnd() * 3;
      out.emote = "happy";
    }
  }
  return out;
}
