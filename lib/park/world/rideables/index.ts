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
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { nameTag } from "../../wizards/wizardModel";
import { DRAGON_BREEDS, HOP_REACH, MOUNT_BODY, MOUNT_CAPS, SUB_CAPS, buildMount, dragonSnout, isBoat, isCraft, isSub, mountBody, mountMaterial, mountScale, mountShadowSize, mountShadowTexture, mountStatueGeometry, setMountGlow, type DragonAct, type DragonBreed, type DragonDrive, type MountKind, type MountRig } from "../../characters/mounts";
import { buildFleet, type CraftKind, type CraftView, type DrivenCraft } from "./fleet";
import { BUMP_GROUND, boatClearance, hullBody, hullTilt, moveBoat, swellDamp, seaWave, type Helm, type SeaBody, type Tilt } from "./craft";
import { DRAGON_ROOST, RIDEABLE_SPOTS, ROOST_LOUNGE } from "../../registry/rideables";
import { facedGap, separateDragons, type DragonFoot, type RoundProp } from "./dragonSpace";
import { DOCKS } from "../../registry/harbours";
import { GARDENS, atSea as seaPoint } from "../underwater/plan";
import { WATER_Y, groundY } from "../../registry/terrain";
import { skyBob, skyTopY } from "../../registry/skyIslands";
import { villageGroundY } from "../../registry/villageIsland";
import { seaDepth, seaFloorY } from "../sea/wander";
import { MANTA_CALL, SEA_FIRST_CALL, SEA_ROOT_Y, angleTo, keepGap, mantaDepth, pickMantaCall, pickSeaCall, sideGap, turnTowards, type MantaCall, type SeaCall } from "./plan";

type RideKind = Exclude<MountKind, "pony">;

export interface Rideables {
  /** idle animation (unicorns graze/wander, dragons shuffle wings, mantas glide in slow loops, dolphins/whales swim) */
  update(dt: number, t: number, o: { kid: THREE.Vector3; under: boolean; atSea: boolean; glow: number; driven?: DrivenCraft | null; diving?: boolean; camera?: THREE.Camera }): void;
  /** the nearest free rideable whose side is within `reach` m of the kid (default HOP_REACH; big
   *  rides measure to their flank, not their middle), with a hop-on prompt label. The returned
   *  object is reused between calls — copy what you keep. */
  nearest(kid: THREE.Vector3, reach?: number, facing?: number): { id: string; kind: MountKind; label: string; x: number; y: number; z: number; yaw: number; breed?: DragonBreed } | null;
  /** dragons the kid has made friends with (they come over and nuzzle; the rest are shy at first) */
  setBonded(ids: Iterable<string>): void;
  /** the kid holds out a hand to a dragon: it sniffs, presses its snout to it, a heart puff - friends.
   *  False if it can't start (not a parked dragon). */
  bond(id: string): boolean;
  /** the dragon making friends right now (null when none) */
  bonding(): string | null;
  /** a dragon that has just finished making friends (once; clears itself) */
  takeBonded(): string | null;
  /** the nearest ride of `kind` standing free within `r` m of the kid (for "a dragon!" hints), or null */
  parkedNear(kid: THREE.Vector3, kind: MountKind, r: number): string | null;
  /** a manta has just come gliding up to a diving kid (true once per visit; clears itself) */
  takeMantaArrival(): boolean;
  /** where the rides kids can find are, for the map */
  pins(): RidePin[];
  /** the dragon "Say hi" / "Fly" is for right now (a glowing ring at its feet and a bobbing arrow over it), or null */
  setTarget(id: string | null): void;
  /** (tests / smoke harness) hold a parked dragon in one act (null = back to its own life) */
  forceAct(id: string, act: DragonAct | null): void;
  /** what's afloat round the kid that a boat mustn't sail through: the moored / drifting boats and
   *  subs, and the sea friends at the surface (refilled every update; read-only) */
  seaBodies(): readonly SeaBody[];
  /** (tests / smoke harness) where a ride is and what it's doing */
  peek(id: string): { state: "idle" | "taken" | "away" | "coming" | "waiting" | "leaving"; x: number; y: number; z: number; yaw: number; act?: DragonAct; bonded?: boolean } | null;
  /** the kid hops on: hide it from the world (the engine builds a MountRig) */
  take(id: string): void;
  /** the kid hops off: leave it where they got off, facing yaw (bikes/cars/unicorns stay; dragons stay; mantas/whales/dolphins swim off and later respawn) */
  release(id: string, x: number, y: number, z: number, yaw: number): void;
  dispose(): void;
}

/** a ride on the map: dragons, manta reefs, docks and unicorn glades */
export interface RidePin {
  id: string;
  kind: "dragon" | "manta" | "dock" | "unicorn";
  x: number;
  z: number;
  emoji: string;
  label: string;
  /** up on a floating mountain */
  sky?: boolean;
  /** out at sea (tapping it explains how to get there) */
  sea?: boolean;
  how?: string;
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
  /** the manta that comes gliding up to any kid diving in deep water (it has no reef home) */
  visit: boolean;
  /** dragons */
  breed?: DragonBreed;
  /** which statue / rig pool draws it (a kind, or a dragon breed) */
  vk: string;
  lounge: boolean;
  /** what it's up to, and for how long */
  act: DragonAct;
  actT: number;
  /** making friends: seconds into it (-1 = not) */
  bondT: number;
  bonded: boolean;
  /** heart puff timer (-1 = none) */
  heartT: number;
  drv: DragonDrive | null;
  /** (tests / smoke harness) held in this act */
  forced: DragonAct | null;
  /** boats / subs left out at sea: sailing home (seconds stuck on the way; true = no way through) */
  stuckT?: number;
  homeBlocked?: boolean;
  /** on its way home (it keeps going once it's set off) */
  homing?: boolean;
}

const LIVE_R = 48;
/** moored boats / subs further off than this (m, each axis) are lost in the sea haze: not drawn */
const CRAFT_SHOW_R = 330;
const UNICORN_CALL_R = 18;
const UNICORN_GIVEUP_R = 26;
/** parked dragons stay animated (breathing, stretching, puffing smoke) this far off, so kids spot them */
const DRAGON_LIVE_R = 120;
/** a dragon notices a kid (turns to look; trots over once it knows them) */
const DRAGON_NOTICE_R = 22;
/** making friends, in seconds: shy, sniff, press the snout to the hand, the heart puff, a happy wiggle */
export const BOND_STEPS = { shy: 1.5, sniff: 3.1, press: 4.1, happy: 5.6 } as const;

