// The Midnight Rift: a long, winding crack in the open-ocean floor south of the park
// (../../registry/abyss.ts), full of the rarest deep-sea animals and a few that have been extinct
// for millions of years. Terraced, layered canyon walls with jutting boulders, a black smoker vent
// field with shimmering plumes, giant tube-worm gardens and yeti crabs, a whale-fall skeleton, sea
// pens and glass sponges on the ledges, the Old Arch (the giant octopus's grotto), the Rock Bridge,
// marine snow and bioluminescent sparkles. Creatures (./creatures.ts, behaviours ./plan.ts):
//   extinct: MEGALODON (16 m; cruises the rift and comes to circle a diving kid, kindly), the
//   ancient GIANT OCTOPUS (reaches out and waves, changes colour), liopleurodon, dunkleosteus,
//   helicoprion, ammonites jetting about, trilobites and sea scorpions on the floor
//   rare today: anglerfish (glowing lures), giant squid, vampire squid, dumbo octopuses, gulper
//   eels, an oarfish, coelacanths, a goblin shark, frilled sharks, barreleyes (see-through heads),
//   comb jellies (rainbow combs), siphonophores, sea pigs, giant isopods, a Greenland shark
// Each has a discovery card (./facts.ts) returned as `spot` when the kid swims up to it.
//
// Shown only under water within ~250 m of the rift (updates skipped otherwise).
// Budget (standard): 6 draw calls (one BatchedMesh each for the rock + still life, the creatures and
// the glassy creatures; the plumes; the glow sprites; the marine snow), ~150k triangles all told
// (low: ~half) — and far less on screen (canyon chunks and creatures are culled by frustum and
// fog). Update is allocation-free and deterministic.
import * as THREE from "three";
import { ABYSS_BOUNDS, ABYSS_GRID, abyssDistance, abyssLocate, abyssProject, type AbyssHit } from "../../registry/abyss";
import { WATER_Y } from "../../registry/terrain";
import { buildGlowSprites, buildSnow } from "../underwater/fx";
import { makeUwUniforms } from "../underwater/shaders";
import { rngOf } from "../fantasy/noise";
import {
  ammoniteGeometry,
  anglerfishGeometry,
  barreleyeDomeGeometry,
  barreleyeGeometry,
  coelacanthGeometry,
  combJellyGeometry,
  dumboGeometry,
  dunkleosteusGeometry,
  eurypteridGeometry,
  frilledGeometry,
  giantSquidGeometry,
  goblinGeometry,
  greenlandGeometry,
  gulperGeometry,
  helicoprionGeometry,
  isopodGeometry,
  liopleurodonGeometry,
  megalodonGeometry,
  octoArmGeometry,
  octopusBodyGeometry,
  oarfishGeometry,
  seaPigGeometry,
  siphonophoreGeometry,
  trilobiteGeometry,
  vampireSquidGeometry,
  yetiCrabGeometry,
  type CreatureGeo,
  type Light,
} from "./creatures";
import { FACTS, RIFT_FACT, type AbyssFact } from "./facts";
import { VOID_GLSL, abyssMaterial, glassMaterial, makeAbyssUniforms, plumeMaterial } from "./material";
import {
  BRIDGE,
  CHIMNEYS,
  GROTTO,
  VENT_FIELD,
  WHALE_FALL,
  makeMegState,
  megPose,
  octoReach,
  planCreatures,
  planProps,
  stepCreature,
  stepEscort,
  stepMegalodon,
  RIFT_L,
  RIM_Y,
  floorAt,
  toWorld,
  wallU,
  type KidInfo,
  type Species,
} from "./plan";
import {
  archGeometry,
  barrelSpongeGeometry,
  boulderGeometry,
  bridgeGeometry,
  CRUST_COLS,
  canyonChunk,
  chimneyGeometry,
  crustGeometry,
  glassSpongeGeometry,
  plumeGeometry,
  seaPenGeometry,
  strataColor,
  tubeWormGeometry,
  whaleFallGeometry,
} from "./scenery";

export { ABYSS, abyssDistance, abyssFloorY } from "../../registry/abyss";

export interface Abyss {
  update(dt: number, t: number, o: { kid: THREE.Vector3; under: boolean; glow: number }): { spot: { id: string; name: string; text: string } | null };
  dispose(): void;
}

/** how near (m) the rift must be for anything to be drawn */
const SHOW_R = 250;
const TAU = Math.PI * 2;
const PH_WRAP = Math.PI * 4;

