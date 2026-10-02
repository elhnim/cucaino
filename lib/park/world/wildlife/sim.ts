// How the Wildlands' wildlife behaves: grazing herds that walk together, look up at the kid, step
// aside or trot off if the kid runs at them, drink at the lake shore now and then, and settle down
// at night; ducks paddling slow circles on the lake; parrots flitting about the rainforest canopy;
// eagles soaring over the Great Ridge. Pure, deterministic-enough stepping (xorshift jitter only),
// no allocation in the hot loop. Tested without a renderer (lib/park/world/wildlife/wildlife.test.ts).
import { groundYFar, WATER_Y } from "../../registry/terrain";
import { RUN_SPEED } from "../fauna/types";
import { ST_DRINK, ST_DRINK_GO, ST_FLEE, ST_FLY, ST_GRAZE, ST_LOOK, ST_PERCH, ST_REST, ST_WALK, WILD_SPECIES_DEFS, WS_KANGAROO, rnd01, xorshift, type WHerd } from "./types";

export interface KidSense {
  x: number;
  z: number;
  speed: number;
  dx: number;
  dz: number;
}

const ease = (v: number, to: number, k: number) => v + (to - v) * Math.min(1, k);

function nextR(h: WHerd): number {
  h.rs = xorshift(h.rs);
  return rnd01(h.rs);
}

/** deer, zebras, giraffes, elephants, kangaroos, goats: ground herds with a home range */
/** the Wildlands' tree trunks and boulders (../fantasy/wilds.ts trunkAt): herd members slide off
 *  them rather than walking through (set once by buildWildlife) */
let trunkAt: ((x: number, z: number, r: number) => { x: number; z: number; r: number } | null) | null = null;
export function setWildTrunks(fn: typeof trunkAt) {
  trunkAt = fn;
}

