// Rideable friends and vehicles for getting round Cucaino Park: bikes and buggies on the trails,
// rainbow unicorns in the meadows, Cloud Dragons on the hilltops, manta rays on the reef, the
// dolphins and whales that come up to swim with you out at sea - and the boats and submarines
// moored at the harbours (built in ./boats). Built in code in the same chibi style as the
// characters (big sparkly eyes, soft toon colours), each with a `seat` the kid sits on.
//
// TRUE SIZE: the kid is 2.26 world units tall and stands for a ~1.4 m 10-year-old, so 1 real metre
// is 1.6 world units (M below). Animals are modelled in a small "chibi" unit and scaled up by
// MOUNT_SCALE (unicorn 1.6 m at the shoulder, dolphin ~2.7 m, manta ~6 m wingspan, humpback whale
// ~14 m, dragon ~10 m); boats and subs are modelled at true size directly (MOUNT_SCALE 1).
//
// Every rig is ONE skinned mesh (one draw call + a blob shadow): the parts are rigid "bones"
// (legs, wheels, wings, tail...) and all colours are vertex colours on one shared toon material,
// with glowing bits (horn, headlights, spots) marked by a per-vertex `glow` attribute. (Subs add
// one see-through glass bubble so the kid shows inside.)
// The same geometry, frozen in its idle pose, is what the world instances for parked/idle
// rideables (lib/park/world/rideables) - so a parked bike looks exactly like the one you ride.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getToonRamp } from "../assets/loader";
import { buildCraftParts } from "./boats";

/** world units per real metre (the kid: 2.26 units = 1.4 m) */
export const M = 1.6;

/** boats: on the sea's surface only (never below it), stopped by beaches and shallows */
export type BoatKind = "pedalo" | "sailboat" | "speedboat" | "ship";
/** submarines: under the sea (or bobbing at the surface), with headlights */
export type SubKind = "sub" | "deepsub";
/** "pony" is the old name of the unicorn (kept so saved picks keep working) */
export type MountKind = "pony" | "unicorn" | "bike" | "car" | "manta" | "dragon" | "whale" | "dolphin" | BoatKind | SubKind;
export const BOAT_KINDS: BoatKind[] = ["pedalo", "sailboat", "speedboat", "ship"];
export const SUB_KINDS: SubKind[] = ["sub", "deepsub"];
export const isBoat = (k: MountKind): k is BoatKind => (BOAT_KINDS as string[]).includes(k);
export const isSub = (k: MountKind): k is SubKind => (SUB_KINDS as string[]).includes(k);
/** boats and subs (moored at docks, drawn by the fleet: lib/park/world/rideables/fleet) */
export const isCraft = (k: MountKind): k is BoatKind | SubKind => isBoat(k) || isSub(k);

/** every kind a kid can find in the world (pony is only an alias of unicorn) */
export const RIDEABLE_KINDS: Exclude<MountKind, "pony">[] = ["bike", "car", "unicorn", "dragon", "manta", "dolphin", "whale", "pedalo", "sailboat", "speedboat", "ship", "sub", "deepsub"];

export type MountMedium = "land" | "air" | "under" | "sea" | "boat";

/**
 * What each ride can do. `speed` is a multiplier of the kid's walking speed (7 units/s).
 * - land: ground only, stops at the shore (bike, car, unicorn)
 * - air: flies (dragon)
 * - under: under the water (manta; subs may also bob up at the surface)
 * - sea: swims at the surface and can dive (whale, dolphin)
 * - boat: floats on the surface only, stopped by beaches, shallows and jetties
 * (the ocean wraps at 640 units: the Rocket Boat crosses it in well under a minute)
 */
export const MOUNT_CAPS: Record<MountKind, { medium: MountMedium; speed: number; label: string; emoji: string; verb: string }> = {
  pony: { medium: "land", speed: 2.3, label: "Rainbow Unicorn", emoji: "\u{1F984}", verb: "Ride" },
  unicorn: { medium: "land", speed: 2.3, label: "Rainbow Unicorn", emoji: "\u{1F984}", verb: "Ride" },
  bike: { medium: "land", speed: 2.0, label: "Bike", emoji: "\u{1F6B2}", verb: "Ride" },
  car: { medium: "land", speed: 2.6, label: "Buggy", emoji: "\u{1F699}", verb: "Drive" },
  dragon: { medium: "air", speed: 2.6, label: "Cloud Dragon", emoji: "\u{1F409}", verb: "Fly" },
  manta: { medium: "under", speed: 1.8, label: "Reef Manta", emoji: "\u{1FABD}", verb: "Glide on" },
  dolphin: { medium: "sea", speed: 2.8, label: "Dolphin", emoji: "\u{1F42C}", verb: "Swim with" },
  whale: { medium: "sea", speed: 1.4, label: "Gentle Whale", emoji: "\u{1F40B}", verb: "Ride" },
  pedalo: { medium: "boat", speed: 1.15, label: "Duck Pedalo", emoji: "\u{1F986}", verb: "Pedal" },
  sailboat: { medium: "boat", speed: 2.6, label: "Candy Sailboat", emoji: "\u26F5", verb: "Sail" },
  speedboat: { medium: "boat", speed: 5, label: "Rocket Boat", emoji: "\u{1F6A4}", verb: "Drive" },
  ship: { medium: "boat", speed: 2.1, label: "Pirate Ship", emoji: "\u{1F3F4}\u200D\u2620\uFE0F", verb: "Captain" },
  sub: { medium: "under", speed: 1.7, label: "Bubble Sub", emoji: "\u{1FAE7}", verb: "Dive in" },
  deepsub: { medium: "under", speed: 1.4, label: "Deep Explorer", emoji: "\u{1F526}", verb: "Dive in" },
};

/**
 * Model scale per kind (rigs are built in chibi units, then scaled to true size). Boats and subs
 * are modelled at true size already.
 */
export const MOUNT_SCALE: Record<MountKind, number> = {
  pony: 1.28, unicorn: 1.28, bike: 1, car: 1, manta: 1.6, dragon: 3.2, whale: 2, dolphin: 1,
  pedalo: 1, sailboat: 1, speedboat: 1, ship: 1, sub: 1, deepsub: 1,
};

/**
 * Each ride's footprint in world units (after scaling), as a capsule along its heading:
 * [half length, half width, centre offset forward]. Used to hop on from anywhere alongside (a
 * whale or a pirate ship is easy to reach) and to keep boats off the sand.
 */
export const MOUNT_BODY: Record<MountKind, [number, number, number]> = {
  bike: [1.0, 0.35, 0], car: [1.6, 0.9, 0], pony: [1.8, 0.8, 0.2], unicorn: [1.8, 0.8, 0.2],
  dragon: [6.5, 3.2, 0], manta: [1.6, 4.2, 0], dolphin: [1.9, 0.6, -0.3], whale: [8.6, 3.3, -2.2],
  pedalo: [2.6, 1.3, 0], sailboat: [4.6, 1.8, 0], speedboat: [4.3, 1.7, 0], ship: [11, 3.5, 0.4], sub: [3.2, 1.25, 0], deepsub: [2.8, 2.7, 0.3],
};

/** how far from a ride's side (m) the kid can be to hop on */
export const HOP_REACH = 3.2;

/** how much further back the camera sits while riding (1 = a kid-sized ride) */
export const MOUNT_VIEW: Record<MountKind, number> = {
  bike: 1, car: 1, pony: 1.05, unicorn: 1.05, dragon: 1.5, manta: 1.2, dolphin: 1, whale: 1.55,
  pedalo: 1.0, sailboat: 1.3, speedboat: 1.1, ship: 1.75, sub: 1.0, deepsub: 1.05,
};

/**
 * How far below the sea surface (WATER_Y) a swimmer's root rides so its back - and the kid's
 * seat - sits just out of the water. (The engine's generic "at sea" height is WATER_Y - 0.85.)
 * Boats ride with their root ON the surface (their hulls are modelled below it).
 */
export const MOUNT_SEA_DRAFT: Partial<Record<MountKind, number>> = { dolphin: 0.42, whale: 1.6 };