const SPECIES_FACT: Record<Species, AbyssFact> = {
  megalodon: FACTS.megalodon,
  greenland: FACTS.greenland,
  liopleurodon: FACTS.liopleurodon,
  dunkleosteus: FACTS.dunkleosteus,
  helicoprion: FACTS.helicoprion,
  goblinShark: FACTS.goblinShark,
  frilledShark: FACTS.frilledShark,
  coelacanth: FACTS.coelacanth,
  giantSquid: FACTS.giantSquid,
  gulper: FACTS.gulper,
  oarfish: FACTS.oarfish,
  anglerfish: FACTS.anglerfish,
  vampireSquid: FACTS.vampireSquid,
  dumbo: FACTS.dumbo,
  barreleye: FACTS.barreleye,
  combJelly: FACTS.combJelly,
  siphonophore: FACTS.siphonophore,
  ammonite: FACTS.ammonite,
  trilobite: FACTS.trilobite,
  eurypterid: FACTS.eurypterid,
  seaPig: FACTS.seaPig,
  isopod: FACTS.isopod,
  yetiCrab: FACTS.yetiCrab,
  giantOctopus: FACTS.giantOctopus,
};

/** which creatures are see-through (drawn in the glass batch) */
const GLASS: Partial<Record<Species, true>> = { combJelly: true, siphonophore: true };

