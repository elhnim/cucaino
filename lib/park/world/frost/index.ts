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
import { B_NARWHAL, B_SEAL, B_TERN, G_CHAIR, G_POLE, G_SCARF, G_SKI, G_SUIT, PENGUIN_RIG, W_TERN_L, W_TERN_R, buildBeasts, buildPenguinBody, buildPenguinHead, buildSkiGear, buildWings } from "./critters";
import { PENGUIN_BODY, STATE_NAMES, colonyAheadOn, colonyChuteClear, colonyKidChute, makeColony, penguinGround, penguinRoot, stepColony, type PenguinPose } from "./colony";
import { kidLiftOffer, kidLiftRequest, kidLiftReset, makeSkiField, skierStands, stepSkiField, type KidLift } from "./ski";
import { skiHutAt } from "./kidSki";
import { slideStartAt } from "./kidSlide";
import { buildSigns } from "./signs";
import { CHAIR_DROP, FROST_WATER_Y } from "../../registry/frostIsland";
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
    /** a puff of snow (kind 2), a skier's spray (4) or a splash (0 big, 1 small) at a world point */
    fx(x: number, y: number, z: number, size: number, kind: number): void;
  };
  /** the Park kid on the Penguin Ski Run (./kidSki.ts) and its chairlift (./ski.ts kidLift*) */
  ski: {
    /** standing by the start hut (skis on offer) */
    hutAt(x: number, z: number): boolean;
    /** standing by the lift's boarding line */
    liftAt(x: number, z: number): boolean;
    /** the kid's run: how far down they are (-99 when not skiing): the start gate holds the penguins */
    kidOnPiste(s: number): void;
    /** is the top of the piste clear (nobody just setting off) */
    topClear(): boolean;
    /** how far down the nearest penguin skiing ahead of s is (Infinity: nobody) */
    aheadOf(s: number): number;
    /** ride the chairlift up: false if the kid's already on it */
    rideLift(x: number, z: number): boolean;
    /** the kid on the lift (state KL_*, where they are) */
    lift(): KidLift;
    liftDone(): void;
  };
  /** the penguins stand where they stand: push the Park kid (on foot) out of any they'd walk into */
  blockKid(p: { x: number; z: number }): void;
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

// (the ocean's sandy deep floor follows seaFloorY, which counts this island's land and slopes as sea
// floor: it's cut away over the island's own ground by ../sea/islandFloors, where Frostpeak is
// registered with every other island — no lookup by mesh name here any more)