/** boats: how deep the water must be under the hull (m), the deepest sea they'll go out on, and how they handle */
export const BOAT_CAPS: Record<BoatKind, { draft: number; maxSea: number; accel: number; turn: number }> = {
  // the pedalo is a shore boat: it stays on the shallow shelves round the islands
  pedalo: { draft: 0.55, maxSea: 15, accel: 1.6, turn: 2.6 },
  sailboat: { draft: 1.0, maxSea: Infinity, accel: 0.8, turn: 1.5 },
  speedboat: { draft: 0.7, maxSea: Infinity, accel: 1.3, turn: 2.2 },
  ship: { draft: 1.9, maxSea: Infinity, accel: 0.45, turn: 0.8 },
};

/**
 * subs: where the root rides when surfaced (WATER_Y + surf), how far the hull reaches below the
 * root (kept off the floor), the deepest they may go below the surface, and how fast they dive
 */
export const SUB_CAPS: Record<SubKind, { surf: number; clear: number; maxDepth: number; rate: number; accel: number; turn: number }> = {
  sub: { surf: -0.6, clear: 1.45, maxDepth: 40, rate: 7, accel: 1.3, turn: 1.9 },
  // the Deep Explorer goes all the way down to the floor of the Midnight Rift (~123 m)
  deepsub: { surf: -0.35, clear: 2.15, maxDepth: 400, rate: 12, accel: 1.1, turn: 1.6 },
};

/** the old picker's list (kept for ParkApp until it moves to finding rides in the world) */
export const MOUNTS: { kind: MountKind; name: string; emoji: string; flies: boolean; blurb: string }[] = [
  { kind: "pony", name: "Rainbow Unicorn", emoji: "🦄", flies: false, blurb: "Gallops super fast along the ground" },
  { kind: "manta", name: "Sky Manta", emoji: "🪽", flies: true, blurb: "Glides through the sky, glows at night" },
  { kind: "dragon", name: "Cloud Dragon", emoji: "🐉", flies: true, blurb: "Flaps high over everything!" },
];

/** colour skins unlocked with Star Shards (10 / 20 / 30) */
export type MountSkin = "classic" | "aurora" | "golden" | "starlight";
export const MOUNT_SKINS: { id: MountSkin; name: string; shards: number }[] = [
  { id: "classic", name: "Classic", shards: 0 },
  { id: "aurora", name: "Aurora", shards: 10 },
  { id: "golden", name: "Golden", shards: 20 },
  { id: "starlight", name: "Starlight", shards: 30 },
];
const SKIN_COLORS: Record<MountKind, Record<MountSkin, string>> = {
  pony: { classic: "#fff4fb", aurora: "#b8f4ff", golden: "#ffe08a", starlight: "#d6c6ff" },
  unicorn: { classic: "#fff4fb", aurora: "#b8f4ff", golden: "#ffe08a", starlight: "#d6c6ff" },
  bike: { classic: "#3fc4e8", aurora: "#8fe8c8", golden: "#f0c040", starlight: "#8a6ae8" },
  car: { classic: "#ff6b6b", aurora: "#5fd0e8", golden: "#f0c040", starlight: "#6a5ab8" },
  manta: { classic: "#6a5ab8", aurora: "#2fb8c8", golden: "#c9962e", starlight: "#2a2a6a" },
  dragon: { classic: "#8fe0c8", aurora: "#8fb8ff", golden: "#f0c040", starlight: "#9a7ae8" },
  whale: { classic: "#6f8fcf", aurora: "#5fb8c8", golden: "#c9a24e", starlight: "#4a4a9a" },
  dolphin: { classic: "#7fb4e6", aurora: "#8fe0e0", golden: "#e8c070", starlight: "#8a7ad8" },
  pedalo: { classic: "#ffd84a", aurora: "#9fe8ff", golden: "#ffc23a", starlight: "#c6b0ff" },
  sailboat: { classic: "#6cc4ff", aurora: "#8fe8c8", golden: "#f0c040", starlight: "#8a6ae8" },
  speedboat: { classic: "#ff4f7a", aurora: "#4fc8e8", golden: "#f0b030", starlight: "#6a5ab8" },
  ship: { classic: "#7a4cc8", aurora: "#3a8ab8", golden: "#c9862e", starlight: "#3a2a7a" },
  sub: { classic: "#ffd23c", aurora: "#7fe0c8", golden: "#f0b030", starlight: "#a88cff" },
  deepsub: { classic: "#ff8a3c", aurora: "#4fc8e8", golden: "#f0c040", starlight: "#8a6ae8" },
};

export interface MountRig {
  kind: MountKind;
  /** moves in 3D with an altitude (the engine's flier logic): the dragon, and the manta under water */
  flies: boolean;
  root: THREE.Group;
  /** where the kid sits, in root space (updated every frame: it follows the body's bob/leap) */
  seat: THREE.Vector3;
  /** where the pet sits (just behind the kid; updated every frame like `seat`) */
  petSeat: THREE.Vector3;
  /** `above` = height above the ground (the shadow stays on the ground) */
  update(dt: number, speed: number, airborne: boolean, glow: number, above?: number): void;
  /** idle pose 0..1 (unicorn grazes with its head down, dragon folds its wings) */
  rest?(amount: number): void;
  dispose(): void;
}

// ── shared GPU resources (never disposed; every rig and statue uses them) ──
const glowU = { value: 0 };
let rideMat: THREE.MeshToonMaterial | null = null;
/** the one toon material every mount uses (vertex colours + a per-vertex glow mask) */
export function mountMaterial(): THREE.MeshToonMaterial {
  if (rideMat) return rideMat;
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: getToonRamp() });
  m.name = "mount:toon";
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRideGlow = glowU;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vRideGlow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRideGlow = glow;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uRideGlow;\nvarying float vRideGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vRideGlow * (0.55 + 0.6 * uRideGlow);");
  };
  m.customProgramCacheKey = () => "mount-glow-v1";
  rideMat = m;
  return m;
}
/** night glow 0..1 for every mount at once (rigs set it from update(); call it for statues too) */
export function setMountGlow(glow: number) {
  glowU.value = glow;
}

let shadowTex: THREE.DataTexture | null = null;
/** a soft purple blob (a DataTexture, so it also works without a DOM) */
export function mountShadowTexture(): THREE.DataTexture {
  if (shadowTex) return shadowTex;
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(i + 0.5 - N / 2, j + 0.5 - N / 2) / (N / 2);
      const a = Math.max(0, 1 - d);
      const k = (j * N + i) * 4;
      data[k] = 90;
      data[k + 1] = 40;
      data[k + 2] = 110;
      data[k + 3] = Math.round(a * a * (3 - 2 * a) * 0.45 * 255);
    }
  shadowTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  shadowTex.magFilter = shadowTex.minFilter = THREE.LinearFilter;
  shadowTex.needsUpdate = true;
  return shadowTex;
}
/** blob shadow footprint (w, l) per kind */
export const MOUNT_SHADOW: Record<MountKind, [number, number]> = {
  pony: [2.2, 3.4], unicorn: [2.2, 3.4], bike: [1.2, 2.4], car: [2.6, 3.8], manta: [4.2, 3.6], dragon: [3.2, 3.6], whale: [5, 10], dolphin: [1.6, 3.4],
  pedalo: [2.6, 5], sailboat: [3.4, 9], speedboat: [3.2, 8.4], ship: [6.6, 21], sub: [2.4, 6.4], deepsub: [4.6, 5.8],
};
/** the blob shadow's footprint in world units (scaled with the ride) */
export function mountShadowSize(kind: MountKind): [number, number] {
  const [w, l] = MOUNT_SHADOW[kind];
  const s = MOUNT_SCALE[kind];
  return [w * s, l * s];
}

/**
 * How far a ride leans in a turn (radians, for root.rotation.z): bikes lean into the turn,
 * the buggy rolls a touch outwards, animals barely. `yawRate` = heading change in rad/s
 * (positive = turning towards +X from +Z), `speed` in m/s.
 */
export function mountLean(kind: MountKind, yawRate: number, speed: number): number {
  // (boats: the Rocket Boat banks hard into a turn, the sailboat heels, the big ship rolls a touch
  // outwards; the subs bank like little planes)
  const [k, max] = LEAN[kind] ?? [0, 0];
  if (!k) return 0;
  return Math.max(-max, Math.min(max, -yawRate * speed * k));
}