export function buildAbyss(scene: THREE.Scene, opts: { lowQuality?: boolean }): Abyss {
  const low = !!opts.lowQuality;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
  const group = new THREE.Group();
  group.name = "abyss";
  group.visible = false;
  scene.add(group);

  const AU = makeAbyssUniforms();
  const rockMat = track(abyssMaterial(AU, { flat: true, rim: 0.32, lift: 0.13 }, { roughness: 0.95 }));
  // (wins the depth tie where the rim strip overlaps the deep sandy floor round it)
  rockMat.polygonOffset = true;
  rockMat.polygonOffsetFactor = -1;
  rockMat.polygonOffsetUnits = -2;
  const lifeMat = track(abyssMaterial(AU, { rim: 0.55, lift: 0.17 }, { roughness: 0.55 }));
  const glassMat = track(glassMaterial(AU));
  const plumeMat = track(plumeMaterial(AU));

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c4 = new THREE.Vector4();
  const col = new THREE.Color();

  const batch = (geos: THREE.BufferGeometry[], instances: number, mat: THREE.Material, name: string) => {
    let verts = 0;
    for (const g of geos) verts += g.attributes.position.count;
    const b = new THREE.BatchedMesh(instances, verts, 0, mat);
    b.name = name;
    b.frustumCulled = false;
    b.perObjectFrustumCulled = true;
    b.sortObjects = mat.transparent;
    const ids = geos.map((g) => b.addGeometry(g));
    for (const g of geos) g.dispose();
    track(b);
    group.add(b);
    return { b, ids };
  };
  const setColor = (b: THREE.BatchedMesh, id: number, c: THREE.Color, a: number) => {
    c4.set(c.r, c.g, c.b, a);
    b.setColorAt(id, c4);
  };

  // ── the rock and the still life (one batch) ──
  const G = ABYSS_GRID;
  const CH = 12;
  const staticGeos: THREE.BufferGeometry[] = [];
  const chunkN = Math.ceil((G.rows - 1) / CH);
  for (let k = 0; k < chunkN; k++) staticGeos.push(canyonChunk(k * CH, Math.min(G.rows - 1, (k + 1) * CH)));
  const GI = {
    boulder: staticGeos.length,
    worms: staticGeos.length + 3,
    pen: staticGeos.length + 6,
    sponge: staticGeos.length + 7,
    barrel: staticGeos.length + 8,
    chimney: staticGeos.length + 9,
    whale: staticGeos.length + 11,
    arch: staticGeos.length + 12,
    bridge: staticGeos.length + 13,
    crust: staticGeos.length + 14,
  };
  staticGeos.push(boulderGeometry(3), boulderGeometry(7), boulderGeometry(11));
  staticGeos.push(tubeWormGeometry(21, low), tubeWormGeometry(22, low), tubeWormGeometry(23, low));
  staticGeos.push(seaPenGeometry(), glassSpongeGeometry(), barrelSpongeGeometry());
  staticGeos.push(chimneyGeometry(31, low), chimneyGeometry(32, low));
  staticGeos.push(whaleFallGeometry(low));
  const arch = archGeometry(low);
  staticGeos.push(arch.geo);
  staticGeos.push(bridgeGeometry(low));
  staticGeos.push(crustGeometry(41, low), crustGeometry(42, low));
  const props = planProps(low);
  const staticCount = chunkN + props.length + CHIMNEYS.length + 3;
  const statics = batch(staticGeos, staticCount, rockMat, "abyss-rock");
  const white = new THREE.Color(1, 1, 1);
  const ident = new THREE.Matrix4();
  const addStatic = (geo: number, mat: THREE.Matrix4, tint: THREE.Color) => {
    const id = statics.b.addInstance(statics.ids[geo]);
    statics.b.setMatrixAt(id, mat);
    setColor(statics.b, id, tint, 0);
    return id;
  };
  for (let k = 0; k < chunkN; k++) addStatic(k, ident, white);
  /** props that are culled by distance (id, x, y, z, radius) */
  const propCull: { id: number; x: number; y: number; z: number; r: number; far: number }[] = [];
  const rp = rngOf(3);
  for (const p of props) {
    let g: number;
    if (p.kind === "rock") g = GI.boulder + Math.floor(rp() * 3);
    else if (p.kind === "worms") g = GI.worms + Math.floor(rp() * 3);
    else if (p.kind === "pen") g = GI.pen;
    else if (p.kind === "sponge") g = GI.sponge;
    else if (p.kind === "crust") g = GI.crust + Math.floor(rp() * 2);
    else g = GI.barrel;
    e.set(p.kind === "rock" ? (rp() - 0.5) * 0.4 : 0, p.yaw, p.kind === "rock" ? (rp() - 0.5) * 0.3 : 0, "YXZ");
    m4.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e), s3.set(p.sx, p.sy, p.sz));
    const tint = p.kind === "rock" ? strataColor(p.x, p.y, p.z, col).clone() : p.kind === "crust" ? CRUST_COLS[p.tilt % CRUST_COLS.length] : white;
    const id = addStatic(g, m4, tint);
    // (glowing crusts carry further than the fog)
    propCull.push({ id, x: p.x, y: p.y, z: p.z, r: Math.max(p.sx, p.sy, p.sz) * 1.5, far: p.kind === "crust" ? 1.8 : 1 });
  }
  CHIMNEYS.forEach((c, i) => {
    e.set(0, i * 1.3, 0, "YXZ");
    m4.compose(v.set(c.x, c.y, c.z), q.setFromEuler(e), s3.set(c.r, c.h, c.r));
    const id = addStatic(GI.chimney + (i % 2), m4, white);
    propCull.push({ id, x: c.x, y: c.y + c.h / 2, z: c.z, r: c.h, far: 1 });
  });
  addStatic(GI.whale, ident, white);
  addStatic(GI.arch, ident, white);
  addStatic(GI.bridge, ident, white);

  // ── the creatures ──
  const creatures = planCreatures(low);
  const GEO: Record<Species, () => CreatureGeo> = {
    megalodon: () => megalodonGeometry(low),
    greenland: () => greenlandGeometry(low),
    liopleurodon: () => liopleurodonGeometry(low),
    dunkleosteus: () => dunkleosteusGeometry(low),
    helicoprion: () => helicoprionGeometry(low),
    goblinShark: () => goblinGeometry(low),
    frilledShark: () => frilledGeometry(low),
    coelacanth: () => coelacanthGeometry(low),
    giantSquid: () => giantSquidGeometry(low),
    gulper: () => gulperGeometry(low),
    oarfish: () => oarfishGeometry(low),
    anglerfish: () => anglerfishGeometry(low),
    vampireSquid: () => vampireSquidGeometry(low),
    dumbo: () => dumboGeometry(low),
    barreleye: () => barreleyeGeometry(low),
    combJelly: () => ({ geo: combJellyGeometry(low), lights: [] }),
    siphonophore: () => ({ geo: siphonophoreGeometry(low), lights: [] }),
    ammonite: () => ammoniteGeometry(low),
    trilobite: () => trilobiteGeometry(low),
    eurypterid: () => eurypteridGeometry(low),
    seaPig: () => seaPigGeometry(low),
    isopod: () => isopodGeometry(low),
    yetiCrab: () => yetiCrabGeometry(low),
    giantOctopus: () => octopusBodyGeometry(low),
  };
  const species = [...new Set(creatures.map((c) => c.sp))];
  const opaqueGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const geoIndex = new Map<Species, number>();
  const lightsOf = new Map<Species, Light[]>();
  const waveOf = new Map<Species, CreatureGeo["wave"]>();
  for (const sp of species) {
    const cg = GEO[sp]();
    lightsOf.set(sp, cg.lights);
    waveOf.set(sp, cg.wave);
    if (GLASS[sp]) {
      geoIndex.set(sp, glassGeos.length);
      glassGeos.push(cg.geo);
    } else {
      geoIndex.set(sp, opaqueGeos.length);
      opaqueGeos.push(cg.geo);
    }
  }
  const ARM = opaqueGeos.length;
  opaqueGeos.push(octoArmGeometry(low).geo);
  const DOME = glassGeos.length;
  glassGeos.push(barreleyeDomeGeometry());
  const nOpaque = creatures.filter((c) => !GLASS[c.sp]).length + 8;
  const nGlass = creatures.filter((c) => GLASS[c.sp] || c.sp === "barreleye").length;
  const life = batch(opaqueGeos, nOpaque, lifeMat, "abyss-life");
  const glass = batch(glassGeos, nGlass, glassMat, "abyss-glass");
  glass.b.renderOrder = 4;
  // instance ids per creature (and the barreleyes' domes)
  const inst = creatures.map((c) => {
    const onGlass = !!GLASS[c.sp];
    const bm = onGlass ? glass : life;
    const id = bm.b.addInstance(bm.ids[geoIndex.get(c.sp)!]);
    setColor(bm.b, id, white, 0);
    const dome = c.sp === "barreleye" ? glass.b.addInstance(glass.ids[DOME]) : -1;
    if (dome >= 0) setColor(glass.b, dome, white, 0);
    return { onGlass, id, dome, b: bm.b };
  });
  const octoIdx = creatures.findIndex((c) => c.sp === "giantOctopus");
  const armIds: number[] = [];
  for (let k = 0; k < 8; k++) {
    const id = life.b.addInstance(life.ids[ARM]);
    setColor(life.b, id, white, 0);
    armIds.push(id);
  }
  const meg = creatures.find((c) => c.kind === "megalodon")!;
  const megSt = makeMegState(meg);

  // ── the vent plumes ──
  const plumeGeo = track(plumeGeometry(low));
  const plumes = new THREE.Mesh(plumeGeo, plumeMat);
  plumes.name = "abyss-plumes";
  plumes.renderOrder = 5;
  plumes.frustumCulled = true;
  group.add(plumes);

  // ── glow sprites: lures, photophores, vent mouths, runes, plankton sparkles ──
  const UW = makeUwUniforms();
  const moving: { ci: number; l: Light }[] = [];
  creatures.forEach((c, ci) => {
    for (const l of lightsOf.get(c.sp) ?? []) moving.push({ ci, l });
  });
  const fixedLights: { x: number; y: number; z: number; r: number; g: number; b: number; s: number }[] = [];
  for (const ch of CHIMNEYS) fixedLights.push({ x: ch.x, y: ch.y + ch.h + 0.2, z: ch.z, r: 1.4, g: 0.55, b: 0.15, s: 3.2 });
  for (const rn of arch.runes) fixedLights.push({ x: rn.x, y: rn.y, z: rn.z, r: 0.35, g: 1.1, b: 1.2, s: 1.3 });
  const nSpark = low ? 50 : 110;
  const glows = track(buildGlowSprites(UW, moving.length + fixedLights.length + nSpark));
  group.add(glows.points);
  fixedLights.forEach((f, i) => glows.set(moving.length + i, f.x, f.y, f.z, f.r, f.g, f.b, f.s));
  const sparkBase = moving.length + fixedLights.length;
  const rs = rngOf(77);
  const spark = new Float32Array(nSpark * 5);
  const SPARK_COLS = [
    [0.3, 1.0, 1.1],
    [0.4, 1.2, 0.6],
    [0.5, 0.6, 1.3],
    [1.1, 0.5, 1.0],
  ];
  for (let i = 0; i < nSpark; i++) {
    spark[i * 5] = rs() * 36;
    spark[i * 5 + 1] = rs() * 36;
    spark[i * 5 + 2] = rs() * 36;
    spark[i * 5 + 3] = rs() * TAU;
    spark[i * 5 + 4] = 0.35 + rs() * 0.9;
  }

  // ── far lights: the glowing crusts (and vent mouths, runes) seen as points of light from much
  //    further than the fog lets you see the rock — the rift below you twinkles like a night sky ──
  const farList: number[] = [];
  for (const p of props) {
    if (p.kind !== "crust") continue;
    const c = CRUST_COLS[p.tilt % CRUST_COLS.length];
    farList.push(p.x + Math.sin(p.yaw) * 0.25, p.y, p.z + Math.cos(p.yaw) * 0.25, c.r, c.g, c.b, 0.55 * p.sx);
  }
  // and many more tiny glows speckled over the cliffs (points only)
  {
    const rw = rngOf(606);
    const wp = { x: 0, y: 0, z: 0 };
    for (let s = 20; s < RIFT_L - 20; s += low ? 2.2 : 1.1) {
      const side = rw() < 0.5 ? 1 : -1;
      const fl = floorAt(s, 0);
      const y = fl + 3 + rw() * (RIM_Y - 5 - fl - 3);
      const u = wallU(s, y, side) - side * 0.35;
      toWorld(s, u, wp);
      const c = CRUST_COLS[Math.floor(rw() * CRUST_COLS.length)];
      const k = 0.5 + rw() * 0.7;
      farList.push(wp.x, y, wp.z, c.r * k, c.g * k, c.b * k, 0.25 + rw() * 0.45);
    }
  }
  for (const ch of CHIMNEYS) farList.push(ch.x, ch.y + ch.h + 0.3, ch.z, 1.6, 0.6, 0.15, 2.4);
  for (const rn of arch.runes) farList.push(rn.x, rn.y, rn.z, 0.4, 1.3, 1.4, 1.1);
  const nFar = farList.length / 7;
  const farPos = new Float32Array(nFar * 3);
  const farCol = new Float32Array(nFar * 3);
  const farSize = new Float32Array(nFar);
  for (let i = 0; i < nFar; i++) {
    farPos.set(farList.slice(i * 7, i * 7 + 3), i * 3);
    farCol.set(farList.slice(i * 7 + 3, i * 7 + 6), i * 3);
    farSize[i] = farList[i * 7 + 6];
  }
  const farGeo = track(new THREE.BufferGeometry());
  farGeo.setAttribute("position", new THREE.BufferAttribute(farPos, 3));
  farGeo.setAttribute("aColor", new THREE.BufferAttribute(farCol, 3));
  farGeo.setAttribute("aSize", new THREE.BufferAttribute(farSize, 1));
  farGeo.computeBoundingSphere();
  const uFarPx = { value: 800 };
  const uFogFar = { value: 50 };
  const farMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: AU.uTime, uPx: uFarPx, uFogFar },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize;
        uniform float uTime; uniform float uPx; uniform float uFogFar;
        varying vec3 vC;
        void main() {
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          float d = -mv.z;
          // (near ones are drawn as rock: these take over past ~half the fog, and fade far out)
          float k = smoothstep( 2.0, uFogFar * 0.5, d ) * ( 1.0 - smoothstep( uFogFar * 1.4, uFogFar * 2.6, d ) );
          float tw = 0.75 + 0.25 * sin( uTime * 1.7 + position.x * 1.3 + position.y * 0.7 );
          vC = aColor * k * tw;
          gl_PointSize = max( 1.5, aSize * projectionMatrix[1][1] * uPx * 0.5 / max( 0.5, d ) ) * step( 0.001, k );
          // (past the fog, pull the point in along the view ray to just inside the fog backdrops,
          // which write depth; rock in between still hides it)
          float pull = min( 1.0, uFogFar * 0.95 / max( 0.01, length( mv.xyz ) ) );
          mv.xyz *= pull;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        void main() {
          float r = length( gl_PointCoord - 0.5 ) * 2.0;
          if ( r > 1.0 ) discard;
          gl_FragColor = vec4( vC * ( pow( 1.0 - r, 1.5 ) + 0.25 * step( r, 0.35 ) ), 1.0 );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  const farLights = new THREE.Points(farGeo, farMat);
  farLights.name = "abyss-far-lights";
  farLights.frustumCulled = false;
  farLights.renderOrder = 6;
  const farSz = new THREE.Vector2();
  farLights.onBeforeRender = (r: THREE.WebGLRenderer) => {
    r.getDrawingBufferSize(farSz);
    uFarPx.value = farSz.y;
  };
  group.add(farLights);

  // ── the void: looking down into the rift, the blue fades into darkness (a backdrop just inside
  //    the underwater one, dark below and fog-coloured elsewhere; the rift's rock fogs the same way) ──
  const voidFog = { value: new THREE.Color() };
  const voidMat = track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      uniforms: { uFogCol: voidFog, uVoid: AU.uVoid, uVoidCol: AU.uVoidCol },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec4 w = modelMatrix * vec4( position, 1.0 );
          vDir = w.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogCol; uniform float uVoid; uniform vec3 uVoidCol;
        varying vec3 vDir;
        ${VOID_GLSL}
        void main() {
          gl_FragColor = vec4( mix( uFogCol, uVoidCol, abVoidK( normalize( vDir ).y, uVoid ) ), 1.0 );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  const voidBox = new THREE.Mesh(track(new THREE.SphereGeometry(1, 24, 12)), voidMat);
  voidBox.name = "abyss-void";
  voidBox.frustumCulled = false;
  voidBox.renderOrder = -4;
  voidBox.onBeforeRender = (_r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => {
    voidBox.position.copy(cam.position);
    voidBox.updateMatrixWorld();
  };
  group.add(voidBox);

  // ── a warm light that follows a kid diving in the rift (so the kid, and whatever swims up,
  //    always reads). It lives in the scene itself, not the group, so showing or hiding the rift
  //    never changes the scene's light count (no shader recompiles); off (0) elsewhere. ──
  const kidLight = new THREE.PointLight("#ffd2a0", 0, 18, 1);
  kidLight.name = "abyss-kid-light";
  kidLight.castShadow = false;
  scene.add(kidLight);

  // ── marine snow (denser down here) ──
  const snowC = { value: new THREE.Vector3() };
  const snow = buildSnow(UW, low ? 500 : 1100, 30, snowC);
  track(snow.geometry);
  track(snow.material as THREE.Material);
  group.add(snow);

  // ── update ──
  const kidI: KidInfo = { x: 0, y: 0, z: 0, s: NaN, u: 0 };
  const kc = { s: 0, u: 0, rim: 0 };
  const result: { spot: { id: string; name: string; text: string } | null } = { spot: null };
  let lastFact: AbyssFact | null = null;
  const up = new THREE.Vector3(0, 1, 0);
  const bx = new THREE.Vector3();
  const by = new THREE.Vector3();
  const bz = new THREE.Vector3();
  const root = new THREE.Vector3();
  const octoQ = new THREE.Quaternion();
  const OCTO_COLS = ["#ff6a3a", "#d23a8a", "#7a4cff", "#2ab8c8", "#ffb02a", "#ff4f6a"].map((h) => new THREE.Color(h));
  const octoCol = new THREE.Color();
  let octoCycle = 0;
  let cullT = 0;
  const lastCull = new THREE.Vector3(1e9, 0, 0);
  const lp = new THREE.Vector3();
  const lightPos = (ci: number, l: Light, out: THREE.Vector3) => {
    const c = creatures[ci];
    const p = c.pose;
    const w = waveOf.get(c.sp);
    let lx = l.x;
    if (w) lx += Math.sin(c.ph - l.z * w.kp) * w.amp(l.z);
    let ly = l.y;
    if (c.sp === "anglerfish") {
      // (the lure bobs: K_BOB)
      ly += Math.sin(c.ph * 2) * 0.07;
      lx += Math.sin(c.ph) * 0.035;
    }
    e.set(p.pitch, p.yaw, p.roll, "YXZ");
    out.set(lx * p.scale, ly * p.scale, l.z * p.scale).applyEuler(e);
    out.x += p.x;
    out.y += p.y;
    out.z += p.z;
    return out;
  };

  return {
    update(dt, t, o) {
      result.spot = null;
      const kid = o.kid;
      const near = abyssDistance(kid.x, kid.z);
      const show = o.under && near < SHOW_R;
      group.visible = show;
      if (!show) {
        kidLight.intensity = 0;
        return result;
      }
      AU.uTime.value = t;
      UW.uTime.value = t;
      const depth = WATER_Y - kid.y;
      const deepK = Math.min(1, Math.max(0, (depth - 18) / 30));
      AU.uKid.value.set(kid.x, kid.y + 1.2, kid.z);
      AU.uLamp.value = deepK;
      kidLight.position.set(kid.x, kid.y + 2.2, kid.z);
      kidLight.intensity = deepK * 1.6;
      AU.uGlowK.value = 0.9 + deepK * 0.7 + o.glow * 0.3;
      UW.uGlow.value = Math.max(o.glow, deepK);
      UW.uGlowK.value = AU.uGlowK.value;
      snowC.value.set(kid.x, kid.y, kid.z);
      const fog = scene.fog as THREE.Fog | null;
      const fogFar = fog && fog.isFog ? fog.far : 60;
      // the void below: strongest over the rift itself
      AU.uVoid.value = 1 - Math.min(1, Math.max(0, (near - 8) / 50));
      voidBox.visible = AU.uVoid.value > 0.001 && !!fog && fog.isFog;
      uFogFar.value = fogFar;
      if (fog && fog.isFog) {
        voidFog.value.copy(fog.color);
        voidBox.scale.setScalar(fog.far * 0.985);
      }

      // where the kid is in the rift
      kidI.x = kid.x;
      kidI.y = kid.y;
      kidI.z = kid.z;
      const pr = abyssProject(kid.x, kid.z, kc);
      kidI.s = pr ? pr.s : NaN;
      kidI.u = pr ? pr.u : 0;

      // ── creatures ──
      const d = Math.min(0.1, dt);
      let best = Infinity;
      let bestFact: AbyssFact | null = null;
      let curLast = Infinity;
      for (let i = 0; i < creatures.length; i++) {
        const c = creatures[i];
        if (c.kind === "megalodon") {
          stepMegalodon(c, megSt, kidI, d, t);
          megPose(megSt, c.pose, d);
          c.pose.scale = c.scale;
        } else if (c.kind === "escort") stepEscort(c, t, d, kidI);
        else stepCreature(c, t, d);
        c.ph = (c.ph + d * c.phRate) % PH_WRAP;
        const p = c.pose;
        const dx = p.x - kid.x;
        const dy = p.y - kid.y;
        const dz = p.z - kid.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const R = c.radius * p.scale;
        const I = inst[i];
        const vis = dist - R * 1.6 < fogFar + 6;
        I.b.setVisibleAt(I.id, vis);
        if (I.dome >= 0) glass.b.setVisibleAt(I.dome, vis);
        if (vis) {
          e.set(p.pitch, p.yaw, p.roll, "YXZ");
          m4.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e), s3.setScalar(p.scale));
          I.b.setMatrixAt(I.id, m4);
          setColor(I.b, I.id, white, c.ph);
          if (I.dome >= 0) {
            glass.b.setMatrixAt(I.dome, m4);
            setColor(glass.b, I.dome, white, c.ph);
          }
        }
        // discovery: the nearest creature the kid has swum right up to
        const reach = dist - R;
        if (SPECIES_FACT[c.sp] === lastFact && reach < curLast) curLast = reach;
        if (reach < 5 + R * 0.5 && reach < best) {
          best = reach;
          bestFact = SPECIES_FACT[c.sp];
        }
      }

      // ── the giant octopus: arms reach out and wave at a kid who comes close; it changes colour ──
      {
        const c = creatures[octoIdx];
        const p = c.pose;
        const dist = Math.hypot(p.x - kid.x, p.y + 1 - kid.y, p.z - kid.z);
        const reach = octoReach(dist);
        const vis = dist < fogFar + 14;
        octoCycle += d * (0.05 + reach * 0.45);
        const ck = octoCycle % OCTO_COLS.length;
        const c0 = OCTO_COLS[Math.floor(ck)];
        const c1 = OCTO_COLS[(Math.floor(ck) + 1) % OCTO_COLS.length];
        octoCol.copy(c0).lerp(c1, Math.min(1, Math.max(0, (ck % 1) * 1.6 - 0.3)));
        setColor(life.b, inst[octoIdx].id, octoCol, c.ph);
        e.set(0, p.yaw, 0, "YXZ");
        octoQ.setFromEuler(e);
        for (let k = 0; k < 8; k++) {
          const id = armIds[k];
          life.b.setVisibleAt(id, vis);
          if (!vis) continue;
          const a = ((k + 0.5) / 8) * TAU;
          const sa = Math.sin(a);
          const ca = Math.cos(a);
          // root on the head's rim (local), rest direction: out and down (the back arms up the wall)
          root.set(sa * 0.95, 0.35, ca * 0.95 + 0.25).applyQuaternion(octoQ).add(v.set(p.x, p.y, p.z));
          const idle = Math.sin(t * 0.35 + k * 1.7) * 0.25;
          bz.set(Math.sin(a + idle), ca < -0.3 ? 0.45 : -0.28, Math.cos(a + idle) * (ca < -0.3 ? 0.55 : 1)).normalize().applyQuaternion(octoQ);
          // the two front arms reach towards the kid and wave
          const front = k === 0 || k === 7;
          if (front && reach > 0) {
            lp.set(kid.x - root.x, kid.y + 0.8 - root.y, kid.z - root.z).normalize();
            // (up and waving, like a big "hello!")
            lp.y += 0.45 + Math.sin(t * 2.2 + k * 1.3) * 0.5;
            lp.x += Math.cos(t * 1.7 + k) * 0.25;
            bz.lerp(lp.normalize(), reach * 0.85).normalize();
          } else if (reach > 0) {
            bz.y += Math.sin(t * 1.3 + k) * 0.15 * reach;
            bz.normalize();
          }
          bx.crossVectors(up, bz);
          if (bx.lengthSq() < 1e-6) bx.set(1, 0, 0);
          bx.normalize();
          by.crossVectors(bz, bx);
          m4.makeBasis(bx, by, bz);
          m4.scale(s3.setScalar(1));
          m4.setPosition(root);
          life.b.setMatrixAt(id, m4);
          setColor(life.b, id, octoCol, (c.ph * (1 + reach) + k * 0.8) % PH_WRAP);
        }
      }

      // ── props: cull by distance every so often ──
      cullT -= dt;
      if (cullT <= 0 || lastCull.distanceToSquared(kid) > 9) {
        cullT = 0.5;
        lastCull.copy(kid);
        for (let i = 0; i < propCull.length; i++) {
          const pc = propCull[i];
          const dd = Math.hypot(pc.x - kid.x, pc.y - kid.y, pc.z - kid.z) - pc.r;
          statics.b.setVisibleAt(pc.id, dd < fogFar * pc.far + 4);
        }
      }

      // ── glow sprites ──
      for (let i = 0; i < moving.length; i++) {
        const m = moving[i];
        const c = creatures[m.ci];
        lightPos(m.ci, m.l, lp);
        const vis = inst[m.ci] && Math.abs(lp.x - kid.x) + Math.abs(lp.z - kid.z) < fogFar * 1.5;
        const s = vis ? m.l.size * c.pose.scale * (0.85 + 0.15 * Math.sin(t * 3 + i)) : 0;
        glows.set(i, lp.x, lp.y, lp.z, m.l.color.r * 1.4, m.l.color.g * 1.4, m.l.color.b * 1.4, s);
      }
      // plankton flashes in a box round the kid (deep down only)
      const B = 36;
      for (let i = 0; i < nSpark; i++) {
        const j = i * 5;
        const x = kid.x - B / 2 + ((((spark[j] + t * 0.15 - kid.x) % B) + B) % B);
        const y = kid.y - B / 2 + ((((spark[j + 1] - t * 0.05 - kid.y) % B) + B) % B);
        const z = kid.z - B / 2 + ((((spark[j + 2] - kid.z) % B) + B) % B);
        const fl = Math.pow(Math.max(0, Math.sin(t * spark[j + 4] + spark[j + 3])), 10) * deepK;
        const cc = SPARK_COLS[i % 4];
        glows.set(sparkBase + i, x, Math.min(y, WATER_Y - 1), z, cc[0] * fl, cc[1] * fl, cc[2] * fl, fl > 0.01 ? 0.22 + fl * 0.25 : 0);
      }
      glows.commit();

      // ── discovery ──
      if (!bestFact) {
        for (let i = 0; i < PLACES.length; i++) {
          const pl = PLACES[i];
          const dd = Math.hypot(pl.x - kid.x, pl.y - kid.y, pl.z - kid.z) - pl.r;
          if (dd < 3 && dd < best) {
            best = dd;
            bestFact = pl.fact;
          }
        }
      }
      if (!bestFact && pr && Math.abs(pr.u) < pr.rim && depth > 14 && depth < 34) bestFact = RIFT_FACT;
      // (sticky: keep the last card while it's still nearly as close, so it doesn't flicker
      // between two animals drifting by)
      if (lastFact && bestFact !== lastFact && curLast < 6.5) bestFact = lastFact;
      lastFact = bestFact;
      result.spot = bestFact;
      return result;
    },
    dispose() {
      scene.remove(group, kidLight);
      kidLight.dispose();
      for (const dd of disposables) dd.dispose();
    },
  };
}

/** places with a discovery card */
const PLACES: { x: number; y: number; z: number; r: number; fact: AbyssFact }[] = [
  { x: VENT_FIELD.x, y: VENT_FIELD.y + 4, z: VENT_FIELD.z, r: 12, fact: FACTS.vents },
  { x: CHIMNEYS[1].x, y: CHIMNEYS[1].y + 1, z: CHIMNEYS[1].z, r: 4, fact: FACTS.tubeWorms },
  { x: WHALE_FALL.x, y: WHALE_FALL.y + 1, z: WHALE_FALL.z, r: 10, fact: FACTS.whaleFall },
  { x: GROTTO.x, y: GROTTO.y + 6, z: GROTTO.z, r: 9, fact: FACTS.arch },
  { x: BRIDGE.mid.x, y: BRIDGE.mid.y, z: BRIDGE.mid.z, r: BRIDGE.mid.r, fact: FACTS.bridge },
];

// ── integration helper: cut the rift out of the deep sandy floor patch ──

let maskTex: THREE.DataTexture | null = null;
/** 1 where the canyon mesh covers the floor (inside its strip, 1.5 m in from the edge), else 0 */
function abyssMask(): THREE.DataTexture {
  if (maskTex) return maskTex;
  const { minX, maxX, minZ, maxZ } = ABYSS_BOUNDS;
  const nx = 512;
  const nz = Math.ceil((nx * (maxZ - minZ)) / (maxX - minX));
  const data = new Uint8Array(nx * nz);
  const h: AbyssHit = { i: 0, a: 0, e: 0 };
  const G = ABYSS_GRID;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = minX + ((i + 0.5) / nx) * (maxX - minX);
      const z = minZ + ((j + 0.5) / nz) * (maxZ - minZ);
      const hit = abyssLocate(x, z, h);
      if (!hit) continue;
      const half = G.half[hit.i];
      const inside = Math.abs(hit.e) * half < half - 1.5 && hit.i > 0 && hit.i < G.rows - 2;
      data[j * nx + i] = inside ? 255 : 0;
    }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  maskTex = tex;
  return tex;
}

