// Coralcove Isle, the Tidewing Folk's island far out in Cucaino Park's ocean: the island (ground,
// reef shallows, a raised knee-deep lagoon), its three villages (Shellharbour's market + harbour,
// Stiltwater's stilt houses, Emberglen's huts round the festival fire) and the lighthouse hill,
// and the life on it — ~30 villagers going about their day (./routine.ts: selling, baking,
// fishing, sweeping, gardening, washing, playing chase and skipping, lighting the lanterns at
// dusk, drumming and dancing round the fire at twilight), who wave when the Park kid comes near
// and chat when they're close; crabs, bubblepups and gulls; canoes sailing round the island and
// back; chimney smoke, glowing lanterns, fireflies and a sweeping lighthouse beam at night.
//
// Cheap by construction: ≤ 16 draw calls (one merged mesh for every prop and deck, a handful of
// instanced meshes for the people / critters / boats with variants picked per instance, one fx
// mesh, two point sets), deterministic seeded placement (registry/villageIsland.ts), and an
// allocation-free update.
import * as THREE from "three";
import { fxMaterial, makeUniforms } from "../fantasy/shaders";
import {
  VILLAGE_ISLAND,
  VILLAGE_LAGOON,
  VILLAGE_SEA_R,
  VILLAGE_WATER_Y,
  villageCoastR,
  villageGroundY,
  villageRng,
  villageSeaFloorY,
  villageWork,
} from "../../registry/villageIsland";
import { addFolkInstanceAttrs, folkDepthMaterial, folkMaterial, trisOf } from "./kit";
import { buildPropsGeometry } from "./props";
import { buildGroundGeometry, buildWater, seaWave } from "./terrain";
import { buildFx } from "./fx";
import {
  BODY_APRON,
  BODY_DRESS,
  BODY_ROBE,
  BODY_TUNIC,
  HAND_TOOLS,
  HIP,
  LEG_X,
  LIMB_ARM,
  LIMB_LEG,
  NECK,
  SHOULDER,
  TOOL_IDS,
  WING_GULL,
  WING_ROOT,
  WING_SPRITE,
  buildBody,
  buildCanoe,
  buildCrab,
  buildGull,
  buildHead,
  buildLimb,
  buildPup,
  buildTools,
  buildWing,
} from "./folk";
import { CLOTHS, HAIRS, SKINS, WINGS, makeSim, stepVillage, type Pose, type TalkOut, type VillagerState } from "./routine";

export interface Village {
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number; hour: number }): { talk: { id: string; name: string; line: string } | null };
  dispose(): void;
}

export interface VillageStats {
  drawCalls: number;
  triangles: number;
}

const X0 = VILLAGE_ISLAND.x;
const Z0 = VILLAGE_ISLAND.z;
const TAU = Math.PI * 2;
/** hide the whole island beyond this distance from its centre (past the fog) */
const HIDE_D = 480;

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** the joint angles one pose resolves to (reused) */
interface Rig {
  hipY: number;
  bob: number;
  lean: number;
  roll: number;
  yawAdd: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  aLs: number;
  aLr: number;
  aRs: number;
  aRr: number;
  lLs: number;
  lRs: number;
  lSpread: number;
  flap: number;
}