export function stepLandHerd(h: WHerd, dt: number, t: number, kid: KidSense, hour: number) {
  const def = WILD_SPECIES_DEFS[h.species];
  const night = hour < 5.3 || hour >= 19.7;
  const dxk = kid.x - h.cx;
  const dzk = kid.z - h.cz;
  const distK = Math.hypot(dxk, dzk);

  if (!def.giant && def.fleeR > 0 && h.state !== ST_FLEE && kid.speed > RUN_SPEED && distK < def.fleeR) {
    // (the kid is running, and running roughly at the herd: it stampedes away)
    const toward = (kid.dx * -dxk + kid.dz * -dzk) / (distK || 1);
    if (toward > 0.15) {
      h.state = ST_FLEE;
      h.timer = 3 + nextR(h) * 2.5;
      const d = distK || 1;
      h.tx = h.cx - (dxk / d) * def.fleeDist;
      h.tz = h.cz - (dzk / d) * def.fleeDist;
    }
  } else if (def.giant && h.state !== ST_LOOK && distK < def.noticeR * 0.55) {
    h.state = ST_LOOK;
    h.timer = 4 + nextR(h) * 3;
  }

  h.timer -= dt;
  if (h.state === ST_FLEE) {
    if (h.timer <= 0) {
      h.state = ST_WALK;
      h.timer = 10 + nextR(h) * 10;
    }
  } else if (h.state === ST_LOOK) {
    if (h.timer <= 0 || distK > def.noticeR * 0.8) {
      h.state = ST_GRAZE;
      h.timer = 6 + nextR(h) * 10;
    }
  } else if (h.state === ST_DRINK_GO) {
    const d = Math.hypot((h.shoreX ?? h.hx) - h.cx, (h.shoreZ ?? h.hz) - h.cz);
    if (d < 3) {
      h.state = ST_DRINK;
      h.timer = 6 + nextR(h) * 8;
    } else if (h.timer <= 0) {
      h.state = ST_WALK; // (took too long: give up and wander instead)
      h.timer = 10 + nextR(h) * 15;
    }
  } else if (h.state === ST_DRINK) {
    if (h.timer <= 0) {
      h.state = ST_WALK;
      h.tx = h.hx + (nextR(h) - 0.5) * 2 * h.hr;
      h.tz = h.hz + (nextR(h) - 0.5) * 2 * h.hr;
      h.timer = 20 + nextR(h) * 20;
    }
  } else if (night) {
    if (h.state !== ST_REST) {
      h.state = ST_REST;
      h.timer = 60 + nextR(h) * 60;
      h.tx = h.hx;
      h.tz = h.hz;
    }
  } else if (h.timer <= 0 || h.state === ST_REST) {
    if (h.shoreX !== null && nextR(h) < 0.12) {
      h.state = ST_DRINK_GO;
      h.tx = h.shoreX;
      h.tz = h.shoreZ ?? h.hz;
      h.timer = 50;
    } else {
      h.state = h.state === ST_GRAZE || h.state === ST_REST ? ST_WALK : ST_GRAZE;
      if (h.state === ST_WALK) {
        h.tx = h.hx + (nextR(h) - 0.5) * 2 * h.hr;
        h.tz = h.hz + (nextR(h) - 0.5) * 2 * h.hr;
      }
      h.timer = h.state === ST_WALK ? 8 + nextR(h) * 10 : 10 + nextR(h) * 20;
    }
  }

  const moving = h.state === ST_FLEE || h.state === ST_WALK || h.state === ST_DRINK_GO;
  const spd = h.state === ST_FLEE ? def.run : def.walk;
  let herdSpeed = 0;
  if (moving) {
    const dx = h.tx - h.cx;
    const dz = h.tz - h.cz;
    const d = Math.hypot(dx, dz);
    if (d > 0.1) {
      const step = Math.min(d, spd * dt);
      h.cx += (dx / d) * step;
      h.cz += (dz / d) * step;
      h.heading = Math.atan2(dx, dz);
      herdSpeed = step / Math.max(dt, 1e-4);
    }
  }
  const sinH = Math.sin(h.heading);
  const cosH = Math.cos(h.heading);
  const grazing = h.state === ST_GRAZE || h.state === ST_DRINK;
  const resting = h.state === ST_REST;
  const lookTarget = (h.state === ST_LOOK || (!moving && distK < def.noticeR)) && distK > 0.5;

  for (const a of h.members) {
    const wx = h.cx + a.ox * cosH + a.oz * sinH;
    const wz = h.cz - a.ox * sinH + a.oz * cosH;
    const ddx = wx - a.x;
    const ddz = wz - a.z;
    const dd = Math.hypot(ddx, ddz);
    const follow = Math.min(1, dt * 2.6);
    a.x += ddx * follow;
    a.z += ddz * follow;
    if (trunkAt) {
      const tr = trunkAt(a.x, a.z, 0.7);
      if (tr) {
        const ox = a.x - tr.x;
        const oz = a.z - tr.z;
        const ol = Math.hypot(ox, oz) || 1;
        a.x = tr.x + (ox / ol) * (tr.r + 0.7);
        a.z = tr.z + (oz / ol) * (tr.r + 0.7);
      }
    }
    a.y = groundYFar(a.x, a.z);
    const mySpeed = dd > 0.02 ? (dd * follow) / Math.max(dt, 1e-4) : 0;
    if (mySpeed > 0.15) a.yaw = Math.atan2(ddx, ddz);
    else if (resting || grazing) {
      a.rs = xorshift(a.rs);
      a.yaw += (rnd01(a.rs) - 0.5) * dt * 0.1;
    }
    const spdK = Math.min(1, (herdSpeed > 0 ? herdSpeed : mySpeed) / def.run);
    if (mySpeed > 0.1) a.phase += dt * (2 + spdK * 7);
    else a.phase += dt * 0.5;
    a.bound = h.species === WS_KANGAROO && spdK > 0.35 ? 1 : 0;
    const strideTarget = mySpeed > 0.1 ? 0.35 + spdK * 0.35 : 0.08;
    a.stride = ease(a.stride, strideTarget, dt * 4);
    a.tail = ease(a.tail, mySpeed > 0.1 ? 0 : grazing ? 0 : Math.sin(t * 1.4 + a.phase) * 0.2, dt * 3);
    a.ear = ease(a.ear, Math.sin(t * 1.1 + a.phase * 1.7) * 0.12, dt * 2);
    a.tuck = ease(a.tuck, resting ? 0.55 : 0, dt * 0.8);
    a.wing = 0;
    // (a grazing herd doesn't dip every head in lockstep: each member looks up for a breather on
    // its own slow, personal rhythm)
    const upForAir = grazing && Math.sin(t * 0.22 + a.phase * 2.3) > 0.55;
    a.headPitch = ease(a.headPitch, grazing ? (upForAir ? 0 : def.graze) : resting ? def.graze * 0.5 : 0, dt * 1.6);
    const wantYaw = lookTarget ? Math.max(-0.85, Math.min(0.85, angleDiff(a.yaw, Math.atan2(kid.x - a.x, kid.z - a.z)))) : 0;
    a.headYaw = ease(a.headYaw, wantYaw, dt * 2.2);
  }
}