/**
 * Integration: patch a material that draws the open-ocean floor (the deep sandy floor patch, the
 * floor caustics) so it discards fragments over the rift — the canyon mesh draws the floor there.
 * Chains any existing onBeforeCompile; works with built-in materials and ShaderMaterials whose
 * shaders have `void main() {` (world xz from `modelMatrix * position`). Idempotent.
 */
export function cutAbyssFloor(mat: THREE.Material): THREE.Material {
  const m = mat as THREE.Material & { __abyssCut?: boolean };
  if (m.__abyssCut) return mat;
  m.__abyssCut = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  const { minX, maxX, minZ, maxZ } = ABYSS_BOUNDS;
  const uMask = { value: abyssMask() };
  const uBox = { value: new THREE.Vector4(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ)) };
  mat.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    shader.uniforms.uAbyssMask = uMask;
    shader.uniforms.uAbyssBox = uBox;
    shader.vertexShader = shader.vertexShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (s) => `varying vec2 vAbyssXZ;\n${s}\n  vAbyssXZ = ( modelMatrix * vec4( position, 1.0 ) ).xz;`);
    shader.fragmentShader = shader.fragmentShader.replace(
      /void\s+main\s*\(\s*\)\s*\{/,
      (s) => `varying vec2 vAbyssXZ; uniform sampler2D uAbyssMask; uniform vec4 uAbyssBox;\n${s}\n  {\n    vec2 abUv = ( vAbyssXZ - uAbyssBox.xy ) * uAbyssBox.zw;\n    if ( abUv.x > 0.0 && abUv.y > 0.0 && abUv.x < 1.0 && abUv.y < 1.0 && texture2D( uAbyssMask, abUv ).r > 0.5 ) discard;\n  }`,
    );
  };
  mat.customProgramCacheKey = function () {
    return prevKey.call(this) + "-abyss-cut";
  };
  mat.needsUpdate = true;
  return mat;
}
