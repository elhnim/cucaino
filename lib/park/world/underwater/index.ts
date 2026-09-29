// Cucaino's underwater world: a coral reef all round the island on the real sea floor — sea grass
// meadows in the lagoon, coral gardens on the shelf, a swaying kelp forest along the drop-off —
// with four showpiece reef gardens (the Sunken Galleon with its treasure, the Sunken Temple, the
// Rainbow Reef, the Glow Kelp forest), 15 glowing pearls in giant clams to find, fish schools that
// scatter round the kid, glowing jellyfish, manta rays, sea turtles, bubbles, god rays, caustics,
// marine snow and the deep sandy plain beyond the reef. Everything that swims roams on its own
// heading (../sea/wander.ts): reef dwellers round their reef, the rest round the kid — respawned
// out of sight when left behind, so the whole boundless ocean is alive. In `surface` (seen from
// above water too): an orca pod, and the giant blue whales and humpbacks (../sea/whales.ts) that
// surface to blow, lift their flukes and dive, breach, and glide past a diving kid.
//
// Budget (standard): `group` ~27 draw calls, `surface` 4. The reef is streamed: items are baked
// once into sectors round the island and only the sectors near the kid are drawn (plan.ts).
// Update is allocation-free.
import * as THREE from "three";
import { WATER_Y, groundY } from "../../registry/terrain";
import { col, merge } from "../fantasy/geo";
import { rngOf } from "../fantasy/noise";
import { buildBubbles, buildCeiling, buildFloorCaustics, buildGlowSprites, buildRays, buildSnow, jellyMaterial } from "./fx";
import {
  FISH_SHAPE,
  anemoneGeometry,
  brainGeometry,
  chestGeometry,
  clamBaseGeometry,
  clamLidGeometry,
  fanGeometry,
  fishGeometry,
  galleonGeometry,
  jellyGeometry,
  kelpGeometry,
  mantaGeometry,
  orcaGeometry,
  place,
  seagrassGeometry,
  staghornGeometry,
  starfishGeometry,
  templeGeometry,
  tableGeometry,
  tubeGeometry,
  turtleGeometry,
  urchinGeometry,
} from "./geometry";
import {
  CHEST,
  GARDENS,
  HERO_ANEMONES,
  PEARLS,
  PEARL_COUNT,
  PEARL_Y,
  REEF_KINDS,
  SPECIES,
  TEMPLE,
  WRECK,
  atSea,
  avoidKid,
  clampWater,
  fillWindow,
  localToWorld,
  midWater,
  planJellies,
  planReef,
  planSchools,
  planVents,
  sectorOf,
  stepFish,
  type ReefKind,
  type V3,
} from "./plan";
import { makeCausticTexture, makeUwUniforms, uwMaterial } from "./shaders";
import { buildRockGeometry } from "../fantasy/stones";
import { buildDeepFloor } from "../sea/deepFloor";
import { DROP, FOAM, MIST, buildSpray } from "../sea/spray";
import { dist2, follow, makeFocusTracker, makeSwimmer, respawn, seaDepth, seaFloorY, shiftSwimmers, swim, trackFocus, type Swimmer, type SwimStyle } from "../sea/wander";
import { blowholeLocal, whaleGeometry } from "../sea/whaleGeometry";
import { BREACH, EV_BLOW, EV_DRIP, EV_ENTER, EV_EXIT, WHALE_STYLE, bodyToWorld, directWhales, makeWhale, makeWhaleDirector, stepWhale, type Whale } from "../sea/whales";

export { PEARL_COUNT } from "./plan";

export interface Underwater {
  /** everything below the surface; the engine shows it only when the camera/kid is near or under water */
  group: THREE.Group;
  /** things visible from above water too (whales, orcas, their spray), always shown */
  surface: THREE.Group;
  /** the giant whales (read-only; exposed for the smoke harness) */
  whales: readonly Whale[];
  /** collectable glowing pearls sitting in giant clams on the reef */
  pearls: { id: number; x: number; y: number; z: number }[];
  setPearlsFound(ids: number[]): void;
  /** kid = the kid's world position; under = camera is below the surface; glow = 0 day..1 twilight.
   *  Returns a pearl id collected this frame (kid within ~2m of an unfound pearl, while under water) */
  update(dt: number, t: number, o: { kid: THREE.Vector3; under: boolean; glow: number }): { pearl: number | null };
  dispose(): void;
}

const PALETTES: Record<ReefKind, string[]> = {
  staghorn: ["#ff6f91", "#ff9a4a", "#b980ff", "#ff80c8", "#4fd8c8", "#ffd166"],
  brain: ["#b6e36b", "#ffb86b", "#d99bff", "#ff8fb1", "#7fe0b8", "#f5e27a"],
  table: ["#9ad0a0", "#c8a8e8", "#e8c890", "#90c8d0"],
  fan: ["#ff4f8b", "#b04bff", "#ff8a3d", "#ffd23f", "#ff5fd0"],
  tube: ["#ff8f3a", "#8a6bff", "#ffd14a", "#ff5fa2", "#3fd6ff"],
  anemone: ["#ff7ac8", "#7affc9", "#ffb26b", "#c49bff", "#6fe8ff"],
  seagrass: ["#4fae4a", "#6fc24a", "#3f9a5a", "#8fcf4a"],
  kelp: ["#e89a3a", "#f0b050", "#d88a40", "#f0c060"],
  rock: ["#d8cfe0", "#c8d8d6", "#e0d0cc", "#c4cee0", "#d6ccc2"],
  starfish: ["#ff5a5a", "#ff9a3c", "#b15bff", "#3fb0ff", "#ffd23f"],
  urchin: ["#6a2a8a", "#2a2458", "#9a2a62", "#40205a"],
};
const JELLY_COLS = ["#7af7ff", "#ff8ae6", "#b99bff", "#9dffc9", "#ffd07a"].map((c) => col(c));

