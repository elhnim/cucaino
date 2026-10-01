// Frostpeak Isle, the penguins' snowy island far out in Cucaino Park's ocean: the island (snowfields,
// the tall peak, ice cliffs, shallows, the frozen pond), its things (igloo camp, research station,
// ice cave, pines, the three slide chutes, ice floes and icebergs), and the life on it — a big penguin
// colony (./colony.ts: emperors with fluffy chicks and little blue penguins waddling in lines up to
// Slide Top, belly-tobogganing down into the sea, porpoising home and hopping out), seals on the
// floes, a narwhal pod offshore and terns overhead (./wildlife.ts), with sparkling snow, snowfall,
// splashes, and the aurora shimmering over the island at night (./fx.ts). When the Park kid comes
// close to a place, update() hands back a discovery with a real, fun fact.
//
// Cheap by construction: ≤ 16 draw calls (one merged mesh for every prop, a handful of instanced
// meshes for the animals with variants picked per instance, the aurora, two point sets),
// deterministic seeded placement (registry/frostIsland.ts), and an allocation-free update.
import * as THREE from "three";
import { fxMaterial, makeUniforms } from "../fantasy/shaders";
import { makeCausticTexture, makeUwUniforms, uwMaterial } from "../underwater/shaders";
import { FROST_ISLAND, FROST_SEA_R, FROST_SPOTS, FROST_SPOT_R, frostFacts } from "../../registry/frostIsland";
import { addFolkInstanceAttrs, folkDepthMaterial, folkMaterial, trisOf } from "../village/kit";
import { buildPropsGeometry } from "./props";
import { buildGroundGeometry, buildWater } from "./terrain";
import { buildFx } from "./fx";
import { B_NARWHAL, B_SEAL, B_TERN, G_CHAIR, G_POLE, G_SKI, PENGUIN_RIG, W_TERN_L, W_TERN_R, buildBeasts, buildPenguinBody, buildPenguinHead, buildSkiGear, buildWings } from "./critters";
import { PENGUIN_BODY, colonyAheadOn, colonyChuteClear, colonyKidChute, makeColony, penguinGround, penguinRoot, stepColony, type PenguinPose } from "./colony";
import { makeSkiField, stepSkiField } from "./ski";
import { slideStartAt } from "./kidSlide";
import { buildSigns } from "./signs";
import { CHAIR_DROP } from "../../registry/frostIsland";
import { BEAST_K, NARWHAL_CALF, makeWildlife, stepWildlife } from "./wildlife";

export interface FrostSpotOut {
  id: string;
  name: string;
  text: string;
}

export interface FrostWorld {
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number; hour: number; under: boolean }): { spot: FrostSpotOut | null };
  /** the Park kid's turn on the penguin slides (see ./kidSlide.ts) */
  slide: {
    /** the chute whose start zone (x, z) is in, or -1 */
    offer(x: number, z: number): number;
    /** the kid is at (or sliding down) chute c, -1 = none: that chute's penguins wait aside */
    hold(c: number): void;
    /** is chute c's first stretch clear of sliding penguins */
    clear(c: number): boolean;
    /** how far down chute c the nearest penguin ahead of s is (Infinity: nobody) */
    ahead(c: number, s: number): number;
    /** a puff of snow (kind 2) or a splash (0 big, 1 small) at a world point */
    fx(x: number, y: number, z: number, size: number, kind: number): void;
  };
  dispose(): void;
}

export interface FrostStats {
  drawCalls: number;
  triangles: number;
}

/** each penguin kind's flipper length (model units, ./critters.ts buildWings): poles sit in their tips */
const FLIP_LEN = [0.42, 0.2, 0.2];
/** below this a penguin's in the sea: no need to look for snow under it */
const WY_DRAW = -0.9;
const X0 = FROST_ISLAND.x;
const Z0 = FROST_ISLAND.z;
/** hide the whole island beyond this distance from its centre (past the fog) */
export const FROST_HIDE_D = 500;
/** the aurora fades out between these distances from the island */
const AUR_NEAR = 240;
const AUR_FAR = 430;

