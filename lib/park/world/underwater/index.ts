// Cucaino's underwater world: a coral reef all round the island on the real sea floor — sea grass
// meadows in the lagoon, coral gardens on the shelf, a swaying kelp forest along the drop-off —
// with four showpiece reef gardens (the Sunken Galleon with its treasure, the Sunken Temple, the
// Rainbow Reef, the Glow Kelp forest), 15 glowing pearls in giant clams to find, fish schools that
// scatter round the kid, glowing jellyfish, manta rays, sea turtles, bubbles, god rays, caustics
// and marine snow. An orca pod circles the island in `surface` (seen from above water too).
//
// Budget (standard): `group` ~26 draw calls, `surface` 2. The reef is streamed: items are baked
// once into sectors round the island and only the sectors near the kid are drawn (plan.ts).
// Update is allocation-free.
import * as THREE from "three";
import { WATER_Y, groundY } from "../../registry/terrain";
import { makeSparkTexture } from "../atmosphere";
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
  TEMPLE,
  WRECK,
  atSea,
  avoidKid,
  clampWater,
  fillWindow,
  localToWorld,
  mantaPath,
  midWater,
  orcaLap,
  planJellies,
  planReef,
  planSchools,
  planVents,
  schoolCentre,
  sectorOf,
  stepFish,
  type ReefKind,
  type V3,
} from "./plan";
import { makeCausticTexture, makeUwUniforms, uwMaterial } from "./shaders";
import { buildRockGeometry } from "../fantasy/stones";

export { PEARL_COUNT } from "./plan";

export interface Underwater {
  /** everything below the surface; the engine shows it only when the camera/kid is near or under water */
  group: THREE.Group;
  /** things visible from above water too (orcas breaching, mantas leaping), always shown */
  surface: THREE.Group;
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

  // ── fish schools ──
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
  const sState = schools.map((s) => ({ ...s, cx: s.ax, cy: s.ay, cz: s.az, px: s.ax, pz: s.az, yaw: 0 }));
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
  const cen: V3 = { x: 0, y: 0, z: 0 };

  // ── jellyfish ──
  const jDefs = planJellies(low ? 16 : 30);
  const jellyK = { value: 1 };
  const jellyMesh = new THREE.InstancedMesh(track(jellyGeometry()), track(jellyMaterial(U, jellyK)), jDefs.length);
  jellyMesh.name = "uw-jellies";
  jellyMesh.frustumCulled = false;
  jellyMesh.renderOrder = 5;
  jDefs.forEach((j, i) => jellyMesh.setColorAt(i, JELLY_COLS[Math.floor(j.hue * JELLY_COLS.length) % JELLY_COLS.length]));
  group.add(jellyMesh);

