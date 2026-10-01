// Cucaino's underwater world: a packed, joyful coral reef all round the island on the real sea
// floor — sea grass meadows (with seahorses) in the lagoon, towering staghorn thickets, big brain
// corals, huge sea fans, giant anemones, finger-coral bushes and sponges across the whole shelf,
// octopuses and moray eels peeking from their holes, crabs scuttling, a swaying kelp forest along
// the drop-off — with four showpiece reef gardens (the Sunken Galleon with its treasure, the
// Sunken Temple, the Rainbow Reef, the Glow Kelp forest), 15 glowing pearls in giant clams to
// find, ~800 fish (reef schools, glittering bait balls, travelling schools that keep turning up
// round the kid, little fish that swarm round them), glowing jellyfish, manta rays, sea turtles,
// blue-spotted rays gliding over the sand, bubbles, god rays, caustics, marine snow and the deep
// sandy plain beyond the reef. Everything that swims roams on its own heading (../sea/wander.ts):
// reef dwellers round their reef, the rest round the kid — respawned out of sight when left
// behind, so the whole boundless ocean is alive — and the big life comes to *meet* a diving kid
// (../sea/visits.ts): the orca pod, mantas and turtles swim right past every half-minute or so. In
// `surface` (seen from above water too): the orca pod, and the giant blue whales and humpbacks
// (../sea/whales.ts) that surface to blow, lift their flukes and dive, breach, and glide past a
// diving kid 8-15 m away every 20-35 s out over the deep.
//
// Creatures get "film light" (a self-light + a fresnel rim, ./shaders.ts) so they show their
// colours and markings in the blue instead of reading as shadows; anything wholly in the fog is
// culled per instance (no ghost outlines through the storybook ink pass).
//
// Budget (standard): ~38 draw calls, <= 260k triangles at the very most (low: about half). The reef
// is streamed: items are baked once into sectors round the island and only the sectors near the
// kid are drawn (plan.ts). Update is allocation-free.
import * as THREE from "three";
import { WATER_Y, groundY } from "../../registry/terrain";
import { col, merge } from "../fantasy/geo";
import { rngOf } from "../fantasy/noise";
import { buildBubbles, buildCeiling, buildFloorCaustics, buildGlowSprites, buildRays, buildSnow, jellyMaterial } from "./fx";
import {
  FISH_SHAPE,
  anemoneGeometry,
  brainGeometry,
  bushGeometry,
  chestGeometry,
  clamBaseGeometry,
  clamLidGeometry,
  crabGeometry,
  eelGeometry,
  fanGeometry,
  fishGeometry,
  galleonGeometry,
  jellyGeometry,
  kelpGeometry,
  mantaGeometry,
  octopusGeometry,
  orcaGeometry,
  place,
  rayGeometry,
  seagrassGeometry,
  seahorseGeometry,
  smallFishGeometry,
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
  REEF_POOL,
  SPECIES,
  TEMPLE,
  WRECK,
  atSea,
  avoidKid,
  FISH_TRUE_M,
  UW_M,
  clampWater,
  fillWindow,
  fishSize,
  localToWorld,
  midWater,
  planJellies,
  planReef,
  planSchools,
  planVents,
  seaK,
  sectorOf,
  stepFish,
  type ReefKind,
  type V3,
} from "./plan";
import { makeCausticTexture, makeUwUniforms, uwMaterial } from "./shaders";
import { buildRockGeometry } from "../fantasy/stones";
import { buildDeepFloor } from "../sea/deepFloor";
import { DROP, FOAM, MIST, buildSpray } from "../sea/spray";
import { makeVisit, startVisit, stepVisit, visitHeight, type Visit } from "../sea/visits";
import { dist2, follow, makeFocusTracker, makeSwimmer, respawn, seaDepth, seaFloorY, shiftSwimmers, swim, trackFocus, type Swimmer, type SwimStyle } from "../sea/wander";
import { blowholeLocal, whaleGeometry } from "../sea/whaleGeometry";
import { BREACH, EV_BLOW, EV_DRIP, EV_ENTER, EV_EXIT, WHALE_STYLE, aimPast, bodyToWorld, directWhales, makeWhale, makeWhaleDirector, stepWhale, whaleLen, type Whale } from "../sea/whales";
import { cutAbyssFloor } from "../abyss";


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
  /** (smoke harness / debugging) send a visitor to the diving kid right away */
  summon(who: "whale" | "orcas" | "manta" | "turtle", from?: number): void;
  /** (smoke harness) the swimmers behind the orcas, mantas, turtles and rays */
  creatures: { orcas: Swimmer[]; mantas: Swimmer[]; turtles: Swimmer[]; rays: Swimmer[] };
  dispose(): void;
}

