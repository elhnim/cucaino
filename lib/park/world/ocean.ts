// The sea around Cucaino Park: a sandy beach ring and a boundless, shimmering ocean that glows
// with plankton at twilight — the water follows you to the horizon wherever you sail, swim or fly
// (and past WRAP_R the world wraps round like a little planet) — with sea life that roams it all:
// glowing jellyfish (some even drift through the air over the Glow Forest), gliding and hopping
// manta rays, leaping dolphin pods (one comes to leap past a kid out at sea every half-minute or
// so), shoals of flying fish bursting out of the waves, terns wheeling overhead and plunge-diving,
// and turtles, each on its own wandering heading (./sea/wander)
// and gathering round wherever you are. (The giant whales and orcas live with ./underwater.)
// All procedural and cheap: one mesh per creature kind, animated by matrices.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeSparkTexture } from "./atmosphere";
import { getToonRamp } from "../assets/loader";
import { COAST_GLSL, ISLAND_R, coastR, parkShoreA } from "../registry/island";
import { WATER_Y, groundY } from "../registry/terrain";
import { VILLAGE_CALM_GLSL } from "../registry/villageIsland";
import { FROST_CALM_GLSL } from "../registry/frostIsland";
import { DINO_CALM_GLSL } from "../registry/dinoIsland";
import { col, merge, mix, part } from "./fantasy/geo";
import { makeVisit, startVisit, stepVisit } from "./sea/visits";
import { makeUwUniforms, uwMaterial } from "./underwater/shaders";
import { dist2, follow, makeFocusTracker, makeSwimmer, respawn, seaDepth, swim, trackFocus, type Swimmer, type SwimStyle } from "./sea/wander";

export const BEACH_IN = ISLAND_R; // where grass meets the sand (plus the coast wobble)
export const SHORE_R = ISLAND_R + 14; // where the sand meets the water
/** the beach things and the sea life by the park start along the park's own shore */
const parkSeaA = parkShoreA;

/** bend a ring/disc geometry (lying in XY before rotation) so its edge follows the natural coastline */
export function wobbleToCoast(geo: THREE.BufferGeometry, minR = 0) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y);
    if (r <= minR + 0.01) continue;
    // after rotation.x = -PI/2, local (x, y) maps to world (x, -z)
    const a = Math.atan2(x, -y);
    const k = coastR(a) / ISLAND_R;
    pos.setXY(i, x * k, y * k);
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

export interface Ocean {
  /** `focus` = the kid / camera focus: the sea and its roaming life follow it (default: the origin) */
  update(dt: number, t: number, glow: number, fog: THREE.Fog, focus?: THREE.Vector3): void;
  dispose(): void;
}

// ── true size ── (the Park kid is 2.26 units = a real ~1.4 m ten-year-old: 1 m = 1.6 units)
//   bottlenose dolphin ~2.5 m (model 3.42 long)   sea turtle ~1.4 m nose to tail (model 2.58)
//   jellyfish bell 0.4–1.6 m (model bell 2 across)  starfish ~0.25 m (model 1.1 across)
//   crested tern ~0.45 m (model 0.67 long)         giant manta ~6 m wingspan (model 3.2: x3, already true)
//   flying fish ~0.4 m (model 0.74 at 0.9: already true)
//   (the jellies drifting through the air over the Glow Forest are fairy-tale: storybook size)
export const OCEAN_K = { dolphin: (1.6 * 2.5) / 3.42, turtle: (1.6 * 1.4) / 2.58, starfish: (1.6 * 0.25) / 1.1, tern: (1.6 * 0.45) / 0.67, manta: 3 } as const;