export function buildRideables(scene: THREE.Scene, opts: { lowQuality?: boolean }): Rideables {
  const low = !!opts.lowQuality;
  const K_LIVE = low ? 2 : 4;
  const DRAGON_LIVE = low ? 2 : 3;
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
  const mk = (id: string, kind: RideKind, x: number, y: number, z: number, yaw: number, sky: string | null, wander: number, state: number, breed?: DragonBreed, lounge = false): Ride => ({
    id, kind, label: kind === "dragon" ? `\u{1F409} Fly ${DRAGON_BREEDS[breed ?? "roostwarden"].name}` : labelOf(kind), hx: x, hy: y, hz: z, hyaw: yaw, sky, wander,
    x, y, z, yaw, pitch: 0, speed: 0, tx: x, tz: z, ty: yaw, moving: false, rest: kind === "unicorn" || kind === "dragon" ? 1 : 0,
    state, timer: rnd() * 5, phase: rnd() * Math.PI * 2, live: null, want: false, view: null, visit: false,
    breed: kind === "dragon" ? breed ?? "roostwarden" : undefined, vk: kind === "dragon" ? `dragon:${breed ?? "roostwarden"}` : kind, lounge,
    act: "stand", actT: rnd() * 6, bondT: -1, bonded: false, heartT: -1,
    drv: kind === "dragon" ? { mode: "park", act: "stand", look: 0, flap: 0, dive: 0 } : null,
    forced: null,
  });
  const rides: Ride[] = RIDEABLE_SPOTS.map((s) => mk(s.id, (s.kind === "pony" ? "unicorn" : s.kind) as RideKind, s.x, s.y ?? groundY(s.x, s.z), s.z, s.yaw, s.sky ?? null, s.wander ?? 0, IDLE, s.breed, !!s.lounge));
  let bondDone: string | null = null;
  let bondingId: string | null = null;
  const dolphin = mk("dolphin-sea", "dolphin", 0, SEA_ROOT_Y.dolphin, 0, 0, null, 0, AWAY);
  const whale = mk("whale-sea", "whale", 0, SEA_ROOT_Y.whale, 0, 0, null, 0, AWAY);
  dolphin.timer = SEA_FIRST_CALL.dolphin;
  whale.timer = SEA_FIRST_CALL.whale;
  // the visiting manta: glides up to a kid diving in deep water anywhere, waits beside them
  const visitor = mk("manta-visit", "manta", 0, WATER_Y - 4, 0, 0, null, 0, AWAY);
  visitor.visit = true;
  rides.push(dolphin, whale, visitor);
  let diveT = 0;
  let diveNeed = MANTA_CALL.after[0] + rnd() * (MANTA_CALL.after[1] - MANTA_CALL.after[0]);
  let mantaArrived = false;
  let wasAtSea = false;
  const mcall: MantaCall = { x: 0, y: 0, z: 0, sx: 0, sz: 0 };
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
  // everything afloat (for the boats: ParkWorld bumps the one you drive off them, and a boat
  // sailing home steers round them): one capsule per craft / sea friend, refilled every update
  const afloat: SeaBody[] = [];
  const afloatOf = new Map<Ride, SeaBody>();
  const drivenBody: SeaBody = { x: 0, z: 0, r: 0, hl: 0, yaw: 0 };
  let drivenOn = false;
  const homeBodies: SeaBody[] = [];
  const HELM: Helm = { yaw: 0, speed: 0, reverse: false, revT: 0 };
  const bodyPool: SeaBody[] = [];
  const kidBody: SeaBody = { x: 0, z: 0, r: 1.3, hl: 0, yaw: 0 };
  const fleetOpts: { crafts: CraftView[]; driven: DrivenCraft | null; glow: number; under: boolean } = { crafts: craftViews, driven: null, glow: 0, under: false };

  // ── per kind: the statue InstancedMesh + a pool of live rigs ──
  const vks: string[] = [];
  for (const r of rides) if (!vks.includes(r.vk) && !isCraft(r.kind)) vks.push(r.vk);
  const COMPANIONS = low ? 0 : 2;
  const statue = new Map<string, THREE.InstancedMesh>();
  const statueList: THREE.InstancedMesh[] = [];
  const pools = new Map<string, MountRig[]>();
  const allRigs: MountRig[] = [];
  const statueGeos: THREE.BufferGeometry[] = [];
  const mat = mountMaterial();
  for (const vk of vks) {
    const r0 = rides.find((r) => r.vk === vk)!;
    const k = r0.kind;
    const n = rides.filter((r) => r.vk === vk).length;
    const sea = k === "dolphin" || k === "whale";
    const cap = n + (k === "dolphin" ? COMPANIONS : 0);
    if (!sea || k === "dolphin") {
      const g = mountStatueGeometry(k, "#ff5fa8", "classic", { rest: k === "unicorn" ? 1 : 0, airborne: k === "manta" }, r0.breed);
      statueGeos.push(g);
      const im = new THREE.InstancedMesh(g, mat, cap);
      im.name = `rideables:${vk}`;
      im.frustumCulled = false;
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(im);
      statue.set(vk, im);
      statueList.push(im);
    }
    const poolN = sea ? 1 : k === "dragon" ? Math.min(n, DRAGON_LIVE) : Math.min(n, K_LIVE);
    const pool: MountRig[] = [];
    for (let i = 0; i < poolN; i++) {
      const rig = buildMount(k, undefined, undefined, r0.breed);
      const sh = rig.root.getObjectByName("mount-shadow");
      if (sh) sh.visible = false; // the shared instanced shadows draw these
      rig.root.visible = false;
      group.add(rig.root);
      pool.push(rig);
      allRigs.push(rig);
    }
    pools.set(vk, pool);
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

  // ── a puff of hearts when a dragon makes friends (one draw) ──
  const HEART_N = 9;
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -0.5);
  heartShape.bezierCurveTo(0.65, 0.05, 0.5, 0.55, 0, 0.28);
  heartShape.bezierCurveTo(-0.5, 0.55, -0.65, 0.05, 0, -0.5);
  const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.18, bevelEnabled: false, curveSegments: 6 });
  heartGeo.translate(0, 0, -0.09);
  const heartMat = new THREE.MeshBasicMaterial({ color: "#ff5f9e" });
  const hearts = new THREE.InstancedMesh(heartGeo, heartMat, HEART_N);
  hearts.name = "rideables:hearts";
  hearts.frustumCulled = false;
  hearts.count = 0;
  group.add(hearts);

  // ── the dragon a kid's "Say hi" / "Fly" is for: a glowing ring round its feet and a bobbing arrow ──
  const hiMat = new THREE.MeshBasicMaterial({ color: "#ffe45c", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const hiRingGeo = new THREE.RingGeometry(0.8, 1, 48, 1);
  hiRingGeo.rotateX(-Math.PI / 2);
  const hiRing = new THREE.Mesh(hiRingGeo, hiMat);
  hiRing.name = "rideables:target-ring";
  hiRing.renderOrder = 2;
  hiRing.visible = false;
  group.add(hiRing);
  const hiArrowGeo = new THREE.ConeGeometry(1.1, 2.2, 4);
  hiArrowGeo.rotateX(Math.PI);
  const hiArrowMat = new THREE.MeshBasicMaterial({ color: "#ffd257" });
  const hiArrow = new THREE.Mesh(hiArrowGeo, hiArrowMat);
  hiArrow.name = "rideables:target-arrow";
  hiArrow.visible = false;
  group.add(hiArrow);
  let targetId: string | null = null;
  // ── keeping dragons apart and out of the Roost's perches, trough and banner ──
  const roostProps: RoundProp[] = roostObstacles();
  const feet: DragonFoot[] = [];
  const footOf: Ride[] = [];
  const pinned: boolean[] = [];

  // ── bubbles streaming off the mantas near a kid under water (one draw) ──
  const BUB_N = low ? 12 : 30;
  const bubGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const bubMat = new THREE.MeshBasicMaterial({ color: "#e4fdff" });
  const bubbles = new THREE.InstancedMesh(bubGeo, bubMat, BUB_N);
  bubbles.name = "rideables:bubbles";
  bubbles.frustumCulled = false;
  bubbles.count = 0;
  group.add(bubbles);

  // ── the Dragon Roost: a stone pad draped on the grass, a ring of candy boulders and a sign ──
  const roostGeo = buildRoostGeometry();
  const roost = new THREE.Mesh(roostGeo, mat);
  roost.name = "rideables:roost";
  group.add(roost);
  let roostSign: THREE.Sprite | null = null;
  if (typeof document !== "undefined") {
    roostSign = nameTag("\u{1F409} Dragon Roost", "#e8475e");
    roostSign.scale.multiplyScalar(1.5);
    roostSign.position.set(DRAGON_ROOST.sign.x, DRAGON_ROOST.sign.y + 4.1, DRAGON_ROOST.sign.z);
    group.add(roostSign);
  }

  // scratch (update allocates nothing)
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler(0, 0, 0, "YXZ");
  const P = new THREE.Vector3();
  const S = new THREE.Vector3(1, 1, 1);
  const S3 = new THREE.Vector3(1, 1, 1);
  // (hearts turn to face where the kid is; good enough for a camera just behind them)
  let cam0x = 0;
  let cam0z = 0;
  const call: SeaCall = { x: 0, z: 0, sx: 0, sz: 0 };
  let lastT = 0;
  const near: { id: string; kind: MountKind; label: string; x: number; y: number; z: number; yaw: number; breed?: DragonBreed } = { id: "", kind: "bike", label: "", x: 0, y: 0, z: 0, yaw: 0 };

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

  /** a dragon's life: naps, scratches and tail-chasing when no one's about; it notices a kid,
   *  shyly at first; once it knows them it trots over and nuzzles; making friends is a little scene */
  /** room to chase its tail round in a circle (no other dragon inside the sweep of its body) */
  const roomToSpin = (r: Ride) => {
    const [hl, , off] = mountBody("dragon", r.breed);
    const reachR = hl + Math.abs(off);
    for (let i = 0; i < rides.length; i++) {
      const o = rides[i];
      if (o === r || o.kind !== "dragon" || o.state !== IDLE) continue;
      const [ohl, ohw, ooff] = mountBody("dragon", o.breed);
      if (Math.hypot(o.x - r.x, o.z - r.z) < reachR + ohl + Math.abs(ooff) * 0.5 + ohw * 0.5) return false;
    }
    return true;
  };
  const updateDragon = (r: Ride, dt: number, t: number, kid: THREE.Vector3) => {
    const br = DRAGON_BREEDS[r.breed!];
    const S = mountScale("dragon", r.breed);
    const dx = kid.x - r.x;
    const dz = kid.z - r.z;
    const kd = Math.hypot(dx, dz);
    const level = Math.abs(kid.y - r.y) < 5;
    const toKid = Math.atan2(dx, dz);
    const bear = angleTo(r.yaw, toKid);
    const drv = r.drv!;
    const canWalk = !r.sky && !r.lounge;
    let walkTo = false;
    const homeD = Math.hypot(r.x - r.hx, r.z - r.hz);
    if (r.forced) {
      r.act = r.forced;
      drv.look = 0;
    } else if (r.bondT >= 0) {
      // ── making friends ──
      r.bondT += dt;
      const T = r.bondT;
      r.yaw = turnTowards(r.yaw, toKid, 1.4, dt);
      drv.look = Math.max(-1, Math.min(1, bear));
      // shuffle to where its snout just reaches the kid's hand
      const reach = dragonSnout(r.breed!)[1] * S * 0.88 + 0.9;
      if (T < BOND_STEPS.press && !r.sky) {
        const wx = kid.x - Math.sin(toKid) * reach;
        const wz = kid.z - Math.cos(toKid) * reach;
        const k = Math.min(1, dt * 1.6);
        r.x += (wx - r.x) * k;
        r.z += (wz - r.z) * k;
      }
      r.act = T < BOND_STEPS.shy ? "shy" : T < BOND_STEPS.sniff ? "sniff" : T < BOND_STEPS.press ? "nuzzle" : "happy";
      if (T >= BOND_STEPS.sniff + 0.4 && r.heartT < 0) r.heartT = 0;
      if (kd > 16) {
        // the kid wandered off: maybe next time
        r.bondT = -1;
        bondingId = null;
      } else if (T >= BOND_STEPS.happy) {
        r.bondT = -1;
        r.bonded = true;
        bondingId = null;
        bondDone = r.id;
        r.act = "happy";
        r.actT = 2.5;
      }
    } else if (level && kd < DRAGON_NOTICE_R) {
      // ── a kid about: look at them ──
      drv.look = Math.max(-1.1, Math.min(1.1, bear));
      const gap = sideGap("dragon", r.x, r.z, r.yaw, kid.x, kid.z, mountBody("dragon", r.breed));
      if (r.act === "happy" && r.actT > 0) r.actT -= dt;
      else if (!r.bonded) r.act = kd < 13 ? "shy" : "stand";
      else if (canWalk && gap > 3.2 && homeD < 10) {
        r.act = "walk";
        walkTo = true;
        // (stop short: its side a step from the kid)
        const stop = Math.max(0, kd - gap) + 1.4;
        r.tx = kid.x - Math.sin(toKid) * stop;
        r.tz = kid.z - Math.cos(toKid) * stop;
      } else r.act = gap < 4.5 ? "nuzzle" : "stand";
      // turn to face them (slowly) when they're well off to one side
      if (!walkTo && Math.abs(bear) > 1.1) r.yaw = turnTowards(r.yaw, toKid, 0.8, dt);
    } else {
      // ── no one about: its own little life ──
      drv.look = 0;
      r.actT -= dt;
      if (canWalk && homeD > 2 && r.act !== "walk") ((r.act = "walk"), (r.actT = 30));
      if (r.act === "walk") {
        r.tx = r.hx;
        r.tz = r.hz;
        walkTo = true;
        if (homeD < 1) ((r.act = "stand"), (r.actT = 2));
      } else if (r.actT < 0) {
        const [wn, ws, wc, wl] = br.moods;
        const roll = rnd() * (wn + ws + wc + wl);
        if (roll < wn) ((r.act = "nap"), (r.actT = 14 + rnd() * 12));
        else if (roll < wn + ws) ((r.act = "scratch"), (r.actT = 3 + rnd() * 1.5));
        else if (roll < wn + ws + wc && !r.sky && roomToSpin(r)) ((r.act = "chase"), (r.actT = 4 + rnd() * 3));
        else ((r.act = "stand"), (r.actT = 5 + rnd() * 6));
      }
      // chasing its tail round and round
      if (r.act === "chase") r.yaw += dt * (br.hover ? 3.2 : 2.2);
      else if (r.act === "stand") {
        r.timer -= dt;
        if (r.timer < 0) {
          r.ty = r.hyaw + (rnd() - 0.5) * 1.6;
          r.timer = 5 + rnd() * 5;
        }
        r.yaw = turnTowards(r.yaw, r.ty, 0.4, dt);
      }
    }
    if (walkTo && canWalk) {
      const left = steer(r, dt, 2.4 * Math.max(0.7, S / 2.9), 1.6);
      if (left < 0.6) r.speed = 0;
    } else r.speed += (0 - r.speed) * Math.min(1, dt * 4);
    if (r.heartT >= 0) {
      r.heartT += dt;
      if (r.heartT > 2.2) r.heartT = -1;
    }
    r.y = r.sky ? r.hy + skyBob(r.sky, t) : landY(r.x, r.z);
  };

  const updateManta = (r: Ride, dt: number, t: number, kid: THREE.Vector3, under: boolean, called: boolean) => {
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
    } else if (r.state === COMING || r.state === WAITING) {
      // the visiting manta: glide up beside the diving kid, then wait there at their depth
      const kd = Math.hypot(kid.x - r.x, kid.z - r.z) || 1;
      r.tx = kid.x + ((r.x - kid.x) / kd) * MANTA_CALL.wait;
      r.tz = kid.z + ((r.z - kid.z) / kd) * MANTA_CALL.wait;
      const left = Math.hypot(r.tx - r.x, r.tz - r.z);
      if (r.state === COMING || left > 7) {
        steer(r, dt, r.state === COMING ? 4.2 : 3.4, 1.4);
        if (r.state === COMING && left < 1.2) {
          r.state = WAITING;
          r.timer = MANTA_CALL.stay;
          mantaArrived = true;
        }
      } else {
        // waiting: hang there facing the kid, flapping slowly (it doesn't back away)
        r.speed += (0.15 - r.speed) * Math.min(1, dt * 1.5);
        r.yaw = turnTowards(r.yaw, Math.atan2(kid.x - r.x, kid.z - r.z), 0.6, dt);
        if (kd > 12) r.timer -= dt;
      }
      r.y += (mantaDepth(r.x, r.z, kid.y) + Math.sin(t * 0.8) * 0.25 - r.y) * Math.min(1, dt * 1.2);
      r.pitch = Math.sin(t * 0.8) * 0.05;
      keepGap(r, kid.x, kid.z);
      // the kid left the deep water (or wandered off for good): swim away
      if (!called && r.state === COMING) ((r.state = LEAVING), (r.timer = 6));
      if (r.state === WAITING && (r.timer < 0 || (!called && kd > 25))) ((r.state = LEAVING), (r.timer = 6));
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
      if (r.visit) {
        // comes when a kid has been diving in deep water for a while
        if (!called || diveT < diveNeed) return;
        if (!pickMantaCall(kid.x, kid.y, kid.z, rnd(), mcall)) return;
        r.state = COMING;
        r.x = mcall.sx;
        r.z = mcall.sz;
        r.y = mcall.y;
        r.tx = mcall.x;
        r.tz = mcall.z;
        r.yaw = Math.atan2(kid.x - r.x, kid.z - r.z);
        r.speed = 3.5;
        r.phase = rnd() * Math.PI * 2;
        return;
      }
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
    const other = isW ? dolphin : whale;
    if (r.state === AWAY) {
      if (!atSea) return;
      r.timer -= dt;
      if (r.timer > 0) return;
      // both may come, but never to the same spot (so it's clear who's who): the second one comes
      // up on the other side of the kid
      const busy = other.state === COMING || other.state === WAITING;
      const aim = busy ? Math.atan2(kid.x - other.tx, kid.z - other.tz) : undefined;
      if (!pickSeaCall(kid.x, kid.z, isW ? "whale" : "dolphin", rnd(), rnd(), call, aim) || (busy && Math.hypot(call.x - other.tx, call.z - other.tz) < 16)) {
        r.timer = 1.5;
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
      // (a big whale cruises in quicker while it's still well off, then glides the last stretch)
      const far = Math.hypot(r.tx - r.x, r.tz - r.z);
      const d = steer(r, dt, isW ? Math.min(5, swim + Math.max(0, far - 18) * 0.06) : swim, 1.6);
      r.y += (surf - r.y) * Math.min(1, dt * 0.8);
      keepGap(r, kid.x, kid.z);
      if (d < 1.5) {
        r.state = WAITING;
        r.timer = isW ? 40 : 34;
      }
      if (!atSea) ((r.state = LEAVING), (r.timer = 7));
      return;
    }
    if (r.state === WAITING) {
      const gap = sideGap(r.kind, r.x, r.z, r.yaw, kid.x, kid.z);
      // (no hurry while the kid's on the way)
      if (gap > 12) r.timer -= dt;
      if (gap > (isW ? 26 : 22)) {
        // the kid swam off: follow, to a spot beside them
        const kd = Math.hypot(kid.x - r.x, kid.z - r.z) || 1;
        const want = isW ? 12 : 8;
        r.tx = kid.x + ((r.x - kid.x) / kd) * want;
        r.tz = kid.z + ((r.z - kid.z) / kd) * want;
        steer(r, dt, swim * 0.7, 1.2);
      } else {
        // stay put, broadside to the kid, and let them swim up to its side (it never backs away)
        r.speed += (0 - r.speed) * Math.min(1, dt * 1.5);
        if (gap > 5) {
          const b = Math.atan2(kid.x - r.x, kid.z - r.z);
          const a1 = b + Math.PI / 2;
          const a2 = b - Math.PI / 2;
          r.yaw = turnTowards(r.yaw, Math.abs(angleTo(r.yaw, a1)) < Math.abs(angleTo(r.yaw, a2)) ? a1 : a2, 0.25, dt);
        }
        r.x += Math.sin(r.yaw) * r.speed * dt;
        r.z += Math.cos(r.yaw) * r.speed * dt;
      }
      // only ever nudged aside so it doesn't sit on top of the kid
      keepGap(r, kid.x, kid.z);
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
    // left away from its dock: once the kid's moved off, it sails itself home - turning for the
    // dock, steering round coasts and other boats, and easing into its mooring. (If there's truly no
    // way through, it waits until it's out of sight and is quietly back at the dock.)
    const awayD = Math.hypot(r.x - r.hx, r.z - r.hz);
    if (awayD > 0.05 || Math.abs(angleTo(r.yaw, r.hyaw)) > 0.01) {
      r.timer -= dt;
      const kidD = Math.hypot(kid.x - r.x, kid.z - r.z);
      if (r.timer < 0 && (kidD > 16 || r.homing) && !r.homeBlocked) {
        r.homing = true;
        sailHome(r, dt, awayD, kid);
      } else r.speed = 0;
      if (r.homeBlocked && kidD > CRAFT_SHOW_R * 1.2 && Math.hypot(kid.x - r.hx, kid.z - r.hz) > CRAFT_SHOW_R * 1.2) {
        r.x = r.hx;
        r.z = r.hz;
        r.y = r.hy;
        r.yaw = r.hyaw;
        r.homeBlocked = false;
        r.homing = false;
        r.stuckT = 0;
      }
    } else {
      r.speed = 0;
      r.homing = false;
    }
  };

  /** clear water ahead for a boat (or a surfaced sub) heading yaw from (x, z), `look` m on */
  const clearAhead = (r: Ride, x: number, z: number, yaw: number, look: number) => {
    for (let d = 3; d <= look; d += 3) {
      const px = x + Math.sin(yaw) * d;
      const pz = z + Math.cos(yaw) * d;
      if (isBoat(r.kind) ? boatClearance(r.kind, px, pz, yaw, seaDepth) < 0.3 : seaDepth(px, pz) < 3) return false;
    }
    return true;
  };

  /** one step of a boat sailing itself home (see updateCraft) */
  const sailHome = (r: Ride, dt: number, awayD: number, kid: THREE.Vector3) => {
    if (awayD < 7) {
      // berthing: ease into the mooring, turning to lie as it was
      const k = Math.min(1, dt * 0.45);
      r.x += (r.hx - r.x) * k;
      r.z += (r.hz - r.z) * k;
      r.yaw = turnTowards(r.yaw, r.hyaw, 0.35, dt);
      if (awayD < 0.06) {
        r.x = r.hx;
        r.z = r.hz;
        if (Math.abs(angleTo(r.yaw, r.hyaw)) < 0.02) r.yaw = r.hyaw;
      }
      r.speed = awayD * k / Math.max(dt, 1e-3);
      return;
    }
    // steer for the dock - or the nearest heading either side of it that's clear water
    const want = Math.atan2(r.hx - r.x, r.hz - r.z);
    let aim = want;
    for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0]) {
      if (clearAhead(r, r.x, r.z, want + da, Math.min(18, awayD))) {
        aim = want + da;
        break;
      }
    }
    HELM.yaw = turnTowards(r.yaw, aim, 0.45, dt);
    HELM.speed = r.speed + (Math.min(3.2, 0.6 + awayD * 0.12) - r.speed) * Math.min(1, dt * 0.5);
    HELM.reverse = false;
    HELM.revT = 0;
    // (round the other boats, the sea friends - and the boat the kid's driving)
    homeBodies.length = 0;
    for (let i = 0; i < afloat.length; i++) if (afloat[i] !== afloatOf.get(r)) homeBodies.push(afloat[i]);
    if (drivenOn) homeBodies.push(drivenBody);
    // (and round a kid swimming in its way)
    if (kid.y < WATER_Y + 0.6 && !drivenOn) {
      kidBody.x = kid.x;
      kidBody.z = kid.z;
      homeBodies.push(kidBody);
    }
    const x0 = r.x;
    const z0 = r.z;
    let ev = 0;
    if (isBoat(r.kind)) ev = moveBoat(r.kind, HELM, r, dt, seaDepth, homeBodies);
    else if (seaDepth(r.x + Math.sin(HELM.yaw) * HELM.speed * dt * 4, r.z + Math.cos(HELM.yaw) * HELM.speed * dt * 4) > 3) {
      r.x += Math.sin(HELM.yaw) * HELM.speed * dt;
      r.z += Math.cos(HELM.yaw) * HELM.speed * dt;
    } else ev = BUMP_GROUND;
    r.yaw = HELM.yaw;
    r.speed = HELM.speed;
    // making no headway (a coast in the way): after a while, give up on sailing
    const gain = awayD - Math.hypot(r.x - r.hx, r.z - r.hz);
    r.stuckT = ev === BUMP_GROUND || gain < 0.02 * dt ? (r.stuckT ?? 0) + dt : Math.max(0, (r.stuckT ?? 0) - dt * 0.5);
    if ((r.stuckT ?? 0) > 25) r.homeBlocked = true;
    void x0;
    void z0;
  };

  const placeRig = (r: Ride, dt: number, glow: number) => {
    const rig = r.live!;
    rig.root.visible = true;
    rig.root.position.set(r.x, r.y, r.z);
    rig.root.rotation.set(r.pitch, r.yaw, 0, "YXZ");
    rig.rest?.(r.rest);
    if (r.drv) {
      r.drv.act = r.act;
      rig.drive?.(r.drv);
    }
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
      cam0x = kid.x;
      cam0z = kid.z + 20;
      const camQ = o.camera ? o.camera.quaternion : null;
      const onLand = !o.atSea && !o.under && kid.y > WATER_Y - 0.3;
      // just swum out into deep water: the sea friends come up soon
      if (o.atSea && !wasAtSea) {
        if (dolphin.state === AWAY) dolphin.timer = Math.min(dolphin.timer, SEA_FIRST_CALL.dolphin + rnd() * 3);
        if (whale.state === AWAY) whale.timer = Math.min(whale.timer, SEA_FIRST_CALL.whale + rnd() * 3);
      }
      wasAtSea = o.atSea;
      // diving in deep water: a manta comes gliding up (unless one of the reef mantas is right there)
      const deep = kid.y < WATER_Y - 0.5 && seaDepth(kid.x, kid.z) >= MANTA_CALL.minDepth;
      let reefNear = false;
      for (let i = 0; i < rides.length && !reefNear; i++) {
        const r = rides[i];
        if (r.kind === "manta" && !r.visit && r.state === IDLE && Math.hypot(r.x - kid.x, r.z - kid.z) < 22) reefNear = true;
      }
      if (deep && (o.under || o.diving) && !reefNear) diveT += dt;
      else if (!deep) diveT = Math.max(0, diveT - dt * 2);
      if (visitor.state === COMING && diveT > 0) {
        diveT = 0;
        diveNeed = MANTA_CALL.after[0] + rnd() * (MANTA_CALL.after[1] - MANTA_CALL.after[0]);
      }
      // ── what's afloat (boats bump off it, a boat sailing home steers round it) ──
      afloat.length = 0;
      afloatOf.clear();
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        const sea = r.kind === "whale" || r.kind === "dolphin";
        if (r.state === TAKEN || r.state === AWAY) continue;
        if (!(r.view || (sea && r.y > WATER_Y - 3.5))) continue;
        if (Math.abs(r.x - kid.x) > 140 || Math.abs(r.z - kid.z) > 140) continue;
        const b = bodyPool[afloat.length] ?? (bodyPool[afloat.length] = { x: 0, z: 0, r: 0, hl: 0, yaw: 0 });
        if (isBoat(r.kind)) hullBody(r.kind, r.x, r.z, r.yaw, b);
        else {
          const [hl, hw, off] = MOUNT_BODY[r.kind];
          b.x = r.x + Math.sin(r.yaw) * off;
          b.z = r.z + Math.cos(r.yaw) * off;
          b.r = hw;
          b.hl = Math.max(0, hl - hw);
          b.yaw = r.yaw;
        }
        afloat.push(b);
        afloatOf.set(r, b);
      }
      drivenOn = !!o.driven && isBoat(o.driven.kind);
      if (o.driven && isBoat(o.driven.kind)) hullBody(o.driven.kind, o.driven.x, o.driven.z, o.driven.yaw, drivenBody);
      // ── behaviour ──
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        if (r.state === TAKEN) continue;
        if (r.kind === "unicorn") {
          if (r.state === IDLE) updateUnicorn(r, dt, t, kid, onLand);
        } else if (r.kind === "dragon") {
          if (r.state === IDLE) updateDragon(r, dt, t, kid);
          else if (r.bondT >= 0) ((r.bondT = -1), (bondingId = null));
        } else if (r.kind === "manta") updateManta(r, dt, t, kid, o.under, deep);
        else if (r.kind === "dolphin" || r.kind === "whale") updateSea(r, dt, t, kid, o.atSea);
        else if (r.view) updateCraft(r, dt, t, kid);
      }
      // dragons never stand in each other or in the Roost's things; the Roost's residents stay in its yard
      {
        let n = 0;
        for (let i = 0; i < rides.length; i++) {
          const r = rides[i];
          if (r.kind !== "dragon" || r.state !== IDLE || r.sky) continue;
          if (Math.abs(r.x - kid.x) > 160 || Math.abs(r.z - kid.z) > 160) continue;
          const [hl, hw, off] = mountBody("dragon", r.breed);
          const f = feet[n] ?? (feet[n] = { x: 0, z: 0, yaw: 0, hl, hw, off });
          f.x = r.x;
          f.z = r.z;
          f.yaw = r.yaw;
          f.hl = hl;
          f.hw = hw;
          f.off = off;
          footOf[n] = r;
          pinned[n] = r.bondT >= 0 || !!r.forced;
          n++;
        }
        feet.length = n;
        footOf.length = n;
        pinned.length = n;
        for (let pass = 0; pass < 3; pass++) separateDragons(feet, roostProps, 0.4, pinned);
        for (let i = 0; i < n; i++) {
          const r = footOf[i];
          let x = feet[i].x;
          let z = feet[i].z;
          // (a Roost dragon is kept inside the boulder ring)
          if (Math.hypot(r.hx - DRAGON_ROOST.x, r.hz - DRAGON_ROOST.z) < DRAGON_ROOST.r) {
            const [hl, , off] = mountBody("dragon", r.breed);
            const fx = Math.sin(r.yaw);
            const fz = Math.cos(r.yaw);
            for (let e = 0; e < 2; e++) {
              const along = off + (e ? hl : -hl);
              const ex = x + fx * along - DRAGON_ROOST.x;
              const ez = z + fz * along - DRAGON_ROOST.z;
              const ed = Math.hypot(ex, ez);
              const lim = DRAGON_ROOST.r + 0.6;
              if (ed > lim) {
                x -= (ex / ed) * (ed - lim);
                z -= (ez / ed) * (ed - lim);
              }
            }
          }
          if (x !== r.x || z !== r.z) {
            r.x = x;
            r.z = z;
            r.y = landY(x, z) + (r.id === DRAGON_ROOST.id ? 0.06 : 0);
          }
        }
      }
      // the target's highlight: a ring round its body, pulsing, and an arrow bobbing over its head
      {
        const r = targetId ? byId.get(targetId) : undefined;
        const on = !!r && r.kind === "dragon" && r.state === IDLE;
        hiRing.visible = hiArrow.visible = on;
        if (on && r) {
          const [hl, hw, off] = mountBody("dragon", r.breed);
          const S = mountScale("dragon", r.breed);
          const fx = Math.sin(r.yaw);
          const fz = Math.cos(r.yaw);
          const pulse = 1 + Math.sin(t * 5) * 0.05;
          hiRing.position.set(r.x + fx * off, r.y + 0.12, r.z + fz * off);
          hiRing.rotation.y = r.yaw;
          hiRing.scale.set((hw + 0.9) * pulse, 1, (hl + 0.9) * pulse);
          hiMat.opacity = 0.65 + Math.sin(t * 5) * 0.25;
          const [sy, sz] = dragonSnout(r.breed!);
          hiArrow.position.set(r.x + fx * sz * S * 0.5, r.y + sy * S + 3.2 + Math.abs(Math.sin(t * 3)) * 0.7, r.z + fz * sz * S * 0.5);
          hiArrow.rotation.y = t * 2;
        }
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
        r.want = visible(r) && (r.kind === "dolphin" || r.kind === "whale" || r.visit);
      }
      // parked dragons stay animated a long way off (they breathe, stretch and puff smoke)
      for (let k = 0; k < DRAGON_LIVE; k++) {
        let best: Ride | null = null;
        let bd = DRAGON_LIVE_R * DRAGON_LIVE_R;
        for (let i = 0; i < rides.length; i++) {
          const r = rides[i];
          if (r.want || r.kind !== "dragon" || r.state !== IDLE) continue;
          const d = (r.x - kid.x) ** 2 + ((r.y - kid.y) * 0.5) ** 2 + (r.z - kid.z) ** 2;
          if (d < bd) ((bd = d), (best = r));
        }
        if (!best) break;
        best.want = true;
      }
      for (let k = 0; k < K_LIVE; k++) {
        let best: Ride | null = null;
        let bd = LIVE_R * LIVE_R;
        for (let i = 0; i < rides.length; i++) {
          const r = rides[i];
          if (r.want || !visible(r) || r.kind === "dolphin" || r.kind === "whale" || r.view || r.kind === "dragon") continue;
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
          pools.get(r.vk)!.push(r.live);
          r.live = null;
        }
      }
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        if (r.want && !r.live) {
          const pool = pools.get(r.vk)!;
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
          const im = statue.get(r.vk);
          if (im && im.count < im.instanceMatrix.count) {
            writeInstance(im, im.count, r.x, r.y, r.z, r.yaw, r.pitch);
            im.count++;
          }
        }
        if (r.kind !== "manta" && r.kind !== "dolphin" && r.kind !== "whale" && !r.view && shadows.count < shadows.instanceMatrix.count) {
          const [w, l] = mountShadowSize(r.kind, r.breed);
          E.set(0, r.yaw, 0, "YXZ");
          Q.setFromEuler(E);
          P.set(r.x, r.y + 0.05, r.z);
          S.set(w, 1, l);
          M.compose(P, Q, S);
          shadows.setMatrixAt(shadows.count++, M);
        }
        // a waiting sea friend sparkles and bobs so kids notice
        if ((r.kind === "dolphin" || r.kind === "whale") && (r.state === WAITING || (r.state === COMING && Math.hypot(r.tx - r.x, r.tz - r.z) < 6))) {
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
      // bubbles off the mantas close to a kid under water (the visitor first: it's come for you)
      bubbles.count = 0;
      if (o.under || o.diving) {
        for (let pass = 0; pass < 2; pass++)
          for (let i = 0; i < rides.length; i++) {
            const r = rides[i];
            if (r.kind !== "manta" || !visible(r) || r.visit !== (pass === 0)) continue;
            if (Math.abs(r.x - kid.x) > 45 || Math.abs(r.z - kid.z) > 45) continue;
            const n = Math.min(BUB_N - bubbles.count, low ? 4 : 10);
            for (let b = 0; b < n; b++) {
              const u = (t * 0.32 + b * 0.137 + r.phase) % 1;
              const a = b * 2.4 + r.phase;
              const rr = 1.2 + (b % 3) * 1.3;
              P.set(r.x + Math.sin(a) * rr + Math.sin(t * 2 + b) * 0.15, Math.min(WATER_Y - 0.2, r.y + 0.8 + u * 5), r.z + Math.cos(a) * rr);
              const sc = (0.6 + (b % 4) * 0.25) * (u < 0.1 ? u * 10 : 1);
              S.set(sc, sc, sc);
              Q.identity();
              M.compose(P, Q, S);
              bubbles.setMatrixAt(bubbles.count++, M);
            }
          }
      }
      bubbles.visible = bubbles.count > 0;
      if (bubbles.count) bubbles.instanceMatrix.needsUpdate = true;
      // hearts puffing up from a dragon that's just made friends
      hearts.count = 0;
      for (let i = 0; i < rides.length && !hearts.count; i++) {
        const r = rides[i];
        if (r.heartT < 0) continue;
        const [sy, sz] = dragonSnout(r.breed!);
        const S = mountScale("dragon", r.breed);
        const hx = r.x + Math.sin(r.yaw) * sz * S * 0.9;
        const hz = r.z + Math.cos(r.yaw) * sz * S * 0.9;
        const hy = r.y + sy * S * 0.75 + 1;
        for (let k = 0; k < HEART_N; k++) {
          const u = Math.max(0, r.heartT - k * 0.08) / 2;
          if (u <= 0 || u >= 1) continue;
          const a = k * 2.1;
          P.set(hx + Math.sin(a) * u * 2.2, hy + u * 4 + Math.sin(k) * 0.4, hz + Math.cos(a) * u * 2.2);
          if (camQ) {
            // (truly facing the camera: its rotation, plus a little wobble round the view axis)
            E.set(0, 0, Math.sin(t * 4 + k) * 0.3, "YXZ");
            Q.setFromEuler(E).premultiply(camQ);
          } else {
            E.set(0, Math.atan2(cam0x - P.x, cam0z - P.z), Math.sin(t * 4 + k) * 0.3, "YXZ");
            Q.setFromEuler(E);
          }
          const sc = Math.sin(Math.min(1, u * 1.4) * Math.PI) * (1.5 + (k % 3) * 0.45);
          S3.set(sc, sc, sc);
          M.compose(P, Q, S3);
          hearts.setMatrixAt(hearts.count++, M);
        }
      }
      hearts.visible = hearts.count > 0;
      if (hearts.count) hearts.instanceMatrix.needsUpdate = true;
      // (the roost is only worth drawing on the main island)
      roost.visible = Math.abs(kid.x - DRAGON_ROOST.x) < 260 && Math.abs(kid.z - DRAGON_ROOST.z) < 260 && kid.y > WATER_Y - 3;
      if (roostSign) roostSign.visible = roost.visible;
    },

    nearest(kid, reach = HOP_REACH, facing) {
      let best: Ride | null = null;
      let bd = Infinity;
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        if (r.state !== IDLE && r.state !== WAITING) continue;
        if (r.bondT >= 0) continue;
        if (Math.abs(r.x - kid.x) > 40 || Math.abs(r.z - kid.z) > 40) continue;
        // height: swimmers can be climbed from anywhere alongside, top to belly (a whale's back is
        // high out of the water); land rides from the ground beside them
        const [lo, hi] = r.kind === "whale" ? [-2.4, 2.4] : r.kind === "dolphin" ? [-0.8, 0.9] : r.kind === "manta" ? [-0.8, 1.2] : [0.6, 0.6];
        const ky = kid.y - r.y;
        const dy = (ky > hi ? ky - hi : ky < lo ? lo - ky : 0) * 0.6;
        // measure to the ride's side (a capsule along its heading), not its middle: a whale or a
        // pirate ship is as easy to climb onto as a bike
        const dh = Math.max(0, sideGap(r.kind, r.x, r.z, r.yaw, kid.x, kid.z, r.breed ? mountBody(r.kind, r.breed) : undefined));
        if (dh * dh + dy * dy >= reach * reach) continue;
        // a dragon: the one the kid faces (or walks toward) wins over one merely a step nearer
        const de = r.kind === "dragon" && facing !== undefined ? facedGap(dh, kid.x, kid.z, facing, r.x, r.z) : dh;
        const d = de * de + dy * dy;
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
      near.breed = best.breed;
      return near;
    },

    setBonded(ids) {
      const set = new Set(ids);
      for (const r of rides) if (r.kind === "dragon") r.bonded = set.has(r.id);
    },

    bond(id) {
      const r = byId.get(id);
      if (!r || r.kind !== "dragon" || r.state !== IDLE || bondingId) return false;
      r.bondT = 0;
      bondingId = id;
      return true;
    },

    bonding() {
      return bondingId;
    },

    takeBonded() {
      const b = bondDone;
      bondDone = null;
      return b;
    },

    parkedNear(kid, kind, rad) {
      let best: Ride | null = null;
      let bd = rad * rad;
      for (let i = 0; i < rides.length; i++) {
        const r = rides[i];
        if (r.kind !== kind || r.state !== IDLE) continue;
        const d = (r.x - kid.x) ** 2 + ((r.y - kid.y) * 0.6) ** 2 + (r.z - kid.z) ** 2;
        if (d < bd) ((bd = d), (best = r));
      }
      return best ? best.id : null;
    },

    takeMantaArrival() {
      const a = mantaArrived;
      mantaArrived = false;
      return a;
    },

    pins() {
      return ridePins();
    },

    setTarget(id) {
      targetId = id;
    },

    forceAct(id, act) {
      const r = byId.get(id);
      if (r && r.drv) r.forced = act;
    },

    peek(id) {
      const r = byId.get(id);
      if (!r) return null;
      const states = ["idle", "taken", "away", "coming", "waiting", "leaving"] as const;
      return { state: states[r.state], x: r.x, y: r.y, z: r.z, yaw: r.yaw, act: r.drv ? r.act : undefined, bonded: r.drv ? r.bonded : undefined };
    },

    take(id) {
      const r = byId.get(id);
      if (!r || r.state === TAKEN) return;
      r.state = TAKEN;
      if (bondingId === id) bondingId = null;
      r.bondT = -1;
      if (r.live) {
        r.live.root.visible = false;
        pools.get(r.vk)!.push(r.live);
        r.live = null;
      }
    },

    seaBodies() {
      return afloat;
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
        // (it sets off home a little while after the kid's moved away)
        r.timer = 12;
        r.stuckT = 0;
        r.homeBlocked = false;
        r.homing = false;
        return;
      }
      if (r.kind === "manta" || r.kind === "dolphin" || r.kind === "whale") {
        // swims off, comes back later (mantas to their reef spot, sea friends when you're at sea)
        r.state = LEAVING;
        r.timer = 7;
        if (r.kind !== "manta") r.y = Math.min(y, SEA_ROOT_Y[r.kind]);
        return;
      }
      // stays where you left it (a unicorn makes that its new meadow; a dragon its new home)
      r.state = IDLE;
      r.lounge = false;
      r.act = "stand";
      r.actT = 4;
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
      bubbles.dispose();
      bubGeo.dispose();
      bubMat.dispose();
      hearts.dispose();
      hiRingGeo.dispose();
      hiArrowGeo.dispose();
      hiMat.dispose();
      hiArrowMat.dispose();
      heartGeo.dispose();
      heartMat.dispose();
      roostGeo.dispose();
      if (roostSign) {
        roostSign.material.map?.dispose();
        roostSign.material.dispose();
      }
    },
  };
}