const LEAN: Partial<Record<MountKind, [number, number]>> = {
  bike: [0.045, 0.42], car: [-0.008, 0.08], unicorn: [0.012, 0.08], pony: [0.012, 0.08], dolphin: [0.03, 0.35],
  pedalo: [0.01, 0.06], sailboat: [0.012, 0.2], speedboat: [0.012, 0.32], ship: [-0.0035, 0.06], sub: [0.02, 0.3], deepsub: [0.012, 0.18],
};

// placeholder material for the build step (parts are baked into vertex colours)
const BUILD_MAT = new THREE.MeshBasicMaterial();

type V3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

export function buildMount(kind: MountKind, accent = "#ff5fa8", skin: MountSkin = "classic"): MountRig {
  const main = SKIN_COLORS[kind][skin] ?? SKIN_COLORS[kind].classic;
  const S = MOUNT_SCALE[kind] ?? 1;
  const root = new THREE.Group();
  root.name = `mount:${kind}`;
  // everything visual hangs off `sc`, which scales the chibi-unit model up to true size
  const sc = new THREE.Group();
  sc.name = "mount-scale";
  root.add(sc);
  const body = new THREE.Bone(); // bobs/tilts
  body.name = "body";
  sc.add(body);

  /** a part: `col` becomes its vertex colour; `glow` parts light up at night */
  const mesh = (g: THREE.BufferGeometry, col: string, glow = false) => {
    const m = new THREE.Mesh(g, BUILD_MAT);
    m.userData.c = col;
    m.userData.g = glow ? 1 : 0;
    return m;
  };
  const bone = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const at = <T extends THREE.Object3D>(o: T, parent: THREE.Object3D, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  /** a round rod from a to b (in parent space) */
  const tube = (parent: THREE.Object3D, a: V3, b: V3, r: number, col: string, seg = 7) => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = mesh(new THREE.CylinderGeometry(r, r, len, seg, 1), col);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, vb.clone().sub(va).normalize());
    parent.add(m);
    return m;
  };
  const eyes = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, blush = true) => {
    const out: THREE.Bone[] = [];
    for (const side of [-1, 1]) {
      const e = bone(parent, side * x, y, z);
      e.add(mesh(new THREE.SphereGeometry(r, 10, 8), "#2b1d2e"));
      const hi = mesh(new THREE.SphereGeometry(r * 0.35, 6, 5), "#ffffff", true);
      hi.position.set(r * 0.3 * side, r * 0.35, r * 0.7);
      e.add(hi);
      out.push(e);
      if (blush) {
        const b = mesh(new THREE.SphereGeometry(r * 0.8, 8, 6), "#ff9fb8");
        b.scale.set(1.2, 0.6, 0.4);
        b.position.set(side * (x + r * 0.9), y - r * 1.3, z - r * 0.3);
        parent.add(b);
      }
    }
    return out;
  };
  const saddle = (parent: THREE.Object3D, y: number, z: number, w: number) => {
    const s = mesh(new THREE.CylinderGeometry(w, w * 1.05, 0.18, 14), accent);
    s.position.set(0, y, z);
    parent.add(s);
    const trim = mesh(new THREE.TorusGeometry(w, 0.06, 6, 16), "#ffe08a");
    trim.rotation.x = Math.PI / 2;
    trim.position.set(0, y + 0.05, z);
    parent.add(trim);
  };
  /** a flat shape in the x/z plane (y up = thickness), e.g. fins and wings */
  const flat = (pts: [number, number][], depth: number, bevel = 0.04, curve = 8) => {
    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: curve });
    g.translate(0, 0, -depth / 2);
    g.rotateX(-Math.PI / 2);
    return g;
  };

  const baseSeat = new THREE.Vector3(0, 1.4, 0);
  const basePet = new THREE.Vector3(0, 1.4, -0.9);
  let eyeList: THREE.Bone[] = [];
  /** per-frame animation; `speed` in m/s */
  let anim: (t: number, dt: number, speed: number, airborne: boolean) => void = () => {};
  let restAmt = 0;
  let caps = MOUNT_CAPS[kind];
  /** craft: adds non-baked parts (a sub's glass bubble) once the body is skinned */
  let after: ((body: THREE.Bone) => void) | null = null;

  if (kind === "pony" || kind === "unicorn") {
    // a proper unicorn: long legs, arched neck, spiral glowing horn, flowing rainbow mane + tail
    const coat = main;
    const rainbow = ["#ff7ac8", "#ffa34d", "#ffe45c", "#6fe39a", "#6cc4ff", "#a88cff"];
    const torso = mesh(new THREE.CapsuleGeometry(0.56, 1.15, 6, 14), coat);
    torso.rotation.x = Math.PI / 2;
    torso.position.y = 1.5;
    body.add(torso);
    // a little star on each flank
    for (const side of [-1, 1]) {
      const st: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = i % 2 ? 0.08 : 0.19;
        st.push([Math.sin(a) * r, Math.cos(a) * r]);
      }
      const g = flat(st, 0.03, 0.01, 1);
      g.rotateZ(Math.PI / 2);
      const s = mesh(g, "#ffd0f0", true);
      s.position.set(side * 0.56, 1.5, -0.55);
      body.add(s);
    }
    const neck = bone(body, 0, 1.72, 0.7);
    const nk = mesh(new THREE.CapsuleGeometry(0.27, 0.78, 5, 10), coat);
    nk.position.set(0, 0.42, 0.2);
    nk.rotation.x = 0.5;
    neck.add(nk);
    const head = bone(neck, 0, 0.95, 0.44);
    const skull = mesh(new THREE.SphereGeometry(0.44, 14, 10), coat);
    skull.scale.set(0.95, 0.95, 1.05);
    head.add(skull);
    const snout = mesh(new THREE.SphereGeometry(0.3, 12, 9), "#ffe0f0");
    snout.scale.set(1, 0.8, 1.15);
    snout.position.set(0, -0.2, 0.42);
    head.add(snout);
    for (const side of [-1, 1]) {
      const n = mesh(new THREE.SphereGeometry(0.04, 5, 4), "#c98aa8");
      n.position.set(side * 0.1, -0.16, 0.74);
      head.add(n);
      const ear = mesh(new THREE.ConeGeometry(0.1, 0.3, 7), coat);
      ear.position.set(side * 0.24, 0.45, -0.1);
      ear.rotation.z = -side * 0.3;
      head.add(ear);
      const inner = mesh(new THREE.ConeGeometry(0.05, 0.18, 6), "#ffb8da");
      inner.position.set(side * 0.24, 0.43, -0.05);
      inner.rotation.z = -side * 0.3;
      head.add(inner);
    }
    eyeList = eyes(head, 0.24, 0.05, 0.36, 0.1);
    // the spiral horn: a golden cone wrapped with a glowing ribbon
    const horn = bone(head, 0, 0.42, 0.2);
    horn.rotation.x = 0.4;
    const hc = mesh(new THREE.ConeGeometry(0.09, 0.62, 10), "#ffe36b", true);
    hc.position.y = 0.3;
    horn.add(hc);
    for (let i = 0; i < 4; i++) {
      const ring = mesh(new THREE.TorusGeometry(0.085 - i * 0.017, 0.022, 5, 12), "#ff9fe0", true);
      ring.rotation.x = Math.PI / 2 + 0.25;
      ring.position.y = 0.06 + i * 0.13;
      horn.add(ring);
    }
    // flowing mane: rainbow locks from the crown down the back of the neck, in two swaying bones
    const mane1 = bone(neck, 0, 0.95, 0.22);
    const mane2 = bone(neck, 0, 0.45, -0.05);
    rainbow.forEach((c, i) => {
      const lock = mesh(new THREE.SphereGeometry(0.2, 8, 6), c);
      lock.scale.set(0.6, 1.05, 0.75);
      const m = i < 3 ? mane1 : mane2;
      const k = i % 3;
      lock.position.set(i % 2 ? 0.09 : -0.09, -k * 0.2, -0.2 - k * 0.1);
      lock.rotation.x = -0.5;
      m.add(lock);
    });
    const fore = mesh(new THREE.SphereGeometry(0.17, 8, 6), rainbow[0]);
    fore.scale.set(1, 0.6, 0.85);
    fore.position.set(0.06, 0.36, 0.2);
    head.add(fore);
    const fore2 = mesh(new THREE.SphereGeometry(0.15, 8, 6), rainbow[5]);
    fore2.scale.set(1, 0.6, 0.85);
    fore2.position.set(-0.08, 0.38, 0.08);
    head.add(fore2);
    // the tail: three bones of rainbow puffs, long and flowing
    const tail1 = bone(body, 0, 1.74, -1.08);
    const tail2 = bone(tail1, 0, -0.34, -0.36);
    const tail3 = bone(tail2, 0, -0.38, -0.26);
    const tails = [tail1, tail2, tail3];
    rainbow.forEach((c, i) => {
      const puff = mesh(new THREE.SphereGeometry(0.23 - (i % 2) * 0.03, 8, 6), c);
      puff.scale.set(0.7, 1.25, 1);
      puff.position.set(i % 2 ? 0.07 : -0.07, -((i % 2) * 0.12), -((i % 2) * 0.08));
      tails[Math.floor(i / 2)].add(puff);
    });
    // four long legs with golden hooves (bones at the hips)
    const legs: THREE.Bone[] = [];
    for (const [x, z] of [[-0.3, 0.62], [0.3, 0.62], [-0.3, -0.62], [0.3, -0.62]] as const) {
      const leg = bone(body, x, 1.28, z);
      const l = mesh(new THREE.CapsuleGeometry(0.13, 0.78, 4, 8), coat);
      l.position.y = -0.55;
      const sock = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 9), "#ffd6ee");
      sock.position.y = -0.98;
      const hoof = mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.16, 9), "#ffcf4a");
      hoof.position.y = -1.14;
      leg.add(l, sock, hoof);
      legs.push(leg);
    }
    saddle(body, 2.08, -0.05, 0.42);
    baseSeat.set(0, 1.72, -0.05);
    basePet.set(0, 1.62, -0.8);
    let f = 0;
    anim = (t, dt, speed) => {
      const run = Math.min(1, speed / 7);
      f += dt * (5 + run * 9);
      // a rotary gallop: fronts a touch apart, backs a touch apart
      const ph = [0, 0.45, Math.PI, Math.PI + 0.45];
      legs.forEach((leg, i) => (leg.rotation.x = Math.sin(f + ph[i]) * (0.12 + 0.75 * run)));
      body.position.y = Math.abs(Math.sin(f)) * 0.2 * run + Math.sin(t * 2) * 0.015;
      body.rotation.x = Math.sin(f) * 0.06 * run;
      const graze = restAmt * (1 - run);
      neck.rotation.x = -0.1 * run + graze * 1.15 + Math.sin(t * 1.3) * 0.03;
      head.rotation.x = Math.sin(f * 2) * 0.08 * run + graze * 0.35 + (graze > 0.5 ? Math.sin(t * 5) * 0.06 : 0);
      mane1.rotation.x = -0.15 - Math.sin(f + 0.6) * 0.25 * run - Math.sin(t * 2.1) * 0.06;
      mane2.rotation.x = -0.1 - Math.sin(f + 1.2) * 0.25 * run - Math.sin(t * 2.4) * 0.06;
      mane1.rotation.z = Math.sin(t * 1.7) * 0.08;
      tail1.rotation.x = -0.25 - run * 0.6 - Math.sin(f) * 0.25 * run;
      tail2.rotation.x = -0.15 - Math.sin(f - 0.8) * 0.3 * run;
      tail3.rotation.x = -0.1 - Math.sin(f - 1.6) * 0.3 * run;
      tail1.rotation.y = Math.sin(t * 2.6) * 0.25 * (1 - run * 0.7);
      tail2.rotation.y = Math.sin(t * 2.6 - 0.7) * 0.2;
    };
    caps = MOUNT_CAPS.unicorn;
  } else if (kind === "bike") {
    // a colourful kid's bicycle: chunky frame, white-wall tyres, a front basket with a flower,
    // rainbow streamers on the grips. The kid pedals with their own legs; the cranks turn.
    const R = 0.42;
    const wheels: THREE.Bone[] = [];
    for (const z of [-0.64, 0.66]) {
      const w = bone(body, 0, R, z);
      const tyre = mesh(new THREE.TorusGeometry(R - 0.07, 0.075, 6, 18), "#3a3040");
      tyre.rotation.y = Math.PI / 2;
      w.add(tyre);
      const rim = mesh(new THREE.TorusGeometry(R - 0.14, 0.025, 4, 16), "#f4f0ff");
      rim.rotation.y = Math.PI / 2;
      w.add(rim);
      const hub = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8), accent);
      hub.rotation.z = Math.PI / 2;
      w.add(hub);
      for (let i = 0; i < 3; i++) {
        const sp = mesh(new THREE.BoxGeometry(0.025, (R - 0.14) * 2, 0.04), "#f4f0ff");
        sp.rotation.x = (i / 3) * Math.PI;
        w.add(sp);
      }
      wheels.push(w);
      // mudguard arc over the wheel
      const guard = mesh(new THREE.TorusGeometry(R + 0.04, 0.04, 4, 10, Math.PI * 0.8), main);
      guard.rotation.y = Math.PI / 2;
      guard.rotation.x = 0;
      guard.rotation.z = Math.PI * 0.1 + (z > 0 ? 0 : 0);
      guard.position.set(0, R, z);
      body.add(guard);
    }
    const bb: V3 = [0, 0.38, -0.04];
    const st: V3 = [0, 0.98, -0.3];
    const ht: V3 = [0, 1.02, 0.44];
    const hb: V3 = [0, 0.74, 0.52];
    tube(body, bb, st, 0.055, main);
    tube(body, bb, hb, 0.065, main);
    tube(body, [0, 0.8, -0.24], [0, 0.94, 0.47], 0.05, main);
    for (const s of [-1, 1]) {
      tube(body, [s * 0.07, R, -0.64], [s * 0.05, 0.38, -0.04], 0.035, main);
      tube(body, [s * 0.07, R, -0.64], [s * 0.04, 0.92, -0.28], 0.035, main);
      tube(body, [s * 0.07, R, 0.66], [s * 0.04, 0.76, 0.52], 0.04, main);
    }
    tube(body, hb, ht, 0.06, main);
    // handlebars (swept back towards the rider) with grips + streamers
    const bars = at(new THREE.Group(), body, 0, 1.16, 0.4);
    tube(bars, [0, -0.14, 0.04], [0, 0.02, 0], 0.04, "#d8d0e8");
    tube(bars, [-0.36, 0.04, -0.12], [0, 0.02, 0], 0.035, "#d8d0e8");
    tube(bars, [0.36, 0.04, -0.12], [0, 0.02, 0], 0.035, "#d8d0e8");
    const streamers: THREE.Bone[] = [];
    for (const s of [-1, 1]) {
      const g = mesh(new THREE.CapsuleGeometry(0.055, 0.14, 3, 7), accent);
      g.rotation.z = Math.PI / 2;
      g.position.set(s * 0.4, 0.045, -0.13);
      bars.add(g);
      const sb = bone(bars, s * 0.5, 0.045, -0.13);
      ["#ff7ac8", "#ffe45c", "#6cc4ff"].forEach((c, i) => {
        const r = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.32), c);
        r.position.set(s * 0.02, -0.02 + i * 0.012, -0.16);
        r.rotation.y = s * (i - 1) * 0.25;
        sb.add(r);
      });
      streamers.push(sb);
    }
    // a bell (glows a little at night)
    const bell = mesh(new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#ffe36b", true);
    bell.position.set(0.22, 0.08, -0.06);
    bars.add(bell);
    // basket on the front with a flower in it
    const bk = at(new THREE.Group(), body, 0, 0.98, 0.78);
    const wick = "#e0a860";
    const bot = mesh(new THREE.BoxGeometry(0.46, 0.04, 0.34), wick);
    bot.position.y = -0.14;
    bk.add(bot);
    for (const [x, z, w, d] of [[0, 0.17, 0.46, 0.04], [0, -0.17, 0.46, 0.04], [0.23, 0, 0.04, 0.34], [-0.23, 0, 0.04, 0.34]] as const) {
      const side = mesh(new THREE.BoxGeometry(w, 0.28, d), wick);
      side.position.set(x, 0, z);
      bk.add(side);
    }
    const rimB = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.38), "#c98a48");
    rimB.position.y = 0.14;
    bk.add(rimB);
    const flower = mesh(new THREE.SphereGeometry(0.1, 8, 6), "#ff8ad8");
    flower.position.set(0.08, 0.2, 0.04);
    bk.add(flower);
    const fc = mesh(new THREE.SphereGeometry(0.05, 6, 5), "#fff06b", true);
    fc.position.set(0.08, 0.24, 0.12);
    bk.add(fc);
    const lamp = mesh(new THREE.SphereGeometry(0.07, 8, 6), "#fff6c0", true);
    lamp.position.set(0, -0.02, 0.22);
    bk.add(lamp);
    // saddle on its post
    tube(body, st, [0, 1.06, -0.3], 0.035, "#d8d0e8");
    const sd = mesh(new THREE.CapsuleGeometry(0.1, 0.2, 4, 8), accent);
    sd.rotation.x = Math.PI / 2;
    sd.scale.set(1.35, 0.7, 1);
    sd.position.set(0, 1.1, -0.28);
    body.add(sd);
    // cranks + pedals turn with the wheels
    const crank = bone(body, 0, bb[1], bb[2]);
    const cog = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10), "#d8d0e8");
    cog.rotation.z = Math.PI / 2;
    cog.position.x = 0.09;
    crank.add(cog);
    for (const s of [-1, 1]) {
      const arm = mesh(new THREE.BoxGeometry(0.035, 0.035, 0.34), "#d8d0e8");
      arm.position.set(s * 0.13, 0, s * 0.15);
      crank.add(arm);
      const pedal = mesh(new THREE.BoxGeometry(0.14, 0.04, 0.09), "#3a3040");
      pedal.position.set(s * 0.19, 0, s * 0.3);
      crank.add(pedal);
    }
    baseSeat.set(0, 0.84, -0.26);
    basePet.set(0, 1.12, 0.8); // the pet rides in the basket!
    let roll = 0;
    anim = (t, dt, speed) => {
      roll += (speed * dt) / R;
      wheels[0].rotation.x = wheels[1].rotation.x = roll;
      crank.rotation.x = roll * 0.55;
      const flow = Math.min(1, speed / 6);
      streamers.forEach((s, i) => {
        s.rotation.x = -0.9 * flow + Math.sin(t * (4 + 8 * flow) + i) * (0.15 + 0.2 * flow) - 0.6 * (1 - flow);
        s.rotation.y = Math.sin(t * 3 + i * 2) * 0.2;
      });
      body.position.y = speed > 0.5 ? Math.abs(Math.sin(t * 9)) * 0.015 : 0;
    };
  } else if (kind === "car") {
    // a chunky cartoon beach buggy: open top, big bouncy wheels, smiley grille, pet seat in the back
    const W = 1.5;
    const tub = new THREE.Shape();
    // side profile (x = forward, y = up)
    const prof: [number, number][] = [
      [-1.3, 0.34], [1.35, 0.34], [1.5, 0.6], [1.35, 0.9], [0.62, 0.98], [0.42, 1.04], [0.32, 0.8], [-0.5, 0.78], [-0.62, 0.96], [-1.35, 0.98], [-1.42, 0.62],
    ];
    prof.forEach(([x, y], i) => (i ? tub.lineTo(x, y) : tub.moveTo(x, y)));
    const tg = new THREE.ExtrudeGeometry(tub, { depth: W, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2, curveSegments: 4 });
    tg.translate(0, 0, -W / 2);
    tg.rotateY(-Math.PI / 2);
    body.add(mesh(tg, main));
    // white racing stripe over the hood + number disc on the doors
    const stripe = mesh(new THREE.BoxGeometry(0.34, 0.04, 0.8), "#fff6f0");
    stripe.position.set(0, 1.02, 0.98);
    stripe.rotation.x = 0.1;
    body.add(stripe);
    for (const s of [-1, 1]) {
      const disc = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), "#fff6f0");
      disc.rotation.z = Math.PI / 2;
      disc.position.set(s * (W / 2 + 0.11), 0.62, -0.1);
      body.add(disc);
      const star = mesh(new THREE.OctahedronGeometry(0.11, 0), accent);
      star.scale.set(0.4, 1, 1);
      star.position.set(s * (W / 2 + 0.14), 0.62, -0.1);
      body.add(star);
    }
    // bumpers
    for (const z of [1.55, -1.48]) {
      const bump = mesh(new THREE.CapsuleGeometry(0.12, W - 0.1, 4, 8), "#e8e4f0");
      bump.rotation.z = Math.PI / 2;
      bump.position.set(0, 0.46, z);
      body.add(bump);
    }
    // smiley grille + headlights (glow) + tail lights
    const grin = mesh(new THREE.TorusGeometry(0.24, 0.045, 5, 12, Math.PI), "#3a3040");
    grin.rotation.z = Math.PI;
    grin.position.set(0, 0.7, 1.66);
    body.add(grin);
    for (const s of [-1, 1]) {
      const hl = mesh(new THREE.SphereGeometry(0.16, 10, 8), "#fff6c0", true);
      hl.position.set(s * 0.5, 0.82, 1.5);
      body.add(hl);
      const hlr = mesh(new THREE.TorusGeometry(0.16, 0.035, 5, 12), "#e8e4f0");
      hlr.position.set(s * 0.5, 0.82, 1.55);
      body.add(hlr);
      const tl = mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), "#ff4060", true);
      tl.position.set(s * 0.52, 0.82, -1.55);
      body.add(tl);
    }
    // seats: kid up front, pet in the back
    for (const [z, w] of [[0.02, 0.62], [-0.98, 0.6]] as const) {
      const cush = mesh(new THREE.BoxGeometry(w, 0.16, 0.5), accent);
      cush.position.set(0, 0.84, z);
      body.add(cush);
      const back = mesh(new THREE.BoxGeometry(w, 0.5, 0.14), accent);
      back.position.set(0, 1.08, z - 0.26);
      back.rotation.x = -0.15;
      body.add(back);
    }
    // steering wheel on its column
    tube(body, [0, 0.9, 0.8], [0, 1.18, 0.45], 0.035, "#3a3040");
    const sw = mesh(new THREE.TorusGeometry(0.2, 0.035, 5, 14), "#3a3040");
    sw.position.set(0, 1.2, 0.43);
    sw.rotation.x = -0.9;
    body.add(sw);
    // windscreen frame
    const ws = mesh(new THREE.BoxGeometry(W - 0.1, 0.42, 0.05), "#cfefff");
    ws.position.set(0, 1.26, 0.64);
    ws.rotation.x = -0.35;
    body.add(ws);
    // roll bar arch behind the kid, with a flag antenna and a star on top (glow)
    const bar = mesh(new THREE.TorusGeometry(W / 2 - 0.02, 0.06, 6, 14, Math.PI), "#e8e4f0");
    bar.position.set(0, 0.96, -0.42);
    body.add(bar);
    tube(body, [0.62, 1.0, -1.3], [0.62, 2.1, -1.36], 0.02, "#e8e4f0");
    const flag = mesh(new THREE.BoxGeometry(0.02, 0.22, 0.32), accent);
    flag.position.set(0.62, 1.98, -1.54);
    body.add(flag);
    const topStar = mesh(new THREE.OctahedronGeometry(0.09, 0), "#ffe36b", true);
    topStar.position.set(0.62, 2.14, -1.36);
    body.add(topStar);
    // big bouncy wheels (fixed to the ground; the body bounces over them)
    const Rw = 0.46;
    const wheels: THREE.Bone[] = [];
    for (const [x, z] of [[-0.86, 0.95], [0.86, 0.95], [-0.86, -0.92], [0.86, -0.92]] as const) {
      const w = bone(sc, x, Rw, z);
      const tyre = mesh(new THREE.CylinderGeometry(Rw, Rw, 0.36, 14), "#3a3040");
      tyre.rotation.z = Math.PI / 2;
      w.add(tyre);
      const tread = mesh(new THREE.TorusGeometry(Rw - 0.02, 0.06, 4, 14), "#4a4050");
      tread.rotation.y = Math.PI / 2;
      w.add(tread);
      const cap = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 10), "#fff6f0");
      cap.rotation.z = Math.PI / 2;
      w.add(cap);
      const nut = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.44, 6), accent);
      nut.rotation.z = Math.PI / 2;
      w.add(nut);
      for (let i = 0; i < 2; i++) {
        const sp = mesh(new THREE.BoxGeometry(0.42, 0.06, 0.36), "#fff6f0");
        sp.rotation.x = (i * Math.PI) / 2;
        sp.scale.set(1, 1, 1);
        w.add(sp);
      }
      wheels.push(w);
    }
    baseSeat.set(0, 0.56, 0.02);
    basePet.set(0, 0.92, -0.98);
    let roll = 0;
    let bounce = 0;
    anim = (t, dt, speed) => {
      roll += (speed * dt) / Rw;
      for (const w of wheels) w.rotation.x = roll;
      const go = Math.min(1, speed / 8);
      bounce = Math.abs(Math.sin(t * 7.5)) * 0.06 * go + Math.sin(t * 13) * 0.012 * go;
      body.position.y = bounce + (1 - go) * Math.sin(t * 2.2) * 0.008;
      body.rotation.x = -Math.sin(t * 7.5) * 0.02 * go;
      body.rotation.z = Math.sin(t * 5.1) * 0.012 * go;
    };
  } else if (kind === "manta") {
    // a big friendly manta ray with glowing spots, gently flapping
    const top = main;
    const core = mesh(new THREE.SphereGeometry(1, 18, 10), top);
    core.scale.set(1.1, 0.35, 1.3);
    core.position.y = 0.3;
    body.add(core);
    const under = mesh(new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), "#e8e0ff");
    under.scale.set(1.08, 0.3, 1.25);
    under.position.y = 0.29;
    body.add(under);
    const wings: THREE.Bone[] = [];
    for (const side of [-1, 1]) {
      const w = bone(body, side * 0.9, 0.3, 0);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.8);
      shape.quadraticCurveTo(1.2, 0.5, 2.1, -0.3);
      shape.quadraticCurveTo(1, -0.4, 0, -0.9);
      shape.lineTo(0, 0.8);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 8 });
      g.rotateX(-Math.PI / 2);
      if (side < 0) g.scale(-1, 1, 1);
      w.add(mesh(g, top));
      wings.push(w);
    }
    for (const side of [-1, 1]) {
      const fin = mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 6), top);
      fin.rotation.x = Math.PI / 2;
      fin.position.set(side * 0.38, 0.35, 1.35);
      body.add(fin);
    }
    eyeList = eyes(body, 0.55, 0.48, 1.05, 0.12);
    const tail = bone(body, 0, 0.3, -1.2);
    const tl = mesh(new THREE.ConeGeometry(0.07, 1.8, 6), top);
    tl.rotation.x = -Math.PI / 2;
    tl.position.set(0, 0, -0.8);
    tail.add(tl);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const s = mesh(new THREE.SphereGeometry(0.07, 6, 4), "#8ff7ff", true);
      s.position.set(Math.sin(a) * 0.75, 0.62, Math.cos(a) * 0.95);
      body.add(s);
    }
    saddle(body, 0.66, -0.1, 0.45);
    baseSeat.set(0, 0.72, -0.05);
    basePet.set(0, 0.66, -0.85);
    anim = (t, _dt, speed, air) => {
      const flap = Math.sin(t * (air ? 2.4 + Math.min(1.2, speed * 0.1) : 1.6)) * (air ? 0.4 : 0.12);
      wings[0].rotation.z = flap;
      wings[1].rotation.z = -flap;
      body.position.y = (air ? Math.sin(t * 2.4) * 0.12 : 0) + 0.25;
      body.rotation.x = -Math.min(0.2, speed * 0.015);
      tail.rotation.y = Math.sin(t * 1.3) * 0.25;
    };
  } else if (kind === "dragon") {
    // a small round cloud dragon with bat wings, little horns and a curly tail
    const scale = main;
    const torso = mesh(new THREE.SphereGeometry(0.85, 16, 12), scale);
    torso.scale.set(1, 0.9, 1.25);
    torso.position.y = 1.1;
    body.add(torso);
    const belly = mesh(new THREE.SphereGeometry(0.7, 12, 9), "#fff3c8");
    belly.scale.set(0.9, 0.8, 1.1);
    belly.position.set(0, 0.95, 0.35);
    body.add(belly);
    const head = bone(body, 0, 1.85, 1.05);
    head.add(mesh(new THREE.SphereGeometry(0.62, 14, 10), scale));
    const snout = mesh(new THREE.SphereGeometry(0.38, 12, 9), scale);
    snout.scale.set(1.1, 0.8, 1);
    snout.position.set(0, -0.15, 0.5);
    head.add(snout);
    for (const side of [-1, 1]) {
      const nostril = mesh(new THREE.SphereGeometry(0.05, 6, 4), "#2b1d2e");
      nostril.position.set(side * 0.13, -0.08, 0.86);
      head.add(nostril);
      const horn = mesh(new THREE.ConeGeometry(0.1, 0.35, 8), "#fff3c8");
      horn.position.set(side * 0.28, 0.58, -0.1);
      horn.rotation.z = -side * 0.35;
      head.add(horn);
    }
    eyeList = eyes(head, 0.26, 0.15, 0.45, 0.12);
    for (let i = 0; i < 5; i++) {
      const sp = mesh(new THREE.ConeGeometry(0.12, 0.3, 6), "#ff9fd6");
      sp.position.set(0, 1.95 - i * 0.12, 0.4 - i * 0.45);
      body.add(sp);
    }
    const wings: THREE.Bone[] = [];
    for (const side of [-1, 1]) {
      const w = bone(body, side * 0.6, 1.6, -0.1);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(1.5, 0.9);
      shape.quadraticCurveTo(1.3, 0.3, 1.6, 0.1);
      shape.quadraticCurveTo(1.1, -0.1, 1.2, -0.45);
      shape.quadraticCurveTo(0.7, -0.3, 0.5, -0.6);
      shape.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 6 });
      g.rotateX(-Math.PI / 2 + 0.4);
      if (side < 0) g.scale(-1, 1, 1);
      w.add(mesh(g, "#ffb3e0"));
      wings.push(w);
    }
    const tail = bone(body, 0, 0.9, -1);
    for (let i = 0; i < 6; i++) {
      const s = mesh(new THREE.SphereGeometry(0.28 - i * 0.035, 9, 7), scale);
      s.position.set(Math.sin(i * 0.6) * 0.2 * i, -i * 0.05, -i * 0.3);
      tail.add(s);
    }
    const tip = mesh(new THREE.OctahedronGeometry(0.16, 0), "#ffd36b", true);
    tip.position.set(Math.sin(6 * 0.6) * 1.2, -0.3, -1.85);
    tail.add(tip);
    for (const [x, z] of [[-0.45, 0.45], [0.45, 0.45], [-0.45, -0.4], [0.45, -0.4]] as const) {
      const l = mesh(new THREE.CapsuleGeometry(0.17, 0.25, 4, 8), scale);
      l.position.set(x, 0.3, z);
      body.add(l);
    }
    saddle(body, 1.93, -0.15, 0.45);
    baseSeat.set(0, 1.97, -0.1);
    basePet.set(0, 1.8, -0.85);
    anim = (t, _dt, speed, air) => {
      const fold = restAmt;
      const flap = air ? Math.sin(t * 7) * 0.7 : Math.sin(t * 1.5) * 0.12 * (1 - fold * 0.5) - 0.3 - fold * 0.55;
      wings[0].rotation.z = flap;
      wings[1].rotation.z = -flap;
      body.position.y = air ? Math.sin(t * 7) * 0.1 : Math.abs(Math.sin(t * (4 + speed))) * 0.08 * Math.min(1, speed / 3) + Math.sin(t * 1.1) * 0.02;
      tail.rotation.y = Math.sin(t * 2.2) * 0.35;
      head.rotation.x = Math.sin(t * 1.4) * 0.05 + fold * 0.12;
      head.rotation.y = Math.sin(t * 0.37) * 0.25 * fold;
    };
  } else if (kind === "whale") {
    // a huge friendly humpback: you sit on its broad back just behind the head; long white
    // flippers, a knobbly head, a big smile, and a slow majestic fluke beat
    const skin0 = main;
    const pale = "#eef2ff";
    const hull = mesh(new THREE.SphereGeometry(1, 20, 14), skin0);
    hull.scale.set(1.65, 1.35, 4.3);
    hull.position.set(0, -0.1, 0);
    body.add(hull);
    // the body's surface height (for sitting things on it)
    const topY = (x: number, z: number) => -0.1 + 1.35 * Math.sqrt(Math.max(0, 1 - (x / 1.65) ** 2 - (z / 4.3) ** 2));
    const bellyM = mesh(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42), pale);
    bellyM.scale.set(1.68, 1.37, 4.34);
    bellyM.position.set(0, -0.1, 0);
    body.add(bellyM);
    // knobbly tubercles on the head
    for (let i = 0; i < 7; i++) {
      const x = ((i % 3) - 1) * 0.42;
      const z = 3.45 - Math.floor(i / 3) * 0.42;
      const k = mesh(new THREE.SphereGeometry(0.11, 6, 5), "#8aa4dc");
      k.position.set(x, topY(x, z) - 0.02, z);
      body.add(k);
    }
    // a big smile round the front of the jaw
    const smilePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = -0.8 + (i / 12) * 1.6;
      const y = -0.5 + 0.22 * (u / 0.8) ** 2;
      const k = Math.sqrt(Math.max(0, 1 - ((y + 0.1) / 1.37) ** 2)) * 1.015;
      smilePts.push(new THREE.Vector3(Math.sin(u) * 1.65 * k, y, Math.cos(u) * 4.3 * k));
    }
    body.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smilePts), 16, 0.045, 4), "#3a3a6a"));
    eyeList = eyes(body, 1.3, 0.05, 2.75, 0.17);
    for (const e of eyeList) e.rotation.y = Math.sign(e.position.x) * 1.1;
    // dorsal hump + a golden saddle cushion on the back
    const hump = mesh(new THREE.ConeGeometry(0.4, 0.7, 7), skin0);
    hump.scale.set(0.3, 1, 1);
    hump.rotation.x = -0.7;
    hump.position.set(0, topY(0, -2.4) + 0.15, -2.4);
    body.add(hump);
    saddle(body, topY(0, 1.15) + 0.04, 1.15, 0.55);
    // blowhole with a sparkly water drop
    const spout = mesh(new THREE.SphereGeometry(0.12, 6, 5), "#bff4ff", true);
    spout.position.set(0, topY(0, 2.2) + 0.02, 2.2);
    body.add(spout);
    // long pectoral flippers
    const flippers: THREE.Bone[] = [];
    for (const side of [-1, 1]) {
      const f = bone(body, side * 1.35, -0.55, 1.6);
      const fl = mesh(new THREE.CapsuleGeometry(0.3, 1.9, 4, 8), pale);
      fl.scale.set(0.3, 1, 1.75);
      fl.rotation.set(0, side * 0.85, Math.PI / 2);
      fl.position.set(side * 0.85, 0, -0.8);
      f.add(fl);
      flippers.push(f);
    }
    // tail stock (two bones) + flukes
    const tail1 = bone(body, 0, -0.05, -3.6);
    const ts = mesh(new THREE.CylinderGeometry(0.75, 0.35, 2.2, 12), skin0);
    ts.rotation.x = Math.PI / 2;
    ts.position.set(0, 0, -1);
    tail1.add(ts);
    const tail2 = bone(tail1, 0, 0, -2.1);
    const fluke = flat([[0, 0.25], [0.9, 0.05], [1.7, -0.25], [1.9, -0.75], [1.2, -0.55], [0.35, -0.6], [0, -0.4], [-0.35, -0.6], [-1.2, -0.55], [-1.9, -0.75], [-1.7, -0.25], [-0.9, 0.05]], 0.12, 0.06, 4);
    const fm = mesh(fluke, skin0);
    fm.position.z = -0.2;
    tail2.add(fm);
    const flukeUnder = flat([[0, 0.15], [1.6, -0.3], [1.7, -0.65], [0, -0.35], [-1.7, -0.65], [-1.6, -0.3]], 0.03, 0, 1);
    const fu = mesh(flukeUnder, pale);
    fu.position.set(0, -0.09, -0.25);
    tail2.add(fu);
    baseSeat.set(0, 1.12, 1.15);
    basePet.set(0, 1.18, 0.1);
    let ph = 0;
    anim = (t, dt, speed) => {
      ph += dt * (0.8 + Math.min(1.5, speed * 0.15));
      const amp = 0.14 + Math.min(0.14, speed * 0.02);
      tail1.rotation.x = Math.sin(ph) * amp;
      tail2.rotation.x = Math.sin(ph - 0.9) * amp * 1.8;
      body.rotation.x = Math.sin(ph + 1.4) * 0.02;
      body.position.y = Math.sin(t * 0.7) * 0.08 + Math.sin(ph + 1.4) * 0.05;
      flippers[0].rotation.z = 0.26 + Math.sin(t * 0.6) * 0.14;
      flippers[1].rotation.z = -0.26 - Math.sin(t * 0.6) * 0.14;
      flippers[0].rotation.x = flippers[1].rotation.x = Math.sin(t * 0.6 + 1) * 0.1;
    };
  } else if (isCraft(kind)) {
    // boats and subs (./boats), built at true size from the same parts kit
    const c = buildCraftParts(kind, { body, sc, mesh, bone, tube, flat, eyes, main, accent });
    baseSeat.set(...c.seat);
    basePet.set(...c.pet);
    anim = c.anim;
    after = c.after ?? null;
    eyeList = c.eyes ?? [];
  } else {
    // a sleek, speedy dolphin: sit just in front of the dorsal fin; it porpoises out of the
    // water in big happy leaps when going fast
    const top = main;
    const belly = "#eef6ff";
    const hull = mesh(new THREE.SphereGeometry(1, 18, 12), top);
    hull.scale.set(0.58, 0.56, 1.55);
    hull.position.set(0, 0.2, 0);
    body.add(hull);
    const bm = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), belly);
    bm.scale.set(0.595, 0.575, 1.57);
    bm.position.set(0, 0.2, 0);
    body.add(bm);
    const melon = mesh(new THREE.SphereGeometry(0.44, 12, 10), top);
    melon.position.set(0, 0.32, 1.12);
    body.add(melon);
    const beak = mesh(new THREE.CapsuleGeometry(0.15, 0.26, 4, 8), "#cfe4f6");
    beak.rotation.x = Math.PI / 2;
    beak.scale.set(1, 1, 0.8);
    beak.position.set(0, 0.14, 1.55);
    body.add(beak);
    const smile = mesh(new THREE.TorusGeometry(0.2, 0.025, 4, 10, Math.PI * 0.8), "#3a3a6a");
    smile.rotation.set(Math.PI / 2 - 0.2, 0, Math.PI * 1.1);
    smile.position.set(0, 0.1, 1.5);
    body.add(smile);
    eyeList = eyes(body, 0.34, 0.36, 1.25, 0.08);
    for (const e of eyeList) e.rotation.y = Math.sign(e.position.x) * 0.9;
    const dorsal = mesh(new THREE.ConeGeometry(0.3, 0.62, 6), top);
    dorsal.scale.set(0.28, 1, 1);
    dorsal.rotation.x = -0.65;
    dorsal.position.set(0, 0.92, -0.45);
    body.add(dorsal);
    saddle(body, 0.76, 0.18, 0.32);
    const flippers: THREE.Bone[] = [];
    for (const side of [-1, 1]) {
      const f = bone(body, side * 0.45, -0.05, 0.5);
      const fl = mesh(new THREE.CapsuleGeometry(0.11, 0.42, 3, 6), top);
      fl.scale.set(0.4, 1, 1.3);
      fl.rotation.set(0, side * 0.7, Math.PI / 2);
      fl.position.set(side * 0.2, 0, -0.18);
      f.add(fl);
      flippers.push(f);
    }
    const tail1 = bone(body, 0, 0.18, -1.3);
    const ts = mesh(new THREE.CylinderGeometry(0.28, 0.12, 0.9, 10), top);
    ts.rotation.x = Math.PI / 2;
    ts.position.z = -0.4;
    tail1.add(ts);
    const tail2 = bone(tail1, 0, 0, -0.85);
    const fk = mesh(flat([[0, 0.12], [0.6, -0.15], [0.65, -0.38], [0, -0.18], [-0.65, -0.38], [-0.6, -0.15]], 0.06, 0.03, 2), top);
    tail2.add(fk);
    baseSeat.set(0, 0.62, 0.2);
    basePet.set(0, 0.62, -0.95);
    let ph = 0;
    let leapT = 0;
    let leapCool = 1.5;
    anim = (t, dt, speed) => {
      ph += dt * (2 + Math.min(6, speed * 0.7));
      const amp = 0.18 + Math.min(0.2, speed * 0.025);
      tail1.rotation.x = Math.sin(ph) * amp;
      tail2.rotation.x = Math.sin(ph - 0.8) * amp * 1.6;
      flippers[0].rotation.z = 0.4 + Math.sin(t * 1.4) * 0.12;
      flippers[1].rotation.z = -0.4 - Math.sin(t * 1.4) * 0.12;
      // leaps: when going fast, a big arc every few seconds
      if (leapT > 0) {
        leapT -= dt;
        const u = 1 - Math.max(0, leapT) / 1.1;
        body.position.y = Math.sin(Math.PI * u) * 1.15;
        body.rotation.x = -Math.cos(Math.PI * u) * 0.45;
      } else {
        body.position.y = Math.sin(ph + 1.2) * 0.05 + Math.sin(t * 1.1) * 0.05;
        body.rotation.x = Math.sin(ph + 1.2) * 0.03;
        leapCool -= dt * (speed > 4 ? 1 : 0);
        if (leapCool < 0) {
          leapT = 1.1;
          leapCool = 2.2 + ((t * 7.31) % 1.6);
        }
      }
    };
  }

  // (subs move with their own depth logic in the engine, not the fliers' altitude)
  const flies = (caps.medium === "air" || caps.medium === "under") && !isSub(kind);

  // ── bake: every part into one skinned mesh (rigid bones, vertex colours, glow mask) ──
  root.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [];
  root.traverse((o) => (o as THREE.Bone).isBone && bones.push(o as THREE.Bone));
  const boneIndex = new Map<THREE.Object3D, number>();
  bones.forEach((b, i) => boneIndex.set(b, i));
  const parts: THREE.BufferGeometry[] = [];
  const meshes: THREE.Mesh[] = [];
  const col = new THREE.Color();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes.push(m);
    let p: THREE.Object3D | null = m.parent;
    while (p && !boneIndex.has(p)) p = p.parent;
    const bi = p ? boneIndex.get(p)! : 0;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(src.attributes)) if (k !== "position" && k !== "normal") src.deleteAttribute(k);
    src.applyMatrix4(m.matrixWorld);
    const n = src.attributes.position.count;
    col.set(m.userData.c as string);
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
    }
    src.setAttribute("color", new THREE.BufferAttribute(c, 3));
    src.setAttribute("glow", new THREE.BufferAttribute(new Float32Array(n).fill(m.userData.g as number), 1));
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = bi;
      sw[i * 4] = 1;
    }
    src.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    src.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    parts.push(src);
  });
  for (const m of meshes) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  const geo = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  geo.computeBoundingSphere();
  const skinned = new THREE.SkinnedMesh(geo, mountMaterial());
  skinned.name = "mount-body";
  skinned.frustumCulled = false;
  sc.add(skinned);
  skinned.add(body);
  skinned.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton(bones));
  sc.scale.setScalar(S);
  after?.(body);

  // a soft blob shadow on the ground (the engine keeps it at ground level while flying)
  const [sw0, sl0] = mountShadowSize(kind);
  const shadowMat = new THREE.MeshBasicMaterial({ map: mountShadowTexture(), transparent: true, depthWrite: false });
  const shadowGeo = new THREE.PlaneGeometry(sw0, sl0);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.name = "mount-shadow";
  root.add(shadow);

  const seat = baseSeat.clone();
  const petSeat = basePet.clone();
  let t = 0;
  let blink = 2 + (kind.length % 3);
  return {
    kind,
    flies,
    root,
    seat,
    petSeat,
    update(dt, speed, airborne, glow, above) {
      t += dt;
      anim(t, dt, speed, airborne);
      // the rider moves with the body's bob (and the dolphin's leaps)
      seat.set(baseSeat.x, baseSeat.y + body.position.y - body.rotation.x * baseSeat.z, baseSeat.z - body.rotation.x * baseSeat.y * 0.3).multiplyScalar(S);
      petSeat.set(basePet.x, basePet.y + body.position.y - body.rotation.x * basePet.z, basePet.z).multiplyScalar(S);
      blink -= dt;
      const closed = blink < 0.12;
      for (const e of eyeList) e.scale.y = closed ? 0.15 : 1;
      if (blink < 0) blink = 2 + Math.random() * 3;
      const h = above ?? root.position.y;
      shadow.position.y = -h + 0.03;
      shadow.scale.setScalar(Math.max(0.35, 1 - h * 0.025));
      shadowMat.opacity = Math.max(0.2, 1 - h * 0.03);
      setMountGlow(glow);
    },
    rest(amount) {
      restAmt = Math.max(0, Math.min(1, amount));
    },
    dispose() {
      root.removeFromParent();
      geo.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      skinned.skeleton.dispose();
      root.traverse((o) => {
        if (o.name === "craft-glass") (o as THREE.Mesh).geometry.dispose();
      });
    },
  };
}