export function buildOcean(scene: THREE.Scene, opts: { skyJellies: { x: number; z: number; radius: number }; lowQuality?: boolean }): Ocean {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const ramp = getToonRamp();
  const toon = (color: string, extra: THREE.MeshToonMaterialParameters = {}) => track(new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra }));
  const low = !!opts.lowQuality;
  const added: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T) => (scene.add(o), added.push(o), o);

  // ── beach ──

  // shells and starfish dotted on the sand
  const shellGeo = track(new THREE.SphereGeometry(0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  const shells = add(new THREE.InstancedMesh(shellGeo, toon("#ffffff"), 70));
  const starGeo = track(starfishGeometry());
  const stars = add(new THREE.InstancedMesh(starGeo, toon("#ffffff"), 40));
  const shellCols = ["#ffc2d9", "#fff0c2", "#c9e8ff", "#e6d0ff"];
  const starCols = ["#ff7a8a", "#ffae5e", "#ff6fcf"];
  const mm = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let seed = 77;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const a = parkSeaA(rnd());
    const rad = coastR(a) + 2 + rnd() * (SHORE_R - BEACH_IN - 1);
    mm.compose(new THREE.Vector3(Math.sin(a) * rad, groundY(Math.sin(a) * rad, Math.cos(a) * rad) + 0.02, Math.cos(a) * rad), qq.setFromAxisAngle(up, rnd() * 6), new THREE.Vector3(1, 0.5, 1.3).multiplyScalar(0.6 + rnd() * 0.8));
    shells.setMatrixAt(i, mm);
    shells.setColorAt(i, new THREE.Color(shellCols[i % shellCols.length]));
  }
  for (let i = 0; i < 40; i++) {
    const a = parkSeaA(rnd());
    const rad = coastR(a) + 3 + rnd() * (SHORE_R - BEACH_IN - 2);
    mm.compose(new THREE.Vector3(Math.sin(a) * rad, groundY(Math.sin(a) * rad, Math.cos(a) * rad) + 0.05, Math.cos(a) * rad), qq.setFromAxisAngle(up, rnd() * 6), new THREE.Vector3(1, 1, 1).multiplyScalar(OCEAN_K.starfish * (0.7 + rnd() * 0.6)));
    stars.setMatrixAt(i, mm);
    stars.setColorAt(i, new THREE.Color(starCols[i % starCols.length]));
  }

  // ── the ocean: a boundless sea. One big disc of water follows the player (snapped, and every
  //    wave, colour and sparkle is computed from world position, so moving it is invisible) out to
  //    past the fog, wherever you sail, swim or fly. Turquoise shallows -> deep blue, foam at the
  //    shore, whitecaps and glints out at sea, the sky mirrored at grazing angles, glowing plankton
  //    at twilight. ──
  const WAVES = /* glsl */ `
    // a few long swells from different directions (world space: the same wherever the mesh is)
    float seaWave( vec2 p, float t ) {
      return sin( p.x * 0.08 + t * 0.9 ) * 0.35 + sin( p.y * 0.11 - t * 1.1 ) * 0.28 + sin( ( p.x + p.y ) * 0.05 + t * 0.6 ) * 0.4
           + sin( dot( p, vec2( 0.13, -0.21 ) ) + t * 1.45 ) * 0.12;
    }`;
  const waterMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      // one-sided: from under the sea the underwater kit draws the surface's rippling underside
      uniforms: {
        uTime: { value: 0 },
        uGlow: { value: 0 },
        uShore: { value: SHORE_R },
        uFogColor: { value: new THREE.Color() },
        uFogNear: { value: 150 },
        uFogFar: { value: 430 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vR; varying vec2 vXZ; varying float vWave; varying float vDist; varying vec3 vN; varying vec3 vW;
        ${WAVES}
        ${VILLAGE_CALM_GLSL}
        ${FROST_CALM_GLSL}
        ${DINO_CALM_GLSL}
        ${COAST_GLSL}
        void main() {
          vec4 w = modelMatrix * vec4( position, 1.0 );
          float r = length( w.xz );
          float sd = islandSeaDist( w.xz );
          // (calm over Coralcove's reef too, so its waterline stays put on the beach)
          float shoreDamp = smoothstep( ${(SHORE_R - ISLAND_R).toFixed(1)}, ${(SHORE_R - ISLAND_R + 25).toFixed(1)}, sd ) * villageCalm( w.xz ) * frostCalm( w.xz ) * dinoCalm( w.xz );
          float wave = seaWave( w.xz, uTime );
          // slope of the swell (for the sky reflection)
          float e = 1.5;
          float wx = seaWave( w.xz + vec2( e, 0.0 ), uTime ) - wave;
          float wz = seaWave( w.xz + vec2( 0.0, e ), uTime ) - wave;
          vN = normalize( vec3( -wx / e * shoreDamp, 1.0, -wz / e * shoreDamp ) );
          w.y += wave * shoreDamp - 0.25;
          vWave = wave; vR = r; vXZ = w.xz; vW = w.xyz;
          vec4 mv = viewMatrix * w;
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uGlow; uniform float uShore; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
        ${COAST_GLSL}
        varying float vR; varying vec2 vXZ; varying float vWave; varying float vDist; varying vec3 vN; varying vec3 vW;
        float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float vnoise( vec2 p ) {
          vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
        }
        void main() {
          // (under the island: the terrain and the beach own that)
          // (vRs: how far out from the coast, as if round the old little island — so the shore
          // colours, foam and shallows follow the real coast everywhere)
          float vRs = islandSeaDist( vXZ ) + ${ISLAND_R.toFixed(1)};
          if ( vRs < ${(SHORE_R - 6).toFixed(1)} ) discard;
          float shore = uShore;
          float depth = smoothstep( shore, shore + 90.0, vRs );
          // (linear colours: the output pass brightens them into sRGB)
          vec3 shallow = mix( vec3( 0.05, 0.52, 0.55 ), vec3( 0.04, 0.2, 0.4 ), uGlow );
          vec3 deep = mix( vec3( 0.07, 0.3, 0.78 ), vec3( 0.03, 0.05, 0.24 ), uGlow );
          // the open sea isn't one flat blue: broad patches of teal and indigo drift over it
          float big = vnoise( vXZ * 0.006 + vec2( uTime * 0.004, 0.0 ) ) * 0.6 + vnoise( vXZ * 0.021 - vec2( 0.0, uTime * 0.006 ) ) * 0.4;
          deep = mix( deep * vec3( 0.86, 0.92, 1.06 ), deep * vec3( 1.02, 1.12, 0.95 ) + vec3( 0.0, 0.02, 0.0 ), smoothstep( 0.3, 0.7, big ) );
          vec3 col = mix( shallow, deep, depth );
          // the swell: crests a touch lighter, troughs deeper
          col *= 0.93 + 0.1 * smoothstep( -0.9, 0.9, vWave );
          // fine ripples: they tilt the surface normal (faded where they'd be smaller than a pixel)
          float fw = length( fwidth( vXZ ) );
          float ripK = 1.0 - smoothstep( 0.3, 1.4, fw );
          vec2 r1 = vec2( 0.9, 0.4 ) * 1.1; vec2 r2 = vec2( -0.35, 0.8 ) * 1.6; vec2 r3 = vec2( 0.55, -0.7 ) * 2.9; vec2 r4 = vec2( -0.8, -0.45 ) * 5.3;
          float a1 = dot( vXZ, r1 ) + uTime * 1.7 + vnoise( vXZ * 0.3 ) * 4.0;
          float a2 = dot( vXZ, r2 ) - uTime * 1.3;
          float a3 = dot( vXZ, r3 ) + uTime * 2.3 + vnoise( vXZ * 0.9 ) * 3.0;
          float a4 = dot( vXZ, r4 ) - uTime * 3.1;
          float ripK2 = 1.0 - smoothstep( 0.1, 0.5, fw );
          vec2 slope = ( r1 * cos( a1 ) * 0.07 + r2 * cos( a2 ) * 0.05 + r3 * cos( a3 ) * 0.03 ) * ripK + r4 * cos( a4 ) * 0.016 * ripK2;
          vec3 N = normalize( vN + vec3( -slope.x, 0.0, -slope.y ) );
          col *= 1.0 + ( sin( a1 ) * 0.03 + sin( a2 ) * 0.02 ) * ripK;
          // the sky mirrored at grazing angles, and the sun's glitter path
          vec3 V = normalize( cameraPosition - vW );
          float fres = pow( 1.0 - max( 0.0, dot( N, V ) ), 5.0 );
          col = mix( col, uFogColor * mix( 1.0, 0.75, uGlow ), fres * 0.3 );
          vec3 Rv = reflect( -V, N );
          float sun = pow( max( 0.0, dot( Rv, normalize( vec3( -0.4, 0.55, -0.75 ) ) ) ), 260.0 );
          col += vec3( 1.0, 0.95, 0.85 ) * sun * 1.3 * ( 1.0 - uGlow ) * ( 1.0 - smoothstep( 180.0, 420.0, vDist ) );
          // (at twilight the moon lays a cool path instead)
          float moon = pow( max( 0.0, dot( Rv, normalize( vec3( 0.42, 0.3, -0.85 ) ) ) ), 120.0 );
          col += vec3( 0.6, 0.65, 1.0 ) * moon * 0.6 * uGlow;
          // sparkles on the wave tops (sun glints by day, starlight by night)
          vec2 q = vXZ * 0.9;
          vec2 cell = floor( q );
          float g = hash( cell + floor( uTime * 1.5 ) );
          float dotG = 1.0 - smoothstep( 0.08, 0.22, length( fract( q ) - 0.5 ) );
          float glintK = 1.0 - smoothstep( 0.6, 1.6, fw );
          col += step( 0.97, g ) * dotG * smoothstep( 0.1, 0.7, vWave ) * vec3( 1.0 ) * 0.7 * glintK;
          // whitecaps out at sea: little white flecks riding the crests, forming and fading
          vec2 wq = vXZ * 0.22 + vec2( uTime * 0.12, uTime * 0.05 );
          vec2 wc = floor( wq );
          float wh = hash( wc * 1.7 + floor( uTime * 0.25 + hash( wc ) ) );
          float wshape = 1.0 - smoothstep( 0.1, 0.34, length( ( fract( wq ) - 0.5 ) * vec2( 1.0, 2.2 ) ) );
          float cap = step( 0.93, wh ) * wshape * smoothstep( 0.35, 0.95, vWave ) * depth * ( 1.0 - smoothstep( 1.0, 3.0, fw ) );
          col = mix( col, vec3( 0.96, 0.99, 1.0 ) * mix( 1.0, 0.45, uGlow ), cap * 0.8 );
          // foam lapping at the shore
          float foam = smoothstep( shore + 3.5 + sin( uTime * 1.3 + vXZ.x * 0.2 ) * 1.2, shore, vRs );
          col = mix( col, vec3( 1.0, 0.98, 0.96 ), foam * 0.85 );
          // glowing plankton near the shore and on crests at twilight
          vec2 pq = vXZ * 1.6;
          float pk = step( 0.9, hash( floor( pq ) + floor( uTime * 0.5 ) ) ) * ( 1.0 - smoothstep( 0.05, 0.3, length( fract( pq ) - 0.5 ) ) );
          float near = 1.0 - smoothstep( shore + 2.0, shore + 45.0, vRs );
          col += uGlow * pk * ( 0.4 + near ) * vec3( 0.3, 1.0, 0.95 ) * 0.7 * glintK;
          float fog = smoothstep( uFogNear, uFogFar, vDist );
          col = mix( col, uFogColor, fog );
          // clear lagoon water near the beach (you can see the sand and the reef below); out at sea you
          // can see a little way down close by (a whale rising under you), but it's deep blue beyond
          float clear = 1.0 - smoothstep( shore + 2.0, shore + 34.0, vRs );
          // (only looking steeply down: at grazing angles the view would run past the deep floor)
          float seeDown = mix( 0.6, 1.0, max( 1.0 - smoothstep( 0.25, 0.55, V.y ), smoothstep( 60.0, 110.0, vDist ) ) );
          float open = smoothstep( shore + 44.0, shore + 62.0, vRs );
          gl_FragColor = vec4( col, mix( mix( 0.95, seeDown, open ), 0.82, clear ) + foam * 0.3 + cap * 0.1 );
        }`,
    }),
  );
  const water = add(new THREE.Mesh(track(seaDisc(SEA_R, low ? 40 : 60, low ? 96 : 144)), waterMat));
  water.name = "sea-surface";
  water.frustumCulled = false;
  const snap = 8;

  // who's around the player, and big jumps (the world wrap) the roaming sea life follows
  const ft = makeFocusTracker();
  const origin = new THREE.Vector3();

  // ── glowing jellyfish (drifting in the sea near you, and through the air above the Glow Forest) ──
  const bellGeo = track(jellyBellGeometry());
  const tentGeo = track(jellyTentacleGeometry());
  const jellyMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false }));
  const tentMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false }));
  const nSea = low ? 14 : 26;
  const nSky = low ? 6 : 12;
  const nJ = nSea + nSky;
  const bells = add(new THREE.InstancedMesh(bellGeo, jellyMat, nJ));
  const tents = add(new THREE.InstancedMesh(tentGeo, tentMat, nJ));
  bells.frustumCulled = tents.frustumCulled = false;
  const jellyCols = ["#7af7ff", "#ff8ae6", "#b99bff", "#9dffc9", "#ffd07a"];
  const JELLY: SwimStyle = { speed: [0.1, 0.32], turn: 0.1, wander: 0.03, depth: [0.3, 0.6], clear: 1, need: 2, look: 3, climb: 0.2, bank: 0 };
  const jellies: { x: number; y: number; z: number; s: number; ph: number; sky: boolean; drift: number; sw: Swimmer }[] = [];
  for (let i = 0; i < nJ; i++) {
    const sky = i >= nSea;
    const a = sky ? rnd() * Math.PI * 2 : parkSeaA(rnd());
    const rad = sky ? Math.sqrt(rnd()) * opts.skyJellies.radius : SHORE_R + 8 + rnd() * 70;
    const x = (sky ? opts.skyJellies.x : 0) + Math.sin(a) * rad;
    const z = (sky ? opts.skyJellies.z : 0) + Math.cos(a) * rad;
    jellies.push({ x, y: sky ? 6 + rnd() * 7 : -0.55 - rnd() * 0.5, z, s: sky ? 0.8 + rnd() * 0.7 : 0.3 + rnd() * 0.7, ph: rnd() * 10, sky, drift: 0.2 + rnd() * 0.3, sw: makeSwimmer(x, 0, z, rnd() * 6.28, 40 + i, 0.2) });
    const c = new THREE.Color(jellyCols[i % jellyCols.length]);
    bells.setColorAt(i, c);
    tents.setColorAt(i, c);
  }
  const jellyHaloGeo = track(new THREE.BufferGeometry());
  const jhp = new Float32Array(nJ * 3);
  const jhc = new Float32Array(nJ * 3);
  jellies.forEach((_, i) => {
    const c = new THREE.Color(jellyCols[i % jellyCols.length]);
    jhc.set([c.r, c.g, c.b], i * 3);
  });
  jellyHaloGeo.setAttribute("position", new THREE.BufferAttribute(jhp, 3));
  jellyHaloGeo.setAttribute("color", new THREE.BufferAttribute(jhc, 3));
  const spark = track(makeSparkTexture());
  const haloMat = track(new THREE.PointsMaterial({ map: spark, size: 7, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  const jellyHalos = add(new THREE.Points(jellyHaloGeo, haloMat));
  jellyHalos.frustumCulled = false;

  // (the giant whales live with the underwater world: ./underwater + ./sea/whales)

  // splash particles (leaping dolphins)
  const splashN = 120;
  const sp = new Float32Array(splashN * 3);
  const sv = new Float32Array(splashN * 3);
  const sl = new Float32Array(splashN);
  const splashGeo = track(new THREE.BufferGeometry());
  splashGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const splashMat = track(new THREE.PointsMaterial({ map: spark, size: 2.4, color: "#e8fbff", transparent: true, depthWrite: false, opacity: 0.9 }));
  const splash = add(new THREE.Points(splashGeo, splashMat));
  splash.frustumCulled = false;
  let splashNext = 0;
  const emit = (x: number, y: number, z: number, n: number, up = 9, spread = 4) => {
    for (let k = 0; k < n; k++) {
      const i = splashNext++ % splashN;
      sp[i * 3] = x;
      sp[i * 3 + 1] = y;
      sp[i * 3 + 2] = z;
      sv[i * 3] = (rnd() - 0.5) * spread;
      sv[i * 3 + 1] = up * (0.6 + rnd() * 0.6);
      sv[i * 3 + 2] = (rnd() - 0.5) * spread;
      sl[i] = 1.2 + rnd() * 0.6;
    }
  };

  // ── manta rays gliding and hopping, dolphin pods leaping, turtles paddling — all roaming ──
  const mantaGeo = track(mantaGeometry());
  const mantas = add(new THREE.InstancedMesh(mantaGeo, toon("#6a5ab8"), low ? 3 : 6));
  mantas.frustumCulled = false;
  const MANTA: SwimStyle = { speed: [2, 3.2], turn: 0.25, wander: 0.05, depth: [0.3, 0.6], clear: 1.5, need: 4, look: 20, climb: 0.5, bank: 1.2 };
  const mantaState = Array.from({ length: mantas.count }, (_, i) => {
    const a = parkSeaA(rnd());
    const r = SHORE_R + 24 + rnd() * 70;
    return { sw: makeSwimmer(Math.sin(a) * r, 0, Math.cos(a) * r, a + (i % 2 ? 1 : -1) * Math.PI / 2, 60 + i, 2.5), ph: rnd() * 10 };
  });
  const dolphinGeo = track(dolphinGeometry());
  const dolphins = add(new THREE.InstancedMesh(dolphinGeo, toon("#8fb6e8"), low ? 4 : 8));
  dolphins.frustumCulled = false;
  const DOLPHIN: SwimStyle = { speed: [5, 7.5], turn: 0.3, wander: 0.05, depth: [1, 1.4], clear: 1.5, need: 5, look: 26, climb: 1, bank: 1.5 };
  const perPod = dolphins.count / 2;
  const pods = [0, 1].map((p) => {
    const a = p === 0 ? -0.5 : -1.7;
    const r = SHORE_R + 32 + p * 16;
    const lead = makeSwimmer(Math.sin(a) * r, -1.2, Math.cos(a) * r, a + (p ? -1 : 1) * Math.PI / 2, 80 + p * 10, 6);
    const members = Array.from({ length: perPod }, (_, k) => (k === 0 ? lead : makeSwimmer(lead.x - Math.sin(lead.yaw) * 3.6 * k, -1.2, lead.z - Math.cos(lead.yaw) * 3.6 * k, lead.yaw, 81 + p * 10 + k, 6)));
    return { lead, members };
  });
  const turtleGeo = track(turtleGeometry());
  const turtles = add(new THREE.InstancedMesh(turtleGeo, toon("#5fbf7f"), low ? 3 : 6));
  turtles.frustumCulled = false;
  const TURTLE: SwimStyle = { speed: [0.5, 0.9], turn: 0.25, wander: 0.05, depth: [0.3, 0.6], clear: 1, need: 2.5, look: 8, climb: 0.3, bank: 0.6 };
  const turtleState = Array.from({ length: turtles.count }, (_, i) => {
    const a = parkSeaA(rnd());
    const r = SHORE_R + 12 + rnd() * 40;
    return { sw: makeSwimmer(Math.sin(a) * r, 0, Math.cos(a) * r, a + (rnd() < 0.5 ? -1 : 1) * Math.PI / 2, 100 + i, 0.7), ph: rnd() * 10 };
  });

  // ── dolphins come to play: every 25-40 s a pod heads for a kid swimming or sailing out at sea
  //    and leaps past close by ──
  const DOLPHIN_V: SwimStyle = { ...DOLPHIN, need: 3.5, look: 14 };
  const dolphinVisit = makeVisit(10);

  // ── flying fish: little shoals burst out of the waves near you and glide over them ──
  const nFly = low ? 6 : 12;
  const flyers = add(new THREE.InstancedMesh(track(flyingFishGeometry()), toon("#ffffff", { vertexColors: true, side: THREE.DoubleSide }), nFly));
  flyers.frustumCulled = false;
  const fly = Array.from({ length: nFly }, () => ({ on: false, t: 0, T: 2, x: 0, z: 0, vx: 0, vz: 0, h: 1 }));
  let flyWait = 3;

  // ── seabirds: terns wheeling over the open sea round you, now and then plunge-diving for fish ──
  const nBird = low ? 3 : 6;
  const birdU = makeUwUniforms();
  const birdGeo = track(seabirdGeometry());
  birdGeo.setAttribute("aInst", new THREE.InstancedBufferAttribute(new Float32Array(nBird * 2), 2));
  const birds = add(new THREE.InstancedMesh(birdGeo, track(uwMaterial(birdU, { motion: "flap", inst: true, sea: false, flapSpeed: 0, flapWave: 1.1 }, { side: THREE.DoubleSide, roughness: 0.75 })), nBird));
  birds.frustumCulled = false;
  const birdA = birdGeo.attributes.aInst as THREE.InstancedBufferAttribute;
  const bird = Array.from({ length: nBird }, () => ({ a: rnd() * 6.28, rad: 11 + rnd() * 10, h: 5 + rnd() * 4, w: (rnd() < 0.5 ? -1 : 1) * (0.28 + rnd() * 0.15), phase: rnd() * 6, flapT: rnd() * 5, dive: -1, sx: 0, sy: 0, sz: 0, tx: 0, tz: 0 }));
  let diveWait = 7;
  const birdC = new THREE.Vector3();
  let birdStarted = false;
  let atSeaK = 0;

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const dayJelly = new THREE.Color("#ffffff");
  const jump = (s: { x: number; z: number }) => {
    s.x += ft.jx;
    s.z += ft.jz;
  };

  return {
    update(dtIn, t, glow, fog, focusIn) {
      const dt = Math.min(0.1, Math.max(0, dtIn));
      const focus = focusIn ?? origin;
      waterMat.uniforms.uTime.value = t;
      waterMat.uniforms.uGlow.value = glow;
      waterMat.uniforms.uFogColor.value.copy(fog.color);
      waterMat.uniforms.uFogNear.value = fog.near;
      waterMat.uniforms.uFogFar.value = fog.far;
      // the sea follows the player (snapped so the vertices don't swim). (No planet-curvature drop:
      // any visible curve would lower the lagoon under the beach and float far-off whales.)
      water.position.set(Math.round(focus.x / snap) * snap, 0, Math.round(focus.z / snap) * snap);
      if (trackFocus(ft, focus.x, focus.z, dt)) {
        for (const j of jellies) if (!j.sky) jump(j.sw);
        for (const m of mantaState) jump(m.sw);
        for (const p of pods) for (const m of p.members) jump(m);
        for (const s of turtleState) jump(s.sw);
      }

      // jellies: pulse (squash/stretch), bob, drift (the sea ones roam round you)
      for (let i = 0; i < nJ; i++) {
        const j = jellies[i];
        const pulse = Math.sin(t * 2.2 + j.ph);
        const sy = j.s * (1 + pulse * 0.14);
        const sxz = j.s * (1 - pulse * 0.09);
        let x: number;
        let z: number;
        if (j.sky) {
          x = j.x + Math.sin(t * 0.1 * j.drift + j.ph) * 3;
          z = j.z + Math.cos(t * 0.08 * j.drift + j.ph) * 3;
        } else {
          if (dist2(j.sw, focus) > 230 * 230) respawn(j.sw, JELLY, focus, 0, 0, rnd, 70, 210);
          swim(j.sw, JELLY, dt, t);
          x = j.sw.x;
          z = j.sw.z;
        }
        const y = j.y + Math.sin(t * 0.8 + j.ph) * (j.sky ? 0.9 : 0.25) + Math.max(0, pulse) * 0.2;
        tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(Math.sin(t * 0.7 + j.ph) * 0.12, 0, Math.cos(t * 0.6 + j.ph) * 0.12)), tmpS.set(sxz, sy, sxz));
        bells.setMatrixAt(i, tmpM);
        tmpM.compose(tmpV, tmpQ, tmpS.set(sxz, j.s * (1 - pulse * 0.1), sxz));
        tents.setMatrixAt(i, tmpM);
        jhp[i * 3] = x;
        jhp[i * 3 + 1] = y + 0.5 * j.s;
        jhp[i * 3 + 2] = z;
      }
      bells.instanceMatrix.needsUpdate = true;
      tents.instanceMatrix.needsUpdate = true;
      jellyHaloGeo.attributes.position.needsUpdate = true;
      jellyMat.color.copy(dayJelly).multiplyScalar(0.85 + glow * 0.9);
      jellyMat.opacity = 0.62 + glow * 0.3;
      haloMat.opacity = 0.15 + glow * 0.75;
      haloMat.size = 6 + glow * 6;

      // splash particles
      for (let i = 0; i < splashN; i++) {
        if (sl[i] <= 0) {
          sp[i * 3 + 1] = -50;
          continue;
        }
        sl[i] -= dt;
        sv[i * 3 + 1] -= 14 * dt;
        sp[i * 3] += sv[i * 3] * dt;
        sp[i * 3 + 1] += sv[i * 3 + 1] * dt;
        sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
      }
      splashGeo.attributes.position.needsUpdate = true;

      // mantas glide and bank on their own headings, flapping, with a joyful hop now and then
      for (let i = 0; i < mantaState.length; i++) {
        const m = mantaState[i];
        if (dist2(m.sw, focus) > 260 * 260) respawn(m.sw, MANTA, focus, ft.vx, ft.vz, rnd, 150, 230, 1.3);
        swim(m.sw, MANTA, dt, t, focus, 4);
        const hop = Math.max(0, Math.sin(t * 0.35 + m.ph) - 0.93) * 60;
        const flap = Math.sin(t * 3 + m.ph) * 0.15;
        tmpM.compose(tmpV.set(m.sw.x, 0.2 + hop, m.sw.z), tmpQ.setFromEuler(tmpE.set(-hop * 0.08, m.sw.yaw, m.sw.roll * 0.6 + flap, "YXZ")), tmpS.set(OCEAN_K.manta, OCEAN_K.manta * (1 + flap), OCEAN_K.manta));
        mantas.setMatrixAt(i, tmpM);
      }
      mantas.instanceMatrix.needsUpdate = true;

      // dolphin pods roam the sea: each dolphin arcs out of the water one after another (and every
      // so often the first pod comes to leap past a kid out at sea)
      const deepHere = seaDepth(focus.x, focus.z);
      atSeaK += ((deepHere > 3 ? 1 : 0) - atSeaK) * Math.min(1, dt * 0.6);
      dolphinVisit.wait -= dt;
      if (!dolphinVisit.on && dolphinVisit.wait <= 0) {
        dolphinVisit.wait = 25 + rnd() * 15;
        const lead = pods[0].lead;
        if (deepHere > 3 && dist2(lead, focus) > 60 * 60) {
          startVisit(lead, DOLPHIN_V, dolphinVisit, focus, ft.vx, ft.vz, rnd, 60, 75, 7 + rnd() * 8, -1.2);
          pods[0].members.forEach((m, k) => k > 0 && Object.assign(m, { x: lead.x - Math.sin(lead.yaw) * 3.6 * k, z: lead.z - Math.cos(lead.yaw) * 3.6 * k, yaw: lead.yaw, speed: lead.speed }));
        }
      }
      let di = 0;
      for (const p of pods) {
        if (p === pods[0] && dolphinVisit.on) {
          const d = stepVisit(p.lead, DOLPHIN_V, dolphinVisit, focus, dt, t);
          if ((dolphinVisit.passed && d > 90) || dolphinVisit.t > 60) dolphinVisit.on = false;
        } else {
          if (dist2(p.lead, focus) > 260 * 260) respawn(p.lead, DOLPHIN, focus, ft.vx, ft.vz, rnd, 150, 230, 1.3);
          swim(p.lead, DOLPHIN, dt, t, focus, 5);
        }
        for (let k = 0; k < p.members.length; k++, di++) {
          const d = p.members[k];
          if (k > 0) follow(d, DOLPHIN, p.lead, (k % 2 ? 1 : -1) * (1.8 + k * 0.9), k * 3.6, dt, t);
          const phase = (t * 0.55 + k * 0.23) % 1;
          const jumpK = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) : 0;
          const y = -1.2 + jumpK * 4.5;
          const pitch = phase < 0.35 ? Math.cos((phase / 0.35) * Math.PI) * 0.9 : 0;
          if (phase < 0.35 && ((t * 0.55 + k * 0.23 - dt * 0.55) % 1) > phase + 0.5) emit(d.x, 0.3, d.z, 6, 5, 2);
          tmpM.compose(tmpV.set(d.x, y, d.z), tmpQ.setFromEuler(tmpE.set(-pitch, d.yaw, d.roll * 0.5, "YXZ")), tmpS.setScalar(OCEAN_K.dolphin));
          dolphins.setMatrixAt(di, tmpM);
        }
      }
      dolphins.instanceMatrix.needsUpdate = true;

      // flying fish: a little shoal bursts out ahead of you, glides a few seconds, splashes back
      flyWait -= dt;
      if (flyWait <= 0) {
        flyWait = 6 + rnd() * 7;
        if (deepHere > 4 && atSeaK > 0.5) {
          const moving = ft.vx * ft.vx + ft.vz * ft.vz > 0.5;
          const base = moving ? Math.atan2(ft.vx, ft.vz) + (rnd() - 0.5) * 1.4 : rnd() * 6.28;
          const r0 = 16 + rnd() * 20;
          const bx = focus.x + Math.sin(base) * r0;
          const bz = focus.z + Math.cos(base) * r0;
          const head = base + (rnd() < 0.5 ? -1 : 1) * (1.1 + rnd() * 0.6);
          let n = 3 + Math.floor(rnd() * 4);
          for (const f of fly) {
            if (f.on || n <= 0 || seaDepth(bx, bz) < 3) continue;
            n--;
            const sp = 9 + rnd() * 4;
            const hh = head + (rnd() - 0.5) * 0.3;
            Object.assign(f, { on: true, t: 0, T: 1.8 + rnd() * 1.6, x: bx + (rnd() - 0.5) * 5, z: bz + (rnd() - 0.5) * 5, vx: Math.sin(hh) * sp, vz: Math.cos(hh) * sp, h: 0.8 + rnd() * 1 });
            emit(f.x, 0.1, f.z, 3, 3, 1.5);
          }
        }
      }
      for (let i = 0; i < nFly; i++) {
        const f = fly[i];
        if (!f.on) {
          tmpM.makeScale(0, 0, 0);
          flyers.setMatrixAt(i, tmpM);
          continue;
        }
        f.t += dt;
        const u = f.t / f.T;
        f.x += f.vx * dt;
        f.z += f.vz * dt;
        if (u >= 1) {
          f.on = false;
          emit(f.x, 0.1, f.z, 4, 3, 1.5);
        }
        const y = WATER_Y + 0.25 + Math.sin(Math.PI * Math.min(1, u)) * f.h;
        tmpM.compose(tmpV.set(f.x, y, f.z), tmpQ.setFromEuler(tmpE.set(-Math.cos(Math.PI * Math.min(1, u)) * 0.22, Math.atan2(f.vx, f.vz), Math.sin(t * 3 + i) * 0.12, "YXZ")), tmpS.setScalar(0.9));
        flyers.setMatrixAt(i, tmpM);
      }
      flyers.instanceMatrix.needsUpdate = true;

      // seabirds wheel round (a little behind) the kid while they're out at sea; one plunge-dives now and then
      birdU.uTime.value = t;
      birdU.uGlow.value = glow;
      if (!birdStarted) (birdC.copy(focus), (birdStarted = true));
      birdC.lerp(focus, Math.min(1, dt * 0.5));
      diveWait -= dt;
      if (diveWait <= 0) {
        diveWait = 9 + rnd() * 10;
        const b = bird[Math.floor(rnd() * nBird)];
        if (b.dive < 0 && atSeaK > 0.8) {
          b.dive = 0;
          b.sx = birdC.x + Math.sin(b.a) * b.rad;
          b.sz = birdC.z + Math.cos(b.a) * b.rad;
          b.sy = WATER_Y + b.h;
          const a2 = rnd() * 6.28;
          b.tx = focus.x + Math.sin(a2) * (6 + rnd() * 8);
          b.tz = focus.z + Math.cos(a2) * (6 + rnd() * 8);
        }
      }
      for (let i = 0; i < nBird; i++) {
        const b = bird[i];
        let x: number;
        let y: number;
        let z: number;
        let yaw: number;
        let pitch = 0;
        let roll: number;
        let flap: number;
        const cx = birdC.x + Math.sin(b.a) * b.rad;
        const cz = birdC.z + Math.cos(b.a) * b.rad;
        b.a += b.w * dt;
        if (b.dive >= 0) {
          b.dive += dt;
          const d = b.dive;
          if (d < 1.1) {
            // fold the wings and plunge
            const k = (d / 1.1) ** 2;
            x = b.sx + (b.tx - b.sx) * k;
            y = b.sy + (WATER_Y - b.sy) * k;
            z = b.sz + (b.tz - b.sz) * k;
            yaw = Math.atan2(b.tx - b.sx, b.tz - b.sz);
            pitch = 1.1;
            roll = 0;
            flap = 0;
          } else if (d < 1.7) {
            if (d - dt < 1.1) emit(b.tx, 0.1, b.tz, 10, 6, 2.5);
            x = b.tx;
            y = WATER_Y - 3; // under (hidden by the scale below)
            z = b.tz;
            yaw = 0;
            roll = 0;
            flap = 0;
          } else {
            // flap hard back up to the flock
            const k = Math.min(1, (d - 1.7) / 2.6);
            const e = 1 - (1 - k) * (1 - k);
            x = b.tx + (cx - b.tx) * e;
            y = WATER_Y + 0.2 + (b.h - 0.2) * e;
            z = b.tz + (cz - b.tz) * e;
            yaw = Math.atan2(cx - b.tx, cz - b.tz);
            pitch = -0.4 * (1 - k);
            roll = 0;
            flap = 1;
            if (k >= 1) b.dive = -1;
          }
        } else {
          x = cx;
          z = cz;
          y = WATER_Y + b.h + Math.sin(t * 0.5 + b.phase) * 0.8;
          yaw = b.a + (b.w > 0 ? Math.PI / 2 : -Math.PI / 2);
          roll = -Math.sign(b.w) * 0.45;
          b.flapT = (b.flapT + dt) % 5;
          flap = b.flapT < 1.4 ? 1 : 0.1;
        }
        b.phase += dt * (flap > 0.5 ? 10 : 1.4);
        const hidden = b.dive >= 1.1 && b.dive < 1.7;
        tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(pitch, yaw, roll, "YXZ")), tmpS.setScalar(hidden ? 0 : OCEAN_K.tern * atSeaK));
        birds.setMatrixAt(i, tmpM);
        birdA.setXY(i, flap, b.phase);
      }
      birds.instanceMatrix.needsUpdate = true;
      birdA.needsUpdate = true;

      for (let i = 0; i < turtleState.length; i++) {
        const s = turtleState[i];
        if (dist2(s.sw, focus) > 220 * 220) respawn(s.sw, TURTLE, focus, ft.vx, ft.vz, rnd, 90, 170, 1.3);
        swim(s.sw, TURTLE, dt, t, focus, 2.5);
        tmpM.compose(tmpV.set(s.sw.x, -0.15 + Math.sin(t + s.ph) * 0.08, s.sw.z), tmpQ.setFromEuler(tmpE.set(0, s.sw.yaw, s.sw.roll * 0.5 + Math.sin(t * 1.5 + s.ph) * 0.06)), tmpS.setScalar(OCEAN_K.turtle));
        turtles.setMatrixAt(i, tmpM);
      }
      turtles.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const o of added) scene.remove(o);
      for (const d of disposables) d.dispose();
    },
  };
}

/** radius of the sea disc round the player (past the camera's far plane) */
export const SEA_R = 640;

/** a polar grid (a disc lying in XZ, facing up): fine rings near the centre, coarser far out */
export function seaDisc(radius: number, rings: number, segs: number): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  for (let i = 1; i <= rings; i++) {
    const r = radius * Math.pow(i / rings, 2.2);
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const idx: number[] = [];
  const ring = (i: number, k: number) => 1 + (i - 1) * segs + (k % segs);
  for (let k = 0; k < segs; k++) idx.push(0, ring(1, k + 1), ring(1, k));
  for (let i = 1; i < rings; i++)
    for (let k = 0; k < segs; k++) {
      const a = ring(i, k);
      const b = ring(i, k + 1);
      const c = ring(i + 1, k);
      const d = ring(i + 1, k + 1);
      idx.push(a, b, c, b, d, c);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  // make sure every triangle faces up
  const p = (j: number) => new THREE.Vector3().fromArray(pos, idx[j] * 3);
  const n = new THREE.Vector3().crossVectors(p(1).sub(p(0)), p(2).sub(p(0)));
  if (n.y < 0) {
    for (let j = 0; j < idx.length; j += 3) {
      const tmp = idx[j + 1];
      idx[j + 1] = idx[j + 2];
      idx[j + 2] = tmp;
    }
    geo.setIndex(idx);
  }
  geo.computeBoundingSphere();
  return geo;
}

// ── creature geometries (built once, facing +Z) ──
function jellyBellGeometry() {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    const a = u * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.sin(a) * (1 - u * 0.05), Math.cos(a) * 0.8 + 0.2));
  }
  pts.push(new THREE.Vector2(0.92, 0.12), new THREE.Vector2(0.8, 0.18));
  const g = new THREE.LatheGeometry(pts, 20);
  return g;
}

function jellyTentacleGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 0.55;
    const pts = [0, 0.3, 0.6, 1].map((u) => new THREE.Vector3(Math.cos(a) * r * (1 - u * 0.3) + Math.sin(u * 6 + i) * 0.12, 0.1 - u * (1.6 + (i % 3) * 0.5), Math.sin(a) * r * (1 - u * 0.3) + Math.cos(u * 6 + i) * 0.12));
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 4, false));
  }
  // frilly oral arms in the middle
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const pts = [0, 0.5, 1].map((u) => new THREE.Vector3(Math.cos(a) * 0.15 + Math.sin(u * 4 + i) * 0.15, 0.1 - u * 1.1, Math.sin(a) * 0.15));
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.09, 5, false));
  }
  return mergeGeometries(parts)!;
}

function mantaGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1);
  shape.quadraticCurveTo(0.9, 0.6, 1.6, -0.1);
  shape.quadraticCurveTo(0.6, -0.1, 0.2, -0.6);
  shape.lineTo(0.05, -2);
  shape.lineTo(-0.05, -2);
  shape.lineTo(-0.2, -0.6);
  shape.quadraticCurveTo(-0.6, -0.1, -1.6, -0.1);
  shape.quadraticCurveTo(-0.9, 0.6, 0, 1);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  return g;
}

function dolphinGeometry() {
  const body = new THREE.SphereGeometry(1, 14, 10);
  body.scale(0.42, 0.42, 1.4);
  const snout = new THREE.ConeGeometry(0.14, 0.5, 8);
  snout.rotateX(Math.PI / 2);
  snout.translate(0, -0.05, 1.5);
  const fin = new THREE.ConeGeometry(0.12, 0.45, 6);
  fin.translate(0, 0.5, -0.1);
  const tail = new THREE.SphereGeometry(1, 8, 4);
  tail.scale(0.6, 0.06, 0.22);
  tail.translate(0, 0, -1.45);
  return mergeGeometries([body, snout, fin, tail].map((g) => g.toNonIndexed()))!;
}

function turtleGeometry() {
  const shell = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.scale(0.9, 0.45, 1.1);
  const head = new THREE.SphereGeometry(0.28, 8, 6);
  head.translate(0, 0.05, 1.2);
  const flip = (x: number, z: number) => {
    const f = new THREE.SphereGeometry(1, 6, 4);
    f.scale(0.45, 0.06, 0.2);
    f.rotateY(x > 0 ? -0.5 : 0.5);
    f.translate(x, 0, z);
    return f;
  };
  return mergeGeometries([shell, head, flip(0.95, 0.5), flip(-0.95, 0.5), flip(0.7, -0.7), flip(-0.7, -0.7)].map((g) => g.toNonIndexed()))!;
}

function starfishGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.2 : 0.55;
    if (i === 0) s.moveTo(Math.sin(a) * r, Math.cos(a) * r);
    else s.lineTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** a flying fish (nose +z, ~0.5 m): a slim blue-silver body and big see-through-blue "wings" */
function flyingFishGeometry() {
  const body = new THREE.OctahedronGeometry(1, 0);
  body.scale(0.07, 0.07, 0.3);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.26, 0, 0.12, -0.42, 0, 0, -0.34, 0, 0, -0.26, 0, 0, -0.34, 0, -0.14, -0.44], 3));
  const wings = new THREE.BufferGeometry();
  // two long pectoral wings, and small pelvic ones behind
  const W = [0.04, 0.02, 0.1, 0.44, 0.04, 0.0, 0.34, 0.02, -0.16, 0.04, 0.02, 0.1, 0.34, 0.02, -0.16, 0.04, 0.02, -0.08];
  const pelvic = [0.03, -0.02, -0.12, 0.16, 0.0, -0.2, 0.03, -0.02, -0.22];
  const all: number[] = [];
  for (const s of [-1, 1]) for (const src of [W, pelvic]) for (let i = 0; i < src.length; i += 3) all.push(src[i] * s, src[i + 1], src[i + 2]);
  wings.setAttribute("position", new THREE.Float32BufferAttribute(all, 3));
  return merge([
    part(body, (p) => mix(col("#2a6fd6"), col("#e8f4ff"), p.y < 0 ? 1 : 0.2), [0, 0, 0], { faceted: true }),
    part(tail, col("#3a86e8"), [0, 0, 0]),
    part(wings, (p) => mix(col("#7fd0ff"), col("#1f7ad8"), Math.abs(p.x) / 0.44), [0, 0, 0]),
  ]);
}

/** a tern (nose +z): white with a black cap, grey wings with dark tips (aFx.y = flap weight) */
function seabirdGeometry() {
  const body = new THREE.OctahedronGeometry(1, 0);
  body.scale(0.07, 0.07, 0.24);
  const head = new THREE.OctahedronGeometry(0.06, 0);
  head.translate(0, 0.03, 0.22);
  const beak = new THREE.ConeGeometry(0.018, 0.1, 3);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.02, 0.31);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.18, -0.08, 0, -0.36, 0, 0, -0.26, 0, 0, -0.18, 0, 0, -0.26, 0.08, 0, -0.36], 3));
  const wing = (s: number) => {
    const g = new THREE.BufferGeometry();
    // inner and outer panels, swept back
    const p = [0.05, 0.02, 0.06, 0.34, 0.02, 0.0, 0.05, 0.02, -0.08, 0.34, 0.02, 0.0, 0.34, 0.02, -0.1, 0.05, 0.02, -0.08, 0.34, 0.02, 0.0, 0.62, 0.01, -0.14, 0.34, 0.02, -0.1];
    g.setAttribute("position", new THREE.Float32BufferAttribute(p.map((v, i) => (i % 3 === 0 ? v * s : v)), 3));
    return part(g, (q) => (Math.abs(q.x) > 0.48 ? col("#22262e") : col("#c9d3de")), (q) => [0, Math.abs(q.x) * 0.5, 0]);
  };
  return merge([
    part(body, col("#ffffff"), [0, 0, 0], { faceted: true }),
    part(head, (q) => (q.y > 0.04 ? col("#15171c") : col("#ffffff")), [0, 0, 0], { faceted: true }),
    part(beak, col("#ff8a2a"), [0, 0, 0]),
    part(tail, col("#f2f4f6"), [0, 0, 0]),
    wing(-1),
    wing(1),
  ]);
}
