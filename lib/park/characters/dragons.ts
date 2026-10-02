// Cucaino Park's dragon breeds: five original, candy-bright dragons, each with its own shape,
// colours and temper. They stand and walk on all four legs like big friendly cats, with big eyes
// (pupils go wide when they're happy), ears that perk up, and a mouth that grins. Parked, they nap,
// scratch, chase their tails, trot over to say hello, nuzzle and wiggle; in the air they beat their
// wings with real downstrokes and glide with them held out.
//
// Built from the same parts kit as every mount (lib/park/characters/mounts): rigid bones baked into
// one skinned mesh with vertex colours. `drive()` is how the world tells a dragon what to do.
import * as THREE from "three";
import type { CraftKit } from "./boats";

type V3 = [number, number, number];

export type DragonBreed = "skyfin" | "puffwing" | "sparkspike" | "zippit" | "roostwarden";
export const DRAGON_BREED_IDS: DragonBreed[] = ["skyfin", "puffwing", "sparkspike", "zippit", "roostwarden"];

interface Shape {
  /** shoulder height (chibi units: 1 = 2.9 world units at size 1) */
  H: number;
  /** torso half width / height / length */
  bw: number;
  bh: number;
  bl: number;
  neckL: number;
  neckR: number;
  /** neck angle above horizontal */
  rise: number;
  headR: number;
  snoutL: number;
  eyeR: number;
  span: number;
  chord: number;
  tailL: number;
  tailR: number;
  tip: "fins" | "tuft" | "spikes" | "heart" | "club";
  horns: "swept" | "nubs" | "spiky" | "tiny" | "curled";
  ears: "fins" | "round" | "frills" | "leaf" | "small";
  back: "fins" | "bumps" | "spikes" | "none" | "plates";
}

export interface BreedDef {
  id: DragonBreed;
  name: string;
  /** the one-line personality kids read */
  line: string;
  /** size factor on the dragon's MOUNT_SCALE */
  size: number;
  /** flying speed factor */
  speed: number;
  /** how it likes to pass the time when parked (weights: nap, scratch, chase, look about) */
  moods: [number, number, number, number];
  /** hovers about instead of standing still (hummingbird-quick) */
  hover?: boolean;
  colors: { hide: string; top: string; belly: string; spike: string; horn: string; memb: string; iris: string };
  shape: Shape;
}

export const DRAGON_BREEDS: Record<DragonBreed, BreedDef> = {
  skyfin: {
    id: "skyfin",
    name: "Skyfin",
    line: "Sleek and super-fast: loves racing the wind over the waves.",
    size: 1,
    speed: 1.25,
    moods: [1, 1, 2, 3],
    colors: { hide: "#2fb7c9", top: "#1f86b0", belly: "#e9fff6", spike: "#ff8a7a", horn: "#fff3d6", memb: "#8fe8e4", iris: "#ffb347" },
    shape: { H: 0.86, bw: 0.42, bh: 0.36, bl: 1.05, neckL: 0.95, neckR: 0.24, rise: 0.62, headR: 0.27, snoutL: 0.4, eyeR: 0.1, span: 3.4, chord: 1.6, tailL: 2.3, tailR: 0.24, tip: "fins", horns: "swept", ears: "fins", back: "fins" },
  },
  puffwing: {
    id: "puffwing",
    name: "Puffwing",
    line: "Round and gentle: loves warm rocks and long naps.",
    size: 0.82,
    speed: 0.85,
    moods: [4, 1, 0.5, 1],
    colors: { hide: "#f6b0cc", top: "#e889b4", belly: "#fff2c9", spike: "#ffe08a", horn: "#fff6e0", memb: "#ffd6e8", iris: "#6fc0ff" },
    shape: { H: 0.74, bw: 0.64, bh: 0.56, bl: 0.86, neckL: 0.6, neckR: 0.3, rise: 0.75, headR: 0.33, snoutL: 0.36, eyeR: 0.12, span: 2.2, chord: 1.25, tailL: 1.4, tailR: 0.3, tip: "tuft", horns: "nubs", ears: "frills", back: "bumps" },
  },
  sparkspike: {
    id: "sparkspike",
    name: "Sparkspike",
    line: "A two-tone show-off who never says no to a trick.",
    size: 0.92,
    speed: 1.1,
    moods: [0.5, 1.5, 2.5, 2],
    colors: { hide: "#ff8a2a", top: "#7a46d6", belly: "#ffe6a0", spike: "#ffe14a", horn: "#fff3d6", memb: "#c09aff", iris: "#4fe0a0" },
    shape: { H: 0.86, bw: 0.48, bh: 0.42, bl: 1.0, neckL: 0.85, neckR: 0.26, rise: 0.68, headR: 0.29, snoutL: 0.34, eyeR: 0.1, span: 3.0, chord: 1.5, tailL: 2.0, tailR: 0.26, tip: "spikes", horns: "spiky", ears: "frills", back: "spikes" },
  },
  zippit: {
    id: "zippit",
    name: "Zippit",
    line: "Tiny, hummingbird-quick and can't sit still for a second.",
    size: 0.6,
    speed: 1.35,
    moods: [0.3, 1, 3, 2],
    hover: true,
    colors: { hide: "#9fe25a", top: "#4fbf4a", belly: "#fff7b0", spike: "#ff7ac8", horn: "#fff6e0", memb: "#c8f4ff", iris: "#ff5f9e" },
    shape: { H: 0.78, bw: 0.42, bh: 0.4, bl: 0.72, neckL: 0.5, neckR: 0.22, rise: 0.8, headR: 0.36, snoutL: 0.2, eyeR: 0.14, span: 2.3, chord: 1.0, tailL: 1.7, tailR: 0.18, tip: "heart", horns: "tiny", ears: "leaf", back: "none" },
  },
  roostwarden: {
    id: "roostwarden",
    name: "Roostwarden",
    line: "The big horned guardian who looks after the Dragon Roost.",
    size: 1.08,
    speed: 1,
    moods: [1.5, 1, 0.5, 3],
    colors: { hide: "#cf3a52", top: "#8f2444", belly: "#ffd98a", spike: "#ffcf4a", horn: "#fff1c9", memb: "#ffab7a", iris: "#ffd257" },
    shape: { H: 0.98, bw: 0.58, bh: 0.5, bl: 1.12, neckL: 1.0, neckR: 0.3, rise: 0.6, headR: 0.33, snoutL: 0.42, eyeR: 0.1, span: 3.3, chord: 1.8, tailL: 2.1, tailR: 0.3, tip: "club", horns: "curled", ears: "small", back: "plates" },
  },
};