export function buildUnderwater(scene: THREE.Scene, opts: { lowQuality?: boolean }): Underwater {
  const low = !!opts.lowQuality;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
  const U = makeUwUniforms();
  U.uCausticTex.value = track(makeCausticTexture());
  const group = new THREE.Group();
  group.name = "underwater";
  const surface = new THREE.Group();
  surface.name = "underwater-surface";

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c = new THREE.Color();
  const X = new THREE.Vector3(1, 0, 0);

  // ── materials (one program each; shared uniforms) ──
  const reefMat = track(uwMaterial(U, { motion: "sway", inst: true }));
  const reefMat2 = track(uwMaterial(U, { motion: "sway", inst: true }, { side: THREE.DoubleSide }));
  const brainMat = track(uwMaterial(U, { motion: "none", inst: true, pattern: "brain" }, { roughness: 0.9 }));
  const fanMat = track(uwMaterial(U, { motion: "sway", inst: true, pattern: "lace" }, { side: THREE.DoubleSide }));
  const landmarkMat = track(uwMaterial(U, { motion: "sway" }, { side: THREE.DoubleSide, roughness: 0.85 }));
  const fishMat = track(uwMaterial(U, { motion: "fish", inst: true }, { side: THREE.DoubleSide, roughness: 0.42 }));
  const mantaMat = track(uwMaterial(U, { motion: "flap", inst: true, flapSpeed: 1.5, flapWave: 1.5 }, { side: THREE.DoubleSide, roughness: 0.6 }));
  const turtleMat = track(uwMaterial(U, { motion: "flap", inst: true, flapSpeed: 1.7, flapWave: 0.4 }, { roughness: 0.7 }));
  const orcaMat = track(uwMaterial(U, { motion: "flap", inst: true, flapAxis: "z", flapSpeed: 2.3, flapWave: 0.55, pattern: "orca" }, { roughness: 0.3 }));
  const clamMat = track(uwMaterial(U, { motion: "none", inst: true }, { side: THREE.DoubleSide, roughness: 0.45 }));
  const pearlMat = track(new THREE.MeshStandardMaterial({ color: "#fff6fb", roughness: 0.12, metalness: 0.15, emissive: new THREE.Color("#ffe3f4"), emissiveIntensity: 0.7 }));

  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, name: string, withInst = true) => {
    track(geo);
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    im.name = name;
    if (withInst) geo.setAttribute("aInst", new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 2), 2));
    im.count = n;
    group.add(im);
    return im;
  };

  // ── the reef (streamed by sector round the kid) ──
  const plan = planReef({ lowQuality: low });
  const heroN = HERO_ANEMONES.length;
  const GEOS: Record<ReefKind, () => THREE.BufferGeometry> = {
    staghorn: staghornGeometry,
    brain: brainGeometry,
    table: tableGeometry,
    fan: fanGeometry,
    tube: tubeGeometry,
    anemone: anemoneGeometry,
    seagrass: seagrassGeometry,
    kelp: kelpGeometry,
    rock: () => buildRockGeometry(low),
    starfish: starfishGeometry,
    urchin: urchinGeometry,
  };
  const MATS: Record<ReefKind, THREE.Material> = {
    staghorn: reefMat,
    brain: brainMat,
    table: reefMat,
    fan: fanMat,
    tube: reefMat,
    anemone: reefMat,
    seagrass: reefMat2,
    kelp: reefMat2,
    rock: reefMat,
    starfish: reefMat,
    urchin: reefMat,
  };
  interface Stream {
    kind: ReefKind;
    im: THREE.InstancedMesh;
    mats: Float32Array;
    cols: Float32Array;
    inst: Float32Array;
    base: number;
    copy: (index: number, slot: number) => void;
  }
  const streams: Stream[] = REEF_KINDS.map((kind) => {
    const items = plan.items[kind];
    const base = kind === "anemone" ? heroN : 0;
    const cap = plan.capacity[kind] + base;
    const im = instanced(GEOS[kind](), MATS[kind], cap, `reef-${kind}`);
    im.count = base; // nothing drawn until the first stream (instances start at the origin)
    const pal = PALETTES[kind].map((h) => col(h));
    const mats = new Float32Array(items.length * 16);
    const cols = new Float32Array(items.length * 3);
    const inst = new Float32Array(items.length * 2);
    items.forEach((it, i) => {
      let sx = it.s;
      let sy = it.s;
      let sz = it.s;
      let rot = it.rot;
      let y = it.y - 0.06 * it.s;
      if (kind === "kelp") {
        const H = Math.max(3, (WATER_Y - 0.7 - it.y) * it.s);
        sx = sy = sz = H / 12;
        y = it.y - 0.2;
      } else if (kind === "rock") {
        sx = it.s * (1 + it.hue * 0.4);
        sy = it.s * (0.55 + it.tilt * 1.5);
        sz = it.s * (1.2 - it.hue * 0.3);
        y = it.y - 0.2 * it.s;
      } else if (kind === "fan") {
        // sea fans turn broadside to the swell (face out to sea)
        rot = Math.atan2(it.x, it.z) + (it.hue - 0.5) * 0.9;
        sy = it.s * 1.1;
      } else if (kind === "brain") {
        sy = it.s * (0.8 + it.hue * 0.3);
      }
      e.set(Math.cos(it.tiltDir) * it.tilt, rot, Math.sin(it.tiltDir) * it.tilt, "YXZ");
      m4.compose(v.set(it.x, y, it.z), q.setFromEuler(e), s3.set(sx, sy, sz));
      m4.toArray(mats, i * 16);
      const pi = Math.floor(it.hue * pal.length) % pal.length;
      c.copy(pal[pi]).lerp(pal[(pi + 1) % pal.length], (it.hue * pal.length) % 1 * 0.3);
      c.multiplyScalar(0.92 + ((it.hue * 97) % 1) * 0.16);
      c.toArray(cols, i * 3);
      inst[i * 2] = it.glow;
      inst[i * 2 + 1] = it.hue * 20;
    });
    const imat = im.instanceMatrix.array as Float32Array;
    im.setColorAt(0, c.set("#ffffff"));
    const icol = im.instanceColor!.array as Float32Array;
    const iinst = (im.geometry.attributes.aInst as THREE.InstancedBufferAttribute).array as Float32Array;
    const copy = (index: number, slot: number) => {
      const k = slot + base;
      for (let j = 0; j < 16; j++) imat[k * 16 + j] = mats[index * 16 + j];
      icol[k * 3] = cols[index * 3];
      icol[k * 3 + 1] = cols[index * 3 + 1];
      icol[k * 3 + 2] = cols[index * 3 + 2];
      iinst[k * 2] = inst[index * 2];
      iinst[k * 2 + 1] = inst[index * 2 + 1];
    };
    return { kind, im, mats, cols, inst, base, copy };
  });
  // the hero anemones (clownfish homes) always occupy the anemone mesh's first slots
  {
    const st = streams.find((s) => s.kind === "anemone")!;
    const pal = ["#ff7ac8", "#c49bff", "#7affc9", "#ff9a6b"].map((h) => col(h));
    HERO_ANEMONES.forEach((a, i) => {
      m4.compose(v.set(a.x, a.y - 0.05, a.z), q.setFromEuler(e.set(0, i * 1.7, 0)), s3.setScalar(a.s));
      st.im.setMatrixAt(i, m4);
      st.im.setColorAt(i, pal[i % pal.length]);
      const ai = st.im.geometry.attributes.aInst as THREE.InstancedBufferAttribute;
      ai.setXY(i, 1, i * 3);
    });
  }
  let curSector = -1;
  const streamReef = (kid: THREE.Vector3) => {
    const s = sectorOf(kid.x, kid.z);
    if (s === curSector) return;
    curSector = s;
    for (const st of streams) {
      const n = fillWindow(plan.starts[st.kind], s, plan.half, plan.capacity[st.kind], st.copy);
      st.im.count = n + st.base;
      st.im.instanceMatrix.needsUpdate = true;
      if (st.im.instanceColor) st.im.instanceColor.needsUpdate = true;
      (st.im.geometry.attributes.aInst as THREE.InstancedBufferAttribute).needsUpdate = true;
      st.im.computeBoundingSphere();
    }
  };

  // ── the sunken galleon + treasure chest, the sunken temple (one mesh each) ──
  const wreckGeo = (() => {
    // follow the floor: bow-down pitch from the slope, sunk a little into the sand
    const bow = localToWorld(WRECK, 0, 6);
    const stern = localToWorld(WRECK, 0, -6);
    const yb = groundY(bow.x, bow.z);
    const ys = groundY(stern.x, stern.z);
    let lo = Infinity;
    for (let f = -6; f <= 6; f += 2) {
      const p = localToWorld(WRECK, 0, f);
      lo = Math.min(lo, groundY(p.x, p.z) - (ys + ((f + 6) / 12) * (yb - ys)));
    }
    const pitch = -Math.atan2(yb - ys, 12);
    const hull = place(galleonGeometry(), WRECK.x, (ys + yb) / 2 + Math.min(0, lo) - 0.55, WRECK.z, WRECK.rot, 0.26, pitch);
    const chest = place(chestGeometry(), CHEST.x, CHEST.y - 0.12, CHEST.z, CHEST.rot, 0.08, 0.05);
    return merge([hull, chest]);
  })();
  const wreck = new THREE.Mesh(track(wreckGeo), landmarkMat);
  wreck.name = "uw-galleon";
  group.add(wreck);
  const templeHead = WATER_Y - 1.1 - TEMPLE.y;
  const temple = templeGeometry({
    headroom: templeHead,
    floorAt: (lx, lz) => {
      const p = localToWorld(TEMPLE, lx, lz);
      return groundY(p.x, p.z) - TEMPLE.y;
    },
  });
  const templeMesh = new THREE.Mesh(track(place(temple.geometry, TEMPLE.x, TEMPLE.y, TEMPLE.z, TEMPLE.rot)), landmarkMat);
  templeMesh.name = "uw-temple";
  group.add(templeMesh);
  const templeGlows = temple.glows.map(([lx, ly, lz]) => {
    const p = localToWorld(TEMPLE, lx, lz);
    return { x: p.x, y: TEMPLE.y + ly, z: p.z };
  });

  // ── giant clams + pearls ──
  const clamBase = instanced(clamBaseGeometry(), clamMat, PEARL_COUNT, "uw-clams");
  const clamLid = instanced(clamLidGeometry(), clamMat, PEARL_COUNT, "uw-clam-lids");
  const pearlMesh = instanced(new THREE.SphereGeometry(0.2, 12, 8), pearlMat, PEARL_COUNT, "uw-pearls", false);
  const shellCols = ["#d8c3b0", "#c9b6d6", "#bcd2c8", "#e0c8b8"].map((h) => col(h));
  const found = new Uint8Array(PEARL_COUNT);
  const localFound = new Uint8Array(PEARL_COUNT);
  const lidOpen = new Float32Array(PEARL_COUNT).fill(1);
  PEARLS.forEach((p, i) => {
    m4.compose(v.set(p.x, p.y - 0.05, p.z), q.setFromEuler(e.set(0, p.rot, 0)), s3.setScalar(p.s));
    clamBase.setMatrixAt(i, m4);
    clamBase.setColorAt(i, shellCols[i % shellCols.length]);
    clamLid.setColorAt(i, shellCols[i % shellCols.length]);
    (clamBase.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(i, 1, i);
    (clamLid.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(i, 1, i);
  });
  clamBase.computeBoundingSphere();

  // ── fish schools: each school's centre is a swimmer roaming round its reef (or round the kid) ──
  const schools = planSchools({ lowQuality: low });
  const nFish = schools.reduce((a, s) => a + s.n, 0);
  const fishMesh = instanced(fishGeometry(), fishMat, nFish, "uw-fish");
  fishMesh.frustumCulled = false;
  const fishInst = fishMesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute;
  fishInst.setUsage(THREE.DynamicDrawUsage);
  fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const fP = new Float32Array(nFish * 3);
  const fV = new Float32Array(nFish * 3);
  const fOff = new Float32Array(nFish * 3);
  const fYaw = new Float32Array(nFish);
  const fPitch = new Float32Array(nFish);
  const fRoll = new Float32Array(nFish);
  const fPhase = new Float32Array(nFish);
  const fSchool = new Uint16Array(nFish);
  const sr = rngOf(5151);
  const sState = schools.map((s, si) => {
    const single = s.n === 1;
    const clown = !single && s.rad < 1;
    const home = { x: s.ax, z: s.az, r: 0 };
    let st: SwimStyle;
    if (single) st = { speed: [0.35, 0.9], turn: 0.45, wander: 0.07, depth: [1.2, 30], clear: 1, need: 2.5, look: 5, climb: 0.35, bank: 0.6, above: [0.9, 2.6], home: { ...home, r: 12 } };
    else if (clown) st = { speed: [0.1, 0.3], turn: 1.4, wander: 0.2, depth: [1.1, 30], clear: 1, need: 2.4, look: 1.5, climb: 0.3, bank: 0.3, above: [1.3, 2.1], home: { ...home, r: 1.6 } };
    else if (s.bait) st = { speed: [0.25, 0.6], turn: 0.5, wander: 0.05, depth: [2, 30], clear: s.spread[1] + 1, need: s.spread[1] * 2 + 3, look: 5, climb: 0.3, bank: 0.2, above: [3, 5.5], home: { ...home, r: 7 } };
    else
      st = {
        speed: [0.7, 1.5],
        turn: 0.55,
        wander: 0.07,
        depth: [1.4, 30],
        clear: s.spread[1] + 0.7,
        need: (s.spread[1] + 0.6) * 1.5 + 1.4,
        look: 7,
        climb: 0.4,
        bank: 0.8,
        above: [1.6 + s.spread[1], 4.5 + s.spread[1]],
        home: s.follow ? undefined : { ...home, r: s.rad * 2.4 + 8 },
      };
    const sw = makeSwimmer(s.ax, s.ay, s.az, sr() * Math.PI * 2, 300 + si * 7, st.speed[0]);
    return { ...s, st, sw, species0: s.species, size0: s.size, kidHome: { x: 0, z: 0, r: 18 } };
  });
  {
    const r = rngOf(4545);
    let i = 0;
    const tint = new THREE.Color();
    sState.forEach((s, si) => {
      for (let k = 0; k < s.n; k++, i++) {
        fSchool[i] = si;
        // a formation: a flattened ellipsoid (a hollow-ish ball for bait balls)
        let ox = (r() - 0.5) * 2;
        let oy = (r() - 0.5) * 2;
        let oz = (r() - 0.5) * 2;
        const l = Math.hypot(ox, oy, oz) || 1;
        const rad = s.bait ? 0.55 + 0.45 * Math.cbrt(r()) : Math.cbrt(r());
        ox = (ox / l) * rad * s.spread[0];
        oy = (oy / l) * rad * s.spread[1];
        oz = (oz / l) * rad * s.spread[2];
        fOff[i * 3] = ox;
        fOff[i * 3 + 1] = oy;
        fOff[i * 3 + 2] = oz;
        fP[i * 3] = s.ax + ox;
        fP[i * 3 + 1] = s.ay + oy;
        fP[i * 3 + 2] = s.az + oz;
        fPhase[i] = r() * 20;
        fYaw[i] = r() * 6.28;
        tint.setHSL(0, 0, 1).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.08);
        fishMesh.setColorAt(i, tint);
      }
    });
  }
  const tgt: V3 = { x: 0, y: 0, z: 0 };
  const push: V3 = { x: 0, y: 0, z: 0 };

  // ── jellyfish: blooms drifting round the gardens, and a few that drift near the kid ──
  const jDefs = planJellies(low ? 16 : 30);
  const jellyK = { value: 1 };
  const jellyMesh = new THREE.InstancedMesh(track(jellyGeometry()), track(jellyMaterial(U, jellyK)), jDefs.length);
  jellyMesh.name = "uw-jellies";
  jellyMesh.frustumCulled = false;
  jellyMesh.renderOrder = 5;
  jDefs.forEach((j, i) => jellyMesh.setColorAt(i, JELLY_COLS[Math.floor(j.hue * JELLY_COLS.length) % JELLY_COLS.length]));
  group.add(jellyMesh);
  const jState = jDefs.map((j, i) => ({
    sw: makeSwimmer(j.x, j.y, j.z, sr() * Math.PI * 2, 500 + i, 0.15),
    st: { speed: [0.06, 0.22], turn: 0.12, wander: 0.03, depth: [2.4, 14], clear: 2.2 * j.s + 0.4, need: 4, look: 3, climb: 0.12, bank: 0, home: j.follow ? undefined : { x: j.x, z: j.z, r: 16 } } as SwimStyle,
  }));

  // ── manta rays: graceful banking glides — half keep to a reef garden, half roam near the kid ──
  const nManta = low ? 3 : 6;
  const mantaMesh = instanced(mantaGeometry(), mantaMat, nManta, "uw-mantas");
  mantaMesh.frustumCulled = false;
  const MANTA: SwimStyle = { speed: [1.5, 2.6], turn: 0.3, wander: 0.05, depth: [3.2, 10], clear: 2.8, need: 6, look: 16, climb: 0.7, bank: 1.4 };
  const mDefs = Array.from({ length: nManta }, (_, i) => {
    const g = GARDENS[i % GARDENS.length];
    const p = atSea(g.a + (i >= 4 ? 0.12 : -0.05), g.d + 12 + (i % 2) * 6);
    const floor = groundY(p.x, p.z);
    const cy = Math.min(WATER_Y - 3.2, Math.max(floor + 4.5, -10));
    const resident = i % 2 === 0;
    return { sw: makeSwimmer(p.x, cy, p.z, g.a + Math.PI / 2 + i, 700 + i, 2), st: resident ? { ...MANTA, home: { x: p.x, z: p.z, r: 40 } } : MANTA, resident, s: 2.1 + (i % 3) * 0.35 };
  });
  mDefs.forEach((_, i) => (mantaMesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(i, 1, i * 2.1));

  // ── sea turtles ──
  const nTurtle = low ? 2 : 3;
  const turtleMesh = instanced(turtleGeometry(), turtleMat, nTurtle, "uw-turtles");
  turtleMesh.frustumCulled = false;
  const TURTLE: SwimStyle = { speed: [0.6, 1.1], turn: 0.35, wander: 0.06, depth: [1.5, 6], clear: 1.6, need: 3, look: 7, climb: 0.4, bank: 0.8 };
  const tDefs = Array.from({ length: nTurtle }, (_, i) => {
    const g = GARDENS[(i * 2 + 1) % GARDENS.length];
    const resident = i % 2 === 0;
    return { sw: makeSwimmer(g.x, midWater(g.x, g.z, 0.5), g.z, i * 2.3, 800 + i, 0.8), st: resident ? { ...TURTLE, home: { x: g.x, z: g.z, r: 28 } } : TURTLE, resident };
  });
  tDefs.forEach((_, i) => (turtleMesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(i, 1, i * 1.3));

  // ── glow sprites (jellies, pearls, treasure, temple runes, galleon lanterns) ──
  const nGlow = jDefs.length + PEARL_COUNT + 2 + templeGlows.length;
  const glow = buildGlowSprites(U, nGlow);
  track(glow);
  group.add(glow.points);
  const G_PEARL = jDefs.length;
  const G_CHEST = G_PEARL + PEARL_COUNT;
  const G_TEMPLE = G_CHEST + 2;
  const chestGlowAt = { x: CHEST.x, y: CHEST.y + 0.75, z: CHEST.z };
  const lantern = localToWorld(WRECK, 0, -6.4);
  const lanternAt = { x: lantern.x, y: groundY(lantern.x, lantern.z) + 3.4, z: lantern.z };

  // ── particles + light ──
  const kidC = { value: new THREE.Vector3() };
  const snow = buildSnow(U, low ? 350 : 800, 34, kidC);
  track(snow.geometry);
  track(snow.material as THREE.Material);
  group.add(snow);
  const bubbles = buildBubbles(U, planVents(low ? 6 : 10), low ? 12 : 18);
  track(bubbles.geometry);
  track(bubbles.material as THREE.Material);
  group.add(bubbles);
  const rayK = { value: 1 };
  const rays = buildRays(U, low ? 8 : 16, rayK);
  track(rays);
  group.add(rays.mesh);
  const ceiling = buildCeiling(U, 120);
  track(ceiling.geometry);
  track(ceiling.material as THREE.Material);
  group.add(ceiling);
  const caustics = buildFloorCaustics(U, low ? 36 : 56);
  track(caustics);
  group.add(caustics.mesh);

  // ── the deep sandy plain beyond the reef (follows the kid) ──
  const sandMat = track(uwMaterial(U, { motion: "none", pattern: "sand" }, { roughness: 0.96 }));
  const deepFloor = buildDeepFloor(sandMat, low ? 32 : 48, low ? 8 : 6);
  track(deepFloor);
  group.add(deepFloor.mesh);

  // ── spray: whale blows, breach splashes, dripping flukes, orca splashes ──
  const spray = buildSpray(low ? 600 : 1100);
  track(spray);
  surface.add(spray.points);
  let sSeed = 99;
  const rnd = () => ((sSeed = (sSeed * 16807) % 2147483647) / 2147483647);
  const emit = (x: number, z: number, n: number, up: number, spread: number) => spray.emit(DROP, x, WATER_Y + 0.2, z, n, up, spread, 0.7, 1.5);
  const foam = (x: number, z: number, n: number, speed: number) => spray.emit(FOAM, x, WATER_Y + 0.12, z, n, 0, speed, 1.5, 2.6);
  // where the kid is heading, and big jumps (the world wrap) that the roaming population follows
  const ft = makeFocusTracker();
  const shift = (s: { x: number; z: number }, dx: number, dz: number) => {
    s.x += dx;
    s.z += dz;
  };

  // ── the orca pod roams the open sea (surface group: seen from above and below) ──
  const nOrca = 3;
  const orcaGeo = track(orcaGeometry());
  orcaGeo.setAttribute("aInst", new THREE.InstancedBufferAttribute(new Float32Array(nOrca * 2), 2));
  const orcaMesh = new THREE.InstancedMesh(orcaGeo, orcaMat, nOrca);
  orcaMesh.name = "uw-orcas";
  orcaMesh.frustumCulled = false;
  surface.add(orcaMesh);
  const orcaInst = orcaGeo.attributes.aInst as THREE.InstancedBufferAttribute;
  const orcas = Array.from({ length: nOrca }, (_, i) => ({ breachT: -1, surfPh: i * 2.3, lastY: -2.5 }));
  const ORCA: SwimStyle = { speed: [3.2, 5], turn: 0.2, wander: 0.04, depth: [2.65, 2.65], clear: 2.5, need: 10, look: 30, climb: 1.2, bank: 2 };
  const orcaSw: Swimmer[] = Array.from({ length: nOrca }, (_, i) => makeSwimmer(0, -2.9, 0, 0, 900 + i, 4));
  {
    const r0 = rngOf(6262);
    const l = orcaSw[0];
    respawn(l, ORCA, { x: 0, z: 0 }, 0, 0, r0, 205, 235);
    l.yaw = Math.atan2(l.x, l.z) + Math.PI / 2;
    for (let i = 1; i < nOrca; i++) Object.assign(orcaSw[i], { x: l.x - Math.sin(l.yaw) * 6 * i, z: l.z - Math.cos(l.yaw) * 6 * i, yaw: l.yaw, y: l.y });
  }
  let breachWait = 9;
  let breachWho = 0;

  // ── giant whales: blue whales and humpbacks roaming the open ocean ──
  const nHump = low ? 1 : 2;
  const nBlue = low ? 1 : 2;
  const whales: Whale[] = [];
  for (let i = 0; i < nHump; i++) whales.push(makeWhale("humpback", 20 + i * 1.6, 11 + i * 2));
  for (let i = 0; i < nBlue; i++) whales.push(makeWhale("blue", 25.5 + i * 1.5, 12 + i * 2));
  {
    const wr = rngOf(8080);
    for (const w of whales) {
      respawn(w, WHALE_STYLE[w.kind], { x: 0, z: 0 }, 0, 0, wr, 215, 300);
      w.wait = 4 + wr() * 26;
      w.lastY = w.lastTail = w.y;
    }
  }
  const director = makeWhaleDirector();
  const whaleMats = {
    blue: track(uwMaterial(U, { motion: "flap", inst: true, flapAxis: "z", flapSpeed: 1.2, flapWave: 3.6, pattern: "blue" }, { roughness: 0.5 })),
    humpback: track(uwMaterial(U, { motion: "flap", inst: true, flapAxis: "z", flapSpeed: 1.35, flapWave: 3.4, pattern: "humpback" }, { roughness: 0.48 })),
  };
  const whaleMesh = (kind: "blue" | "humpback", n: number) => {
    const geo = track(whaleGeometry(kind));
    geo.setAttribute("aInst", new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
    const m = new THREE.InstancedMesh(geo, whaleMats[kind], n);
    m.name = `uw-${kind}-whales`;
    m.frustumCulled = false;
    surface.add(m);
    return m;
  };
  const whaleMeshes = { blue: whaleMesh("blue", nBlue), humpback: whaleMesh("humpback", nHump) };
  const blowholes = { blue: blowholeLocal("blue"), humpback: blowholeLocal("humpback") };
  const wp: V3 = { x: 0, y: 0, z: 0 };
  const foamT = new Float32Array(whales.length);
  const counts = { blue: 0, humpback: 0 };

  scene.add(group, surface);

  const result: { pearl: number | null } = { pearl: null };

  return {
    group,
    surface,
    whales,
    pearls: PEARLS.map((p) => ({ id: p.id, x: p.x, y: p.y + PEARL_Y * p.s, z: p.z })),
    setPearlsFound(ids) {
      for (let i = 0; i < PEARL_COUNT; i++) found[i] = localFound[i] || ids.includes(i) ? 1 : 0;
    },
    update(dtIn, t, o) {
      const dt = Math.min(0.1, Math.max(0, dtIn));
      const gl = o.glow;
      U.uTime.value = t;
      U.uGlow.value = gl;
      U.uGlowK.value = 0.2 + gl * 1.2;
      U.uCausticK.value = 1 - gl * 0.75;
      jellyK.value = 0.7 + gl * 0.55;
      rayK.value = 1 - gl * 0.5;
      pearlMat.emissiveIntensity = 0.55 + gl * 0.6 + Math.sin(t * 2) * 0.08;
      result.pearl = null;
      const kid = o.kid;

      // the roaming population follows the kid; across the world wrap the neighbourhood jumps too
      if (trackFocus(ft, kid.x, kid.z, dt)) {
        shiftSwimmers(whales, ft.jx, ft.jz);
        shiftSwimmers(orcaSw, ft.jx, ft.jz);
        for (const s of sState) if (s.follow) shift(s.sw, ft.jx, ft.jz);
        for (let i = 0; i < jDefs.length; i++) if (jDefs[i].follow) shift(jState[i].sw, ft.jx, ft.jz);
        for (const m of mDefs) if (!m.resident) shift(m.sw, ft.jx, ft.jz);
        for (const d of tDefs) if (!d.resident) shift(d.sw, ft.jx, ft.jz);
        for (let i = 0; i < nFish; i++)
          if (sState[fSchool[i]].follow) {
            fP[i * 3] += ft.jx;
            fP[i * 3 + 2] += ft.jz;
          }
      }

      // ── giant whales ──
      directWhales(whales, director, ft, kid.y, o.under, dt, rnd);
      counts.blue = counts.humpback = 0;
      for (let wi = 0; wi < whales.length; wi++) {
        const w = whales[wi];
        const ev = stepWhale(w, dt, t, rnd, kid);
        if (ev & EV_BLOW) {
          const bh = blowholes[w.kind];
          bodyToWorld(w, 0, bh.y * w.len, bh.z * w.len, wp);
          if (w.kind === "blue") {
            // a tall straight column
            spray.emit(MIST, wp.x, wp.y + 0.2, wp.z, 80, 13, 0.8, 2.4, 3.8);
            spray.emit(DROP, wp.x, wp.y + 0.2, wp.z, 24, 9, 1.1, 0.35, 1.6);
          } else {
            // a bushy balloon of a blow
            spray.emit(MIST, wp.x, wp.y + 0.2, wp.z, 70, 8.5, 2.2, 2.8, 3.4);
            spray.emit(DROP, wp.x, wp.y + 0.2, wp.z, 20, 6.5, 1.8, 0.35, 1.4);
          }
        }
        if (ev & EV_EXIT) {
          bodyToWorld(w, 0, 0, w.len * 0.2, wp);
          spray.emit(DROP, wp.x, WATER_Y + 0.3, wp.z, 160, 10, 6, 0.5, 1.9);
          spray.emit(MIST, wp.x, WATER_Y + 0.5, wp.z, 30, 5, 5, 3.6, 2.4);
          spray.emit(FOAM, wp.x, WATER_Y + 0.12, wp.z, 26, 0, 5, 2.4, 4);
        }
        if (ev & EV_ENTER) {
          if (w.mode === BREACH) {
            // the crash: a wall of white water
            spray.emit(DROP, w.x, WATER_Y + 0.3, w.z, 260, 14, 11, 0.6, 2.3);
            spray.emit(MIST, w.x, WATER_Y + 0.6, w.z, 70, 6, 9, 5, 3);
            spray.emit(FOAM, w.x, WATER_Y + 0.12, w.z, 80, 0, 7, 2.8, 5.5);
          } else {
            bodyToWorld(w, 0, 0, -w.len * 0.5, wp);
            spray.emit(DROP, wp.x, WATER_Y + 0.2, wp.z, 36, 4, 3, 0.6, 1.2);
            spray.emit(FOAM, wp.x, WATER_Y + 0.12, wp.z, 24, 0, 3, 2, 4);
          }
        }
        if (ev & EV_DRIP) {
          // water streaming off the trailing edge of the raised flukes
          for (let k = 0; k < 2; k++) {
            bodyToWorld(w, (rnd() - 0.5) * 0.28 * w.len, 0, -0.53 * w.len, wp);
            spray.emit(DROP, wp.x, wp.y, wp.z, 1, 0.2, 0.5, 0.45, 2.2);
          }
        }
        // a slick of foam along the back while it lingers at the surface
        if (w.y + w.girth > WATER_Y - 0.1 && w.mode !== BREACH) {
          foamT[wi] -= dt;
          if (foamT[wi] <= 0) {
            foamT[wi] = 0.2;
            bodyToWorld(w, 0, 0, (rnd() - 0.6) * w.len * 0.8, wp);
            spray.emit(FOAM, wp.x, WATER_Y + 0.12, wp.z, 1, 0, 0.6, 3, 3.5);
          }
        }
        const mesh = whaleMeshes[w.kind];
        const k = counts[w.kind]++;
        e.set(w.pitch, w.yaw, w.roll, "YXZ");
        m4.compose(v.set(w.x, w.y, w.z), q.setFromEuler(e), s3.setScalar(w.len));
        mesh.setMatrixAt(k, m4);
        (mesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(k, w.flap, wi * 2.1);
      }
      whaleMeshes.blue.instanceMatrix.needsUpdate = true;
      whaleMeshes.blue.geometry.attributes.aInst.needsUpdate = true;
      whaleMeshes.humpback.instanceMatrix.needsUpdate = true;
      whaleMeshes.humpback.geometry.attributes.aInst.needsUpdate = true;

      // ── orcas: a pod roaming the open sea, porpoising, and now and then a breach ──
      const lead = orcaSw[0];
      swim(lead, ORCA, dt, t, kid, 5);
      for (let i = 1; i < nOrca; i++) {
        follow(orcaSw[i], ORCA, lead, i === 1 ? -4.5 : 4.5, 4 + i * 1.5, dt, t);
        orcaSw[i].y = lead.y;
        orcaSw[i].roll += (lead.roll - orcaSw[i].roll) * Math.min(1, dt * 2);
      }
      {
        let quiet = true;
        for (const oc of orcas) if (oc.breachT >= 0 || oc.lastY > -2.2) quiet = false;
        const d2 = dist2(lead, kid);
        if ((d2 > 300 * 300 && quiet) || d2 > 460 * 460) respawn(lead, ORCA, kid, ft.vx, ft.vz, rnd, 190, 250, 1.2);
      }
      breachWait -= dt;
      if (breachWait <= 0) {
        breachWait = 16 + rnd() * 20;
        const ob = orcas[breachWho];
        if (ob.breachT < 0) ob.breachT = 0;
        breachWho = (breachWho + 1) % nOrca;
      }
      for (let i = 0; i < nOrca; i++) {
        const oc = orcas[i];
        const sw = orcaSw[i];
        const x = sw.x;
        const z = sw.z;
        let y: number;
        let pitch: number;
        let roll = sw.roll * 0.5;
        let flapK = 1;
        if (oc.breachT >= 0) {
          oc.breachT += dt;
          const u = oc.breachT / 3.3;
          y = -3.4 + Math.sin(Math.min(1, u) * Math.PI) * 9.2;
          pitch = -1.05 + Math.min(1, u) * 2.1;
          roll = Math.sin(Math.min(1, u) * Math.PI) * 0.55;
          flapK = 0.25;
          if (oc.lastY < WATER_Y && y >= WATER_Y) (emit(x, z, 45, 8, 5), foam(x, z, 20, 3));
          if (oc.lastY > WATER_Y && y <= WATER_Y) (emit(x, z, 70, 11, 8), foam(x, z, 30, 4.5));
          if (u >= 1) oc.breachT = -1;
        } else {
          // porpoise: rise to breathe every ~8 s (back and fin break the surface), then dive
          const u = (t * 0.125 + oc.surfPh) % 1;
          const surf = u < 0.3 ? Math.sin((u / 0.3) * Math.PI) : 0;
          y = sw.y + surf * 2.3;
          pitch = u < 0.3 ? -Math.cos((u / 0.3) * Math.PI) * 0.22 : sw.pitch * 0.5;
          if (oc.lastY < -1.2 && y >= -1.2) (spray.emit(MIST, x, WATER_Y + 0.8, z, 6, 4, 0.8, 1.2, 1.6), foam(x, z, 6, 1.5)); // blow
        }
        oc.lastY = y;
        e.set(pitch, sw.yaw, roll, "YXZ");
        m4.compose(v.set(x, y, z), q.setFromEuler(e), s3.setScalar(1));
        orcaMesh.setMatrixAt(i, m4);
        orcaInst.setXY(i, flapK, i * 1.7);
      }
      orcaMesh.instanceMatrix.needsUpdate = true;
      orcaInst.needsUpdate = true;
      spray.update(dt, gl);

      if (!group.visible) return result;

      // ── streaming + things that follow the kid ──
      streamReef(kid);
      rays.update(kid);
      const fog = scene.fog as THREE.Fog | null;
      caustics.update(kid, fog && (fog as THREE.Fog).isFog ? fog.far : 60);
      deepFloor.update(kid);
      ceiling.position.set(kid.x, WATER_Y - 0.02, kid.z);
      kidC.value.set(kid.x, kid.y + 1.5, kid.z);

      // ── fish ──
      let fi = 0;
      for (let si = 0; si < sState.length; si++) {
        const s = sState[si];
        const sw = s.sw;
        if (s.follow) {
          // the "near you" school: roams round the kid (and hops ahead unseen if left far behind);
          // out over the deep it's a shoal of silver sardines
          if (o.under && dist2(sw, kid) > 70 * 70) {
            respawn(sw, s.st, kid, ft.vx, ft.vz, rnd, 26, 36, 1.2);
            sw.y = clampWater(sw.x, sw.z, kid.y + 1.5, 1.5);
            const open = seaDepth(sw.x, sw.z) > 16;
            s.species = open ? SPECIES.sardine : s.species0;
            s.size = open ? 0.5 : s.size0;
            for (let k = 0; k < s.n; k++) {
              const j = (fi + k) * 3;
              fP[j] = sw.x + fOff[j];
              fP[j + 1] = sw.y + fOff[j + 1];
              fP[j + 2] = sw.z + fOff[j + 2];
              fV[j] = fV[j + 1] = fV[j + 2] = 0;
            }
          }
          if (o.under) {
            s.kidHome.x = kid.x;
            s.kidHome.z = kid.z;
            s.st.home = s.kidHome;
          } else s.st.home = undefined;
          // keep up with a kid who's swimming along
          s.st.speed[1] = Math.max(1.5, Math.hypot(ft.vx, ft.vz) * (dist2(sw, kid) > 15 * 15 ? 1.25 : 0.9));
        }
        swim(sw, s.st, dt, t);
        const cx = sw.x;
        const cyy = sw.y;
        const cz = sw.z;
        const cy = Math.cos(sw.yaw);
        const sy = Math.sin(sw.yaw);
        const baseSpeed = s.n === 1 ? 1.1 : s.bait ? 2.2 : Math.max(2.6, s.follow ? s.st.speed[1] * 1.3 : 0);
        const size = s.size;
        const shape = FISH_SHAPE[s.species];
        for (let k = 0; k < s.n; k++, fi++) {
          const j = fi * 3;
          let ox = fOff[j];
          const oy = fOff[j + 1];
          let oz = fOff[j + 2];
          if (s.bait) {
            // swirl round the ball's vertical axis (inner fish faster)
            const rr = Math.hypot(ox, oz) || 0.01;
            const a = Math.atan2(oz, ox) + t * (0.9 / (0.6 + rr * 0.35));
            ox = Math.cos(a) * rr;
            oz = Math.sin(a) * rr;
            tgt.x = cx + ox;
            tgt.z = cz + oz;
          } else {
            // formation turned to the school's heading (x across, z along)
            tgt.x = cx + ox * cy + oz * sy;
            tgt.z = cz - ox * sy + oz * cy;
          }
          const wob = fPhase[fi];
          tgt.x += Math.sin(t * 0.7 + wob) * 0.25;
          tgt.y = cyy + oy + Math.sin(t * 0.9 + wob * 1.3) * 0.15;
          tgt.z += Math.cos(t * 0.6 + wob) * 0.25;
          const scare = avoidKid(fP[j], fP[j + 1], fP[j + 2], kid, s.n === 1 ? 3.5 : 4.5, push);
          tgt.x += push.x * 1.6;
          tgt.y += push.y * 1.6;
          tgt.z += push.z * 1.6;
          const speed = stepFish(fP, fV, fi, tgt.x, tgt.y, tgt.z, dt, s.n === 1 ? 0.6 : 2.2 + scare * 5, baseSpeed * (1 + scare * 2.2));
          // stay in the water
          const floor = seaFloorY(fP[j], fP[j + 2]) + 0.35 * size;
          if (fP[j + 1] < floor) fP[j + 1] = floor;
          if (fP[j + 1] > WATER_Y - 0.5) fP[j + 1] = WATER_Y - 0.5;
          // face where it's going; bank into turns
          if (speed > 0.05) {
            const vx = fV[j];
            const vz = fV[j + 2];
            const want = Math.atan2(vx, vz);
            let dy = want - fYaw[fi];
            dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
            const turn = dy * Math.min(1, dt * 6);
            fYaw[fi] += turn;
            fRoll[fi] += (Math.max(-0.6, Math.min(0.6, -turn / Math.max(dt, 1e-3) * 0.12)) - fRoll[fi]) * Math.min(1, dt * 4);
            const pitchWant = Math.max(-0.5, Math.min(0.5, -Math.atan2(fV[j + 1], Math.hypot(vx, vz))));
            fPitch[fi] += (pitchWant - fPitch[fi]) * Math.min(1, dt * 4);
          }
          fPhase[fi] += dt * (5 + speed * 7) * (s.n === 1 ? 0.45 : 1);
          e.set(fPitch[fi], fYaw[fi], fRoll[fi], "YXZ");
          m4.compose(v.set(fP[j], fP[j + 1], fP[j + 2]), q.setFromEuler(e), s3.set(shape[0] * size, shape[1] * size, shape[2] * size));
          fishMesh.setMatrixAt(fi, m4);
          fishInst.setXY(fi, s.species + Math.min(0.99, 0.2 + (speed / baseSpeed) * 0.6), fPhase[fi]);
        }
      }
      fishMesh.instanceMatrix.needsUpdate = true;
      fishInst.needsUpdate = true;

      // ── jellies: pulse (in the shader), bob and drift ──
      for (let i = 0; i < jDefs.length; i++) {
        const j = jDefs[i];
        const js = jState[i];
        if (j.follow && o.under && dist2(js.sw, kid) > 58 * 58) {
          respawn(js.sw, js.st, kid, 0, 0, rnd, 28, 50);
          js.sw.y = midWater(js.sw.x, js.sw.z, 0.35 + rnd() * 0.4, 3);
        }
        swim(js.sw, js.st, dt, t);
        const x = js.sw.x;
        const z = js.sw.z;
        const pulse = Math.sin(t * 1.9 + x * 0.37 + z * 0.23);
        const y = clampWater(x, z, js.sw.y + Math.sin(t * 0.3 + j.ph) * 0.8 + pulse * 0.12, 2.2 * j.s + 0.4);
        e.set(Math.sin(t * 0.4 + j.ph) * 0.15, j.ph, Math.cos(t * 0.35 + j.ph) * 0.15);
        m4.compose(v.set(x, y, z), q.setFromEuler(e), s3.setScalar(j.s));
        jellyMesh.setMatrixAt(i, m4);
        const jc = JELLY_COLS[Math.floor(j.hue * JELLY_COLS.length) % JELLY_COLS.length];
        const hk = (0.35 + gl * 0.6) * (0.85 + 0.15 * pulse);
        glow.set(i, x, y + 0.45 * j.s, z, jc.r * hk, jc.g * hk, jc.b * hk, j.s * (3.2 + gl * 1.6));
      }
      jellyMesh.instanceMatrix.needsUpdate = true;

      // ── mantas ──
      for (let i = 0; i < nManta; i++) {
        const m = mDefs[i];
        if (!m.resident && dist2(m.sw, kid) > 150 * 150) respawn(m.sw, m.st, kid, ft.vx, ft.vz, rnd, 70, 115, 1.3);
        swim(m.sw, m.st, dt, t, kid, 5);
        e.set(m.sw.pitch, m.sw.yaw, m.sw.roll, "YXZ");
        m4.compose(v.set(m.sw.x, m.sw.y, m.sw.z), q.setFromEuler(e), s3.setScalar(m.s));
        mantaMesh.setMatrixAt(i, m4);
      }
      mantaMesh.instanceMatrix.needsUpdate = true;

      // ── turtles ──
      for (let i = 0; i < nTurtle; i++) {
        const d = tDefs[i];
        if (!d.resident && dist2(d.sw, kid) > 120 * 120) respawn(d.sw, d.st, kid, ft.vx, ft.vz, rnd, 55, 90, 1.3);
        swim(d.sw, d.st, dt, t, kid, 3);
        e.set(d.sw.pitch * 0.6, d.sw.yaw, d.sw.roll * 0.5 + Math.sin(t * 0.8 + i) * 0.06, "YXZ");
        m4.compose(v.set(d.sw.x, d.sw.y, d.sw.z), q.setFromEuler(e), s3.setScalar(1.15));
        turtleMesh.setMatrixAt(i, m4);
      }
      turtleMesh.instanceMatrix.needsUpdate = true;

      // ── clams + pearls ──
      for (let i = 0; i < PEARL_COUNT; i++) {
        const p = PEARLS[i];
        const want = found[i] ? 0 : 1;
        lidOpen[i] += (want - lidOpen[i]) * Math.min(1, dt * 3);
        const open = lidOpen[i] * (1.2 + Math.sin(t * 0.8 + i) * 0.08);
        const hinge = localToWorldY(p, 0, -0.55 * p.s);
        q.setFromEuler(e.set(0, p.rot, 0));
        q2.setFromAxisAngle(X, -open);
        q.multiply(q2);
        m4.compose(v.set(hinge.x, p.y - 0.05 + 0.3 * p.s, hinge.z), q, s3.setScalar(p.s));
        clamLid.setMatrixAt(i, m4);
        const bob = Math.sin(t * 1.6 + i * 1.3) * 0.035;
        const py = p.y - 0.05 + (PEARL_Y + bob) * p.s;
        const ps = found[i] ? 0 : p.s;
        m4.compose(v.set(p.x, py, p.z), q.identity(), s3.setScalar(ps));
        pearlMesh.setMatrixAt(i, m4);
        const pk = found[i] ? 0 : (0.55 + gl * 0.5) * (0.85 + 0.15 * Math.sin(t * 2.4 + i));
        glow.set(G_PEARL + i, p.x, py, p.z, 1.0 * pk, 0.85 * pk, 1.0 * pk, found[i] ? 0 : 1.2 * p.s);
        // collect: the kid swims within ~2 m of an unfound pearl
        if (!found[i] && o.under && result.pearl === null) {
          const dx = kid.x - p.x;
          const dy = kid.y - py;
          const dz = kid.z - p.z;
          if (dx * dx + dz * dz < 4 && Math.abs(dy) < 2.6) {
            found[i] = 1;
            localFound[i] = 1;
            result.pearl = i;
          }
        }
      }
      clamLid.instanceMatrix.needsUpdate = true;
      pearlMesh.instanceMatrix.needsUpdate = true;
      const ck = 0.6 + gl * 0.7;
      glow.set(G_CHEST, chestGlowAt.x, chestGlowAt.y, chestGlowAt.z, 1.0 * ck, 0.72 * ck, 0.25 * ck, 3.4);
      glow.set(G_CHEST + 1, lanternAt.x, lanternAt.y, lanternAt.z, 1.0 * ck * 0.8, 0.6 * ck * 0.8, 0.25 * ck * 0.8, 2.6);
      for (let i = 0; i < templeGlows.length; i++) {
        const g = templeGlows[i];
        const tk = (0.5 + gl * 0.6) * (0.85 + 0.15 * Math.sin(t * 1.3 + i));
        glow.set(G_TEMPLE + i, g.x, g.y, g.z, 0.35 * tk, 0.95 * tk, 1.0 * tk, i === templeGlows.length - 2 ? 3.2 : 2.2);
      }
      glow.commit();
      return result;
    },
    dispose() {
      scene.remove(group, surface);
      for (const root of [group, surface]) root.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
      for (const d of disposables) d.dispose();
    },
  };
}

/** clam hinge position: `fwd` metres along the clam's heading (allocation-free scratch) */
const hingeOut = { x: 0, z: 0 };
function localToWorldY(p: { x: number; z: number; rot: number }, right: number, fwd: number) {
  const s = Math.sin(p.rot);
  const c = Math.cos(p.rot);
  hingeOut.x = p.x + s * fwd + c * right;
  hingeOut.z = p.z + c * fwd - s * right;
  return hingeOut;
}