/**
 * The open ocean's sandy deep floor (../sea/deepFloor.ts) follows seaFloorY, which counts this island's
 * land and slopes as sea floor (so creatures steer round it) — so its coarse sand cells drew a second,
 * sandy island poking up through the snow wherever the ground dips between them. The island draws all
 * of its own ground out past FROST_SEA_R (its skirt), so cut the sand out over it, the way the Midnight
 * Rift cuts its crack out of the same material (../abyss cutAbyssFloor).
 */
export function cutFrostFloor(mat: THREE.Material): THREE.Material {
  const m = mat as THREE.Material & { __frostCut?: boolean };
  if (m.__frostCut) return mat;
  m.__frostCut = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (q) => `varying vec2 vFrostXZ;
${q}
  vFrostXZ = ( modelMatrix * vec4( position, 1.0 ) ).xz;`);
    shader.fragmentShader = shader.fragmentShader.replace(
      /void\s+main\s*\(\s*\)\s*\{/,
      (q) => `varying vec2 vFrostXZ;
${q}
  if ( length( vFrostXZ - vec2( ${X0.toFixed(2)}, ${Z0.toFixed(2)} ) ) < ${(FROST_SEA_R - 1).toFixed(2)} ) discard;`,
    );
  };
  mat.customProgramCacheKey = function () {
    return prevKey.call(this) + "-frost-cut";
  };
  mat.needsUpdate = true;
  return mat;
}

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

