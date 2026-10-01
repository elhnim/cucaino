// The rides kids find round Cucaino Park, waiting to be hopped on (lib/park/registry/rideables):
// parked bikes and buggies, unicorns grazing (they trot over when you come near their meadow),
// Cloud Dragons shuffling their wings on the hilltops, manta rays gliding slow loops over the reef,
// and — out at sea — a dolphin (with its pod) or, in the deep blue, a whale that swims up beside
// you, sparkles and waits a while to be ridden. Boats and submarines bob at their moorings round
// the harbours (drawn by ./fleet, which also draws the wake, spray, bubbles and headlights of the
// one you're driving); one left out at sea drifts home once you're well away.
//
// Drawn with the very same rigs as riding (lib/park/characters/mounts), but cheaply: the few
// nearest are live animated rigs (one skinned draw call each); the rest are frozen idle-pose
// statues, one InstancedMesh per kind; all blob shadows are one InstancedMesh. Budget with
// everything showing: kinds (6) + live (<= 4) + sea friends (<= 2) + shadows (1) + sparkles (1)
// = <= 14 draw calls, plus the fleet's <= 6. update() allocates nothing.
import * as THREE from "three";
import { HOP_REACH, MOUNT_BODY, MOUNT_CAPS, SUB_CAPS, buildMount, isBoat, isCraft, isSub, mountMaterial, mountShadowSize, mountShadowTexture, mountStatueGeometry, setMountGlow, type MountKind, type MountRig } from "../../characters/mounts";
import { buildFleet, type CraftKind, type CraftView, type DrivenCraft } from "./fleet";
import { hullTilt, swellDamp, seaWave, type Tilt } from "./craft";
import { RIDEABLE_SPOTS } from "../../registry/rideables";
import { WATER_Y, groundY } from "../../registry/terrain";
import { skyBob, skyTopY } from "../../registry/skyIslands";
import { villageGroundY } from "../../registry/villageIsland";
import { seaFloorY } from "../sea/wander";
import { SEA_ROOT_Y, angleTo, pickSeaCall, turnTowards, type SeaCall } from "./plan";

type RideKind = Exclude<MountKind, "pony">;

export interface Rideables {
  /** idle animation (unicorns graze/wander, dragons shuffle wings, mantas glide in slow loops, dolphins/whales swim) */
  update(dt: number, t: number, o: { kid: THREE.Vector3; under: boolean; atSea: boolean; glow: number; driven?: DrivenCraft | null }): void;
  /** the nearest free rideable whose side is within `reach` m of the kid (default HOP_REACH; big
   *  rides measure to their flank, not their middle), with a hop-on prompt label. The returned
   *  object is reused between calls — copy what you keep. */
  nearest(kid: THREE.Vector3, reach?: number): { id: string; kind: MountKind; label: string; x: number; y: number; z: number; yaw: number } | null;
  /** the kid hops on: hide it from the world (the engine builds a MountRig) */
  take(id: string): void;
  /** the kid hops off: leave it where they got off, facing yaw (bikes/cars/unicorns stay; dragons stay; mantas/whales/dolphins swim off and later respawn) */
  release(id: string, x: number, y: number, z: number, yaw: number): void;
  dispose(): void;
}

// states
const IDLE = 0; // waiting where it lives (parked / grazing / perched / looping)
const TAKEN = 1; // being ridden (hidden)
const AWAY = 2; // hidden, counting down to come back
const COMING = 3; // a sea friend swimming up to the kid
const WAITING = 4; // a sea friend waiting beside the kid
const LEAVING = 5; // swimming off (then AWAY)

interface Ride {
  id: string;
  kind: RideKind;
  label: string;
  /** home (where it parks / grazes / perches / loops) */
  hx: number;
  hy: number;
  hz: number;
  hyaw: number;
  sky: string | null;
  wander: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  tx: number;
  tz: number;
  /** dragons: the heading it's slowly turning to */
  ty: number;
  moving: boolean;
  rest: number;
  state: number;
  timer: number;
  phase: number;
  live: MountRig | null;
  want: boolean;
  /** boats / subs: the fleet's view of it (where it's drawn, bobbing on the swell) */
  view: CraftView | null;
}