function resolveRig(p: Pose, v: VillagerState, t: number, r: Rig): void {
  const sd = v.def.seed;
  const ph = (sd % 97) * 0.37;
  r.hipY = HIP;
  r.bob = Math.sin(t * 2 + ph) * 0.012;
  r.lean = v.def.elder ? 0.12 : 0;
  r.roll = 0;
  r.yawAdd = 0;
  r.headYaw = p.look * 0.85 + Math.sin(t * 0.5 + ph) * 0.15;
  r.headPitch = Math.sin(t * 0.7 + ph) * 0.05;
  r.headRoll = Math.sin(t * 0.9 + ph * 2) * 0.06;
  r.aLs = Math.sin(t * 1.3 + ph) * 0.05;
  r.aRs = -r.aLs;
  r.aLr = 0.08;
  r.aRr = 0.08;
  r.lLs = 0;
  r.lRs = 0;
  r.lSpread = 0;
  r.flap = 0.18 + Math.sin(t * 7 + ph) * 0.12;
  const c = p.cycle;
  switch (p.anim) {
    case "walk": {
      const g = p.gait;
      r.lLs = Math.sin(c) * 0.62 * g;
      r.lRs = -r.lLs;
      r.aLs = -Math.sin(c) * 0.5 * g;
      r.aRs = -r.aLs;
      r.bob = Math.abs(Math.cos(c)) * 0.06 * g;
      r.roll = Math.sin(c) * 0.06 * g;
      r.flap = 0.3 + Math.sin(t * 10 + ph) * 0.2;
      break;
    }
    case "run": {
      const g = Math.max(0.6, p.gait);
      r.lLs = Math.sin(c) * 0.95 * g;
      r.lRs = -r.lLs;
      r.aLs = -Math.sin(c) * 0.95 * g;
      r.aRs = -r.aLs;
      r.aLr = r.aRr = 0.3;
      r.bob = Math.abs(Math.cos(c)) * 0.13 * g;
      r.lean = 0.16;
      r.roll = Math.sin(c) * 0.05;
      r.flap = 0.5 + Math.sin(t * 16 + ph) * 0.35;
      break;
    }
    case "sit":
    case "story": {
      r.hipY = 0.58;
      r.lLs = r.lRs = 1.45;
      r.aLs = r.aRs = 0.45;
      r.aLr = r.aRr = -0.1;
      if (p.anim === "story") {
        // telling a tale: big arm gestures, looking round the circle
        r.aRs = 0.9 + Math.sin(t * 2.2 + ph) * 0.5;
        r.aRr = 0.5 + Math.sin(t * 1.7) * 0.4;
        r.aLs = 0.7 + Math.sin(t * 1.9 + 1) * 0.4;
        r.aLr = 0.3 + Math.sin(t * 1.3 + 2) * 0.3;
        r.headYaw += Math.sin(t * 0.6) * 0.5;
      }
      break;
    }
    case "fish":
    case "sit-edge": {
      r.hipY = 0.12;
      r.lLs = 0.55 + Math.sin(t * 2.1 + ph) * 0.25;
      r.lRs = 0.55 - Math.sin(t * 2.1 + ph) * 0.25;
      r.aRs = 1.05 + Math.max(0, Math.sin(t * 0.4 + ph) - 0.85) * 3;
      r.aLs = 0.95;
      r.aLr = -0.25;
      r.aRr = -0.05;
      r.headPitch = 0.12;
      break;
    }
    case "drum":
    case "sit-ground": {
      r.hipY = 0.14;
      r.lLs = r.lRs = 1.45;
      r.lSpread = 0.35;
      const beat = t * 7.5 + ph;
      r.aLs = 0.85 + Math.max(0, Math.sin(beat)) * 0.45;
      r.aRs = 0.85 + Math.max(0, Math.sin(beat + Math.PI)) * 0.45;
      r.aLr = r.aRr = 0.25;
      r.bob = Math.abs(Math.sin(beat * 0.5)) * 0.03;
      r.headPitch = Math.sin(beat) * 0.08;
      r.headRoll = Math.sin(beat * 0.5) * 0.1;
      break;
    }
    case "sweep": {
      r.aLs = r.aRs = 0.6;
      r.aLr = -0.2;
      r.aRr = -0.1;
      r.yawAdd = Math.sin(t * 2.6 + ph) * 0.35;
      r.lean = 0.12;
      r.headPitch = 0.15;
      break;
    }
    case "bake": {
      const k = Math.sin(t * 1.4 + ph);
      r.aLs = r.aRs = 1.3 + k * 0.15;
      r.aLr = r.aRr = -0.15;
      r.lean = 0.08 + Math.max(0, k) * 0.1;
      r.headPitch = 0.1;
      break;
    }
    case "sell": {
      r.aRs = 0.7 + Math.sin(t * 2.3 + ph) * 0.35;
      r.aRr = 0.35;
      r.aLs = 0.5;
      r.headPitch = Math.sin(t * 3 + ph) * 0.08;
      // now and then: holding something up for the shoppers to see
      if (Math.sin(t * 0.35 + ph) > 0.8) r.aRs = 2.2;
      break;
    }
    case "garden": {
      const k = Math.sin(t * 3.2 + ph);
      r.lean = 0.45;
      r.aLs = r.aRs = 0.95 + k * 0.4;
      r.aLr = -0.15;
      r.aRr = -0.1;
      r.bob = -0.04 + Math.abs(k) * 0.02;
      r.headPitch = 0.3;
      break;
    }
    case "wash": {
      const k = Math.sin(t * 1.8 + ph);
      r.aLs = 2.5 + k * 0.2;
      r.aRs = 2.5 - k * 0.2;
      r.aLr = r.aRr = 0.25;
      r.headPitch = -0.3;
      r.bob = Math.max(0, k) * 0.03;
      break;
    }
    case "light": {
      r.aRs = 0.9;
      r.aLs = 0.9;
      r.aLr = -0.3;
      r.headPitch = -0.35;
      break;
    }
    case "flute": {
      r.aLs = r.aRs = 1.35;
      r.aLr = r.aRr = -0.45;
      r.roll = Math.sin(t * 1.5 + ph) * 0.08;
      r.bob = Math.abs(Math.sin(t * 1.5 + ph)) * 0.03;
      r.headRoll = Math.sin(t * 1.5 + ph) * 0.12;
      break;
    }
    case "dance": {
      const k = t * 4.6 + ph;
      r.bob = Math.abs(Math.sin(k)) * 0.24;
      r.aLr = 1.95 + Math.sin(k) * 0.4;
      r.aRr = 1.95 - Math.sin(k) * 0.4;
      r.aLs = r.aRs = 0.35;
      r.lLs = Math.max(0, Math.sin(k)) * 0.5;
      r.lRs = Math.max(0, -Math.sin(k)) * 0.5;
      r.roll = Math.sin(k * 0.5) * 0.14;
      r.headRoll = Math.sin(k * 0.5) * 0.15;
      r.flap = 0.5 + Math.sin(t * 18 + ph) * 0.4;
      break;
    }
    case "turn": {
      const k = t * 6;
      r.aRs = 1.0 + Math.cos(k) * 0.5;
      r.aRr = 0.35 + Math.sin(k) * 0.35;
      r.aLs = 0.3;
      r.bob = Math.abs(Math.sin(k)) * 0.02;
      break;
    }
    case "jump": {
      const k = t * 6;
      const up = Math.max(0, Math.sin(k));
      r.bob = up * 0.42;
      r.lLs = r.lRs = up * 0.5;
      r.aLr = r.aRr = 0.9 + up * 0.5;
      r.flap = 0.4 + up * 0.6;
      break;
    }
    case "talk": {
      r.aRs = 0.8 + Math.sin(t * 3.4 + ph) * 0.3;
      r.aRr = 0.45 + Math.sin(t * 2.3) * 0.2;
      r.headPitch = Math.sin(t * 4.5) * 0.08;
      break;
    }
    case "look": {
      r.aRs = 1.85;
      r.aRr = 0.4;
      r.headPitch = -0.12;
      r.headYaw += Math.sin(t * 0.35 + ph) * 0.5;
      break;
    }
    case "nets": {
      const k = Math.sin(t * 2.6 + ph);
      r.aLs = 1.05 + k * 0.2;
      r.aRs = 1.05 - k * 0.2;
      r.aLr = r.aRr = -0.1;
      r.headPitch = 0.15;
      break;
    }
    default:
      break;
  }
  // waving at the Park kid (the free hand; or the right one)
  if (p.wave > 0.01) {
    const left = p.tool !== "none" && HAND_TOOLS.has(TOOL_IDS[p.tool]);
    // (out to the side and up, so the hand clears the big head)
    const wv = 2.0 + Math.sin(t * 10 + ph) * 0.38;
    if (left) {
      r.aLr += (wv - r.aLr) * p.wave;
      r.aLs += (0.45 - r.aLs) * p.wave;
    } else {
      r.aRr += (wv - r.aRr) * p.wave;
      r.aRs += (0.45 - r.aRs) * p.wave;
    }
    r.headRoll += Math.sin(t * 5 + ph) * 0.08 * p.wave;
  }
}