/** the colony's states in which a penguin is standing or waddling about on the snow */
const STANDS = new Set(["home", "walkout", "ascend", "queue", "walkhome", "huddle", "follow", "creche"].map((n) => STATE_NAMES.indexOf(n)));
/** the Park kid's half-width (for stepping aside / bumping into penguins) */
const KID_R = 0.5;

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
  /** standing / waddling about on the snow (not sliding, swimming, skiing or on the lift): steps aside */
  const standsAside = (i: number) => {
    if (i >= NC) return skierStands(ski.skiers[i - NC]);
    const p = colony.penguins[i];
    return p.y > FROST_WATER_Y + 0.3 && STANDS.has(p.state);
  };
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
  // the ski run's gear: skis and poles for every skier, a bright ski suit and a scarf, and the chairlift's chairs
  // (three meshes, so each instance only draws its own piece)
  const gear = inst("frost-skigear", buildSkiGear(CHAIR_DROP, [G_SKI, G_POLE]), NK * 4, true);
  const wear = inst("frost-skiwear", buildSkiGear(CHAIR_DROP, [G_SUIT, G_SCARF]), NK * 2, true);
  const chairs = inst("frost-chairs", buildSkiGear(CHAIR_DROP, [G_CHAIR]), ski.chairs, true);
  // (penguins standing about step aside for the Park kid: an offset per penguin, eased in and out)
  const offX = new Float32Array(NC + NK);
  const offZ = new Float32Array(NC + NK);
  const ALL = [bodies, heads, wings, beasts, gear, wear, chairs];
  // (a touch of per-penguin variety: slightly different blacks and whites)
  const tint = [...colony.penguins, ...ski.skiers].map((p) => new THREE.Color().setScalar(0.94 + ((p.seed % 11) / 11) * 0.08));
  const SKI_COLS = ["#ff3d6e", "#2f6bff", "#ffc21a", "#14c79a", "#a35cff", "#ff7a1a"].map((c) => new THREE.Color(c));
  const SCARF_COLS = ["#fff04a", "#ff4fd8", "#3dfcff", "#ff5a3d", "#7dff4a", "#ffffff"].map((c) => new THREE.Color(c));
  const skiCol = ski.skiers.map((k) => SKI_COLS[k.seed % SKI_COLS.length]);
  // (the scarf never matches the suit)
  const scarfCol = ski.skiers.map((k) => SCARF_COLS[(k.seed + 1 + Math.floor(k.seed / 7)) % SCARF_COLS.length]);

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

  return {
    update(dtIn, t, o) {
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
        // (the ski run's snow puffs, bigger: they read from the lodge)
        fx.burst(b[k * 5], b[k * 5 + 1], b[k * 5 + 2], b[k * 5 + 3] * (b[k * 5 + 4] === 2 ? 1.7 : 1), b[k * 5 + 4]);
      }
      // penguins standing about (queues, the colony at home, waddling up) step aside for the kid
      for (let i = 0; i < NP; i++) {
        const p = pose(i);
        let wx = 0;
        let wz = 0;
        if (near && standsAside(i)) {
          const dx = p.x - kidW.x;
          const dz = p.z - kidW.z;
          const d = Math.hypot(dx, dz);
          const R = KID_R + PENGUIN_BODY[p.kind].rx * p.size + 0.35;
          if (d < R && d > 1e-4) {
            wx = (dx / d) * (R - d);
            wz = (dz / d) * (R - d);
          }
        }
        const e = Math.min(1, dt * 7);
        offX[i] += (wx - offX[i]) * e;
        offZ[i] += (wz - offZ[i]) * e;
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
        p.x += offX[i];
        p.z += offZ[i];
        penguinRoot(p, root, p.y > WY_DRAW ? penguinGround : undefined);
        p.x -= offX[i];
        p.z -= offZ[i];
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
      let nwr = 0;
      for (let j = 0; j < NK; j++) {
        const k = ski.skiers[j];
        const i = NC + j;
        const rig = PENGUIN_RIG[k.kind];
        k.x += offX[i];
        k.z += offZ[i];
        penguinRoot(k, root, penguinGround);
        k.x -= offX[i];
        k.z -= offZ[i];
        local(root.x - X0, root.y, root.z - Z0, k.pitch, k.yaw, k.roll, k.size, mRoot);
        // the ski suit round the body and the scarf round the neck (racers; the chicks have no suits)
        if (k.kind !== 1) {
          const B = PENGUIN_BODY[k.kind];
          mLocal.compose(vp.set(0, B.cy, 0.005), q.identity(), vs.set(B.rx, B.ry, B.rz));
          mOut.multiplyMatrices(mRoot, mLocal);
          setInst(wear, nwr++, mOut, skiCol[j], G_SUIT);
          const nr = B.rx * 0.62;
          mLocal.compose(vp.set(0, rig.neck - 0.02, 0.01), q.setFromEuler(e.set(0.1, 0, 0, "YXZ")), vs.set(nr, nr, nr));
          mOut.multiplyMatrices(mRoot, mLocal);
          setInst(wear, nwr++, mOut, scarfCol[j], G_SCARF);
        }
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
        setInst(chairs, c, mOut, white, G_CHAIR);
      }
      gear.m.count = ng;
      wear.m.count = nwr;
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
    ski: {
      hutAt: (x, z) => skiHutAt(x, z),
      liftAt: (x, z) => kidLiftOffer(x, z),
      kidOnPiste: (s) => {
        ski.kidSkiS = s;
      },
      topClear: () => {
        for (const k of ski.skiers) if ((k.state === 6 || k.state === 7) && k.s < 6) return false;
        return true;
      },
      aheadOf: (s) => {
        let best = Infinity;
        for (const k of ski.skiers) if ((k.state === 6 || k.state === 7) && k.s > s) best = Math.min(best, k.s);
        return best;
      },
      rideLift: (x, z) => kidLiftRequest(ski, x, z),
      lift: () => ski.kid,
      liftDone: () => kidLiftReset(ski),
    },
    blockKid(p) {
      if (Math.abs(p.x - X0) > FROST_ISLAND.r + 40 || Math.abs(p.z - Z0) > FROST_ISLAND.r + 40) return;
      for (let i = 0; i < NP; i++) {
        if (!standsAside(i)) continue;
        const q2 = pose(i);
        const px = q2.x + offX[i];
        const pz = q2.z + offZ[i];
        const dx = p.x - px;
        const dz = p.z - pz;
        const d = Math.hypot(dx, dz);
        const R = KID_R + PENGUIN_BODY[q2.kind].rx * q2.size + 0.15;
        if (d < R && d > 1e-4) {
          p.x = px + (dx / d) * R;
          p.z = pz + (dz / d) * R;
        }
      }
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