/**
 * The rig frozen in its idle pose as a plain (unskinned) geometry, for instancing parked/idle
 * rideables (position + normal + color + glow; feet at y=0, facing +Z). Caller owns/disposes it.
 */
export function mountStatueGeometry(kind: MountKind, accent = "#ff5fa8", skin: MountSkin = "classic", pose: { rest?: number; airborne?: boolean } = {}): THREE.BufferGeometry {
  const rig = buildMount(kind, accent, skin);
  rig.rest?.(pose.rest ?? 0);
  // settle the idle pose (a few quiet frames)
  for (let i = 0; i < 3; i++) rig.update(0.02, 0, !!pose.airborne, 0, 0);
  const sk = rig.root.getObjectByName("mount-body") as THREE.SkinnedMesh;
  rig.root.updateMatrixWorld(true);
  sk.skeleton.update();
  const src = sk.geometry;
  const out = new THREE.BufferGeometry();
  const n = src.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const mats = sk.skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(sk.bindMatrixInverse, b.matrixWorld).multiply(sk.skeleton.boneInverses[i]).multiply(sk.bindMatrix));
  const nmats = mats.map((m) => new THREE.Matrix3().getNormalMatrix(m));
  const si = src.attributes.skinIndex;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const b = si.getX(i);
    v.fromBufferAttribute(src.attributes.position as THREE.BufferAttribute, i).applyMatrix4(mats[b]);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    v.fromBufferAttribute(src.attributes.normal as THREE.BufferAttribute, i).applyMatrix3(nmats[b]).normalize();
    nor[i * 3] = v.x;
    nor[i * 3 + 1] = v.y;
    nor[i * 3 + 2] = v.z;
  }
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", (src.attributes.color as THREE.BufferAttribute).clone());
  out.setAttribute("glow", (src.attributes.glow as THREE.BufferAttribute).clone());
  const S = MOUNT_SCALE[kind] ?? 1;
  if (S !== 1) out.scale(S, S, S);
  out.computeBoundingSphere();
  rig.dispose();
  return out;
}