/** the Dragon Roost's perches, trough and banner poles, as round obstacles the dragons keep out of */
export function roostObstacles(): RoundProp[] {
  const R0 = DRAGON_ROOST;
  const at = (du: number, df: number, r: number): RoundProp => ({ x: R0.x + R0.u.x * du + R0.f.x * df, z: R0.z + R0.u.z * du + R0.f.z * df, r });
  const out: RoundProp[] = [];
  // the perches (a post with a long crossbar along f): along the bar
  for (const df of [-6.5, 6.5]) for (const e of [-1.6, 0, 1.6]) out.push(at(-6.8, df + e, 0.55));
  // the trough (3.6 long along f)
  for (const e of [-1.3, 0, 1.3]) out.push(at(1.5, -7.6 + e, 0.8));
  // the banner's poles
  for (const e of [-1.9, 1.9]) out.push(at(4.2, 6.8 + e, 0.35));
  return out;
}

/** the Dragon Roost's pad (draped over the grass), boulder ring and sign post, as one mesh */
function buildRoostGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  const paint = (g: THREE.BufferGeometry, c: string, glow = 0) => {
    const src = g.index ? g.toNonIndexed() : g;
    if (src !== g) g.dispose();
    for (const k of Object.keys(src.attributes)) if (k !== "position" && k !== "normal") src.deleteAttribute(k);
    const n = src.attributes.position.count;
    col.set(c);
    const cc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) ((cc[i * 3] = col.r), (cc[i * 3 + 1] = col.g), (cc[i * 3 + 2] = col.b));
    src.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    src.setAttribute("glow", new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
    parts.push(src);
  };
  const R0 = DRAGON_ROOST;
  // the pad: pale stone rings draped onto the ground
  for (const [r0, r1, c, lift] of [[0, R0.r, "#efe2ff", 0.06], [R0.r - 0.7, R0.r, "#c9a8f0", 0.09], [2.2, 2.8, "#ffd6ef", 0.09]] as const) {
    const g = new THREE.RingGeometry(r0 + 0.001, r1, 40, 3);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = R0.x + pos.getX(i);
      const z = R0.z + pos.getZ(i);
      pos.setXYZ(i, x, groundY(x, z) + lift, z);
    }
    g.computeVertexNormals();
    paint(g, c);
  }
  // a ring of round candy boulders, open towards the trail (the sign's side)
  const toSign = Math.atan2(R0.sign.x - R0.x, R0.sign.z - R0.z);
  const rockCols = ["#b9a4e8", "#f3b4d6", "#a8d8f0", "#f6d58e"];
  for (let i = 0; i < 14; i++) {
    const a = toSign + 0.75 + (i / 13) * (Math.PI * 2 - 1.5);
    const rr = R0.r + 1.1;
    const x = R0.x + Math.sin(a) * rr;
    const z = R0.z + Math.cos(a) * rr;
    const s = 0.55 + ((i * 7) % 5) * 0.12;
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(1.2, 0.8, 1);
    g.rotateY(i * 1.3);
    g.translate(x, groundY(x, z) + s * 0.45, z);
    paint(g, rockCols[i % rockCols.length]);
  }
  // ── the dragon academy: perches, a trough of fish, a banner, warm rocks for napping ──
  const at = (du: number, df: number): [number, number, number] => {
    const x = R0.x + R0.u.x * du + R0.f.x * df;
    const z = R0.z + R0.u.z * du + R0.f.z * df;
    return [x, groundY(x, z), z];
  };
  const faceYaw = Math.atan2(R0.u.x, R0.u.z);
  const part = (g: THREE.BufferGeometry, c: string, p: [number, number, number], dy: number, rotY = faceYaw, glow = 0) => {
    g.rotateY(rotY);
    g.translate(p[0], p[1] + dy, p[2]);
    paint(g, c, glow);
  };
  // two perches at the back: a stout post with a cushioned crossbar
  for (const df of [-6.5, 6.5]) {
    const p = at(-6.8, df);
    part(new THREE.CylinderGeometry(0.28, 0.36, 3.2, 8), "#b07a4e", p, 1.6);
    part(new THREE.BoxGeometry(0.42, 0.42, 3.4), "#c98a58", p, 3.2, faceYaw + Math.PI / 2);
    part(new THREE.CylinderGeometry(0.34, 0.34, 3.3, 10).rotateZ(Math.PI / 2), "#ff9fc8", p, 3.5, faceYaw);
    for (const e of [-1.6, 1.6]) {
      const q: [number, number, number] = [p[0] + R0.f.x * e, p[1], p[2] + R0.f.z * e];
      part(new THREE.SphereGeometry(0.38, 8, 6), "#ffd257", q, 3.5, faceYaw, 1);
    }
  }
  // the feeding trough, piled with fish
  {
    const p = at(1.5, -7.6);
    part(new THREE.BoxGeometry(3.6, 0.7, 1.4), "#a8784e", p, 0.35);
    part(new THREE.BoxGeometry(3.2, 0.12, 1.0), "#6fc8ff", p, 0.68);
    const fishCols = ["#ff9a4a", "#7fd0ff", "#ffd257", "#ff7fae", "#9fe07a"];
    for (let i = 0; i < 7; i++) {
      const fs = new THREE.Shape();
      fs.moveTo(-0.4, 0);
      fs.quadraticCurveTo(-0.05, 0.22, 0.3, 0.02);
      fs.lineTo(0.48, 0.16);
      fs.lineTo(0.44, -0.16);
      fs.lineTo(0.3, -0.02);
      fs.quadraticCurveTo(-0.05, -0.22, -0.4, 0);
      const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.14, bevelEnabled: false, curveSegments: 4 });
      fg.translate(0, 0, -0.07);
      fg.rotateX((i % 3) * 0.5 - 0.5);
      fg.rotateZ(((i * 37) % 7) * 0.12 - 0.3);
      fg.rotateY(1.2 + i * 0.7);
      fg.translate(-1.3 + i * 0.42, 0.1 + (i % 2) * 0.12, ((i * 13) % 5) * 0.12 - 0.25);
      part(fg, fishCols[i % fishCols.length], p, 0.72);
    }
  }
  // the academy banner on two poles, beside the open side
  {
    const p = at(4.2, 6.8);
    for (const e of [-1.9, 1.9]) {
      const q: [number, number, number] = [p[0] + R0.f.x * e, p[1], p[2] + R0.f.z * e];
      part(new THREE.CylinderGeometry(0.1, 0.12, 5.2, 7), "#e8e0f0", q, 2.6);
      part(new THREE.ConeGeometry(0.22, 0.5, 6), "#ffd257", q, 5.4, faceYaw, 1);
    }
    const cloth = new THREE.BoxGeometry(3.6, 1.7, 0.06);
    part(cloth, "#e8475e", p, 4.1);
    // a gold trim and a big round crest (a dragon wing, in the storybook style)
    part(new THREE.BoxGeometry(3.7, 0.16, 0.08), "#ffd257", p, 3.2);
    part(new THREE.BoxGeometry(3.7, 0.16, 0.08), "#ffd257", p, 4.95);
    const crest = new THREE.CylinderGeometry(0.62, 0.62, 0.1, 16).rotateX(Math.PI / 2);
    part(crest, "#fff3d6", [p[0] + R0.u.x * 0.06, p[1], p[2] + R0.u.z * 0.06], 4.1);
    const wing = new THREE.Shape();
    wing.moveTo(0, -0.1);
    wing.lineTo(0.42, 0.34);
    wing.quadraticCurveTo(0.3, 0.05, 0.4, -0.05);
    wing.quadraticCurveTo(0.2, -0.05, 0.25, -0.3);
    wing.lineTo(0, -0.1);
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.04, bevelEnabled: false, curveSegments: 3 });
    wg.scale(1.6, 1.6, 1);
    wg.translate(-0.3, 0, 0);
    part(wg, "#e8475e", [p[0] + R0.u.x * 0.12, p[1], p[2] + R0.u.z * 0.12], 4.05);
  }
  // warm napping rocks round the Puffwing's spot
  {
    // (an oval round its whole body, a step clear of it)
    const [hl, hw, off] = mountBody("dragon", "puffwing");
    const c = at(ROOST_LOUNGE.puffwing[0], ROOST_LOUNGE.puffwing[1] + off);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const du = Math.sin(a) * (hw + 1.1);
      const df = Math.cos(a) * (hl + 1.1);
      const x = c[0] + R0.u.x * du + R0.f.x * df;
      const z = c[2] + R0.u.z * du + R0.f.z * df;
      const g = new THREE.DodecahedronGeometry(0.45 + (i % 3) * 0.12, 0);
      g.scale(1.3, 0.6, 1);
      g.translate(x, groundY(x, z) + 0.2, z);
      paint(g, ["#ffb37a", "#ff9a6a", "#ffc98e"][i % 3], 1);
    }
  }
  // the sign post (the name tag floats on it)
  const sg = R0.sign;
  const post = new THREE.CylinderGeometry(0.12, 0.14, 3.6, 7);
  post.translate(sg.x, sg.y + 1.8, sg.z);
  paint(post, "#a87a52");
  const cap = new THREE.SphereGeometry(0.26, 8, 6);
  cap.translate(sg.x, sg.y + 3.65, sg.z);
  paint(cap, "#ffd257", 1);
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