const LIVE_R = 48;
/** moored boats / subs further off than this (m, each axis) are lost in the sea haze: not drawn */
const CRAFT_SHOW_R = 330;
const UNICORN_CALL_R = 18;
const UNICORN_GIVEUP_R = 26;

export function buildRideables(scene: THREE.Scene, opts: { lowQuality?: boolean }): Rideables {
  const low = !!opts.lowQuality;
  const K_LIVE = low ? 2 : 4;
  const group = new THREE.Group();
  group.name = "rideables";
  scene.add(group);

  let seed = 0x5eed1234;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };

  const labelOf = (k: RideKind) => `${MOUNT_CAPS[k].emoji} ${MOUNT_CAPS[k].verb} the ${MOUNT_CAPS[k].label}`;
  const mk = (id: string, kind: RideKind, x: number, y: number, z: number, yaw: number, sky: string | null, wander: number, state: number): Ride => ({
    id, kind, label: labelOf(kind), hx: x, hy: y, hz: z, hyaw: yaw, sky, wander,
    x, y, z, yaw, pitch: 0, speed: 0, tx: x, tz: z, ty: yaw, moving: false, rest: kind === "unicorn" || kind === "dragon" ? 1 : 0,
    state, timer: rnd() * 5, phase: rnd() * Math.PI * 2, live: null, want: false, view: null,
  });
  const rides: Ride[] = RIDEABLE_SPOTS.map((s) => mk(s.id, (s.kind === "pony" ? "unicorn" : s.kind) as RideKind, s.x, s.y ?? groundY(s.x, s.z), s.z, s.yaw, s.sky ?? null, s.wander ?? 0, IDLE));
  const dolphin = mk("dolphin-sea", "dolphin", 0, SEA_ROOT_Y.dolphin, 0, 0, null, 0, AWAY);
  const whale = mk("whale-sea", "whale", 0, SEA_ROOT_Y.whale, 0, 0, null, 0, AWAY);
  dolphin.timer = 6;
  whale.timer = 14;
  rides.push(dolphin, whale);
  const byId = new Map(rides.map((r) => [r.id, r]));

  // ── boats and subs: drawn by the fleet ──
  const crafts = rides.filter((r) => isCraft(r.kind));
  const craftCount: Partial<Record<CraftKind, number>> = {};
  for (const r of crafts) {
    craftCount[r.kind as CraftKind] = (craftCount[r.kind as CraftKind] ?? 0) + 1;
    r.view = { kind: r.kind as CraftKind, x: r.x, y: r.y, z: r.z, yaw: r.yaw, pitch: 0, roll: 0, shown: true };
  }
  const craftViews: CraftView[] = crafts.map((r) => r.view!);
  const fleet = buildFleet(group, { lowQuality: low, count: craftCount });
  const tilt: Tilt = { pitch: 0, roll: 0, y: 0 };
  const fleetOpts: { crafts: CraftView[]; driven: DrivenCraft | null; glow: number; under: boolean } = { crafts: craftViews, driven: null, glow: 0, under: false };

  // ── per kind: the statue InstancedMesh + a pool of live rigs ──
  const kinds: RideKind[] = [];
  for (const r of rides) if (!kinds.includes(r.kind) && !isCraft(r.kind)) kinds.push(r.kind);
  const COMPANIONS = low ? 0 : 2;
  const statue = new Map<RideKind, THREE.InstancedMesh>();
  const statueList: THREE.InstancedMesh[] = [];
  const pools = new Map<RideKind, MountRig[]>();
  const allRigs: MountRig[] = [];
  const statueGeos: THREE.BufferGeometry[] = [];
  const mat = mountMaterial();
  for (const k of kinds) {
    const n = rides.filter((r) => r.kind === k).length;
    const sea = k === "dolphin" || k === "whale";
    const cap = n + (k === "dolphin" ? COMPANIONS : 0);
    if (!sea || k === "dolphin") {
      const g = mountStatueGeometry(k, "#ff5fa8", "classic", { rest: k === "unicorn" ? 1 : k === "dragon" ? 1 : 0, airborne: k === "manta" });
      statueGeos.push(g);
      const im = new THREE.InstancedMesh(g, mat, cap);
      im.name = `rideables:${k}`;
      im.frustumCulled = false;
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(im);
      statue.set(k, im);
      statueList.push(im);
    }
    const poolN = sea ? 1 : Math.min(n, K_LIVE);
    const pool: MountRig[] = [];
    for (let i = 0; i < poolN; i++) {
      const rig = buildMount(k);
      const sh = rig.root.getObjectByName("mount-shadow");
      if (sh) sh.visible = false; // the shared instanced shadows draw these
      rig.root.visible = false;
      group.add(rig.root);
      pool.push(rig);
      allRigs.push(rig);
    }
    pools.set(k, pool);
  }

  // ── blob shadows for everything standing on the ground (one draw) ──
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: mountShadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const grounded = rides.filter((r) => r.kind !== "manta" && r.kind !== "dolphin" && r.kind !== "whale" && !isCraft(r.kind)).length;
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, Math.max(1, grounded));
  shadows.name = "rideables:shadows";
  shadows.frustumCulled = false;
  shadows.count = 0;
  shadows.renderOrder = 1;
  group.add(shadows);

  // ── sparkles round a sea friend that's waiting for you (one draw) ──
  const SPARK_N = low ? 6 : 12;
  const sparkGeo = new THREE.OctahedronGeometry(0.34, 0);
  // opaque, so the (transparent) sea surface drawn later can't paint over them
  const sparkMat = new THREE.MeshBasicMaterial({ color: "#ffe45c" });
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_N);
  sparks.name = "rideables:sparkles";
  sparks.frustumCulled = false;
  sparks.count = 0;
  group.add(sparks);

  // scratch (update allocates nothing)
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler(0, 0, 0, "YXZ");
  const P = new THREE.Vector3();
  const S = new THREE.Vector3(1, 1, 1);
  const call: SeaCall = { x: 0, z: 0, sx: 0, sz: 0 };
  let lastT = 0;
  const near = { id: "", kind: "bike" as MountKind, label: "", x: 0, y: 0, z: 0, yaw: 0 };

  const landY = (x: number, z: number) => villageGroundY(x, z) ?? groundY(x, z);
  const visible = (r: Ride) => r.state === IDLE || r.state === COMING || r.state === WAITING || r.state === LEAVING;

  /** walk/swim towards (tx, tz) at up to `max` m/s; returns the distance left */
  const steer = (r: Ride, dt: number, max: number, turnRate: number) => {
    const dx = r.tx - r.x;
    const dz = r.tz - r.z;
    const d = Math.hypot(dx, dz);
    const goal = d > 0.4 ? Math.min(max, d * 1.2 + 0.4) : 0;
    r.speed += (goal - r.speed) * Math.min(1, dt * 3);
    if (d > 0.3) r.yaw = turnTowards(r.yaw, Math.atan2(dx, dz), turnRate, dt);
    // only move forward once roughly facing the way (animals turn, then go)
    const facing = Math.cos(angleTo(r.yaw, Math.atan2(dx, dz)));
    const step = r.speed * dt * Math.max(0, facing);
    r.x += Math.sin(r.yaw) * step;
    r.z += Math.cos(r.yaw) * step;
    return d;
  };

  const updateUnicorn = (r: Ride, dt: number, t: number, kid: THREE.Vector3, onLand: boolean) => {
    const kdh = Math.hypot(kid.x - r.hx, kid.z - r.hz);
    const kd = Math.hypot(kid.x - r.x, kid.z - r.z);
    let max = 1.1;
    if (onLand && kdh < UNICORN_CALL_R) {
      // trot over and stop a couple of metres in front of the kid
      if (kd > 4.4) {
        r.tx = kid.x + ((r.x - kid.x) / (kd || 1)) * 3.6;
        r.tz = kid.z + ((r.z - kid.z) / (kd || 1)) * 3.6;
        max = kd > 7 ? 3.8 : 2;
      } else {
        r.tx = r.x;
        r.tz = r.z;
        r.yaw = turnTowards(r.yaw, Math.atan2(kid.x - r.x, kid.z - r.z), 2.5, dt);
      }
      r.rest += (0 - r.rest) * Math.min(1, dt * 3);
      r.timer = 1 + rnd() * 2;
    } else if (Math.hypot(r.x - r.hx, r.z - r.hz) > r.wander + 1.5 && (kdh > UNICORN_GIVEUP_R || !onLand)) {
      // wander back to the meadow
      r.tx = r.hx;
      r.tz = r.hz;
      max = 1.6;
      r.rest += (0 - r.rest) * Math.min(1, dt * 2);
    } else {
      // graze: amble to a new patch every few seconds, head down in between
      r.timer -= dt;
      if (r.timer < 0) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * r.wander;
        const x = r.hx + Math.sin(a) * d;
        const z = r.hz + Math.cos(a) * d;
        if (landY(x, z) > WATER_Y + 0.4) {
          r.tx = x;
          r.tz = z;
        }
        r.timer = 5 + rnd() * 6;
      }
      const left = Math.hypot(r.tx - r.x, r.tz - r.z);
      r.rest += ((left < 0.5 ? 1 : 0) - r.rest) * Math.min(1, dt * 1.5);
    }
    steer(r, dt, max, 2.4);
    r.y = r.sky ? (skyTopY(r.x, r.z, t)?.y ?? r.y) : landY(r.x, r.z);
  };

  const updateDragon = (r: Ride, dt: number, t: number, kid: THREE.Vector3) => {
    const kd = Math.hypot(kid.x - r.x, kid.z - r.z);
    if (kd < 16) {
      r.yaw = turnTowards(r.yaw, Math.atan2(kid.x - r.x, kid.z - r.z), 1.2, dt);
      r.rest += (0.2 - r.rest) * Math.min(1, dt * 2);
    } else {
      r.timer -= dt;
      if (r.timer < 0) {
        r.ty = r.hyaw + (rnd() - 0.5) * 2;
        r.timer = 5 + rnd() * 5;
      }
      r.yaw = turnTowards(r.yaw, r.ty, 0.5, dt);
      r.rest += (1 - r.rest) * Math.min(1, dt * 0.8);
    }
    r.y = r.hy + (r.sky ? skyBob(r.sky, t) : 0);
  };

  const updateManta = (r: Ride, dt: number, t: number, kid: THREE.Vector3, under: boolean) => {
    if (r.state === IDLE) {
      // slow loops round its spot; slower still when a kid swims close (easy to catch)
      const near = under && Math.hypot(kid.x - r.x, kid.y - r.y, kid.z - r.z) < 10;
      const w = near ? 0.1 : 0.22;
      r.phase += dt * w;
      const R = 3.6;
      r.x = r.hx + Math.sin(r.phase) * R;
      r.z = r.hz + Math.cos(r.phase) * R;
      r.yaw = Math.atan2(Math.cos(r.phase), -Math.sin(r.phase));
      r.y = r.hy + Math.sin(t * 0.35 + r.phase) * 0.5;
      r.pitch = Math.cos(t * 0.35 + r.phase) * 0.06;
      r.speed = w * R;
    } else if (r.state === LEAVING) {
      r.timer -= dt;
      r.speed += (4 - r.speed) * Math.min(1, dt);
      r.x += Math.sin(r.yaw) * r.speed * dt;
      r.z += Math.cos(r.yaw) * r.speed * dt;
      r.y = Math.max(seaFloorY(r.x, r.z) + 1.2, Math.min(WATER_Y - 1.4, r.y - dt * 0.6));
      r.pitch = 0.12;
      if (r.timer < 0) {
        r.state = AWAY;
        r.timer = 40 + rnd() * 20;
      }
    } else if (r.state === AWAY) {
      r.timer -= dt;
      // back home once the kid isn't watching the spot
      if (r.timer < 0 && Math.hypot(kid.x - r.hx, kid.z - r.hz) > 28) {
        r.state = IDLE;
        r.phase = rnd() * Math.PI * 2;
      }
    }
  };

  const updateSea = (r: Ride, dt: number, t: number, kid: THREE.Vector3, atSea: boolean) => {
    const isW = r.kind === "whale";
    const surf = isW ? SEA_ROOT_Y.whale : SEA_ROOT_Y.dolphin;
    const swim = isW ? 2.4 : 5.2;
    if (r.state === AWAY) {
      if (!atSea) return;
      r.timer -= dt;
      if (r.timer > 0) return;
      const other = isW ? dolphin : whale;
      // one friend at a time, so it's clear who's come to see you
      if (other.state === COMING || other.state === WAITING) {
        r.timer = 4;
        return;
      }
      if (!pickSeaCall(kid.x, kid.z, isW ? "whale" : "dolphin", rnd(), rnd(), call)) {
        r.timer = 2.5;
        return;
      }
      r.state = COMING;
      r.x = call.sx;
      r.z = call.sz;
      r.tx = call.x;
      r.tz = call.z;
      r.y = surf - 2.5;
      r.yaw = Math.atan2(call.x - call.sx, call.z - call.sz);
      r.speed = swim;
      return;
    }
    if (r.state === COMING) {
      const d = steer(r, dt, swim, 1.6);
      r.y += (surf - r.y) * Math.min(1, dt * 0.8);
      if (d < 1.5) {
        r.state = WAITING;
        r.timer = isW ? 30 : 24;
      }
      if (!atSea) ((r.state = LEAVING), (r.timer = 7));
      return;
    }
    if (r.state === WAITING) {
      r.timer -= dt;
      const kd = Math.hypot(kid.x - r.x, kid.z - r.z);
      // keep close by if the kid swims about
      if (kd > (isW ? 19 : 15)) {
        r.tx = kid.x + ((r.x - kid.x) / kd) * (isW ? 14 : 10);
        r.tz = kid.z + ((r.z - kid.z) / kd) * (isW ? 14 : 10);
        steer(r, dt, swim * 0.6, 1.2);
      } else {
        // idle about broadside-on (easy to see, easy to climb on), keeping 8.5-14 m away
        r.speed += (0.35 - r.speed) * Math.min(1, dt);
        r.yaw = turnTowards(r.yaw, Math.atan2(kid.x - r.x, kid.z - r.z) + Math.PI / 2, 0.35, dt);
        r.x += Math.sin(r.yaw) * r.speed * dt;
        r.z += Math.cos(r.yaw) * r.speed * dt;
        const k2 = Math.hypot(r.x - kid.x, r.z - kid.z) || 1;
        const cl = isW ? Math.min(17, Math.max(12, k2)) : Math.min(14, Math.max(8.5, k2));
        r.x = kid.x + ((r.x - kid.x) / k2) * cl;
        r.z = kid.z + ((r.z - kid.z) / k2) * cl;
      }
      r.y = surf + Math.sin(t * (isW ? 0.5 : 1.3)) * (isW ? 0.12 : 0.15);
      if (r.timer < 0 || !atSea) ((r.state = LEAVING), (r.timer = 7));
      return;
    }
    if (r.state === LEAVING) {
      r.timer -= dt;
      const away = Math.atan2(r.x - kid.x, r.z - kid.z);
      r.yaw = turnTowards(r.yaw, away, 0.8, dt);
      r.speed += (swim * 1.1 - r.speed) * Math.min(1, dt);
      r.x += Math.sin(r.yaw) * r.speed * dt;
      r.z += Math.cos(r.yaw) * r.speed * dt;
      if (r.timer < 4) r.y = Math.max(seaFloorY(r.x, r.z) + 1.5, r.y - dt * 1.2);
      if (r.timer < 0) {
        r.state = AWAY;
        r.timer = isW ? 50 + rnd() * 30 : 25 + rnd() * 20;
      }
    }
  };

  /** boats and subs: bob on the swell where they're moored (or left); a sub left under water floats
   *  up; one left away from its dock drifts home once the kid's well away */
  const updateCraft = (r: Ride, dt: number, t: number, kid: THREE.Vector3) => {
    const v = r.view!;
    const [hl, hw] = MOUNT_BODY[r.kind];
    // (far from the kid: no need to ride the swell exactly)
    const far = Math.abs(kid.x - r.x) + Math.abs(kid.z - r.z) > 260;
    if (isSub(r.kind)) {
      const surf = WATER_Y + SUB_CAPS[r.kind].surf;
      if (r.y < surf - 0.05) r.y = Math.min(surf, r.y + dt * 1.4);
      else r.y = surf;
      const k = Math.max(0, 1 - (surf - r.y) / 1.5);
      v.y = r.y + (far ? 0 : seaWave(r.x, r.z, t) * swellDamp(r.x, r.z) * k * 0.8);
      v.pitch = Math.sin(t * 0.8 + r.phase) * 0.025;
      v.roll = Math.sin(t * 0.6 + r.phase * 1.7) * 0.04;
    } else if (far) {
      v.y = WATER_Y;
      v.pitch = v.roll = 0;
    } else {
      hullTilt(r.x, r.z, r.yaw, hl * 2, hw * 2, t, tilt);
      // a little rocking even on a calm day (bigger boats rock slower and less)
      const big = Math.min(1, 4 / hl);
      v.y = tilt.y + Math.sin(t * (0.8 + big) + r.phase) * 0.05 * big;
      v.pitch = tilt.pitch + Math.sin(t * (0.6 + big * 0.7) + r.phase) * 0.02 * big;
      v.roll = tilt.roll + Math.sin(t * (0.7 + big * 0.6) + r.phase * 1.3) * 0.045 * big;
    }
    v.x = r.x;
    v.z = r.z;
    v.yaw = r.yaw;
    // left away from its dock: drift home once the kid's well away
    if (Math.hypot(r.x - r.hx, r.z - r.hz) > 2) {
      r.timer -= dt;
      if (r.timer < 0 && Math.hypot(kid.x - r.x, kid.z - r.z) > 90 && Math.hypot(kid.x - r.hx, kid.z - r.hz) > 70) {
        r.x = r.hx;
        r.z = r.hz;
        r.y = r.hy;
        r.yaw = r.hyaw;
      }
    }
  };

  const placeRig = (r: Ride, dt: number, glow: number) => {
    const rig = r.live!;
    rig.root.visible = true;
    rig.root.position.set(r.x, r.y, r.z);
    rig.root.rotation.set(r.pitch, r.yaw, 0, "YXZ");
    rig.rest?.(r.rest);
    const air = r.kind === "manta" || (r.kind === "dolphin" && r.y < SEA_ROOT_Y.dolphin - 0.5) || (r.kind === "whale" && r.y < SEA_ROOT_Y.whale - 0.5);
    rig.update(dt, r.speed, air, glow, r.kind === "manta" ? r.y - seaFloorY(r.x, r.z) : 0);
  };

  const writeInstance = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, pitch: number) => {
    E.set(pitch, yaw, 0, "YXZ");
    Q.setFromEuler(E);
    P.set(x, y, z);
    S.set(1, 1, 1);
    M.compose(P, Q, S);
    im.setMatrixAt(i, M);
  };

  return {
    update(dt, t, o) {
      lastT = t;
      setMountGlow(o.glow);
      const kid = o.kid;
      const onLand = !o.atSea && !o.under && kid.y > WATER_Y - 0.3;
      // ── behaviour ──
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        if (r.state === TAKEN) continue;
        if (r.kind === "unicorn") {
          if (r.state === IDLE) updateUnicorn(r, dt, t, kid, onLand);
        } else if (r.kind === "dragon") {
          if (r.state === IDLE) updateDragon(r, dt, t, kid);
        } else if (r.kind === "manta") updateManta(r, dt, t, kid, o.under);
        else if (r.kind === "dolphin" || r.kind === "whale") updateSea(r, dt, t, kid, o.atSea);
        else if (r.view) updateCraft(r, dt, t, kid);
      }
      // (moored craft past the fog aren't drawn)
      for (let i = 0; i < crafts.length; i++) {
        const c = crafts[i];
        c.view!.shown = c.state === IDLE && Math.abs(c.x - kid.x) < CRAFT_SHOW_R && Math.abs(c.z - kid.z) < CRAFT_SHOW_R;
      }
      fleetOpts.driven = o.driven ?? null;
      fleetOpts.glow = o.glow;
      fleetOpts.under = o.under;
      fleet.update(dt, t, fleetOpts);
      // ── which get a live rig: the sea friends always, then the K nearest others in range ──
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        r.want = visible(r) && (r.kind === "dolphin" || r.kind === "whale");
      }
      for (let k = 0; k < K_LIVE; k++) {
        let best: Ride | null = null;
        let bd = LIVE_R * LIVE_R;
        for (let i = 0; i < rides.length; i++) {
          const r = rides[i];
          if (r.want || !visible(r) || r.kind === "dolphin" || r.kind === "whale" || r.view) continue;
          const d = (r.x - kid.x) ** 2 + ((r.y - kid.y) * 0.7) ** 2 + (r.z - kid.z) ** 2;
          if (d < bd) ((bd = d), (best = r));
        }
        if (!best) break;
        best.want = true;
      }
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        if (r.live && !r.want) {
          r.live.root.visible = false;
          pools.get(r.kind)!.push(r.live);
          r.live = null;
        }
      }
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        if (r.want && !r.live) {
          const pool = pools.get(r.kind)!;
          if (pool.length) r.live = pool.pop()!;
        }
        if (r.live) placeRig(r, dt, o.glow);
      }
      // ── statues, shadows, sparkles ──
      for (let i = 0; i < statueList.length; i++) statueList[i].count = 0;
      shadows.count = 0;
      sparks.count = 0;
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        if (!visible(r)) continue;
        if (!r.live && !r.view) {
          const im = statue.get(r.kind);
          if (im && im.count < im.instanceMatrix.count) {
            writeInstance(im, im.count, r.x, r.y, r.z, r.yaw, r.pitch);
            im.count++;
          }
        }
        if (r.kind !== "manta" && r.kind !== "dolphin" && r.kind !== "whale" && !r.view && shadows.count < shadows.instanceMatrix.count) {
          const [w, l] = mountShadowSize(r.kind);
          E.set(0, r.yaw, 0, "YXZ");
          Q.setFromEuler(E);
          P.set(r.x, r.y + 0.05, r.z);
          S.set(w, 1, l);
          M.compose(P, Q, S);
          shadows.setMatrixAt(shadows.count++, M);
        }
        // a waiting sea friend sparkles and bobs so kids notice
        if (r.state === WAITING || (r.state === COMING && Math.hypot(r.tx - r.x, r.tz - r.z) < 6)) {
          const big = r.kind === "whale" ? 6 : 1.6;
          const n = Math.min(SPARK_N - sparks.count, SPARK_N / 2);
          for (let s = 0; s < n; s++) {
            const a = t * 0.9 + (s / n) * Math.PI * 2;
            const h = ((t * 0.6 + s * 0.37) % 1);
            E.set(t * 2 + s, t * 3 + s, 0, "YXZ");
            Q.setFromEuler(E);
            P.set(r.x + Math.sin(a) * big, WATER_Y + 0.4 + h * 2.2 + (r.kind === "whale" ? 1.6 : 0), r.z + Math.cos(a) * big);
            const sc = Math.sin(h * Math.PI) * (0.9 + 0.5 * Math.sin(t * 6 + s));
            S.set(sc, sc * 1.4, sc);
            M.compose(P, Q, S);
            sparks.setMatrixAt(sparks.count++, M);
          }
        }
      }
      // the dolphin's pod swims along with it
      const dim = statue.get("dolphin");
      if (dim && COMPANIONS && visible(dolphin)) {
        for (let c = 0; c < COMPANIONS; c++) {
          const side = c ? 1 : -1;
          let x: number;
          let z: number;
          let yaw: number;
          if (dolphin.state === WAITING) {
            const a = t * 0.35 + c * Math.PI;
            x = dolphin.x + Math.sin(a) * 5.5;
            z = dolphin.z + Math.cos(a) * 5.5;
            yaw = a + Math.PI / 2;
          } else {
            const sy = Math.sin(dolphin.yaw);
            const cy = Math.cos(dolphin.yaw);
            x = dolphin.x + cy * side * 2.6 - sy * (2.5 + c);
            z = dolphin.z - sy * side * 2.6 - cy * (2.5 + c);
            yaw = dolphin.yaw;
          }
          // porpoising arcs
          const u = (t * 0.45 + c * 0.5) % 1;
          const leap = u < 0.3 ? Math.sin((u / 0.3) * Math.PI) : 0;
          const y = dolphin.y - 0.25 + leap * 1.2 - (u >= 0.3 ? 0.35 : 0);
          writeInstance(dim, dim.count++, x, y, z, yaw, u < 0.3 ? -Math.cos((u / 0.3) * Math.PI) * 0.45 : 0);
        }
      }
      for (let i = 0; i < statueList.length; i++) {
        const im = statueList[i];
        im.visible = im.count > 0;
        if (im.count) im.instanceMatrix.needsUpdate = true;
      }
      shadows.visible = shadows.count > 0;
      if (shadows.count) shadows.instanceMatrix.needsUpdate = true;
      sparks.visible = sparks.count > 0;
      if (sparks.count) sparks.instanceMatrix.needsUpdate = true;
    },

    nearest(kid, reach = HOP_REACH) {
      let best: Ride | null = null;
      let bd = reach * reach;
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        if (r.state !== IDLE && r.state !== WAITING) continue;
        if (Math.abs(r.x - kid.x) > 40 || Math.abs(r.z - kid.z) > 40) continue;
        const dy = (r.y + (r.kind === "whale" ? 2.4 : 0.6) - kid.y) * 0.6;
        // measure to the ride's side (a capsule along its heading), not its middle: a whale or a
        // pirate ship is as easy to climb onto as a bike
        const [hl, hw, off] = MOUNT_BODY[r.kind];
        const fx = Math.sin(r.yaw);
        const fz = Math.cos(r.yaw);
        const ax = kid.x - (r.x + fx * off);
        const az = kid.z - (r.z + fz * off);
        const along = Math.max(-hl, Math.min(hl, ax * fx + az * fz));
        const dh = Math.max(0, Math.hypot(ax - fx * along, az - fz * along) - hw);
        const d = dh * dh + dy * dy;
        if (d < bd) ((bd = d), (best = r));
      }
      if (!best) return null;
      near.id = best.id;
      near.kind = best.kind;
      near.label = best.label;
      near.x = best.x;
      near.y = best.y;
      near.z = best.z;
      near.yaw = best.yaw;
      return near;
    },

    take(id) {
      const r = byId.get(id);
      if (!r || r.state === TAKEN) return;
      r.state = TAKEN;
      if (r.live) {
        r.live.root.visible = false;
        pools.get(r.kind)!.push(r.live);
        r.live = null;
      }
    },

    release(id, x, y, z, yaw) {
      const r = byId.get(id);
      if (!r) return;
      r.x = x;
      r.y = y;
      r.z = z;
      r.yaw = yaw;
      r.pitch = 0;
      r.speed = 0;
      r.tx = x;
      r.tz = z;
      if (r.view) {
        // a boat stays bobbing where it's left (a sub floats up); it drifts home later
        r.state = IDLE;
        r.y = isBoat(r.kind) ? WATER_Y : Math.min(y, WATER_Y + SUB_CAPS[r.kind as "sub"].surf);
        r.timer = 45;
        return;
      }
      if (r.kind === "manta" || r.kind === "dolphin" || r.kind === "whale") {
        // swims off, comes back later (mantas to their reef spot, sea friends when you're at sea)
        r.state = LEAVING;
        r.timer = 7;
        if (r.kind !== "manta") r.y = Math.min(y, SEA_ROOT_Y[r.kind]);
        return;
      }
      // stays where you left it (a unicorn makes that its new meadow)
      r.state = IDLE;
      r.hx = x;
      r.hz = z;
      r.hyaw = yaw;
      r.ty = yaw;
      const top = skyTopY(x, z, lastT);
      if (top && Math.abs(top.y - y) < 2) {
        r.sky = top.id;
        r.hy = y - skyBob(top.id, lastT);
      } else {
        r.sky = null;
        r.hy = y;
      }
      r.timer = 3 + rnd() * 3;
    },

    dispose() {
      fleet.dispose();
      group.removeFromParent();
      for (const rig of allRigs) rig.dispose();
      for (const g of statueGeos) g.dispose();
      for (const im of statueList) im.dispose();
      shadows.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      sparks.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
    },
  };
}