function angleDiff(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** ducks (and a couple of paler "swans"): slow circles on the lake's surface, no ground to stand on */
export function stepDuckRaft(h: WHerd, dt: number, t: number) {
  for (const a of h.members) {
    const rPhase = (a.rs % 1000) / 1000;
    const ang = t * 0.1 + rPhase * Math.PI * 2;
    const swimR = 2.2 + (a.rs % 7);
    a.x = h.hx + Math.sin(ang) * swimR;
    a.z = h.hz + Math.cos(ang) * swimR;
    a.y = WATER_Y + 0.05 + Math.sin(t * 2 + rPhase * 6) * 0.025;
    a.yaw = ang + Math.PI / 2;
    a.phase += dt * 1.5;
    a.tail = Math.sin(t * 0.8 + rPhase * 5) * 0.15;
    a.ear = 0;
    a.wing = 0;
    a.headPitch = Math.sin(t * 0.5 + rPhase * 4) > 0.9 ? -0.6 : 0; // an occasional dip for a dabble
    a.headYaw = 0;
  }
}

/** parrots: perch in the canopy, flit to another nearby perch every so often */
export function stepBirdFlock(h: WHerd, dt: number, t: number) {
  h.timer -= dt;
  if (h.state !== ST_FLY && h.timer <= 0) {
    h.state = ST_FLY;
    h.timer = 1.2 + nextR(h) * 1.4;
    h.tx = h.hx + (nextR(h) - 0.5) * 2 * h.hr;
    h.tz = h.hz + (nextR(h) - 0.5) * 2 * h.hr;
  } else if (h.state === ST_FLY && h.timer <= 0) {
    h.state = ST_PERCH;
    h.timer = 7 + nextR(h) * 14;
    h.cx = h.tx;
    h.cz = h.tz;
  }
  const flying = h.state === ST_FLY;
  for (const a of h.members) {
    const baseX = flying ? h.cx : h.hx + a.ox;
    const baseZ = flying ? h.cz : h.hz + a.oz;
    const targetX = flying ? h.tx + a.ox * 0.4 : baseX;
    const targetZ = flying ? h.tz + a.oz * 0.4 : baseZ;
    const u = flying ? 1 - Math.max(0, h.timer) / 1.4 : 1;
    a.x = baseX + (targetX - baseX) * Math.min(1, u);
    a.z = baseZ + (targetZ - baseZ) * Math.min(1, u);
    const groundY = groundYFar(a.x, a.z);
    const perchY = groundY + 9 + (a.rs % 9);
    a.y = flying ? perchY + Math.sin(u * Math.PI) * 3 : perchY;
    if (flying) {
      a.yaw = Math.atan2(targetX - baseX, targetZ - baseZ);
      a.wing = 1.1 + Math.sin(t * 16 + a.phase) * 0.55;
      a.phase += dt * 16;
    } else {
      a.rs = xorshift(a.rs);
      a.yaw += (rnd01(a.rs) - 0.5) * dt * 0.3;
      a.wing = 0.15;
      a.phase += dt * 1.5;
    }
    a.tail = Math.sin(t * 2 + a.phase * 0.3) * 0.2;
    a.ear = 0;
    a.headPitch = 0;
    a.headYaw = flying ? 0 : Math.sin(t * 0.6 + a.phase) * 0.4;
  }
}

/** eagles: a slow, continuous soaring circle over the Great Ridge */
export function stepEagle(h: WHerd, dt: number, t: number) {
  for (const a of h.members) {
    const ang = t * 0.12 + (a.rs % 1000) / 1000;
    a.x = h.hx + Math.sin(ang) * h.hr;
    a.z = h.hz + Math.cos(ang) * h.hr;
    a.y = groundYFar(h.hx, h.hz) + 72 + Math.sin(t * 0.3) * 3;
    a.yaw = ang + Math.PI / 2;
    a.wing = 1.3 + Math.sin(t * 0.7 + a.phase) * 0.12;
    a.tail = 0.1;
    a.headPitch = -0.15;
    a.headYaw = 0;
    a.phase += dt;
  }
}

/** keep the kid out of a large animal's body (an approximate circle, not a full nose-tail capsule —
 *  simple and cheap, good enough for the Wildlands' herds): pushes `pos` out if it's inside. */
export function pushFromAnimal(pos: { x: number; y: number; z: number }, kidR: number, ax: number, az: number, ay: number, bodyR: number): boolean {
  const dx = pos.x - ax;
  const dz = pos.z - az;
  const d = Math.hypot(dx, dz);
  const minD = bodyR + kidR;
  if (d >= minD || Math.abs(pos.y - ay) > bodyR + 2.2) return false;
  const push = minD - d;
  if (d < 1e-4) {
    pos.x += minD;
    return true;
  }
  pos.x += (dx / d) * push;
  pos.z += (dz / d) * push;
  return true;
}