let pinCache: RidePin[] | null = null;
/** the rides kids can find, for the map: every dragon, the manta reefs, the docks and the unicorn glades */
export function ridePins(): RidePin[] {
  if (pinCache) return pinCache;
  const out: RidePin[] = [];
  for (const s of RIDEABLE_SPOTS) {
    if (s.kind === "dragon" && s.lounge) continue;
    if (s.kind === "dragon") {
      out.push({
        id: `ride:${s.id}`,
        kind: "dragon",
        x: s.x,
        z: s.z,
        emoji: "\u{1F409}",
        label: s.id === "dragon-roost" ? "Dragon Roost" : DRAGON_BREEDS[s.breed ?? "roostwarden"].name,
        sky: !!s.sky,
        how: s.sky ? "A dragon waits up on Buttercup Meadow! Fly up there on another dragon, tap Land, then walk up to it and tap Hop on" : undefined,
      });
    } else if (s.kind === "unicorn") out.push({ id: `ride:${s.id}`, kind: "unicorn", x: s.x, z: s.z, emoji: "\u{1F984}", label: "Unicorns" });
  }
  // one pin per reef garden (where the mantas glide)
  const reefNames: Record<string, string> = { rainbow: "Rainbow Reef", wreck: "Shipwreck Reef", glow: "Glow Reef", ruins: "Sunken Ruins" };
  for (const g of GARDENS) {
    const ms = RIDEABLE_SPOTS.filter((s) => s.kind === "manta" && s.id.startsWith(`manta-${g.kind}-`));
    const p = ms.length ? { x: ms.reduce((a, s) => a + s.x, 0) / ms.length, z: ms.reduce((a, s) => a + s.z, 0) / ms.length } : seaPoint(g.a, 30);
    out.push({
      id: `ride:reef-${g.kind}`,
      kind: "manta",
      x: p.x,
      z: p.z,
      emoji: "\u{1FABD}",
      label: `Mantas: ${reefNames[g.kind] ?? "Reef"}`,
      sea: true,
      how: "Manta rays glide over the reef! Swim out past the beach and hold \u25BC to dive. A manta will come to you anywhere the water is deep",
    });
  }
  for (const d of DOCKS) out.push({ id: `ride:dock-${d.id}`, kind: "dock", x: d.x, z: d.z, emoji: "\u2693", label: d.name, sea: true, how: `${d.name}: boats and submarines to sail! Walk out along the jetty and hop aboard` });
  pinCache = out;
  return out;
}