export function buildFrostIsland(scene: THREE.Scene, opts: { lowQuality?: boolean }): FrostWorld {
  const low = !!opts.lowQuality;
  const group = new THREE.Group();
  group.name = "frost-island";
  group.position.set(X0, 0, Z0);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), FROST_SEA_R + 10);

  // ── ground + water ──
  const groundGeo = track(buildGroundGeometry(low));
  // (the underwater kit's material: caustics and the sea's blue on the submerged slopes, like the
  // rest of the sea floor; plain snow above the water)
  const GU = makeUwUniforms();
  GU.uCausticTex.value = track(makeCausticTexture());
  const groundMat = track(uwMaterial(GU, { motion: "none" }, { flatShading: true, roughness: 0.92 }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = "frost-ground";
  ground.receiveShadow = !low;
  group.add(ground);
  const WU = { uTime: { value: 0 }, uGlow: { value: 0 }, uAurora: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 150 }, uFogFar: { value: 430 } };
  const water = buildWater(low, WU);
  track(water.geometry);
  track(water.material as THREE.Material);
  group.add(water);

  // ── every prop, chute, floe and berg: one mesh ──
  const PU = makeUniforms();
  PU.uSway.value = 0.12;
  const propGeo = track(buildPropsGeometry(low));
  const propMat = track(fxMaterial(PU, { roughness: 0.7, metalness: 0, flatShading: true }));
  const props = new THREE.Mesh(propGeo, propMat);
  props.name = "frost-props";
  props.castShadow = !low;
  props.receiveShadow = !low;
  group.add(props);

  // ── the animals ──
  const colony = makeColony(low);
  const ski = makeSkiField(low);
  const wild = makeWildlife(low);
  const NC = colony.penguins.length;
  const NK = ski.skiers.length;
  /** every penguin drawn: the colony's, then the skiers */
  const NP = NC + NK;
  const pose = (i: number): PenguinPose & { kind: number; headPitch: number; headYaw: number; flipOut: number; flipBack: number } => (i < NC ? colony.penguins[i] : ski.skiers[i - NC]);
  const NS = wild.seals.length;
  const NN = wild.narwhals.length;
  const NT = wild.terns.length;
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
  const bodies = inst("frost-penguins", buildPenguinBody(low), NP, true);
  const heads = inst("frost-penguin-heads", buildPenguinHead(low), NP, true);
  const wings = inst("frost-wings", buildWings(), NP * 2 + NT * 2, false);
  const beasts = inst("frost-beasts", buildBeasts(low), NS + NN + NT, true);
  // the ski run's gear: skis and poles for every skier, and the chairlift's chairs
  const gear = inst("frost-skigear", buildSkiGear(CHAIR_DROP), NK * 4 + ski.chairs, true);
  const ALL = [bodies, heads, wings, beasts, gear];
  // (a touch of per-penguin variety: slightly different blacks and whites)
  const tint = [...colony.penguins, ...ski.skiers].map((p) => new THREE.Color().setScalar(0.94 + ((p.seed % 11) / 11) * 0.08));
  const SKI_COLS = ["#ff5a7a", "#4f7bff", "#ffcf4a", "#4fc3a1", "#b07ce8", "#ff9a3d"].map((c) => new THREE.Color(c));
  const skiCol = ski.skiers.map((k) => SKI_COLS[k.seed % SKI_COLS.length]);

  // ── the painted words on the signs and banners ──
  const signs = buildSigns();
  track(signs.geometry);
  track(signs.material as THREE.MeshLambertMaterial);
  if ((signs.material as THREE.MeshLambertMaterial).map) track((signs.material as THREE.MeshLambertMaterial).map!);
  group.add(signs);
  const white = new THREE.Color(1, 1, 1);
  const sealTint = wild.seals.map((_, i) => new THREE.Color().setScalar(0.85 + (i % 3) * 0.08));

  // ── fx ──
  const XU = { uTime: { value: 0 }, uAurora: { value: 0 }, uGlow: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 150 }, uFogFar: { value: 430 } };
  const fx = buildFx(XU, low);
  group.add(fx.aurora, fx.glints, fx.flakes);
  disposables.push(fx);

  scene.add(group);

  // ── scratch (allocation-free update) ──
  const mRoot = new THREE.Matrix4();
  const mLocal = new THREE.Matrix4();
  const mOut = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const vp = new THREE.Vector3();
  const vs = new THREE.Vector3();
  const root = { x: 0, y: 0, z: 0 };
  const kidW = { x: 0, z: 0 };
  const auroraTint = new THREE.Color(0.1, 0.55, 0.38);
  const local = (px: number, py: number, pz: number, rx: number, ry: number, rz: number, s: number, out: THREE.Matrix4) => {
    e.set(rx, ry, rz, "YXZ");
    return out.compose(vp.set(px, py, pz), q.setFromEuler(e), vs.set(s, s, s));
  };
  const setInst = (o: (typeof ALL)[number], i: number, m: THREE.Matrix4, c: THREE.Color, sel: number) => {
    o.m.setMatrixAt(i, m);
    o.m.setColorAt(i, c);
    o.sel.setX(i, sel);
  };

  // discoveries
  const spotOut: FrostSpotOut = { id: "", name: "", text: "" };
  const result: { spot: FrostSpotOut | null } = { spot: null };
  const visits = new Map<string, number>();
  const facts = FROST_SPOTS.map((s) => frostFacts(s.id));
  let inSpot = -1;

  const FOG_U = [WU, XU];
  let visible = true;
  let sandCut = false;

  return {
    update(dtIn, t, o) {
      // (the ocean's deep sand floor: cut out over the island, once it exists)
      if (!sandCut) {
        const sand = scene.getObjectByName("uw-deep-floor") as THREE.Mesh | undefined;
        if (sand) {
          cutFrostFloor(sand.material as THREE.Material);
          sandCut = true;
        }
      }
      const dt = Math.min(0.1, Math.max(0, dtIn));
      const dKid = Math.hypot(o.kid.x - X0, o.kid.z - Z0);
      visible = dKid < FROST_HIDE_D;
      group.visible = visible;
      result.spot = null;
      if (!visible) {
        inSpot = -1;
        return result;
      }
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
        U.uGlow.value = glow;
      }
      // the aurora: at night, over the island, fading with distance (dim from under the sea)
      const aur = smooth(0.45, 0.9, glow) * (1 - smooth(AUR_NEAR, AUR_FAR, dKid)) * (o.under ? 0.25 : 1);
      XU.uAurora.value = aur;
      WU.uAurora.value = aur;
      groundMat.emissive.copy(auroraTint).multiplyScalar(aur * 0.14);
      GU.uTime.value = t;
      GU.uGlow.value = glow;
      GU.uCausticK.value = 1 - glow * 0.7;
      PU.uTime.value = t;
      PU.uGlowK.value = 0.06 + glow * 1.5;
      PU.uPulse.value = glow;
      FU.uGlowK.value = 0.12 + glow * 1.3;

      // ── the animals' day ──
      const near = dKid < FROST_ISLAND.r + 40;
      kidW.x = o.kid.x;
      kidW.z = o.kid.z;
      stepColony(colony, dtIn, t, near ? kidW : null);
      stepSkiField(ski, dtIn, t, near ? kidW : null);
      stepWildlife(wild, dtIn, t);
      for (let k = 0; k < ski.ev.n; k++) {
        const b = ski.ev.buf;
        fx.burst(b[k * 5], b[k * 5 + 1], b[k * 5 + 2], b[k * 5 + 3], b[k * 5 + 4]);
      }
      for (let k = 0; k < colony.ev.n; k++) {
        const b = colony.ev.buf;
        fx.burst(b[k * 5], b[k * 5 + 1], b[k * 5 + 2], b[k * 5 + 3], b[k * 5 + 4]);
      }
      for (let k = 0; k < wild.ev.n; k++) {
        const b = wild.ev.buf;
        fx.burst(b[k * 5], b[k * 5 + 1], b[k * 5 + 2], b[k * 5 + 3], b[k * 5 + 4]);
      }

      // penguins
      let nw = 0;
      for (let i = 0; i < NP; i++) {
        const p = pose(i);
        const rig = PENGUIN_RIG[p.kind];
        // (rest it on the real snow; swimmers well under the waves have their own floor)
        penguinRoot(p, root, p.y > WY_DRAW ? penguinGround : undefined);
        local(root.x - X0, root.y, root.z - Z0, p.pitch, p.yaw, p.roll, p.size, mRoot);
        setInst(bodies, i, mRoot, tint[i], p.kind);
        mOut.multiplyMatrices(mRoot, local(0, rig.neck, 0.02, p.headPitch, p.headYaw, 0, 1, mLocal));
        setInst(heads, i, mOut, tint[i], p.kind);
        for (let sd = 1; sd >= -1; sd -= 2) {
          mOut.multiplyMatrices(mRoot, local(sd * rig.shoulderX, rig.shoulderY, 0, p.flipBack, 0, sd * p.flipOut, 1, mLocal));
          setInst(wings, nw++, mOut, white, p.kind);
        }
      }
      // skis, poles and chairs
      let ng = 0;
      for (let j = 0; j < NK; j++) {
        const k = ski.skiers[j];
        const i = NC + j;
        const rig = PENGUIN_RIG[k.kind];
        penguinRoot(k, root, penguinGround);
        local(root.x - X0, root.y, root.z - Z0, k.pitch, k.yaw, k.roll, k.size, mRoot);
        const foot = PENGUIN_BODY[k.kind].foot + 0.02;
        const sy = Math.sin(k.yaw);
        const cyw = Math.cos(k.yaw);
        for (let sd = 1; sd >= -1; sd -= 2) {
          const yawS = k.yaw - sd * k.splay * 0.32;
          if (k.dangle > 0.5) {
            // hanging off the feet (riding the lift, a tumble): in the body's frame, tips down a bit
            mOut.multiplyMatrices(mRoot, local(sd * foot, -0.02, 0.06, 0.45, -sd * k.splay * 0.32, 0, 1, mLocal));
          } else {
            // flat on the snow under each foot, along the slope, edged with the lean
            const fx2 = root.x + cyw * sd * foot * k.size;
            const fz2 = root.z - sy * sd * foot * k.size;
            const down = -(k.gx * Math.sin(yawS) + k.gz * Math.cos(yawS));
            local(fx2 - X0, root.y + 0.012, fz2 - Z0, Math.atan(down), yawS, k.roll * 0.4, k.size, mOut);
          }
          setInst(gear, ng++, mOut, skiCol[j], G_SKI);
        }
        if (k.kind !== 1) {
          // poles in the flippers' tips, swinging forward to plant at each turn
          for (let sd = 1; sd >= -1; sd -= 2) {
            const fl = FLIP_LEN[k.kind] * 0.8;
            const hx = sd * (rig.shoulderX + fl * Math.sin(k.flipOut) * 0.6);
            const hy = rig.shoulderY - fl * Math.cos(k.flipOut);
            const swing = sd > 0 ? k.poleL : k.poleR;
            mLocal.compose(vp.set(hx, hy, 0.06), q.setFromEuler(e.set(-swing * 0.45 - 0.15, 0, sd * 0.14, "YXZ")), vs.set(1, hy + 0.04, 1));
            mOut.multiplyMatrices(mRoot, mLocal);
            setInst(gear, ng++, mOut, white, G_POLE);
          }
        }
        void i;
      }
      for (let c = 0; c < ski.chairs; c++) {
        const P4 = ski.chairPose;
        local(P4[c * 4] - X0, P4[c * 4 + 1] - 0.02, P4[c * 4 + 2] - Z0, 0, P4[c * 4 + 3], 0, 1, mOut);
        setInst(gear, ng++, mOut, white, G_CHAIR);
      }
      gear.m.count = ng;
      // seals, narwhals, terns
      let nb = 0;
      for (let i = 0; i < NS; i++) {
        const s = wild.seals[i];
        local(s.x - X0, s.y, s.z - Z0, s.pitch, s.yaw, s.roll, BEAST_K.seal, mOut);
        setInst(beasts, nb++, mOut, sealTint[i], B_SEAL);
      }
      for (let i = 0; i < NN; i++) {
        const n = wild.narwhals[i];
        local(n.x - X0, n.y, n.z - Z0, n.pitch, n.yaw, n.roll, BEAST_K.narwhal * (i === NN - 1 ? NARWHAL_CALF : 1), mOut);
        setInst(beasts, nb++, mOut, white, B_NARWHAL);
      }
      for (let i = 0; i < NT; i++) {
        const b = wild.terns[i];
        local(b.x - X0, b.y, b.z - Z0, b.pitch, b.yaw, b.roll, BEAST_K.tern, mRoot);
        setInst(beasts, nb++, mRoot, white, B_TERN);
        for (let sd = 1; sd >= -1; sd -= 2) {
          if (b.flap < -0.5) mOut.multiplyMatrices(mRoot, local(sd * 0.05, 0.04, 0, 0, sd * 1.1, sd * 0.15, 0.8, mLocal));
          else mOut.multiplyMatrices(mRoot, local(sd * 0.06, 0.03, 0.02, 0, 0, sd * b.flap, 1, mLocal));
          setInst(wings, nw++, mOut, white, sd > 0 ? W_TERN_R : W_TERN_L);
        }
      }
      wings.m.count = nw;
      beasts.m.count = nb;
      for (let k = 0; k < ALL.length; k++) {
        const o2 = ALL[k];
        o2.m.instanceMatrix.needsUpdate = true;
        if (o2.m.instanceColor) o2.m.instanceColor.needsUpdate = true;
        o2.sel.needsUpdate = true;
      }

      fx.update(dt, t, { glow, kid: o.kid, near: dKid < FROST_ISLAND.r + 30 && !o.under, under: o.under });

      // ── discoveries ──
      let found = -1;
      for (let k = 0; k < FROST_SPOTS.length; k++) {
        const s = FROST_SPOTS[k];
        const r = FROST_SPOT_R[s.kind];
        if ((o.kid.x - s.x) ** 2 + (o.kid.z - s.z) ** 2 < r * r) {
          found = k;
          break;
        }
      }
      if (found !== inSpot) {
        if (found >= 0) visits.set(FROST_SPOTS[found].id, (visits.get(FROST_SPOTS[found].id) ?? -1) + 1);
        inSpot = found;
      }
      if (found >= 0) {
        const s = FROST_SPOTS[found];
        const f = facts[found];
        spotOut.id = s.id;
        spotOut.name = s.name;
        spotOut.text = f[(visits.get(s.id) ?? 0) % f.length];
        result.spot = spotOut;
      }
      return result;
    },
    slide: {
      offer: (x, z) => slideStartAt(x, z),
      hold: (c) => colonyKidChute(colony, c),
      clear: (c) => colonyChuteClear(colony, c),
      ahead: (c, s) => colonyAheadOn(colony, c, s),
      fx: (x, y, z, size, kind) => fx.burst(x, y, z, size, kind),
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
      for (const o2 of ALL) o2.m.dispose();
    },
  };
}

/** draw calls and triangles the island adds (for the budget test / the harness) */
export function frostMeshStats(group: THREE.Object3D): FrostStats {
  let drawCalls = 0;
  let triangles = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as THREE.Mesh).isMesh && !(o as THREE.Points).isPoints) return;
    if (!o.visible) return;
    drawCalls++;
    if ((o as THREE.Points).isPoints) return;
    const g = m.geometry as THREE.BufferGeometry;
    const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    triangles += trisOf(g) * n;
  });
  return { drawCalls, triangles };
}