// saturated, joyful reef colours (a kids' film reef, not a faded photo). Pure-ish hues with a low
// smallest channel: bright light + filmic tone mapping turns anything paler into pastel.
const PALETTES: Record<ReefKind, string[]> = {
  staghorn: ["#ff2d86", "#ff7400", "#9b34ff", "#ff3fc8", "#00d6b4", "#ffc800", "#ff4a3a"],
  brain: ["#8ce000", "#ff9a00", "#c04cff", "#ff4f8a", "#00e0a0", "#ffd400"],
  table: ["#3fd07a", "#a45cff", "#ffae2a", "#2ab8ff", "#ff6aa8"],
  fan: ["#ff1f72", "#8f1fff", "#ff6000", "#ffc000", "#ff2fcf", "#ff2f2f"],
  tube: ["#ff6a00", "#5a3cff", "#ffc400", "#ff2f86", "#00b4ff"],
  anemone: ["#ff4fc8", "#2fffb0", "#ff8a1f", "#a066ff", "#2fe0ff"],
  seagrass: ["#3fc02a", "#62d42a", "#22a84a", "#86dc2a"],
  kelp: ["#e0861f", "#eca03a", "#d0762a", "#eab440"],
  rock: ["#e8609e", "#9a6ae8", "#f07a5a", "#3ab8c8", "#c85ad8", "#ff7a8a"],
  starfish: ["#ff1f1f", "#ff7400", "#9636ff", "#1f8cff", "#ffc800", "#ff2fa6"],
  urchin: ["#6a1a98", "#2a1a70", "#a01a66", "#401070"],
  bush: ["#ff3f96", "#ff8a1a", "#b050ff", "#00d0bc", "#ffd21f", "#ff3a3a", "#6aee3a"],
  seahorse: ["#ffc000", "#ff7414", "#ff4fa0", "#a066ff", "#1fd8c0"],
  octopus: ["#ff5a1f", "#e02a66", "#9a3cff", "#ff8a2a"],
  eel: ["#ffffff", "#e8ffd0", "#fff2c0"],
  crab: ["#ff2a14", "#ff6400", "#ff1f5a", "#ff9a14"],
};
const JELLY_COLS = ["#7af7ff", "#ff8ae6", "#b99bff", "#9dffc9", "#ffd07a"].map((c) => col(c));
/** fish size (m) by species, for travelling schools that change species */
const SIZE_OF = FISH_TRUE_M.map((_, i) => fishSize(i));

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
  // coral: culled when wholly in the fog, or right at the camera (a coral head filling the screen)
  const CORAL = { cull: 1.6, cullNear: 0.9, rim: 0.18, lift: 0.04 } as const;
  const reefMat = track(uwMaterial(U, { motion: "sway", inst: true, ...CORAL }));
  const reefMat2 = track(uwMaterial(U, { motion: "sway", inst: true, cull: 1.4, cullNear: 0.9, cullHeight: 1.2, rim: 0.15, lift: 0.04 }, { side: THREE.DoubleSide }));
  const kelpMat = track(uwMaterial(U, { motion: "sway", inst: true, cull: 12, cullNear: 1.5, cullHeight: 12, rim: 0.15, lift: 0.04 }, { side: THREE.DoubleSide }));
  const brainMat = track(uwMaterial(U, { motion: "none", inst: true, pattern: "brain", ...CORAL }, { roughness: 0.9 }));
  const fanMat = track(uwMaterial(U, { motion: "sway", inst: true, pattern: "lace", ...CORAL, cullHeight: 1.8 }, { side: THREE.DoubleSide }));
  const critterMat = track(uwMaterial(U, { motion: "sway", inst: true, cull: 1.6, rim: 0.45, lift: 0.18 }));
  const peekMat = track(uwMaterial(U, { motion: "sway", inst: true, peek: true, cull: 1.6, rim: 0.4, lift: 0.16 }));
  const crabMat = track(uwMaterial(U, { motion: "scuttle", inst: true, cull: 1.6, rim: 0.4, lift: 0.16 }));
  const landmarkMat = track(uwMaterial(U, { motion: "sway", lift: 0.05 }, { side: THREE.DoubleSide, roughness: 0.85 }));
  const fishMat = track(uwMaterial(U, { motion: "fish", inst: true, cull: 1.4, rim: 0.55, lift: 0.2 }, { side: THREE.DoubleSide, roughness: 0.42 }));
  const mantaMat = track(uwMaterial(U, { motion: "flap", inst: true, flapSpeed: 1.5, flapWave: 1.5, cull: 2, rim: 0.4, lift: 0.22 }, { side: THREE.DoubleSide, roughness: 0.6 }));
  const turtleMat = track(uwMaterial(U, { motion: "flap", inst: true, flapSpeed: 1.7, flapWave: 0.4, cull: 1.6, rim: 0.5, lift: 0.22 }, { roughness: 0.7 }));
  const rayMat = track(uwMaterial(U, { motion: "flap", inst: true, flapSpeed: 2.4, flapWave: 5, cull: 1.2, rim: 0.3, lift: 0.2 }, { side: THREE.DoubleSide, roughness: 0.6 }));
  const orcaMat = track(uwMaterial(U, { motion: "flap", inst: true, flapAxis: "z", flapSpeed: 2.3, flapWave: 0.55, pattern: "orca", cull: 4, rim: 0.85, lift: 0.2 }, { roughness: 0.3 }));
  const clamMat = track(uwMaterial(U, { motion: "none", inst: true, lift: 0.1 }, { side: THREE.DoubleSide, roughness: 0.45 }));
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
    bush: bushGeometry,
    seahorse: seahorseGeometry,
    octopus: octopusGeometry,
    eel: eelGeometry,
    crab: crabGeometry,
  };
  const MATS: Record<ReefKind, THREE.Material> = {
    staghorn: reefMat,
    brain: brainMat,
    table: reefMat,
    fan: fanMat,
    tube: reefMat,
    anemone: reefMat,
    seagrass: reefMat2,
    kelp: kelpMat,
    rock: reefMat,
    starfish: reefMat,
    urchin: reefMat,
    bush: reefMat,
    seahorse: critterMat,
    octopus: peekMat,
    eel: peekMat,
    crab: crabMat,
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
      let tilt = it.tilt;
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
      } else if (kind === "seahorse") {
        // bobbing among the sea grass blades (kept under the surface)
        y = Math.min(WATER_Y - 0.9, it.y + 0.3 + it.hue * 0.7);
        tilt = 0;
      } else if (kind === "octopus" || kind === "eel") {
        y = it.y - 0.05;
        tilt *= 0.4;
      } else if (kind === "crab") {
        y = it.y;
      }
      e.set(Math.cos(it.tiltDir) * tilt, rot, Math.sin(it.tiltDir) * tilt, "YXZ");
      m4.compose(v.set(it.x, y, it.z), q.setFromEuler(e), s3.set(sx, sy, sz));
      m4.toArray(mats, i * 16);
      const pi = Math.floor(it.hue * pal.length) % pal.length;
      c.copy(pal[pi]).lerp(pal[(pi + 1) % pal.length], (it.hue * pal.length) % 1 * 0.3);
      c.multiplyScalar(0.94 + ((it.hue * 97) % 1) * 0.14);
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
  const pearlMesh = instanced(new THREE.SphereGeometry(0.2, 10, 6), pearlMat, PEARL_COUNT, "uw-pearls", false);
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

  // ── fish: each school's centre is a swimmer roaming round its reef (or round the kid). Two
  //    meshes: the detailed reef fish, and a cheap small fish for bait balls and anthias clouds ──
  const schools = planSchools({ lowQuality: low });
  const nFish = schools.reduce((a, s) => a + s.n, 0);
  const fMesh = new Uint8Array(nFish);
  const fSlot = new Uint16Array(nFish);
  let nBig = 0;
  let nSmall = 0;
  {
    let i = 0;
    // (low quality: every fish on the cheap mesh)
    for (const s of schools) for (let k = 0; k < s.n; k++, i++) (fMesh[i] = s.small || low ? 1 : 0), (fSlot[i] = s.small || low ? nSmall++ : nBig++);
  }
  const fishMesh = instanced(fishGeometry(), fishMat, nBig, "uw-fish");
  const smallMesh = instanced(smallFishGeometry(), fishMat, nSmall, "uw-fish-small");
  fishMesh.visible = nBig > 0;
  const fishMeshes = [fishMesh, smallMesh];
  const fishInsts = fishMeshes.map((m) => {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const a = m.geometry.attributes.aInst as THREE.InstancedBufferAttribute;
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  });
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
    const clown = !single && s.rad < 1 && !s.buddy;
    const home = { x: s.ax, z: s.az, r: 0 };
    let st: SwimStyle;
    if (single) st = { speed: [0.35, 0.9], turn: 0.45, wander: 0.07, depth: [1.2, 30], clear: 1, need: 2.5, look: 5, climb: 0.35, bank: 0.6, above: [0.9, 2.6], home: { ...home, r: 12 } };
    else if (clown) st = { speed: [0.1, 0.3], turn: 1.4, wander: 0.2, depth: [1.1, 30], clear: 1, need: 2.4, look: 1.5, climb: 0.3, bank: 0.3, above: [1.3, 2.1], home: { ...home, r: 1.6 } };
    else if (s.bait) st = { speed: [0.25, 0.6], turn: 0.5, wander: 0.05, depth: [2, 30], clear: s.spread[1] + 1, need: s.spread[1] * 2 + 3, look: 5, climb: 0.3, bank: 0.2, above: [3, 5.5], home: s.follow ? undefined : { ...home, r: 7 } };
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
    return { ...s, st, sw, species0: s.species, size0: s.size, kidHome: { x: 0, z: 0, r: 13 }, above0: st.above, depth0: [st.depth[0], st.depth[1]] as const };
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
        fishMeshes[fMesh[i]].setColorAt(fSlot[i], tint);
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

  // ── manta rays: graceful banking glides — half keep to a reef garden, half roam near the kid
  //    (and every 14-22 s one glides right over a diving kid) ──
  const nManta = low ? 4 : 8;
  const mantaMesh = instanced(mantaGeometry(), mantaMat, nManta, "uw-mantas");
  mantaMesh.frustumCulled = false;
  const MANTA: SwimStyle = { speed: [1.5, 2.6], turn: 0.3, wander: 0.05, depth: [3.2, 10], clear: 2.8, need: 6, look: 16, climb: 0.7, bank: 1.4 };
  const MANTA_V: SwimStyle = { ...MANTA, depth: [1.2, 12], clear: 1.5, need: 3, look: 10, bank: 0.6 };
  const mDefs = Array.from({ length: nManta }, (_, i) => {
    const g = GARDENS[i % GARDENS.length];
    const p = atSea(g.a + (i >= 4 ? 0.12 : -0.05), g.d + 12 + (i % 2) * 6);
    const floor = groundY(p.x, p.z);
    const cy = Math.min(WATER_Y - 3.2, Math.max(floor + 4.5, -10));
    const resident = i % 2 === 0;
    return { sw: makeSwimmer(p.x, cy, p.z, g.a + Math.PI / 2 + i, 700 + i, 2), st: resident ? { ...MANTA, home: { x: p.x, z: p.z, r: 40 } } : MANTA, resident, s: seaK("manta") * (0.9 + (i % 3) * 0.15), visit: makeVisit(0) };
  });
  mDefs.forEach((_, i) => (mantaMesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(i, 1, i * 2.1));
  let mantaWait = 6;
  let wasUnder = false;

  // ── sea turtles (one cruises past a diving kid every 16-26 s) ──
  const nTurtle = low ? 3 : 5;
  const turtleMesh = instanced(turtleGeometry(), turtleMat, nTurtle, "uw-turtles");
  turtleMesh.frustumCulled = false;
  const TURTLE: SwimStyle = { speed: [0.6, 1.1], turn: 0.35, wander: 0.06, depth: [1.5, 6], clear: 1.6, need: 3, look: 7, climb: 0.4, bank: 0.8 };
  const TURTLE_V: SwimStyle = { ...TURTLE, speed: [0.8, 1.4], depth: [0.8, 12], clear: 1.1, need: 2, look: 6 };
  const tDefs = Array.from({ length: nTurtle }, (_, i) => {
    const g = GARDENS[(i * 2 + 1) % GARDENS.length];
    const resident = i % 2 === 0 && i < 4;
    return { sw: makeSwimmer(g.x, midWater(g.x, g.z, 0.5), g.z, i * 2.3, 800 + i, 0.8), st: resident ? { ...TURTLE, home: { x: g.x, z: g.z, r: 28 } } : TURTLE, resident, visit: makeVisit(0) };
  });
  tDefs.forEach((_, i) => (turtleMesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(i, 1, i * 1.3));
  let turtleWait = 9;

  // ── blue-spotted rays gliding low over the sand round the kid ──
  const nRay = low ? 3 : 6;
  const rayMesh = instanced(rayGeometry(), rayMat, nRay, "uw-rays");
  rayMesh.frustumCulled = false;
  const rDefs = Array.from({ length: nRay }, (_, i) => {
    const home = { x: 0, z: 0, r: 24 };
    const st: SwimStyle = { speed: [0.6, 1.3], turn: 0.4, wander: 0.06, depth: [1, 40], clear: 0.45, need: 1.8, look: 5, climb: 0.5, bank: 0.7, above: [0.5, 1.3], home };
    const p = atSea(i * 1.1, 24 + (i % 3) * 5);
    return { sw: makeSwimmer(p.x, groundY(p.x, p.z) + 0.8, p.z, i * 1.7, 850 + i, 1), st, home, s: seaK("ray") * (0.85 + (i % 3) * 0.15) };
  });
  rDefs.forEach((_, i) => (rayMesh.geometry.attributes.aInst as THREE.InstancedBufferAttribute).setXY(i, 1, i * 1.9));

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
  const rays = buildRays(U, low ? 10 : 20, rayK);
  track(rays);
  group.add(rays.mesh);
  const ceiling = buildCeiling(U, 120);
  track(ceiling.geometry);
  track(ceiling.material as THREE.Material);
  group.add(ceiling);
  const caustics = buildFloorCaustics(U, low ? 36 : 56);
  cutAbyssFloor(caustics.mesh.material as THREE.Material); // (the rift's own rock draws the floor there)
  track(caustics);
  group.add(caustics.mesh);

  // ── a fog-coloured backdrop at the fog's far distance, under water only. The storybook ink pass
  //    draws a line wherever the depth jumps; without this the far sea floor would meet the empty
  //    background in a long dark line across the blue (fogged to nothing, but still inked). ──
  const backdropMat = track(new THREE.MeshBasicMaterial({ color: 0x3ccfd9, side: THREE.BackSide, fog: false }));
  const backdrop = new THREE.Mesh(track(new THREE.SphereGeometry(1, 24, 12)), backdropMat);
  backdrop.name = "uw-backdrop";
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -5;
  backdrop.visible = false;
  backdrop.onBeforeRender = (_r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => {
    backdrop.position.copy(cam.position);
    backdrop.updateMatrixWorld();
  };
  group.add(backdrop);

  // ── the deep sandy plain beyond the reef (follows the kid) ──
  const sandMat = track(uwMaterial(U, { motion: "none", pattern: "sand" }, { roughness: 0.96 }));
  cutAbyssFloor(sandMat);
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

  // ── the orca pod roams the open sea (surface group: seen from above and below); every 24-36 s
  //    it comes to swim right past a diving kid (anywhere the water's 5.5 m+ deep) ──
  const nOrca = low ? 3 : 4;
  const orcaGeo = track(orcaGeometry());
  orcaGeo.setAttribute("aInst", new THREE.InstancedBufferAttribute(new Float32Array(nOrca * 2), 2));
  const orcaMesh = new THREE.InstancedMesh(orcaGeo, orcaMat, nOrca);
  orcaMesh.name = "uw-orcas";
  orcaMesh.frustumCulled = false;
  surface.add(orcaMesh);
  const orcaInst = orcaGeo.attributes.aInst as THREE.InstancedBufferAttribute;
  // (true size: a bull 8 m, cows 6.5–6.8 m, a calf 2.7 m — orcaGeometry is 6.48 long)
  const ORCA_M = [8, 6.5, 6.8, 2.7];
  const orcas = Array.from({ length: nOrca }, (_, i) => ({ breachT: -1, surfPh: i * 2.3, lastY: -2.5, s: (UW_M * ORCA_M[i]) / 6.48 }));
  const ORCA: SwimStyle = { speed: [3.6, 5.6], turn: 0.18, wander: 0.04, depth: [3.8, 3.8], clear: 4, need: 12, look: 36, climb: 1.2, bank: 2 };
  const ORCA_V: SwimStyle = { speed: [3.4, 4.8], turn: 0.3, wander: 0.04, depth: [2.6, 30], clear: 3.4, need: 7, look: 24, climb: 1.4, bank: 1.6 };
  // (side, back: spaced for true-size orcas)
  const POD: [number, number][] = [
    [0, 0],
    [-7.5, 10],
    [7.5, 12.5],
    [2.5, 6],
  ];
  const orcaSw: Swimmer[] = Array.from({ length: nOrca }, (_, i) => makeSwimmer(0, -2.9, 0, 0, 900 + i, 4));
  const orcaVisit: Visit = makeVisit(10);
  const placePod = () => {
    const l = orcaSw[0];
    for (let i = 1; i < nOrca; i++) {
      const [side, back] = POD[i];
      Object.assign(orcaSw[i], { x: l.x - Math.sin(l.yaw) * back + Math.cos(l.yaw) * side, z: l.z - Math.cos(l.yaw) * back - Math.sin(l.yaw) * side, yaw: l.yaw, y: l.y, speed: l.speed });
    }
  };
  {
    const r0 = rngOf(6262);
    const l = orcaSw[0];
    respawn(l, ORCA, { x: 0, z: 0 }, 0, 0, r0, 205, 235);
    l.yaw = Math.atan2(l.x, l.z) + Math.PI / 2;
    placePod();
  }
  let breachWait = 9;
  const TURTLE_S = seaK("turtle");
  let breachWho = 0;

  // ── giant whales: blue whales and humpbacks roaming the open ocean ──
  const nHump = low ? 1 : 2;
  const nBlue = low ? 1 : 2;
  const whales: Whale[] = [];
  // (true size: humpbacks ~14 m = 22 units, blue whales ~25 m = 40 units — sea/whales.ts)
  for (let i = 0; i < nHump; i++) whales.push(makeWhale("humpback", whaleLen("humpback", i), 11 + i * 2));
  for (let i = 0; i < nBlue; i++) whales.push(makeWhale("blue", whaleLen("blue", i), 12 + i * 2));
  {
    const wr = rngOf(8080);
    for (const w of whales) {
      respawn(w, WHALE_STYLE[w.kind], { x: 0, z: 0 }, 0, 0, wr, 215, 300);
      w.wait = 4 + wr() * 26;
      w.lastY = w.lastTail = w.y;
    }
  }
  const director = makeWhaleDirector();
  const WHALE_LOOK = { cull: 0.62, rim: 0.55, lift: 0.16 } as const;
  const whaleMats = {
    blue: track(uwMaterial(U, { motion: "flap", inst: true, flapAxis: "z", flapSpeed: 1.2, flapWave: 3.6, pattern: "blue", ...WHALE_LOOK }, { roughness: 0.5 })),
    humpback: track(uwMaterial(U, { motion: "flap", inst: true, flapAxis: "z", flapSpeed: 1.35, flapWave: 3.4, pattern: "humpback", ...WHALE_LOOK }, { roughness: 0.48 })),
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
  // (summon: start the next visitor this close, for the smoke harness)
  const near = { whale: 0, orcas: 0, manta: 0, turtle: 0 };
  const lastKid = new THREE.Vector3();
  const fromMin = (k: keyof typeof near, d: number) => near[k] || d;
  const fromMax = (k: keyof typeof near, d: number) => {
    const v = near[k] ? near[k] + 6 : d;
    near[k] = 0;
    return v;
  };

  return {
    group,
    surface,
    whales,
    creatures: { orcas: orcaSw, mantas: mDefs.map((m) => m.sw), turtles: tDefs.map((d) => d.sw), rays: rDefs.map((d) => d.sw) },
    pearls: PEARLS.map((p) => ({ id: p.id, x: p.x, y: p.y + PEARL_Y * p.s, z: p.z })),
    setPearlsFound(ids) {
      for (let i = 0; i < PEARL_COUNT; i++) found[i] = localFound[i] || ids.includes(i) ? 1 : 0;
    },
    summon(who, from = 0) {
      near[who] = from;
      if (who === "whale") {
        if (from > 0) {
          // straight away, `from` metres out (the harness runs slower than real time)
          const w = whales[0];
          const st = WHALE_STYLE[w.kind];
          respawn(w, st, lastKid, ft.vx, ft.vz, rnd, from, from + 6, 0.5);
          w.side = aimPast(w, lastKid, 8 + w.girth * 1.5 + rnd() * 5, rnd);
          w.hold = lastKid.y - 4;
          w.holdT = 50;
          w.y = Math.min(WATER_Y - w.girth - 2.5, Math.max(seaFloorY(w.x, w.z) + st.clear, w.hold));
          w.mode = 0;
          w.cue = -1;
          w.speed = st.speed[1];
        } else director.enc = 0;
      } else if (who === "orcas") orcaVisit.wait = 0;
      else if (who === "manta") mantaWait = 0;
      else turtleWait = 0;
    },
    update(dtIn, t, o) {
      const dt = Math.min(0.1, Math.max(0, dtIn));
      const gl = o.glow;
      U.uTime.value = t;
      U.uGlow.value = gl;
      U.uGlowK.value = 0.25 + gl * 1.15;
      U.uCausticK.value = 1 - gl * 0.75;
      jellyK.value = 0.7 + gl * 0.55;
      rayK.value = 1 - gl * 0.5;
      pearlMat.emissiveIntensity = 0.55 + gl * 0.6 + Math.sin(t * 2) * 0.08;
      result.pearl = null;
      const kid = o.kid;
      const depthHere = seaDepth(kid.x, kid.z);
      lastKid.copy(kid);
      // just dived in? the big life comes to say hello soon, and the fish are already about
      const diveIn = o.under && !wasUnder;
      wasUnder = o.under;
      if (diveIn) {
        mantaWait = Math.min(mantaWait, 3);
        turtleWait = Math.min(turtleWait, 6);
        orcaVisit.wait = Math.min(orcaVisit.wait, 9);
        director.enc = Math.min(director.enc, 6);
      }

      // the roaming population follows the kid; across the world wrap the neighbourhood jumps too
      if (trackFocus(ft, kid.x, kid.z, dt)) {
        shiftSwimmers(whales, ft.jx, ft.jz);
        shiftSwimmers(orcaSw, ft.jx, ft.jz);
        for (const s of sState) if (s.follow || s.buddy) shift(s.sw, ft.jx, ft.jz);
        for (let i = 0; i < jDefs.length; i++) if (jDefs[i].follow) shift(jState[i].sw, ft.jx, ft.jz);
        for (const m of mDefs) if (!m.resident) shift(m.sw, ft.jx, ft.jz);
        for (const d of tDefs) if (!d.resident) shift(d.sw, ft.jx, ft.jz);
        for (const d of rDefs) shift(d.sw, ft.jx, ft.jz);
        for (let i = 0; i < nFish; i++)
          if (sState[fSchool[i]].follow || sState[fSchool[i]].buddy) {
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
            // a tall straight column (~9 m: true size)
            spray.emit(MIST, wp.x, wp.y + 0.2, wp.z, 80, 15, 0.9, 2.6, 4.2);
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

      // ── orcas: a pod roaming the open sea, porpoising, now and then a breach — and swimming
      //    right past a diving kid ──
      const lead = orcaSw[0];
      if (o.under) orcaVisit.wait -= dt;
      if (o.under && !orcaVisit.on && orcaVisit.wait <= 0) {
        orcaVisit.wait = 24 + rnd() * 12;
        let busy = false;
        for (const oc of orcas) if (oc.breachT >= 0) busy = true;
        if (!busy && depthHere >= 7 && dist2(lead, kid) > 50 * 50) {
          startVisit(lead, ORCA_V, orcaVisit, kid, ft.vx, ft.vz, rnd, fromMin("orcas", 58), fromMax("orcas", 70), 10 + rnd() * 6, kid.y - 3 - rnd() * 2);
          placePod();
        }
      }
      const pod = orcaVisit.on ? ORCA_V : ORCA;
      if (orcaVisit.on) {
        const d = stepVisit(lead, ORCA_V, orcaVisit, kid, dt, t);
        if ((orcaVisit.passed && d > 80) || orcaVisit.t > 70 || !o.under) orcaVisit.on = false;
      } else swim(lead, ORCA, dt, t, kid, 9);
      for (let i = 1; i < nOrca; i++) {
        const [side, back] = POD[i];
        follow(orcaSw[i], pod, lead, side, back, dt, t);
        orcaSw[i].y = orcaVisit.on ? visitHeight(orcaSw[i].x, orcaSw[i].z, ORCA_V, lead.y + side * 0.12) : lead.y;
        orcaSw[i].pitch = lead.pitch;
        orcaSw[i].roll += (lead.roll - orcaSw[i].roll) * Math.min(1, dt * 2);
      }
      if (!orcaVisit.on) {
        let quiet = true;
        for (const oc of orcas) if (oc.breachT >= 0 || oc.lastY > -2.2) quiet = false;
        const d2 = dist2(lead, kid);
        if ((d2 > 300 * 300 && quiet) || d2 > 460 * 460) {
          respawn(lead, ORCA, kid, ft.vx, ft.vz, rnd, 190, 250, 1.2);
          placePod();
        }
        breachWait -= dt;
        if (breachWait <= 0) {
          breachWait = 16 + rnd() * 20;
          const ob = orcas[breachWho];
          if (ob.breachT < 0) ob.breachT = 0;
          breachWho = (breachWho + 1) % nOrca;
        }
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
        if (orcaVisit.on) {
          // gliding past under water: no porpoising (it would pop out of the kid's view)
          y = sw.y;
          pitch = sw.pitch * 0.6;
          oc.breachT = -1;
        } else if (oc.breachT >= 0) {
          oc.breachT += dt;
          const u = oc.breachT / (3.3 * Math.sqrt(Math.max(1, oc.s)));
          // (a true-size orca: deeper start, a higher (but not sky-high) leap, a slower arc)
          y = -3.4 * Math.max(1, oc.s) + Math.sin(Math.min(1, u) * Math.PI) * 9.2 * Math.sqrt(Math.max(1, oc.s));
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
          // (each one rises until its own back breaks the surface: the bull's tall fin, the calf too)
          const peakY = WATER_Y - 0.92 * oc.s * 0.35;
          y = sw.y + surf * Math.max(0, peakY - sw.y);
          pitch = u < 0.3 ? -Math.cos((u / 0.3) * Math.PI) * 0.22 : sw.pitch * 0.5;
          if (oc.lastY < peakY - 0.4 && y >= peakY - 0.4) (spray.emit(MIST, x, WATER_Y + 0.8, z, 6, 4, 0.8, 1.2, 1.6), foam(x, z, 6, 1.5)); // blow
        }
        oc.lastY = y;
        e.set(pitch, sw.yaw, roll, "YXZ");
        m4.compose(v.set(x, y, z), q.setFromEuler(e), s3.setScalar(oc.s));
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
      backdrop.visible = o.under && !!fog && fog.isFog;
      if (backdrop.visible && fog) {
        backdropMat.color.copy(fog.color);
        backdrop.scale.setScalar(fog.far * 0.99);
      }
      deepFloor.update(kid);
      ceiling.position.set(kid.x, WATER_Y - 0.02, kid.z);
      kidC.value.set(kid.x, kid.y + 1.5, kid.z);

      // ── fish ──
      let fi = 0;
      for (let si = 0; si < sState.length; si++) {
        const s = sState[si];
        const sw = s.sw;
        const hide = s.buddy && !o.under;
        if (s.buddy) {
          // little fish swirling round the kid (a loose ring a little ahead and above them)
          const a = t * 0.4 + s.ph;
          const tx = kid.x + Math.sin(a) * 2.6 + ft.vx * 0.35;
          const tz = kid.z + Math.cos(a) * 2.6 + ft.vz * 0.35;
          const ty = clampWater(tx, tz, kid.y + 1 + Math.sin(t * 0.5 + s.ph) * 0.5, 0.6);
          if (diveIn || dist2(sw, kid) > 30 * 30) {
            // (just dived in, or left behind: they're already round the kid)
            sw.x = kid.x;
            sw.y = ty;
            sw.z = kid.z;
            for (let k = 0; k < s.n; k++) {
              const j = (fi + k) * 3;
              fP[j] = sw.x + fOff[j];
              fP[j + 1] = sw.y + fOff[j + 1];
              fP[j + 2] = sw.z + fOff[j + 2];
              fV[j] = fV[j + 1] = fV[j + 2] = 0;
            }
          }
          const k = Math.min(1, dt * 1.6);
          const dx = (tx - sw.x) * k;
          const dz = (tz - sw.z) * k;
          sw.x += dx;
          sw.y += (ty - sw.y) * k;
          sw.z += dz;
          if (dx * dx + dz * dz > 1e-6) sw.yaw = Math.atan2(dx, dz);
        } else {
          if (s.follow) {
            // a school that keeps near the kid: roams round them, and turns up again ahead (unseen)
            // when left far behind — a reef species over the reef, silver fish out over the deep
            if (o.under && (diveIn || dist2(sw, kid) > 80 * 80)) {
              // (just dived in: fill the water round the kid straight away — the splash hides it)
              if (diveIn) respawn(sw, s.st, kid, ft.vx, ft.vz, rnd, 8, 26, Math.PI);
              else respawn(sw, s.st, kid, ft.vx, ft.vz, rnd, 36, 56, 1.1);
              sw.y = clampWater(sw.x, sw.z, kid.y - 1.5 + (rnd() - 0.5) * 3, 1.5);
              const open = seaDepth(sw.x, sw.z) > 16;
              if (!s.bait) {
                s.species = open ? (rnd() < 0.55 ? SPECIES.jack : SPECIES.sardine) : si % 3 === 0 ? s.species0 : REEF_POOL[Math.floor(rnd() * REEF_POOL.length)];
                s.size = s.species === s.species0 ? s.size0 : SIZE_OF[s.species];
              }
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
            // over the reef they keep low over the coral; out over the deep they swim round the
            // kid's own depth (a little below: the camera looks down on the kid), not 20 m down
            if (o.under && seaDepth(sw.x, sw.z) > 16) {
              const kd = WATER_Y - kid.y;
              s.st.above = undefined;
              s.st.depth[0] = Math.max(1.2, kd + 0.5);
              s.st.depth[1] = kd + (s.bait ? 7 : 5);
            } else {
              s.st.above = s.above0;
              s.st.depth[0] = s.depth0[0];
              s.st.depth[1] = s.depth0[1];
            }
            // keep up with a kid who's swimming along
            s.st.speed[1] = Math.max(1.5, Math.hypot(ft.vx, ft.vz) * (dist2(sw, kid) > 15 * 15 ? 1.25 : 0.9));
          }
          swim(sw, s.st, dt, t);
        }
        const cx = sw.x;
        const cyy = sw.y;
        const cz = sw.z;
        const cy = Math.cos(sw.yaw);
        const sy = Math.sin(sw.yaw);
        const baseSpeed = s.n === 1 ? 1.1 : s.buddy ? 4 : s.bait ? 2.2 : Math.max(2.6, s.follow ? s.st.speed[1] * 1.3 : 0);
        const size = hide ? 0 : s.size;
        const shape = FISH_SHAPE[s.species];
        const scareR = s.n === 1 ? 3.5 : s.buddy ? 1.3 : 3.2;
        for (let k = 0; k < s.n; k++, fi++) {
          const j = fi * 3;
          let ox = fOff[j];
          const oy = fOff[j + 1];
          let oz = fOff[j + 2];
          if (s.bait || s.buddy) {
            // swirl round the ball's vertical axis (inner fish faster)
            const rr = Math.hypot(ox, oz) || 0.01;
            const a = Math.atan2(oz, ox) + t * ((s.buddy ? 0.6 : 0.9) / (0.6 + rr * 0.35));
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
          const scare = avoidKid(fP[j], fP[j + 1], fP[j + 2], kid, scareR, push);
          tgt.x += push.x * 1.6;
          tgt.y += push.y * 1.6;
          tgt.z += push.z * 1.6;
          const speed = stepFish(fP, fV, fi, tgt.x, tgt.y, tgt.z, dt, s.n === 1 ? 0.6 : 2.2 + scare * 5, baseSpeed * (1 + scare * 2.2));
          // stay in the water
          const floor = seaFloorY(fP[j], fP[j + 2]) + 0.35 * s.size;
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
          const mi = fMesh[fi];
          fishMeshes[mi].setMatrixAt(fSlot[fi], m4);
          fishInsts[mi].setXY(fSlot[fi], s.species + Math.min(0.99, 0.2 + (speed / baseSpeed) * 0.6), fPhase[fi]);
        }
      }
      for (let mi = 0; mi < 2; mi++) {
        fishMeshes[mi].instanceMatrix.needsUpdate = true;
        fishInsts[mi].needsUpdate = true;
      }

      // ── jellies: pulse (in the shader), bob and drift ──
      for (let i = 0; i < jDefs.length; i++) {
        const j = jDefs[i];
        const js = jState[i];
        if (j.follow && o.under && dist2(js.sw, kid) > 70 * 70) {
          respawn(js.sw, js.st, kid, 0, 0, rnd, 30, 55);
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

      // ── mantas (a roaming one glides right over a diving kid every 14-22 s) ──
      if (o.under) mantaWait -= dt;
      if (o.under && mantaWait <= 0) {
        mantaWait = 14 + rnd() * 8;
        if (depthHere >= 4.5) {
          let pick = -1;
          for (let i = 0; i < nManta; i++) if (!mDefs[i].resident && !mDefs[i].visit.on && dist2(mDefs[i].sw, kid) > 45 * 45) pick = i;
          if (pick >= 0) startVisit(mDefs[pick].sw, MANTA_V, mDefs[pick].visit, kid, ft.vx, ft.vz, rnd, fromMin("manta", 44), fromMax("manta", 56), 6 + rnd() * 5, kid.y - 2.2 - rnd() * 2);
        }
      }
      for (let i = 0; i < nManta; i++) {
        const m = mDefs[i];
        if (m.visit.on) {
          const d = stepVisit(m.sw, MANTA_V, m.visit, kid, dt, t);
          if ((m.visit.passed && d > 60) || m.visit.t > 60) m.visit.on = false;
        } else {
          if (!m.resident && dist2(m.sw, kid) > 150 * 150) respawn(m.sw, m.st, kid, ft.vx, ft.vz, rnd, 70, 115, 1.3);
          swim(m.sw, m.st, dt, t, kid, 7);
        }
        e.set(m.sw.pitch, m.sw.yaw, m.sw.roll, "YXZ");
        m4.compose(v.set(m.sw.x, m.sw.y, m.sw.z), q.setFromEuler(e), s3.setScalar(m.s));
        mantaMesh.setMatrixAt(i, m4);
      }
      mantaMesh.instanceMatrix.needsUpdate = true;

      // ── turtles (one cruises past a diving kid every 16-26 s) ──
      if (o.under) turtleWait -= dt;
      if (o.under && turtleWait <= 0) {
        turtleWait = 16 + rnd() * 10;
        if (depthHere >= 2.5) {
          let pick = -1;
          for (let i = 0; i < nTurtle; i++) if (!tDefs[i].resident && !tDefs[i].visit.on && dist2(tDefs[i].sw, kid) > 38 * 38) pick = i;
          if (pick >= 0) startVisit(tDefs[pick].sw, TURTLE_V, tDefs[pick].visit, kid, ft.vx, ft.vz, rnd, fromMin("turtle", 34), fromMax("turtle", 46), 2.5 + rnd() * 3, kid.y - 0.6 - rnd() * 1.2);
        }
      }
      for (let i = 0; i < nTurtle; i++) {
        const d = tDefs[i];
        if (d.visit.on) {
          const dd = stepVisit(d.sw, TURTLE_V, d.visit, kid, dt, t);
          if ((d.visit.passed && dd > 50) || d.visit.t > 70) d.visit.on = false;
        } else {
          if (!d.resident && dist2(d.sw, kid) > 120 * 120) respawn(d.sw, d.st, kid, ft.vx, ft.vz, rnd, 55, 90, 1.3);
          swim(d.sw, d.st, dt, t, kid, 3);
        }
        e.set(d.sw.pitch * 0.6, d.sw.yaw, d.sw.roll * 0.5 + Math.sin(t * 0.8 + i) * 0.06, "YXZ");
        m4.compose(v.set(d.sw.x, d.sw.y, d.sw.z), q.setFromEuler(e), s3.setScalar(TURTLE_S));
        turtleMesh.setMatrixAt(i, m4);
      }
      turtleMesh.instanceMatrix.needsUpdate = true;

      // ── rays gliding over the sand near the kid ──
      for (let i = 0; i < nRay; i++) {
        const d = rDefs[i];
        if (o.under) {
          d.home.x = kid.x;
          d.home.z = kid.z;
          if (dist2(d.sw, kid) > 75 * 75) {
            respawn(d.sw, d.st, kid, ft.vx, ft.vz, rnd, 30, 50, 1.2);
            d.sw.y = seaFloorY(d.sw.x, d.sw.z) + 0.8;
          }
        }
        swim(d.sw, d.st, dt, t, kid, 2.5);
        e.set(d.sw.pitch * 0.5, d.sw.yaw, d.sw.roll * 0.6, "YXZ");
        m4.compose(v.set(d.sw.x, d.sw.y, d.sw.z), q.setFromEuler(e), s3.setScalar(d.s));
        rayMesh.setMatrixAt(i, m4);
      }
      rayMesh.instanceMatrix.needsUpdate = true;

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