  // ── manta rays: graceful banking figure-eights over the reef edge and the deep ──
  const nManta = low ? 3 : 6;
  const mantaMesh = instanced(mantaGeometry(), mantaMat, nManta, "uw-mantas");
  mantaMesh.frustumCulled = false;
  const mDefs = Array.from({ length: nManta }, (_, i) => {
    const g = GARDENS[i % GARDENS.length];
    const p = atSea(g.a + (i >= 4 ? 0.12 : -0.05), g.d + 12 + (i % 2) * 6);
    const floor = groundY(p.x, p.z);
    const cy = Math.min(WATER_Y - 3.2, Math.max(floor + 4.5, -10));
    return { cx: p.x, cy, cz: p.z, r: 16 + (i % 3) * 5, rot: g.a + i, speed: 0.06 + (i % 3) * 0.012, ph: i * 1.9, s: 2.1 + (i % 3) * 0.35, yaw: 0, prevYaw: 0, y: cy };
  });
  const mp: V3 = { x: 0, y: 0, z: 0 };
  const mn: V3 = { x: 0, y: 0, z: 0 };
  mDefs.forEach((_, i) => (mantaMesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(i, 1, i * 2.1));

  // ── sea turtles ──
  const nTurtle = low ? 2 : 3;
  const turtleMesh = instanced(turtleGeometry(), turtleMat, nTurtle, "uw-turtles");
  turtleMesh.frustumCulled = false;
  const tDefs = Array.from({ length: nTurtle }, (_, i) => {
    const g = GARDENS[(i * 2 + 1) % GARDENS.length];
    return { ax: g.x, az: g.z, ay: midWater(g.x, g.z, 0.5), rad: 12 + i * 3, speed: 0.035 + i * 0.006, ph: i * 2.3, spread: [0, 1.2, 0] as [number, number, number] };
  });
  tDefs.forEach((_, i) => (turtleMesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(i, 1, i * 1.3));
  const tp: V3 = { x: 0, y: 0, z: 0 };
  const tn: V3 = { x: 0, y: 0, z: 0 };

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

  // ── the orca pod (surface group: seen from above and below) ──
  const nOrca = 3;
  const orcaGeo = track(orcaGeometry());
  orcaGeo.setAttribute("aInst", new THREE.InstancedBufferAttribute(new Float32Array(nOrca * 2), 2));
  const orcaMesh = new THREE.InstancedMesh(orcaGeo, orcaMat, nOrca);
  orcaMesh.name = "uw-orcas";
  orcaMesh.frustumCulled = false;
  surface.add(orcaMesh);
  const orcaInst = orcaGeo.attributes.aInst as THREE.InstancedBufferAttribute;
  const orcas = Array.from({ length: nOrca }, (_, i) => ({ y: -2.5, vy: 0, pitch: 0, roll: 0, breachT: -1, surfPh: i * 2.3, lastY: -2.5, spout: 2 + i * 3 }));
  let breachWait = 9;
  let breachWho = 0;
  const lapSpeed = 0.021;
  const op: V3 = { x: 0, y: 0, z: 0 };
  const on: V3 = { x: 0, y: 0, z: 0 };
  // splash particles
  const splashN = 320;
  const sp = new Float32Array(splashN * 3).fill(-80);
  const sv = new Float32Array(splashN * 3);
  const sl = new Float32Array(splashN);
  const sf = new Uint8Array(splashN);
  const splashGeo = track(new THREE.BufferGeometry());
  splashGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const spark = track(makeSparkTexture());
  const splashMat = track(new THREE.PointsMaterial({ map: spark, size: 1.9, color: "#f4fdff", transparent: true, depthWrite: false, opacity: 0.95 }));
  const splash = new THREE.Points(splashGeo, splashMat);
  splash.frustumCulled = false;
  surface.add(splash);
  let splashNext = 0;
  let sSeed = 99;
  const rnd = () => ((sSeed = (sSeed * 16807) % 2147483647) / 2147483647);
  const emit = (x: number, z: number, n: number, up: number, spread: number) => {
    for (let k = 0; k < n; k++) {
      const i = splashNext++ % splashN;
      sp[i * 3] = x + (rnd() - 0.5) * spread * 0.4;
      sp[i * 3 + 1] = WATER_Y + 0.2;
      sp[i * 3 + 2] = z + (rnd() - 0.5) * spread * 0.4;
      sv[i * 3] = (rnd() - 0.5) * spread;
      sv[i * 3 + 1] = up * (0.5 + rnd() * 0.7);
      sv[i * 3 + 2] = (rnd() - 0.5) * spread;
      sl[i] = 1 + rnd() * 0.8;
      sf[i] = 0;
    }
  };
  // lingering foam: spreads out on the surface and fades
  const foam = (x: number, z: number, n: number, speed: number) => {
    for (let k = 0; k < n; k++) {
      const i = splashNext++ % splashN;
      const a = rnd() * Math.PI * 2;
      sp[i * 3] = x;
      sp[i * 3 + 1] = WATER_Y + 0.15;
      sp[i * 3 + 2] = z;
      sv[i * 3] = Math.sin(a) * speed * (0.4 + rnd() * 0.6);
      sv[i * 3 + 1] = 0;
      sv[i * 3 + 2] = Math.cos(a) * speed * (0.4 + rnd() * 0.6);
      sl[i] = 1.6 + rnd() * 1.2;
      sf[i] = 1;
    }
  };

  scene.add(group, surface);

  const result: { pearl: number | null } = { pearl: null };

  return {
    group,
    surface,
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

      // orcas: a pod lapping the island, porpoising, and now and then a breach with a big splash
      breachWait -= dt;
      if (breachWait <= 0) {
        breachWait = 16 + rnd() * 20;
        const ob = orcas[breachWho];
        if (ob.breachT < 0) ob.breachT = 0;
        breachWho = (breachWho + 1) % nOrca;
      }
      for (let i = 0; i < nOrca; i++) {
        const oc = orcas[i];
        const lag = i * 0.022;
        orcaLap(t - lag / lapSpeed, lapSpeed, op);
        orcaLap(t - lag / lapSpeed + 0.5, lapSpeed, on);
        const side = (i - 1) * 3.5;
        const hx = on.x - op.x;
        const hz = on.z - op.z;
        const hl = Math.hypot(hx, hz) || 1;
        const x = op.x + (hz / hl) * side;
        const z = op.z - (hx / hl) * side;
        const yaw = Math.atan2(hx, hz);
        let y: number;
        let pitch: number;
        let roll = 0;
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
          y = -2.9 + surf * 2.3;
          pitch = u < 0.3 ? -Math.cos((u / 0.3) * Math.PI) * 0.22 : 0;
          if (oc.lastY < -1.2 && y >= -1.2) (emit(x, z, 10, 5, 1.2), foam(x, z, 6, 1.5)); // spout
        }
        oc.lastY = y;
        e.set(pitch, yaw, roll, "YXZ");
        m4.compose(v.set(x, y, z), q.setFromEuler(e), s3.setScalar(1));
        orcaMesh.setMatrixAt(i, m4);
        orcaInst.setXY(i, flapK, i * 1.7);
      }
      orcaMesh.instanceMatrix.needsUpdate = true;
      orcaInst.needsUpdate = true;
      for (let i = 0; i < splashN; i++) {
        if (sl[i] <= 0) {
          sp[i * 3 + 1] = -80;
          continue;
        }
        sl[i] -= dt;
        if (sf[i]) {
          sv[i * 3] *= 1 - dt * 0.8;
          sv[i * 3 + 2] *= 1 - dt * 0.8;
        } else sv[i * 3 + 1] -= 13 * dt;
        sp[i * 3] += sv[i * 3] * dt;
        sp[i * 3 + 1] += sv[i * 3 + 1] * dt;
        sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
        if (sp[i * 3 + 1] < WATER_Y - 0.3) sl[i] = 0;
      }
      splashGeo.attributes.position.needsUpdate = true;

      if (!group.visible) return result;

      // ── streaming + things that follow the kid ──
      streamReef(kid);
      rays.update(kid);
      const fog = scene.fog as THREE.Fog | null;
      caustics.update(kid, fog && (fog as THREE.Fog).isFog ? fog.far : 60);
      ceiling.position.set(kid.x, WATER_Y - 0.02, kid.z);
      kidC.value.set(kid.x, kid.y + 1.5, kid.z);

      // ── fish ──
      let fi = 0;
      for (let si = 0; si < sState.length; si++) {
        const s = sState[si];
        if (s.follow) {
          // the "near you" school: keep within sight of the kid (hop ahead unseen if left far behind)
          const dx = kid.x - s.ax;
          const dz = kid.z - s.az;
          const d = Math.hypot(dx, dz);
          if (o.under && d > 70) {
            const a = rnd() * Math.PI * 2;
            s.ax = kid.x + Math.sin(a) * 45;
            s.az = kid.z + Math.cos(a) * 45;
            s.ay = clampWater(s.ax, s.az, kid.y + 1.5, 1.5);
            schoolCentre(s, t, cen);
            for (let k = 0; k < s.n; k++) {
              const j = (fi + k) * 3;
              fP[j] = cen.x + fOff[j];
              fP[j + 1] = cen.y + fOff[j + 1];
              fP[j + 2] = cen.z + fOff[j + 2];
              fV[j] = fV[j + 1] = fV[j + 2] = 0;
            }
          } else if (o.under && d > 9) {
            const k = Math.min(1, dt * 0.12);
            s.ax += dx * k;
            s.az += dz * k;
            s.ay += (clampWater(s.ax, s.az, kid.y + 1.5, 1.5) - s.ay) * k;
          }
        }
        schoolCentre(s, t, cen);
        const hx = cen.x - s.px;
        const hz = cen.z - s.pz;
        if (hx * hx + hz * hz > 1e-6) s.yaw = Math.atan2(hx, hz);
        s.px = cen.x;
        s.pz = cen.z;
        const cy = Math.cos(s.yaw);
        const sy = Math.sin(s.yaw);
        const baseSpeed = s.n === 1 ? 1.1 : s.bait ? 2.2 : 2.6;
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
            tgt.x = cen.x + ox;
            tgt.z = cen.z + oz;
          } else {
            // formation turned to the school's heading (x across, z along)
            tgt.x = cen.x + ox * cy + oz * sy;
            tgt.z = cen.z - ox * sy + oz * cy;
          }
          const wob = fPhase[fi];
          tgt.x += Math.sin(t * 0.7 + wob) * 0.25;
          tgt.y = cen.y + oy + Math.sin(t * 0.9 + wob * 1.3) * 0.15;
          tgt.z += Math.cos(t * 0.6 + wob) * 0.25;
          const scare = avoidKid(fP[j], fP[j + 1], fP[j + 2], kid, s.n === 1 ? 3.5 : 4.5, push);
          tgt.x += push.x * 1.6;
          tgt.y += push.y * 1.6;
          tgt.z += push.z * 1.6;
          const speed = stepFish(fP, fV, fi, tgt.x, tgt.y, tgt.z, dt, s.n === 1 ? 0.6 : 2.2 + scare * 5, baseSpeed * (1 + scare * 2.2));
          // stay in the water
          const floor = groundY(fP[j], fP[j + 2]) + 0.35 * size;
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

      // ── jellies: pulse (in the shader), bob and drift; a few stay out in the blue near the kid ──
      for (let i = 0; i < jDefs.length; i++) {
        const j = jDefs[i];
        if (j.follow && o.under) {
          const dx = j.x - kid.x;
          const dz = j.z - kid.z;
          if (dx * dx + dz * dz > 58 * 58) {
            const a = rnd() * Math.PI * 2;
            j.x = kid.x + Math.sin(a) * (30 + rnd() * 20);
            j.z = kid.z + Math.cos(a) * (30 + rnd() * 20);
            j.y = midWater(j.x, j.z, 0.35 + rnd() * 0.4, 3);
          }
        }
        const x = j.x + Math.sin(t * 0.05 + j.ph) * 4;
        const z = j.z + Math.cos(t * 0.04 + j.ph) * 4;
        const pulse = Math.sin(t * 1.9 + x * 0.37 + z * 0.23);
        const y = clampWater(x, z, j.y + Math.sin(t * 0.3 + j.ph) * 0.8 + pulse * 0.12, 2.2 * j.s + 0.4);
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
        mantaPath(m, t, mp);
        mantaPath(m, t + 0.2, mn);
        // glide over the reef, never through it
        mp.y = clampWater(mp.x, mp.z, mp.y, 2.6);
        mn.y = clampWater(mn.x, mn.z, mn.y, 2.6);
        m.y += (mp.y - m.y) * Math.min(1, dt * 1.5);
        mp.y = m.y;
        const yaw = Math.atan2(mn.x - mp.x, mn.z - mp.z);
        let dyaw = yaw - m.prevYaw;
        dyaw -= Math.round(dyaw / (Math.PI * 2)) * Math.PI * 2;
        m.prevYaw = yaw;
        m.yaw += (Math.max(-0.75, Math.min(0.75, -(dyaw / Math.max(dt, 1e-3)) * 1.6)) - m.yaw) * Math.min(1, dt * 2);
        const pitch = -Math.atan2(mn.y - mp.y, Math.hypot(mn.x - mp.x, mn.z - mp.z));
        e.set(pitch, yaw, m.yaw, "YXZ");
        m4.compose(v.set(mp.x, mp.y, mp.z), q.setFromEuler(e), s3.setScalar(m.s));
        mantaMesh.setMatrixAt(i, m4);
      }
      mantaMesh.instanceMatrix.needsUpdate = true;

      // ── turtles ──
      for (let i = 0; i < nTurtle; i++) {
        const d = tDefs[i];
        schoolCentre(d, t, tp);
        schoolCentre(d, t + 0.3, tn);
        const yaw = Math.atan2(tn.x - tp.x, tn.z - tp.z);
        const pitch = -Math.atan2(tn.y - tp.y, Math.hypot(tn.x - tp.x, tn.z - tp.z)) * 0.6;
        e.set(pitch, yaw, Math.sin(t * 0.8 + i) * 0.08, "YXZ");
        m4.compose(v.set(tp.x, tp.y, tp.z), q.setFromEuler(e), s3.setScalar(1.15));
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