/** what a dragon is up to (the world picks; the rig animates it) */
export type DragonAct = "stand" | "nap" | "scratch" | "chase" | "walk" | "nuzzle" | "wiggle" | "shy" | "sniff" | "happy";

export interface DragonDrive {
  mode: "park" | "fly";
  act: DragonAct;
  /** where the kid is, as a head turn (radians, + = to its left) */
  look: number;
  /** flying: 0 = gliding with wings held out .. 1 = beating hard */
  flap: number;
  /** flying: 0..1 diving (wings swept back) */
  dive: number;
}

/**
 * Where a dragon's snout is (chibi units, before MOUNT_SCALE x size): [up, forward] from its
 * feet. (For hearts, smoke and fire puffs.)
 */
export function dragonSnout(breed: DragonBreed): [number, number] {
  const s = DRAGON_BREEDS[breed].shape;
  const ny = s.H + s.bh * 0.55 + Math.sin(s.rise) * s.neckL;
  const nz = s.bl * 0.85 + Math.cos(s.rise) * s.neckL;
  return [ny + s.headR * 0.1, nz + s.headR * 0.4 + s.snoutL + 0.1];
}

/** the footprint capsule (chibi units, before scaling): half length, half width, offset forward */
export function dragonBody(breed: DragonBreed): [number, number, number] {
  const s = DRAGON_BREEDS[breed].shape;
  const front = dragonSnout(breed)[1];
  const back = -s.bl * 1.05;
  return [(front - back) / 2, Math.max(s.bw * 1.05, 0.5), (front + back) / 2];
}

/**
 * The poses that have to reach something (tuned against the rig in dragons.test.ts):
 * - scratch: sitting back on its haunches, the neck curled round to the right and the head tipped
 *   so its right ear meets the right hind foot, which lifts forward and scratches away (a dog's ear
 *   scratch); the other hind leg folds under, the front legs prop it up
 * - nap: lying flat, front paws stretched out ahead, hind legs folded forward along the flanks (on
 *   the grass, never through it)
 */
export const SCRATCH_POSE = { lower: 0.28, pitch: -0.25, neckX: 0.65, neckY: 2.35, neckZ: 0.05, headX: 0.1, headY: 0.3, headZ: -0.7, hindRx: -1.98, hindRz: 0.08, otherRx: -1.2, frontRx: 0.35, tailX: 0.4 };
/** per-breed tweaks to the scratch (a short-legged Puffwing has to bend further) */
export const SCRATCH_TUNE: Record<DragonBreed, Partial<typeof SCRATCH_POSE>> = {
  skyfin: { pitch: 0, lower: 0, neckY: 2.25, neckX: 0.75, headZ: -0.25, hindRx: -2, hindRz: 0.2, frontRx: 0.75, neckZ: -0.2, headX: 0.08, headY: -0.25, otherRx: -0.9 },
  puffwing: { pitch: -0.2, lower: 0, neckY: 1.6, neckX: 0.75, headZ: -0.63, hindRx: -2.12, hindRz: 0.45, frontRx: 0.85, neckZ: -0.15, headX: -0.58, headY: -0.38, otherRx: -1.2 },
  sparkspike: { pitch: -0.2, lower: 0.1, neckY: 2.2, neckX: 0.75, headZ: -0.62, hindRx: -2.02, hindRz: 0.22, frontRx: 0.55, neckZ: -0.03, headX: -0.58, headY: -0.08, otherRx: -0.9 },
  zippit: { pitch: -0.2, lower: 0.2, neckY: 1.52, neckX: 0.65, headZ: -0.5, hindRx: -2.25, hindRz: 0.23, frontRx: 1.05, neckZ: -0.2, headX: -0.13, headY: -0.13, otherRx: -1.2 },
  roostwarden: { pitch: -0.2, lower: 0.1, neckY: 2.18, neckX: 0.7, headZ: -0.12, hindRx: -2.2, hindRz: 0.25, frontRx: 0.55, neckZ: -0.15, headX: 0.08, headY: -0.38, otherRx: -0.9 },
};
export const NAP_POSE = { frontRx: -1.5, hindRx: -1.4, hindRz: 0.3, neckX: 0.45, headX: 0.35 };
/** how high the belly stays off the grass lying down, per breed (so the folded legs rest on it, not through it) */
export const NAP_DROP: Record<DragonBreed, number> = { skyfin: 0.14, puffwing: 0.06, sparkspike: 0.11, zippit: 0.1, roostwarden: 0.1 };