export function buildVillage(scene: THREE.Scene, opts: { lowQuality?: boolean }): Village {
  const low = !!opts.lowQuality;
  const group = new THREE.Group();
  group.name = "village-island";
  group.position.set(X0, 0, Z0);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), VILLAGE_SEA_R);

  // ── ground + water ──
  const groundGeo = track(buildGroundGeometry(low));
  const groundMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96, metalness: 0 }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = "village-ground";
  ground.receiveShadow = !low;
  group.add(ground);
  const WU = { uTime: { value: 0 }, uGlow: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 150 }, uFogFar: { value: 430 } };
  const water = buildWater(low, WU);
  track(water.geometry);
  track(water.material as THREE.Material);
  group.add(water);

  // ── every prop and deck: one mesh ──
  const PU = makeUniforms();
  PU.uSway.value = 0.1;
  const propGeo = track(buildPropsGeometry(low));
  const propMat = track(fxMaterial(PU, { roughness: 0.85, metalness: 0, flatShading: true }));
  const props = new THREE.Mesh(propGeo, propMat);
  props.name = "village-props";
  props.castShadow = !low;
  props.receiveShadow = !low;
  group.add(props);

  // ── the folk ──
  const sim = makeSim();
  const N = sim.villagers.length;
  const FU = { uGlowK: { value: 0.1 } };
  const folkMat = track(folkMaterial(FU));
  const depthMat = track(folkDepthMaterial());
  const inst = (name: string, geo: THREE.BufferGeometry, count: number, shadow: boolean) => {
    track(geo);
    const m = new THREE.InstancedMesh(geo, folkMat, count);
    m.name = name;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = shadow && !low;
    m.customDepthMaterial = depthMat;
    m.boundingSphere = sphere;
    const a = addFolkInstanceAttrs(m);
    group.add(m);
    return { m, ...a };
  };
  const bodies = inst("village-bodies", buildBody(low), N, true);
  const heads = inst("village-heads", buildHead(low), N, true);
  const limbs = inst("village-limbs", buildLimb(), N * 4, true);
  // (true size, against the 2.26-unit Park kid = a 1.4 m ten-year-old: 1 m = 1.6 units)
  //   beach crab ~0.3 m across its claws (model 1.02)   gull ~0.55 m long (model 0.84)
  //   the bubblepups are seal pups, ~0.8 m (model 1.42 at 0.9: already true)
  const CRAB_K = (1.6 * 0.3) / 1.02;
  const GULL_K = (1.6 * 0.55) / 0.84;
  const nGull = low ? 5 : 8;
  const wings = inst("village-wings", buildWing(), N * 2 + nGull * 2, false);
  const tools = inst("village-tools", buildTools(), N + 1, true);
  const nCrab = low ? 5 : 10;
  const nPup = low ? 3 : 5;
  const nBoat = low ? 3 : 4;
  const crabs = inst("village-crabs", buildCrab(), nCrab, false);
  const pups = inst("village-pups", buildPup(), nPup, false);
  const gulls = inst("village-gulls", buildGull(), nGull, false);
  const boats = inst("village-boats", buildCanoe(), nBoat, true);

  // looks: per villager colours
  const skin = sim.villagers.map((v) => new THREE.Color(SKINS[v.def.skin]));
  const hair = sim.villagers.map((v) => new THREE.Color(HAIRS[v.def.hair]));
  const cloth = sim.villagers.map((v) => new THREE.Color(CLOTHS[v.def.cloth]));
  const wingC = sim.villagers.map((v) => new THREE.Color(WINGS[v.def.wing]));
  const scaleOf = sim.villagers.map((v) => (v.def.kid ? 0.7 : v.def.elder ? 0.92 : 1) * (0.96 + ((v.def.seed * 13) % 9) / 100));
  const bodyVar = sim.villagers.map((v) => [BODY_TUNIC, BODY_DRESS, BODY_ROBE, BODY_APRON][v.def.body] ?? BODY_TUNIC);

  // ── fx ──
  const XU = {
    uTime: { value: 0 },
    uFire: { value: 0.3 },
    uOven: { value: 0.3 },
    uBeam: { value: 0 },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 150 },
    uFogFar: { value: 430 },
  };
  const fx = buildFx(XU, low);
  group.add(fx.flames, fx.glow, fx.smoke);
  disposables.push(fx);

  scene.add(group);

  // ── scratch (allocation-free update) ──
  const rig: Rig = { hipY: 0, bob: 0, lean: 0, roll: 0, yawAdd: 0, headYaw: 0, headPitch: 0, headRoll: 0, aLs: 0, aLr: 0, aRs: 0, aRr: 0, lLs: 0, lRs: 0, lSpread: 0, flap: 0 };
  const mRoot = new THREE.Matrix4();
  const mLocal = new THREE.Matrix4();
  const mOut = new THREE.Matrix4();
  const mArmR = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const vp = new THREE.Vector3();
  const vs = new THREE.Vector3();
  const talk: TalkOut = { id: "", name: "", line: "" };
  const result: { talk: TalkOut | null } = { talk: null };
  const kidL = { x: 0, z: 0 };
  const skipSpot = villageWork("skip");

  const local = (px: number, py: number, pz: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, out: THREE.Matrix4) => {
    e.set(rx, ry, rz, "YXZ");
    return out.compose(vp.set(px, py, pz), q.setFromEuler(e), vs.set(sx, sy, sz));
  };

  const setInst = (o: ReturnType<typeof inst>, i: number, m: THREE.Matrix4, c: THREE.Color, b: THREE.Color | null, sel: number) => {
    o.m.setMatrixAt(i, m);
    o.m.setColorAt(i, c);
    if (b) o.colB.setXYZ(i, b.r, b.g, b.b);
    o.sel.setX(i, sel);
  };

  // critters: homes
  const rnd = villageRng(3131);
  const crabHome = Array.from({ length: nCrab }, (_, i) => {
    const a = (i / nCrab) * TAU + rnd() * 0.4;
    return { a, s: 0.9 + rnd() * 0.05, ph: rnd() * 10, sp: 0.4 + rnd() * 0.5, off: 0, col: new THREE.Color(["#ff6a4a", "#ff8a3c", "#ff5a7a"][i % 3]) };
  });
  const L = VILLAGE_LAGOON;
  const pupHome: { x: number; z: number; r: number; ph: number; follow: number; col: THREE.Color; yaw: number; px: number; pz: number }[] = [
    { x: L.x - X0 - 12, z: L.z - Z0 + 6, r: 2.2 },
    { x: L.x - X0 + 15, z: L.z - Z0 - 6, r: 2.5 },
    { x: -10, z: 13, r: 0, follow: 1 },
    { x: 18, z: 50, r: 2.5 },
    { x: -20, z: 46, r: 2 },
  ]
    .slice(0, nPup)
    .map((p, i) => ({ x: p.x, z: p.z, r: p.r, ph: i * 2.3, follow: (p as { follow?: number }).follow ?? 0, col: new THREE.Color(["#cfd8ff", "#ffd6ea", "#d6fff0", "#fff3c8", "#e6dcff"][i]), yaw: 0, px: p.x, pz: p.z }));
  const pip = sim.villagers.find((v) => v.def.id === "pip") ?? sim.villagers[0];
  const gullC = new THREE.Color("#ffffff");
  const gullWingC = new THREE.Color("#ffffff");
  const perches: [number, number, number][] = [
    [1.9, 2.2, 72.1],
    [10.1, 2.2, 72.1],
    [14.5, (villageGroundY(X0 + 14.5, Z0 + 48.5) ?? 2.4) + 2.1, 48.5],
  ];

  // boats: each has its own mooring by the jetty and sails a loop round the island
  interface BoatPath {
    pts: Float32Array;
    cum: Float32Array;
    len: number;
    phase: number;
    moor: number;
    hull: THREE.Color;
    sail: THREE.Color;
    yaw: number;
  }
  // (alongside the jetty where the water's deep enough; outriggers on the side away from it)
  const moorings: [number, number, number][] = [
    [2.0, 66.5, -1],
    [8.3, 63.5, 1],
    [8.3, 67.5, 1],
    [2.0, 62.5, -1],
  ];
  const BOAT_DWELL = 45;
  const BOAT_PERIOD = 230;
  const boatPaths: BoatPath[] = moorings.slice(0, nBoat).map(([mx, mz, side], i) => {
    const p: number[] = [mx, mz];
    const out1 = [mx + side * 5, mz + 4];
    const out2 = [mx + side * 9, 80];
    p.push(...out1, ...out2);
    const a0 = Math.atan2(out2[0], out2[1]);
    const dir = side < 0 ? 1 : -1; // west moorings go round anticlockwise (on the map), east clockwise
    const steps = 72;
    for (let k = 0; k <= steps; k++) {
      const a = a0 + dir * (k / steps) * TAU;
      const r = villageCoastR(a) * 1.42 + Math.sin(a * 3 + i) * 3;
      p.push(Math.sin(a) * r, Math.cos(a) * r);
    }
    p.push(...out2, ...out1, mx, mz);
    const pts = new Float32Array(p);
    const n = pts.length / 2;
    const cum = new Float32Array(n);
    for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]);
    return {
      pts,
      cum,
      len: cum[n - 1],
      phase: (i / Math.max(1, nBoat)) * BOAT_PERIOD + i * 7,
      moor: side,
      hull: new THREE.Color(["#ff7a6b", "#4fc3a1", "#ffcf4a", "#6a8cff"][i]),
      sail: new THREE.Color(["#ffb070", "#ffe066", "#8fd8ff", "#ff9ed2"][i]),
      yaw: 0,
    };
  });
  const boatAt = (b: BoatPath, t: number, out: { x: number; z: number; tx: number; tz: number; moving: boolean }) => {
    const u = (((t + b.phase) % BOAT_PERIOD) + BOAT_PERIOD) % BOAT_PERIOD;
    const n = b.pts.length / 2;
    if (u < BOAT_DWELL) {
      out.x = b.pts[0];
      out.z = b.pts[1];
      out.tx = 0;
      out.tz = 1;
      out.moving = false;
      return;
    }
    const d = ((u - BOAT_DWELL) / (BOAT_PERIOD - BOAT_DWELL)) * b.len;
    let k = 1;
    while (k < n - 1 && b.cum[k] < d) k++;
    const seg = b.cum[k] - b.cum[k - 1] || 1;
    const f = (d - b.cum[k - 1]) / seg;
    const ax = b.pts[k * 2 - 2];
    const az = b.pts[k * 2 - 1];
    const bx = b.pts[k * 2];
    const bz = b.pts[k * 2 + 1];
    out.x = ax + (bx - ax) * f;
    out.z = az + (bz - az) * f;
    out.tx = (bx - ax) / seg;
    out.tz = (bz - az) / seg;
    out.moving = true;
  };
  const bp = { x: 0, z: 0, tx: 0, tz: 1, moving: false };

  let visible = true;
  const FOG_U = [WU, XU];
  const ALL = [bodies, heads, limbs, wings, tools, crabs, pups, gulls, boats];

  return {
    update(dtIn, t, o) {
      const dt = Math.min(0.1, Math.max(0, dtIn));
      const dKid = Math.hypot(o.kid.x - X0, o.kid.z - Z0);
      visible = dKid < HIDE_D;
      group.visible = visible;
      result.talk = null;
      if (!visible) return result;
      const glow = o.glow;
      const fog = scene.fog as THREE.Fog | null;
      for (let u = 0; u < FOG_U.length; u++) {
        const U = FOG_U[u];
        if (fog) {
          U.uFogColor.value.copy(fog.color);
          U.uFogNear.value = fog.near;
          U.uFogFar.value = fog.far;
        }
        U.uTime.value = t;
      }
      WU.uGlow.value = glow;
      PU.uTime.value = t;
      PU.uGlowK.value = 0.06 + glow * 1.5;
      PU.uPulse.value = glow;
      FU.uGlowK.value = 0.12 + glow * 1.3;

      // ── the villagers' day ──
      const near = dKid < VILLAGE_ISLAND.r + 30;
      const talker = stepVillage(sim, dtIn, t, o.hour, near ? o.kid : null, talk);
      if (talker >= 0) result.talk = talk;

      let nb = 0;
      let nl = 0;
      let nw = 0;
      let nt = 0;
      let baking = false;
      for (let i = 0; i < N; i++) {
        const v = sim.villagers[i];
        const p = v.pose;
        if (p.hidden) continue;
        // (low quality: the extra strollers aren't drawn; everyone with a job or a line still is)
        if (low && v.def.role === "villager") continue;
        if (v.act === "bake" && p.anim === "bake") baking = true;
        resolveRig(p, v, t, rig);
        const s = scaleOf[i];
        // root = the hips
        local(v.x - X0, v.y + (rig.hipY + rig.bob) * s, v.z - Z0, rig.lean, v.yaw + rig.yawAdd, rig.roll, s, s, s, mRoot);
        setInst(bodies, nb, mRoot, cloth[i], skin[i], bodyVar[i]);
        // head
        mOut.multiplyMatrices(mRoot, local(0, NECK, 0, rig.headPitch, rig.headYaw, rig.headRoll, 1, 1, 1, mLocal));
        setInst(heads, nb, mOut, hair[i], skin[i], v.def.hairStyle);
        // arms (left +x is the villager's left: facing +z, left is +x)
        mOut.multiplyMatrices(mRoot, local(SHOULDER.x, SHOULDER.y, 0, -rig.aLs, 0, rig.aLr, 1, 1, 1, mLocal));
        setInst(limbs, nl++, mOut, cloth[i], skin[i], LIMB_ARM);
        mArmR.multiplyMatrices(mRoot, local(-SHOULDER.x, SHOULDER.y, 0, -rig.aRs, 0, -rig.aRr, 1, 1, 1, mLocal));
        setInst(limbs, nl++, mArmR, cloth[i], skin[i], LIMB_ARM);
        // legs
        mOut.multiplyMatrices(mRoot, local(LEG_X, 0, 0, -rig.lLs, 0, rig.lSpread, 1, 1, 1, mLocal));
        setInst(limbs, nl++, mOut, cloth[i], skin[i], LIMB_LEG);
        mOut.multiplyMatrices(mRoot, local(-LEG_X, 0, 0, -rig.lRs, 0, -rig.lSpread, 1, 1, 1, mLocal));
        setInst(limbs, nl++, mOut, cloth[i], skin[i], LIMB_LEG);
        // wings (the left one mirrored)
        for (let sd = 1; sd >= -1; sd -= 2) {
          mOut.multiplyMatrices(mRoot, local(sd * WING_ROOT.x, WING_ROOT.y, WING_ROOT.z, 0.15, sd * (0.55 + rig.flap), sd * 0.2, sd, 1, 1, mLocal));
          setInst(wings, nw++, mOut, wingC[i], null, WING_SPRITE);
        }
        // the tool in hand
        const tool = TOOL_IDS[p.tool];
        if (tool !== TOOL_IDS.none && tool !== TOOL_IDS.rope) {
          if (HAND_TOOLS.has(tool)) mOut.copy(mArmR);
          else if (tool === TOOL_IDS.pole && p.anim === "light") mOut.multiplyMatrices(mRoot, local(0, 0, 0, 0.45, 0, 0, 1, 1, 1, mLocal));
          else mOut.copy(mRoot);
          setInst(tools, nt++, mOut, cloth[i], skin[i], tool);
        }
        if (p.tool === "rope" && p.anim === "turn") {
          // the skipping rope, turning between the two turners
          const hy = (villageGroundY(skipSpot.x, skipSpot.z) ?? v.y) + 0.72;
          // (the rope's x runs along the turners' line: world x; it spins about that line)
          e.set(t * 6, 0, 0, "YXZ");
          mOut.compose(vp.set(skipSpot.x - X0, hy, skipSpot.z - Z0), q.setFromEuler(e), vs.set(1.65, 0.7, 1));
          setInst(tools, nt++, mOut, cloth[i], skin[i], TOOL_IDS.rope);
        }
        nb++;
      }

      // ── crabs scuttle sideways along the beach (and hurry off if you get close) ──
      for (let i = 0; i < nCrab; i++) {
        const c = crabHome[i];
        const go = Math.sin(t * c.sp + c.ph);
        const step = Math.sign(go) * Math.pow(Math.abs(go), 0.5) * 2.2;
        const r0 = villageCoastR(c.a) * c.s;
        let a = c.a + (step + c.off) / r0;
        let x = Math.sin(a) * r0;
        let z = Math.cos(a) * r0;
        const kd = Math.hypot(o.kid.x - X0 - x, o.kid.z - Z0 - z);
        if (kd < 3) c.off += (kd < 1.5 ? 3 : 1.5) * dt * (c.ph > 5 ? 1 : -1);
        else c.off *= 1 - dt * 0.05;
        a = c.a + (step + c.off) / r0;
        x = Math.sin(a) * r0;
        z = Math.cos(a) * r0;
        const y = villageGroundY(x + X0, z + Z0) ?? 1;
        const moving = Math.abs(Math.cos(t * c.sp + c.ph)) > 0.3;
        local(x, y + (moving ? Math.abs(Math.sin(t * 22 + i)) * 0.03 : 0), z, 0, a, moving ? Math.sin(t * 20 + i) * 0.08 : 0, CRAB_K, CRAB_K, CRAB_K, mOut);
        setInst(crabs, i, mOut, c.col, null, -1);
      }

      // ── bubblepups: waddle round their spots, one follows Pip, all turn to look at you ──
      for (let i = 0; i < nPup; i++) {
        const pu = pupHome[i];
        let tx: number;
        let tz: number;
        if (pu.follow && !pip.pose.hidden) {
          tx = pip.x - X0 - Math.sin(pip.yaw) * 1.4;
          tz = pip.z - Z0 - Math.cos(pip.yaw) * 1.4;
        } else {
          const a = t * 0.25 + pu.ph;
          const pause = Math.sin(t * 0.4 + pu.ph) > 0.3;
          tx = pu.x + Math.sin(pause ? pu.ph : a) * pu.r;
          tz = pu.z + Math.cos(pause ? pu.ph : a) * pu.r;
        }
        const dx = tx - pu.px;
        const dz = tz - pu.pz;
        const d = Math.hypot(dx, dz);
        const moving = d > 0.15;
        if (moving) {
          const sp = Math.min(d, (pu.follow ? 2.8 : 0.9) * dt);
          pu.px += (dx / d) * sp;
          pu.pz += (dz / d) * sp;
          pu.yaw += Math.atan2(Math.sin(Math.atan2(dx, dz) - pu.yaw), Math.cos(Math.atan2(dx, dz) - pu.yaw)) * Math.min(1, dt * 5);
        }
        const kx = o.kid.x - X0 - pu.px;
        const kz = o.kid.z - Z0 - pu.pz;
        if (!moving && Math.hypot(kx, kz) < 6) pu.yaw += Math.atan2(Math.sin(Math.atan2(kx, kz) - pu.yaw), Math.cos(Math.atan2(kx, kz) - pu.yaw)) * Math.min(1, dt * 3);
        const hop = moving ? Math.abs(Math.sin(t * 7 + i)) * 0.18 : Math.abs(Math.sin(t * 1.5 + i)) * 0.02;
        const gy = villageGroundY(pu.px + X0, pu.pz + Z0) ?? 1;
        local(pu.px, gy + hop, pu.pz, moving ? -0.1 : 0, pu.yaw, 0, 0.9, 0.9 - hop * 0.3, 0.9, mOut);
        setInst(pups, i, mOut, pu.col, null, -1);
      }

      // ── gulls: most wheel over the harbour and the island, a few sit on posts ──
      for (let i = 0; i < nGull; i++) {
        const perched = i < perches.length && Math.sin(t * 0.05 + i * 2.1) > -0.2;
        let x: number;
        let y: number;
        let z: number;
        let yaw: number;
        let roll = 0;
        let flap: number;
        if (perched) {
          x = perches[i][0];
          y = perches[i][1];
          z = perches[i][2];
          yaw = Math.sin(t * 0.6 + i) * 1.2;
          flap = -1;
        } else {
          const R = 14 + (i % 3) * 9;
          const sp = (0.2 + (i % 4) * 0.04) * (i % 2 ? 1 : -1);
          const a = t * sp + i * 1.9;
          const cx = i % 2 ? 6 : -4;
          const cz = i % 2 ? 58 : 20;
          x = cx + Math.sin(a) * R;
          z = cz + Math.cos(a) * R;
          y = 10 + (i % 3) * 3 + Math.sin(t * 0.3 + i) * 1.5;
          yaw = a + (sp > 0 ? Math.PI / 2 : -Math.PI / 2);
          roll = sp > 0 ? -0.35 : 0.35;
          const glide = Math.sin(t * 0.5 + i) > 0.2;
          flap = glide ? 0.12 : Math.sin(t * 11 + i * 3) * 0.6;
        }
        local(x, y, z, 0, yaw, roll, GULL_K, GULL_K, GULL_K, mRoot);
        setInst(gulls, i, mRoot, gullC, null, -1);
        for (let sd = 1; sd >= -1; sd -= 2) {
          if (flap < -0.5) mOut.multiplyMatrices(mRoot, local(sd * 0.08, 0.08, -0.05, 0, sd * 1.35, sd * 0.2, sd * 0.45, 1, 0.8, mLocal));
          else mOut.multiplyMatrices(mRoot, local(sd * 0.1, 0.06, 0, 0, 0, sd * flap, sd, 1, 1, mLocal));
          setInst(wings, nw++, mOut, gullWingC, null, WING_GULL);
        }
      }

      // ── canoes: moored by the jetty, then off round the island and home again ──
      for (let i = 0; i < nBoat; i++) {
        const b = boatPaths[i];
        boatAt(b, t, bp);
        const wx = bp.x + X0;
        const wz = bp.z + Z0;
        // (riding the swell, but never sinking into the sand in a trough)
        const wy = Math.max(VILLAGE_WATER_Y + seaWave(wx, wz, t), (villageSeaFloorY(wx, wz) ?? -30) + 0.3);
        const want = bp.moving ? Math.atan2(bp.tx, bp.tz) : 0;
        b.yaw += Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw)) * Math.min(1, dt * 1.2);
        const pitch = (seaWave(wx + Math.sin(b.yaw) * 1.5, wz + Math.cos(b.yaw) * 1.5, t) - seaWave(wx - Math.sin(b.yaw) * 1.5, wz - Math.cos(b.yaw) * 1.5, t)) / 3;
        const rollB = (seaWave(wx + Math.cos(b.yaw), wz - Math.sin(b.yaw), t) - seaWave(wx - Math.cos(b.yaw), wz + Math.sin(b.yaw), t)) / 2;
        local(bp.x, wy - 0.05, bp.z, -pitch, b.yaw, rollB + (bp.moving ? 0.05 : 0), 1, 1, 1, mOut);
        setInst(boats, i, mOut, b.hull, b.sail, -1);
      }

      bodies.m.count = nb;
      heads.m.count = nb;
      limbs.m.count = nl;
      wings.m.count = nw;
      tools.m.count = nt;
      for (let k = 0; k < ALL.length; k++) {
        const o2 = ALL[k];
        o2.m.instanceMatrix.needsUpdate = true;
        if (o2.m.instanceColor) o2.m.instanceColor.needsUpdate = true;
        o2.colB.needsUpdate = true;
        o2.sel.needsUpdate = true;
      }

      // ── fire, light, smoke ──
      const fire = 0.2 + 0.8 * smooth(0.25, 0.75, glow);
      XU.uFire.value = fire;
      XU.uOven.value = baking ? 1 : 0.3;
      XU.uBeam.value = smooth(0.35, 0.85, glow);
      fx.update(dt, t, { glow, fire, oven: XU.uOven.value, lit: sim.lit, lighting: 0 });
      return result;
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
      for (const o2 of ALL) o2.m.dispose();
    },
  };
}

/** draw calls and triangles the village adds (for the budget test / the harness) */
export function villageMeshStats(group: THREE.Object3D): VillageStats {
  let drawCalls = 0;
  let triangles = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as THREE.Mesh).isMesh && !(o as THREE.Points).isPoints) return;
    drawCalls++;
    const g = m.geometry as THREE.BufferGeometry;
    if ((o as THREE.Points).isPoints) return;
    const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    triangles += trisOf(g) * n;
  });
  return { drawCalls, triangles };
}