export interface DragonParts {
  seat: V3;
  pet: V3;
  anim: (t: number, dt: number, speed: number, airborne: boolean) => void;
  drive: (d: DragonDrive) => void;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function buildDragonParts(breed: DragonBreed, k: CraftKit, opts: { main?: string } = {}): DragonParts {
  const B = DRAGON_BREEDS[breed];
  const s = B.shape;
  const { body, mesh, bone, tube, flat } = k;
  const hide = opts.main ?? B.colors.hide;
  const top = opts.main ? "#" + new THREE.Color(opts.main).multiplyScalar(0.72).getHexString() : B.colors.top;
  const { belly, spike, horn, memb, iris } = B.colors;
  const claw = "#fff8ea";
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, col: string, x = 0, y = 0, z = 0, glow = false) => {
    const m = mesh(g, col, glow);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const ball = (parent: THREE.Object3D, r: number, col: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 10) => {
    const m = add(parent, new THREE.SphereGeometry(r, seg, Math.max(5, seg - 3)), col, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  /** a thin upright plate spike */
  const plate = (parent: THREE.Object3D, x: number, y: number, z: number, h: number, lean: number, col = spike, w = 0.42) => {
    const g = new THREE.ConeGeometry(h * w, h, 4);
    g.scale(0.3, 1, 1);
    const m = add(parent, g, col, x, y + h * 0.4, z);
    m.rotation.x = lean;
    return m;
  };
  const cone = (parent: THREE.Object3D, r: number, h: number, col: string, x: number, y: number, z: number, rx: number, rz = 0, seg = 6) => {
    const m = add(parent, new THREE.ConeGeometry(r, h, seg), col, x, y, z);
    m.rotation.set(rx, 0, rz);
    return m;
  };

  /** a smooth tapered tube along a curve through `pts` (radius r0 at the start .. r1 at the end,
   *  easing), with round caps; no segment steps. `rings` along it, `radial` round it. */
  const taper = (parent: THREE.Object3D, pts: V3[], r0: number, r1: number, col: string, rings = 8, radial = 12, capA = true, capB = true) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), false, "centripetal");
    const fr = curve.computeFrenetFrames(rings, false);
    const pos: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
      const u = i / rings;
      curve.getPointAt(u, c);
      const r = r0 + (r1 - r0) * (u * u * (3 - 2 * u) * 0.5 + u * 0.5);
      const N = fr.normals[i];
      const Bn = fr.binormals[i];
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        pos.push(c.x + r * (ca * N.x + sa * Bn.x), c.y + r * (ca * N.y + sa * Bn.y), c.z + r * (ca * N.z + sa * Bn.z));
      }
    }
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    add(parent, g, col);
    // round caps (exactly the tube's radius: the joint to the next segment is seamless)
    if (capA) ball(parent, r0, col, ...pts[0], 1, 1, 1, radial);
    if (capB) ball(parent, r1, col, ...pts[pts.length - 1], 1, 1, 1, radial);
    return g;
  };

  const H = s.H;
  // ── body: chest, barrel and hips, level like a big cat's; top colour along the back ──
  const torso = body;
  ball(torso, 1, hide, 0, H, 0, s.bw, s.bh, s.bl, 16);
  ball(torso, s.bw * 1.02, hide, 0, H + s.bh * 0.08, s.bl * 0.72, 1, s.bh / s.bw * 1.05, 1.05, 12);
  ball(torso, s.bw * 0.95, hide, 0, H - s.bh * 0.02, -s.bl * 0.75, 1, s.bh / s.bw * 1.02, 1.1, 12);
  // the darker saddle-back (two-tone)
  {
    const g = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.32);
    add(torso, g, top, 0, H + 0.005, 0).scale.set(s.bw * 1.03, s.bh * 1.04, s.bl * 1.02);
  }
  // the scaly belly band
  {
    const g = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4);
    add(torso, g, belly, 0, H, 0).scale.set(s.bw * 1.02, s.bh * 1.03, s.bl * 1.03);
    for (let i = 0; i < 5; i++) {
      const z = -s.bl * 0.7 + (i / 4) * s.bl * 1.4;
      const kk = Math.sqrt(Math.max(0.1, 1 - (z / (s.bl * 1.03)) ** 2));
      const tg = new THREE.TorusGeometry(1, 0.03, 3, 8, Math.PI * 0.55);
      tg.rotateZ(Math.PI * 1.225);
      add(torso, tg, B.colors.spike === "#ffe08a" ? "#f4c56a" : "#f2b45a", 0, H, z).scale.set(s.bw * 1.03 * kk, s.bh * 1.04 * kk, 1);
    }
  }
  // back decoration (behind the saddle)
  const backZ0 = -s.bl * 0.35;
  for (let i = 0; i < 4; i++) {
    const z = backZ0 - i * s.bl * 0.2;
    const y = H + s.bh * Math.sqrt(Math.max(0, 1 - (z / s.bl) ** 2)) - 0.03;
    if (s.back === "spikes") plate(torso, 0, y, z, 0.3 - i * 0.03, -0.45);
    else if (s.back === "plates") plate(torso, 0, y, z, 0.26 - i * 0.02, -0.3, spike, 0.7);
    else if (s.back === "bumps") ball(torso, 0.09, spike, 0, y + 0.02, z, 1, 0.8, 1, 7);
    else if (s.back === "fins") {
      // a tall swept sail-fin, thick enough to read from any side
      const h = 0.46 - i * 0.07;
      const f = add(torso, flat([[0, 0], [0.62 * h / 0.46, 0], [0.5 * h / 0.46, 0.18 * h / 0.46], [0.08, h]], 0.07, 0.015, 1), spike, 0, y - 0.04, z + 0.36);
      f.rotation.set(0, Math.PI / 2, Math.PI / 2);
    }
  }
  if (s.back === "spikes")
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) cone(torso, 0.05, 0.18, spike, side * s.bw * 0.95, H + 0.05, -s.bl * 0.3 + i * 0.3, 0, -side * 1.3, 4);

  // ── four legs (bones at the shoulders and hips: the stride and the folds) ──
  const legs: THREE.Bone[] = [];
  for (const [side, front] of [[-1, 1], [1, 1], [-1, 0], [1, 0]] as const) {
    const lx = side * s.bw * 0.72;
    const lz = front ? s.bl * 0.6 : -s.bl * 0.62;
    const ly = H - s.bh * 0.25;
    const leg = bone(torso, lx, ly, lz);
    const lr = (front ? 0.13 : 0.16) * (s.bw / 0.45) ** 0.5;
    ball(leg, lr * 1.9, hide, 0, 0, 0, 0.8, 1, 1.1, 9);
    const knee: V3 = front ? [side * 0.02, -ly * 0.5, -0.04] : [side * 0.02, -ly * 0.48, 0.1];
    const ankle: V3 = front ? [side * 0.03, -ly + 0.12, 0.04] : [side * 0.03, -ly + 0.14, -0.08];
    tube(leg, [0, -0.02, 0], knee, lr * 1.05, hide, 8);
    ball(leg, lr * 1.08, hide, ...knee, 1, 1, 1, 8);
    tube(leg, knee, ankle, lr * 0.92, hide, 8);
    ball(leg, lr * 1.25, hide, ankle[0], -ly + 0.09, ankle[2] + 0.07, 1.1, 0.6, 1.5, 8);
    for (let c = -1; c <= 1; c++) cone(leg, 0.035, 0.11, claw, ankle[0] + c * lr * 0.55, -ly + 0.06, ankle[2] + 0.07 + lr * 1.5, Math.PI / 2 + 0.3, 0, 5);
    leg.name = `leg${legs.length}`;
    legs.push(leg);
  }

  // ── a neck reaching forward and up, and the head ──
  const neck = bone(torso, 0, H + s.bh * 0.55, s.bl * 0.85);
  neck.name = "neck";
  neck.rotation.order = "YXZ";
  // (an S: up out of the chest, then curving forward to the head)
  const nk = (u: number): V3 => [0, Math.sin(s.rise) * s.neckL * u + Math.sin(u * Math.PI) * 0.06, Math.cos(s.rise) * s.neckL * u - Math.sin(u * Math.PI) * 0.05 + u * u * 0.06];
  const neckPts: V3[] = [nk(0), nk(0.33), nk(0.66), nk(1)];
  taper(neck, [[0, -0.12, -0.12], ...neckPts], s.neckR * 1.45, s.neckR * 0.8, hide, 9, 12, false, true);
  // the throat stripe, belly coloured, all the way up
  taper(neck, neckPts.map((q, i): V3 => [0, q[1] - s.neckR * (0.5 - i * 0.04), q[2] + s.neckR * (0.42 - i * 0.05)]), s.neckR * 0.95, s.neckR * 0.5, belly, 6, 8, false, false);
  // ridge along the back of the neck
  for (let i = 1; i <= 3; i++) {
    const p = nk(i / 3.6);
    const r = s.neckR * (1.3 - i * 0.12);
    if (s.back === "spikes" || s.back === "plates") plate(neck, 0, p[1] + r * 0.72, p[2] - r * 0.45, 0.18, -0.9);
    else if (s.back === "bumps") ball(neck, 0.08, spike, 0, p[1] + r * 0.85, p[2] - r * 0.35, 1, 0.8, 1, 6);
    else if (s.back === "fins") {
      const h = 0.3 - i * 0.04;
      const f = add(neck, flat([[0, 0], [h * 1.3, 0], [h * 1.05, h * 0.4], [0.05, h]], 0.06, 0.012, 1), spike, 0, p[1] + r * 0.62, p[2] + 0.12);
      f.rotation.set(-0.35, Math.PI / 2, Math.PI / 2);
    }
  }
  const prev: V3 = nk(1);
  const head = bone(neck, ...prev);
  head.name = "head";
  const hr = s.headR * 1.18;
  ball(head, hr, hide, 0, 0, 0, 1, 0.88, 1.02, 12);
  add(head, new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.35), top, 0, 0.005, -0.01).scale.set(hr * 1.02, hr * 0.9, hr * 1.04);
  // the snout (upper jaw) with a big grin, nostrils on top
  // (a long, tapering muzzle: wide at the cheeks, narrower at the nose - a dragon's, not a pig's)
  const snoutG = taper(head, [[0, -hr * 0.12, hr * 0.2], [0, -hr * 0.1, hr * 0.45 + s.snoutL * 0.5], [0, -hr * 0.14, hr * 0.45 + s.snoutL + hr * 0.1]], hr * 0.66, hr * 0.44, hide, 6, 12, false, true);
  void snoutG;
  const tipZ = hr * 0.45 + s.snoutL + hr * 0.5;
  for (const side of [-1, 1]) {
    // nostril ridges on top near the tip, flaring back
    const nr = ball(head, hr * 0.13, top, side * hr * 0.2, hr * 0.17, tipZ - hr * 0.3, 0.8, 0.55, 1.5, 7);
    nr.rotation.y = side * 0.3;
    ball(head, hr * 0.07, "#3a1f2e", side * hr * 0.21, hr * 0.2, tipZ - hr * 0.16, 1, 0.6, 0.8, 5);
    // a brow ridge over each eye, angled down toward the snout
    const br = ball(head, hr * 0.2, top, side * hr * 0.5, hr * 0.56, hr * 0.48, 1.25, 0.42, 0.9, 7);
    br.rotation.set(0.25, side * 0.45, -side * 0.35);
  }
  // the lower jaw on its own bone (it opens into a grin)
  const jaw = bone(head, 0, -hr * 0.35, hr * 0.15);
  {
    const lj = add(jaw, new THREE.CapsuleGeometry(hr * 0.5, s.snoutL * 0.9, 4, 8), belly, 0, -0.02, hr * 0.3 + s.snoutL * 0.45);
    lj.rotation.x = Math.PI / 2;
    lj.scale.set(1, 1, 0.55);
    ball(jaw, hr * 0.36, "#ff7f9e", 0, hr * 0.06, hr * 0.3 + s.snoutL * 0.5, 1, 0.4, 1.3, 7);
  }
  // a smile line curling up at the corners
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10 - 0.5;
      const zz = tipZ - hr * 0.35 - Math.abs(u) * s.snoutL * 1.4;
      pts.push(new THREE.Vector3(u * hr * 1.25, -hr * 0.32 + (u * 2) ** 2 * hr * 0.24, zz));
    }
    add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.018, 3), "#3a1f2e");
  }
  for (const side of [-1, 1]) cone(head, 0.022, 0.07, claw, side * hr * 0.3, -hr * 0.4, tipZ - hr * 0.5, Math.PI, 0, 4);
  // big eyes: white, coloured iris, a pupil that widens, a shine
  const eyesB: THREE.Bone[] = [];
  const pupils: THREE.Bone[] = [];
  const er = s.eyeR * 1.25;
  for (const side of [-1, 1]) {
    const e = bone(head, side * hr * 0.55, hr * 0.28, hr * 0.5);
    e.rotation.y = side * 0.5;
    ball(e, er, "#ffffff", 0, 0, 0, 1, 1, 0.8, 10);
    ball(e, er * 0.7, iris, 0, 0, er * 0.42, 1, 1, 0.5, 10);
    const p = bone(e, 0, 0, er * 0.62);
    ball(p, er * 0.42, "#24142a", 0, 0, 0, 1, 1, 0.45, 8);
    const sh = ball(e, er * 0.2, "#ffffff", side * -er * 0.22, er * 0.3, er * 0.72, 1, 1, 0.5, 6);
    sh.userData.g = 1;
    eyesB.push(e);
    pupils.push(p);
  }
  // horns
  for (const side of [-1, 1]) {
    if (s.horns === "swept") {
      cone(head, hr * 0.17, hr * 1.5, horn, side * hr * 0.4, hr * 0.62, -hr * 0.5, -1.15, -side * 0.25, 7);
    } else if (s.horns === "nubs") {
      // short, curving, swept-back horns (cute, but a dragon's), and a little cheek spike
      taper(head, [[side * hr * 0.36, hr * 0.62, hr * 0.05], [side * hr * 0.48, hr * 0.98, -hr * 0.28], [side * hr * 0.56, hr * 1.06, -hr * 0.72]], hr * 0.17, hr * 0.03, horn, 5, 7, true, false);
      cone(head, hr * 0.08, hr * 0.42, spike, side * hr * 0.86, -hr * 0.12, -hr * 0.2, -1.6, -side * 0.5, 4);
      if (side > 0) for (let i = 0; i < 3; i++) ball(head, hr * (0.12 - i * 0.02), spike, 0, hr * (0.86 - i * 0.12), -hr * (0.15 + i * 0.32), 1, 0.85, 1.1, 6);
    } else if (s.horns === "spiky") {
      cone(head, hr * 0.14, hr * 1.1, horn, side * hr * 0.42, hr * 0.62, -hr * 0.4, -0.9, -side * 0.35, 5);
      cone(head, hr * 0.1, hr * 0.7, spike, side * hr * 0.7, hr * 0.25, -hr * 0.5, -1.2, -side * 0.9, 4);
      cone(head, hr * 0.08, hr * 0.5, spike, 0, hr * 0.85, -hr * 0.2, -0.6, 0, 4);
    } else if (s.horns === "tiny") {
      cone(head, hr * 0.1, hr * 0.45, horn, side * hr * 0.3, hr * 0.9, -hr * 0.05, -0.3, -side * 0.3, 5);
    } else {
      // big curling ram-ish horns: one smooth tapering curl
      const curl: V3[] = [];
      let px = side * hr * 0.5;
      let py = hr * 0.6;
      let pz = -hr * 0.3;
      curl.push([px, py, pz]);
      for (let i = 0; i < 4; i++) {
        const a = i * 0.9;
        px += side * hr * 0.25;
        py += Math.cos(a) * hr * 0.35;
        pz -= Math.sin(a + 0.3) * hr * 0.45;
        curl.push([px, py, pz]);
      }
      taper(head, curl, hr * 0.21, hr * 0.06, horn, 8, 8, true, true);
      // a spiky chin
      cone(head, hr * 0.1, hr * 0.5, spike, 0, -hr * 0.7, hr * 0.1, Math.PI - 0.5, 0, 4);
    }
  }
  // ears / frills on their own bones (they perk up and droop)
  const ears: THREE.Bone[] = [];
  for (const side of [-1, 1]) {
    const e = bone(head, side * hr * 0.72, hr * 0.42, -hr * 0.35);
    let g: THREE.BufferGeometry;
    if (s.ears === "fins") g = flat([[0, 0], [0.12, 0.05], [0.5, 0.42], [0.08, 0.32]], 0.02, 0.01, 1);
    else if (s.ears === "round") g = flat([[0, 0], [0.16, 0.02], [0.24, 0.16], [0.18, 0.3], [0.04, 0.26]], 0.04, 0.02, 1);
    else if (s.ears === "frills") g = flat([[0, 0], [0.2, 0.04], [0.42, 0.12], [0.24, 0.22], [0.4, 0.34], [0.12, 0.3]], 0.02, 0.01, 1);
    else if (s.ears === "leaf") g = flat([[0, 0], [0.14, 0.08], [0.34, 0.36], [0.06, 0.24]], 0.03, 0.01, 1);
    else g = flat([[0, 0], [0.1, 0.04], [0.22, 0.24], [0.04, 0.16]], 0.03, 0.01, 1);
    const sc = hr / 0.3;
    g.scale(side * sc, sc, sc);
    // (lies flat; the bone stands it up)
    const m = add(e, g, s.ears === "round" ? hide : memb);
    m.rotation.set(0, 0, 0);
    e.name = side > 0 ? "earR" : "earL";
    ears.push(e);
  }

  // ── wings: an arm (shoulder->wrist, inner membrane) and a hand (fingers, outer membrane) ──
  const arms: THREE.Bone[] = [];
  const hands: THREE.Bone[] = [];
  const S = s.span;
  const C = s.chord;
  for (const side of [-1, 1]) {
    const X = (x: number) => x * side;
    const arm = bone(torso, side * s.bw * 0.55, H + s.bh * 0.8, s.bl * 0.32);
    const E: V3 = [X(S * 0.26), 0, -S * 0.02];
    const W: V3 = [X(S * 0.5), 0, S * 0.05];
    const ar = 0.045 + 0.012 * S;
    tube(arm, [0, 0, 0], E, ar, hide, 7);
    tube(arm, E, W, ar * 0.8, hide, 7);
    ball(arm, ar * 1.05, hide, ...W, 1, 1, 1, 7);
    cone(arm, 0.04, 0.16, claw, W[0], 0.02, W[2] + 0.12, Math.PI / 2, 0, 5);
    const hand = bone(arm, ...W);
    const tips: V3[] = [[X(S * 0.5), 0, -C * 0.08], [X(S * 0.42), 0, -C * 0.55], [X(S * 0.24), 0, -C * 0.88], [X(S * 0.02), 0, -C * 0.92]];
    for (const tp of tips) tube(hand, [0, 0, 0], tp, 0.035, top, 5);
    // outer membrane (on the hand): wrist -> finger tips, scalloped
    const p2 = (v: V3): [number, number] => [v[0], -v[2]];
    const outer = new THREE.Shape();
    outer.moveTo(0, 0);
    outer.lineTo(...p2(tips[0]));
    for (let i = 1; i < tips.length; i++) {
      const a = tips[i - 1];
      const b = tips[i];
      const mx = (a[0] + b[0]) / 2 - X(S * 0.04);
      const mz = (a[2] + b[2]) / 2 + C * 0.12;
      outer.quadraticCurveTo(mx, -mz, ...p2(b));
    }
    outer.lineTo(0, 0);
    const og = new THREE.ExtrudeGeometry(outer, { depth: 0.025, bevelEnabled: false, curveSegments: 5 });
    og.translate(0, 0, -0.012);
    og.rotateX(-Math.PI / 2);
    hand.add(mesh(og, memb));
    // inner membrane (on the arm): shoulder -> elbow -> wrist -> the last finger's tip -> body
    const inner = new THREE.Shape();
    const f4: V3 = [W[0] + tips[3][0], 0, W[2] + tips[3][2]];
    inner.moveTo(0, 0);
    inner.lineTo(...p2(E));
    inner.lineTo(...p2(W));
    inner.lineTo(...p2(f4));
    inner.quadraticCurveTo(X(S * 0.2), C * 0.62, X(0.02), C * 0.7);
    inner.lineTo(0, 0);
    const ig = new THREE.ExtrudeGeometry(inner, { depth: 0.025, bevelEnabled: false, curveSegments: 5 });
    ig.translate(0, 0, -0.012);
    ig.rotateX(-Math.PI / 2);
    arm.add(mesh(ig, memb));
    arms.push(arm);
    hands.push(hand);
  }

  // ── the tail: three bones, and a tip with personality ──
  const tail1 = bone(torso, 0, H + s.bh * 0.1, -s.bl * 0.95);
  const segL = s.tailL / 3;
  const tail2 = bone(tail1, 0, -0.08, -segL);
  const tail3 = bone(tail2, 0, -0.04, -segL);
  tail1.name = "tail1";
  // one smooth taper from the hips to the tip: each bone's piece starts at exactly the radius the
  // last one ended at, and the joints are balls of that radius, so bending never shows a step
  const tr = [s.tailR * 1.55, s.tailR * 0.95, s.tailR * 0.62, s.tailR * 0.3];
  // (each piece reaches a little back inside the one before, so a bend never opens a gap - and
  // there are no joint balls to show as rings)
  const lap = Math.min(0.14, segL * 0.2);
  taper(tail1, [[0, 0.04, 0.3], [0, -0.01, -segL * 0.45], [0, -0.08, -segL - lap * 0.3]], tr[0], tr[1] * 0.98, hide, 6, 12, false, false);
  taper(tail2, [[0, 0.012, lap], [0, -0.025, -segL * 0.5], [0, -0.04, -segL - lap * 0.3]], tr[1], tr[2] * 0.98, hide, 6, 12, false, false);
  taper(tail3, [[0, 0.006, lap], [0, 0, -segL * 0.55], [0, 0, -segL]], tr[2], tr[3], hide, 6, 10, false, true);
  if (s.back === "fins")
    for (const [b, h] of [[tail1, 0.3], [tail2, 0.24], [tail3, 0.18]] as const) {
      const f = add(b, flat([[0, 0], [h * 1.4, 0], [h * 1.1, h * 0.35], [0.05, h]], 0.06, 0.012, 1), spike, 0, s.tailR * 0.5, -segL * 0.15);
      f.rotation.set(0, Math.PI / 2, Math.PI / 2);
    }
  const tz = -segL - 0.02;
  if (s.back === "spikes" || s.back === "plates") for (const [b, h] of [[tail1, 0.2], [tail2, 0.16], [tail3, 0.12]] as const) plate(b, 0, s.tailR * 0.6, -segL * 0.5, h, -0.9);
  if (s.tip === "fins") {
    for (const side of [-1, 1]) {
      const f = add(tail3, flat([[0, 0], [0.55, -0.12], [0.66, -0.55], [0.12, -0.38]], 0.05, 0.012, 1), spike, 0, 0, tz);
      f.scale.set(side, 1, 1);
    }
  } else if (s.tip === "tuft") {
    for (let i = 0; i < 5; i++) ball(tail3, 0.13, i % 2 ? spike : belly, Math.sin(i * 1.3) * 0.08, Math.cos(i * 1.3) * 0.08, tz - 0.05 - (i % 2) * 0.06, 1, 1, 1.3, 7);
  } else if (s.tip === "spikes") {
    for (let i = 0; i < 4; i++) cone(tail3, 0.06, 0.32, spike, 0, 0, tz, Math.PI / 2 + 0.5 * Math.cos((i * Math.PI) / 2), 0.5 * Math.sin((i * Math.PI) / 2), 4).rotation.order = "XZY";
    cone(tail3, 0.07, 0.36, spike, 0, 0, tz - 0.12, -Math.PI / 2, 0, 5);
  } else if (s.tip === "heart") {
    const hs = new THREE.Shape();
    hs.moveTo(0, -0.18);
    hs.bezierCurveTo(0.24, 0.02, 0.18, 0.2, 0, 0.1);
    hs.bezierCurveTo(-0.18, 0.2, -0.24, 0.02, 0, -0.18);
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.05, bevelEnabled: false, curveSegments: 5 });
    hg.translate(0, 0, -0.025);
    hg.rotateY(Math.PI / 2);
    add(tail3, hg, spike, 0, 0.0, tz - 0.12, true);
  } else {
    ball(tail3, 0.2, spike, 0, 0, tz - 0.1, 1, 0.85, 1.2, 8);
    for (let i = 0; i < 4; i++) cone(tail3, 0.05, 0.16, horn, Math.sin(i * 1.57) * 0.18, Math.cos(i * 1.57) * 0.16, tz - 0.1, 0, -i * 1.57, 4);
  }

  // ── the rider's saddle on the shoulders, with a grab handle ──
  const seatY = H + s.bh * 0.98;
  const seatZ = s.bl * 0.22;
  {
    const sw = Math.max(0.3, s.bw * 0.7);
    add(torso, new THREE.CylinderGeometry(sw, sw * 1.05, 0.14, 14), k.accent, 0, seatY - 0.02, seatZ).scale.set(1, 1, 1.15);
    const tr = add(torso, new THREE.TorusGeometry(sw, 0.05, 5, 16), "#ffe08a", 0, seatY + 0.04, seatZ);
    tr.rotation.x = Math.PI / 2;
    tr.scale.set(1, 1.15, 1);
    tube(torso, [-0.16, seatY + 0.02, seatZ + sw * 1.05], [-0.16, seatY + 0.2, seatZ + sw * 1.1], 0.028, "#ffe08a", 5);
    tube(torso, [0.16, seatY + 0.02, seatZ + sw * 1.05], [0.16, seatY + 0.2, seatZ + sw * 1.1], 0.028, "#ffe08a", 5);
    tube(torso, [-0.18, seatY + 0.2, seatZ + sw * 1.1], [0.18, seatY + 0.2, seatZ + sw * 1.1], 0.036, "#ffe08a", 6);
  }
  // a little puff of smoke from the nostrils now and then (scaled to nothing between)
  const puff = bone(head, 0, hr * 0.25, tipZ + 0.02);
  for (const [x, y, z, r] of [[0, 0, 0, 0.1], [0.08, 0.06, 0.12, 0.08], [-0.07, 0.1, 0.2, 0.07]] as const) add(puff, new THREE.SphereGeometry(r, 6, 4), "#f6f2ff", x, y, z, true);

  // ── animation ──
  let drv: DragonDrive = { mode: "fly", act: "stand", look: 0, flap: 0.6, dive: 0 };
  const P = { lower: 0, pitch: 0, neckX: 0, neckY: 0, neckZ: 0, headX: 0, headY: 0, headZ: 0, jaw: 0.15, ear: 0.3, pupil: 1, eye: 1, tailY: 0.2, tailX: 0, fold: 1, wingUp: 0.5, nap: 0, scratch: 0, walk: 0, wiggle: 0, sniff: 0, hover: 0, chase: 0 };
  const T = { ...P };
  let blinkT = 2;
  let puffT = 3;
  let stride = 0;
  let flapPh = 0;
  let lookT = 0;
  let lookA = 0;
  const maxDrop = H - s.bh - NAP_DROP[breed];
  const scratchQ = { ...SCRATCH_POSE, ...SCRATCH_TUNE[breed] };
  const target = (act: DragonAct, t: number) => {
    Object.assign(T, { lower: 0, pitch: 0, neckX: 0, neckY: 0, neckZ: 0, headX: 0, headY: 0, headZ: 0, jaw: 0.15, ear: 0.3, pupil: 1, eye: 1, tailY: 0.2, tailX: 0, fold: 1, wingUp: 0.5, nap: 0, scratch: 0, walk: 0, wiggle: 0, sniff: 0, hover: B.hover ? 1 : 0, chase: 0 });
    // looking about (or at the kid)
    if (Math.abs(drv.look) > 0.01) T.neckY = Math.max(-1, Math.min(1, drv.look)) * 0.7;
    else T.neckY = lookA * 0.5;
    T.headY = T.neckY * 0.5;
    switch (act) {
      case "nap":
        Object.assign(T, { lower: 1, nap: 1, neckX: NAP_POSE.neckX, headX: NAP_POSE.headX, neckY: 0.5, headY: 0.4, eye: 0.04, ear: -0.6, tailY: 0.9, jaw: 0, pupil: 1, hover: 0, wingUp: 0.1 });
        break;
      case "scratch": {
        const q = scratchQ;
        Object.assign(T, { lower: q.lower, pitch: q.pitch, scratch: 1, neckX: q.neckX, neckY: q.neckY, neckZ: q.neckZ, headX: q.headX, headY: q.headY, headZ: q.headZ, eye: 0.2, ear: -0.2, jaw: 0.55, pupil: 1.2, tailY: 0.6, tailX: q.tailX, hover: 0, wingUp: 0.3 });
        break;
      }
        break;
      case "chase":
        Object.assign(T, { walk: 1, chase: 1, neckY: 1.0, headY: 0.6, tailY: 0.8, ear: 0.9, jaw: 0.5, pupil: 1.25 });
        break;
      case "walk":
        Object.assign(T, { walk: 1, ear: 0.8, jaw: 0.3, pupil: 1.15 });
        break;
      case "nuzzle":
        Object.assign(T, { neckX: 0.5, headX: 0.25, eye: 0.4, ear: 0.8, jaw: 0.45, pupil: 1.3, tailY: 0.3 });
        T.headZ = Math.sin(t * 3) * 0.25;
        break;
      case "wiggle":
        Object.assign(T, { wiggle: 1, ear: 1, jaw: 0.6, pupil: 1.35, fold: 0.4, wingUp: 0.9, lower: 0.15 });
        break;
      case "happy":
        Object.assign(T, { wiggle: 0.5, ear: 1, jaw: 0.7, pupil: 1.4, eye: 0.85, fold: 0.6, wingUp: 0.8 });
        break;
      case "shy":
        Object.assign(T, { lower: 0.3, pitch: 0.12, neckX: 0.35, headX: 0.2, ear: -0.7, jaw: 0, pupil: 0.65, tailY: 0.7, hover: 0 });
        T.neckY = -T.neckY * 0.5;
        break;
      case "sniff":
        Object.assign(T, { sniff: 1, neckX: 0.7, headX: 0.15, ear: 0.4, jaw: 0.05, pupil: 1.1, hover: 0 });
        break;
    }
  };
  const anim = (t: number, dt: number, speed: number, airborne: boolean) => {
    const fly = airborne && drv.mode === "fly";
    const ease = Math.min(1, dt * 4);
    blinkT -= dt;
    if (blinkT < -0.14) blinkT = 2 + ((t * 7.3) % 3);
    lookT -= dt;
    if (lookT < 0) {
      lookA = Math.sin(t * 12.9) * 0.9;
      lookT = 2.5 + ((t * 3.1) % 3);
    }
    if (fly) {
      // ── flying: the wings beat with a quick powerful downstroke and a slower, folded upstroke;
      // with flap ~0 they're held out and gliding (a tiny tremble), swept back in a dive ──
      const f = Math.max(0, Math.min(1, drv.flap));
      const rate = (B.hover ? 13 : 5.2) * (0.6 + f * 0.5);
      flapPh += dt * rate * (0.25 + f);
      const c = Math.cos(flapPh);
      // downstroke = the falling half of the cycle, fast (sharpened)
      const w = Math.sign(c) * Math.pow(Math.abs(c), 0.7);
      const amp = f * 0.62;
      const dive = drv.dive;
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const z = 0.12 + w * amp + (1 - f) * Math.sin(t * 9 + i) * 0.015;
        const sweep = dive * 0.9 + 0.05;
        arms[i].rotation.set(0, side * sweep, side * (z - dive * 0.15));
        // the hand trails a little on the downstroke, folds on the upstroke
        const hz = w > 0 ? -w * amp * 0.25 : w * amp * 0.55;
        hands[i].rotation.set(0, side * dive * 0.6, side * hz);
      }
      for (let i = 0; i < 4; i++) legs[i].rotation.set(i < 2 ? -0.9 : 1.1, 0, 0);
      body.position.y = -w * amp * 0.06;
      body.rotation.set(0, 0, 0);
      neck.rotation.set(-0.18 + dive * 0.2, 0, 0);
      head.rotation.set(0.25 - dive * 0.15, 0, 0);
      jaw.rotation.x = 0.25 + f * 0.1;
      for (const e of ears) e.rotation.set(-0.9, 0, 0);
      tail1.rotation.set(0.05, Math.sin(t * 1.4) * 0.1, 0);
      tail2.rotation.set(-0.02, Math.sin(t * 1.4 - 0.6) * 0.15, 0);
      tail3.rotation.set(-0.02, Math.sin(t * 1.4 - 1.2) * 0.2, 0);
      for (const p of pupils) p.scale.setScalar(1.2);
      for (const e of eyesB) e.scale.y = blinkT < 0 ? 0.15 : 1;
      puff.scale.setScalar(0.001);
      return;
    }
    target(drv.act, t);
    if (speed > 0.3 && drv.act !== "chase") T.walk = Math.max(T.walk, Math.min(1, speed / 2));
    for (const key of Object.keys(P) as (keyof typeof P)[]) P[key] = lerp(P[key], T[key], ease);
    // breathing, wiggles, the stride
    const breath = Math.sin(t * (P.nap > 0.5 ? 0.9 : 1.4));
    stride += dt * (P.walk * (B.hover ? 9 : 6.5) + 0.0001);
    const hov = P.hover * (0.45 + Math.sin(t * 2.3) * 0.12);
    body.position.y = -P.lower * maxDrop + breath * 0.012 + Math.abs(Math.sin(stride)) * 0.035 * P.walk + hov;
    body.rotation.set(P.pitch + Math.sin(t * 20) * 0.02 * P.wiggle, Math.sin(t * 9) * 0.06 * P.wiggle, Math.sin(t * 14) * 0.08 * P.wiggle);
    // legs: stride when walking; folded under when napping; one back leg scratching
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const side = i % 2 ? 1 : -1;
      const ph = stride + (i === 0 || i === 3 ? 0 : Math.PI);
      let rx = Math.sin(ph) * 0.5 * P.walk;
      let rz = 0;
      // lying down: front paws stretched forward, back legs tucked to the sides
      rx = lerp(rx, front ? NAP_POSE.frontRx : NAP_POSE.hindRx, P.nap);
      rz = lerp(rz, front ? 0 : side * NAP_POSE.hindRz, P.nap);
      // sitting back to scratch: the left hind leg folds under; the right one lifts forward to the ear
      // and scratches away (quick little kicks); the front legs prop the chest up
      const q = scratchQ;
      if (i === 2) rx = lerp(rx, q.otherRx, P.scratch);
      if (i === 3) {
        rx = lerp(rx, q.hindRx + Math.sin(t * 24) * 0.16, P.scratch);
        rz = lerp(rz, q.hindRz + Math.sin(t * 24) * 0.06, P.scratch);
      }
      if (front) rx = lerp(rx, q.frontRx, P.scratch);
      // hovering: legs dangle and paddle a little
      rx += P.hover * Math.sin(t * 5 + i) * 0.15;
      legs[i].rotation.set(rx, 0, rz);
    }
    // wings: folded along the back (perched) .. spread (stretching, happy)
    stretchCycle(t, dt);
    const open = Math.max(1 - P.fold, stretchK);
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const hoverFlap = P.hover * Math.sin(t * 34 + i * 0.4) * 0.5;
      // (folded: the arm lies back along the flank, the hand tucked behind it)
      const up = lerp(0.18 + P.wingUp * 0.25, 0.6, open) + breath * 0.03 + hoverFlap + Math.sin(t * 18) * 0.2 * P.wiggle - P.nap * 0.2;
      const sweep = lerp(1.25, 0.15, open) * (1 - P.hover * 0.6);
      arms[i].rotation.set(0, side * sweep, side * up);
      hands[i].rotation.set(0, side * lerp(1.5, 0.05, open) * (1 - P.hover * 0.7), side * lerp(-0.25, 0.05, open));
    }
    // neck, head, jaw, ears, eyes
    const sniffBob = P.sniff * Math.sin(t * 16) * 0.05;
    neck.rotation.set(P.neckX - breath * 0.02 + Math.sin(t * 0.8) * 0.03, P.neckY, P.neckZ);
    head.rotation.set(P.headX + sniffBob, P.headY, P.headZ);
    jaw.rotation.x = P.jaw * 0.45 + Math.max(0, Math.sin(t * 0.7)) * 0.04;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const twitch = Math.max(0, Math.sin(t * 3.1 + i * 2) - 0.95) * 6;
      ears[i].rotation.set(lerp(-0.8, 1.05, (P.ear + 1) / 2) + twitch * 0.2, side * 0.1, side * (0.4 - P.ear * 0.25));
    }
    for (const p of pupils) p.scale.setScalar(P.pupil);
    const open01 = blinkT < 0 ? 0.12 : 1;
    for (const e of eyesB) e.scale.y = Math.max(0.06, Math.min(P.eye, open01));
    // tail: a lazy swish, curled round when napping, chasing the head
    const swish = Math.sin(t * (1 + P.wiggle * 6)) * (0.25 + P.wiggle * 0.3);
    tail1.rotation.set(-0.12 + P.tailX + P.nap * 0.1, P.tailY * 0.5 + swish, 0);
    tail2.rotation.set(0.05, P.tailY * 0.6 + swish * 1.2, 0);
    tail3.rotation.set(0.12 - P.nap * 0.1, P.tailY * 0.7 + swish * 1.4, 0);
    // a puff of smoke every few seconds (awake and standing about)
    puffT -= dt;
    if (puffT < -1.3) puffT = 3.5 + ((t * 5.3) % 3);
    const pu = puffT < 0 && P.nap < 0.3 && drv.act !== "sniff" ? -puffT / 1.3 : 0;
    puff.scale.setScalar(pu > 0 ? Math.max(0.001, Math.sin(pu * Math.PI) * (0.6 + pu)) : 0.001);
    puff.position.y = hr * 0.25 + pu * 0.3;
  };
  // an occasional big wing stretch when standing about
  let stretchT = 4;
  let stretchK = 0;
  const stretchCycle = (t: number, dt: number) => {
    stretchT -= dt;
    if (stretchT < -2.2) stretchT = 7 + ((t * 3.7) % 5);
    const on = drv.act === "stand" || drv.act === "happy";
    stretchK = on && stretchT < 0 ? Math.sin((-stretchT / 2.2) * Math.PI) : 0;
  };
  return {
    seat: [0, seatY + 0.08, seatZ],
    pet: [0, seatY + 0.02, seatZ - Math.max(0.5, s.bl * 0.6)],
    anim,
    drive: (d) => {
      drv = d;
    },
  };
}
