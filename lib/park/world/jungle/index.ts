// The rainforest round Rainbow Falls, at TRUE size: emergent giants ~38 m tall on buttress roots,
// a canopy roof ~20-29 m up that the kid walks under along the jungle trails, palms and tree ferns
// in the understory, a thicket of ferns and giant leaves between the trails (it blocks walking:
// lib/park/registry/jungle.ts), hanging vines and lianas, mossy logs, shafts of sunlight through
// the gaps and dappled light on the forest floor — and its wildlife (./monkeys.ts, ./birds.ts).
//
// Placement is pure (./plan.ts, tested). Every repeated thing is instanced (one draw call per
// model), leaves sway in the wind and take a per-instance green, and the whole jungle is cut away
// between the camera and the kid (./cutaway.ts). Update loop allocation-free.
import * as THREE from "three";
import { fxMaterial, makeUniforms, FOG_FACTOR_GLSL } from "../fantasy/shaders";
import { thicketGrid, TG_HALF, TG_N } from "../../registry/jungle";
import { SUN_DIR, TREE_TYPES, planJungle, type JunglePlan, type KeepFn } from "./plan";
import { buildClump, buildJungleTree, buildLogs, buildVine, trisOf } from "./geometry";
import { addJungleCut, makeJungleCut, type JungleCut } from "./cutaway";
import { buildMonkeys, type Monkeys } from "./monkeys";
import { buildJungleBirds, type JungleBirds } from "./birds";

export interface Jungle {
  plan: JunglePlan;
  /** the see-through cut's uniforms (the waterways' plants share them) */
  cut: JungleCut;
  /** the trunks (and the giants' buttresses) to walk round */
  obstacles: { x: number; z: number; r: number }[];
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number; camera?: THREE.Vector3 }): void;
  setVisible(v: boolean): void;
  stats: { calls: number; tris: number; trees: number; clumps: number; vines: number; monkeys: number; birds: number };
  dispose(): void;
}

const LEAF = ["#3f8f3a", "#2f7a3e", "#4f9e32", "#2a6e48", "#5aa83a", "#367f2c", "#1f6a44", "#64b03e"].map((c) => new THREE.Color(c));

export function buildJungle(scene: THREE.Scene, opts: { lowQuality?: boolean; keep?: KeepFn; ground?: { material: THREE.Material } } = {}): Jungle {
  const low = !!opts.lowQuality;
  const plan = planJungle({ lowQuality: low, keep: opts.keep });
  const group = new THREE.Group();
  group.name = "jungle";
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
  const U = makeUniforms();
  U.uSway.value = 0.12;
  U.uGlowK.value = 0;
  const cut = makeJungleCut();
  const camPos = new THREE.Vector3(0, -1e4, 0);
  const grabCam = (_r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => void cut.uJCam.value.setFromMatrixPosition(cam.matrixWorld);
  const leafMat = track(addJungleCut(fxMaterial(U, { roughness: 0.9, metalness: 0 }), cut, { shadeBelow: true }));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c = new THREE.Color();
  let calls = 0;
  let tris = 0;
  const addIM = (geo: THREE.BufferGeometry, n: number, name: string, mat: THREE.Material = leafMat) => {
    const im = new THREE.InstancedMesh(track(geo), mat, Math.max(1, n));
    im.count = n;
    im.name = name;
    im.castShadow = false;
    im.receiveShadow = !low;
    im.onBeforeRender = grabCam;
    group.add(im);
    calls++;
    tris += trisOf(geo) * n;
    return im;
  };

  // ── the trees ──
  for (let type = 0; type < TREE_TYPES; type++) {
    const list = plan.trees.filter((t) => t.type === type);
    if (!list.length) continue;
    const im = addIM(buildJungleTree(type, low), list.length, `jungle-trees-${type}`);
    list.forEach((t, i) => {
      e.set(0, t.rot, 0);
      m4.compose(v.set(t.x, t.y - 0.2, t.z), q.setFromEuler(e), s3.set(t.s, t.s * t.sy, t.s));
      im.setMatrixAt(i, m4);
      const k = t.hue * (LEAF.length - 0.001);
      c.copy(LEAF[Math.floor(k)]).lerp(LEAF[Math.min(LEAF.length - 1, Math.floor(k) + 1)], k % 1);
      if (type >= 2) c.offsetHSL(0.02, 0.05, 0.04);
      im.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }

  // ── the undergrowth ──
  {
    const im = addIM(buildClump(low), plan.clumps.length, "jungle-undergrowth");
    plan.clumps.forEach((cl, i) => {
      e.set(0, cl.rot, 0);
      const sy = cl.kind === 2 ? 0.8 : cl.kind === 1 ? 1.25 : 1;
      m4.compose(v.set(cl.x, cl.y - 0.1, cl.z), q.setFromEuler(e), s3.set(cl.s * 1.6, cl.s * 1.6 * sy, cl.s * 1.6));
      im.setMatrixAt(i, m4);
      const k = cl.hue * (LEAF.length - 0.001);
      c.copy(LEAF[Math.floor(k)]).offsetHSL(0, 0.04, cl.kind === 1 ? 0.06 : 0);
      im.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }

  // ── vines and lianas ──
  {
    const im = addIM(buildVine(low), plan.vines.length, "jungle-vines");
    plan.vines.forEach((vn, i) => {
      e.set(0, vn.rot, 0);
      const w = vn.liana ? 2.6 : 1.2;
      m4.compose(v.set(vn.x, vn.top, vn.z), q.setFromEuler(e), s3.set(w, vn.len, w));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.copy(LEAF[(i * 3) % LEAF.length]).offsetHSL(0.03, 0, 0.05));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }

  // ── mossy logs ──
  const logGeo = buildLogs(plan.logs);
  if (logGeo) {
    const mesh = new THREE.Mesh(track(logGeo), leafMat);
    mesh.name = "jungle-logs";
    mesh.receiveShadow = !low;
    mesh.onBeforeRender = grabCam;
    group.add(mesh);
    calls++;
    tris += trisOf(logGeo);
  }

  // ── shafts of sunlight through the canopy's gaps (motes drifting in them) ──
  const shaftMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: { ...THREE.UniformsLib.fog, uTime: { value: 0 }, uGlow: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying float vU; varying vec3 vW;
        #include <fog_pars_vertex>
        void main() {
          vU = uv.y;
          vec4 w = modelMatrix * instanceMatrix * vec4( position, 1.0 );
          vW = w.xyz;
          vN = normalize( mat3( modelMatrix * instanceMatrix ) * normal );
          vV = normalize( cameraPosition - w.xyz );
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uGlow;
        varying vec3 vN; varying vec3 vV; varying float vU; varying vec3 vW;
        #include <fog_pars_fragment>
        ${FOG_FACTOR_GLSL}
        float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        void main() {
          // brightest down the beam's middle (seen side-on), fading at the top and where it lands
          float edge = pow( abs( dot( vN, vV ) ), 1.6 );
          float along = smoothstep( 0.0, 0.12, vU ) * ( 1.0 - smoothstep( 0.55, 1.0, vU ) );
          float a = edge * along * 0.12;
          // motes of dust and pollen twinkling as they drift down the light
          vec2 q = vec2( vW.x + vW.z, vW.y + uTime * 0.6 ) * 1.3;
          float m = step( 0.985, h( floor( q ) ) ) * ( 1.0 - smoothstep( 0.05, 0.3, length( fract( q ) - 0.5 ) ) );
          a += m * along * 0.6;
          vec3 day = vec3( 1.0, 0.93, 0.62 );
          vec3 night = vec3( 0.45, 0.6, 1.0 );
          vec3 col = mix( day, night, uGlow ) * a * mix( 1.0, 0.35, uGlow );
          gl_FragColor = vec4( col * ( 1.0 - fantasyFog() ), 1.0 );
        }`,
    }),
  );
  {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(track(geo), shaftMat, Math.max(1, plan.shafts.length));
    im.name = "jungle-sunbeams";
    im.count = plan.shafts.length;
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z);
    q.setFromUnitVectors(up, dir);
    plan.shafts.forEach((s, i) => {
      m4.compose(v.set(s.x, s.y - 0.2, s.z), q, s3.set(s.r, s.len, s.r * 0.8));
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.renderOrder = 3;
    group.add(im);
    calls++;
    tris += 20 * plan.shafts.length;
  }

  // ── dappled light on the forest floor: the terrain darkens under the canopy, with sun-flecks ──
  let floorU: { uJTime: { value: number }; uJGlow: { value: number } } | null = null;
  if (opts.ground) {
    const g = thicketGrid();
    const data = new Uint8Array(TG_N * TG_N);
    // blur the canopy grid so its edge fades softly into the meadow
    const tmp = new Float32Array(TG_N * TG_N);
    for (let k = 0; k < tmp.length; k++) tmp[k] = g.canopy[k];
    for (let pass = 0; pass < 3; pass++) {
      const o = Float32Array.from(tmp);
      for (let j = 1; j < TG_N - 1; j++)
        for (let i = 1; i < TG_N - 1; i++) {
          const k = j * TG_N + i;
          tmp[k] = (o[k] * 2 + o[k - 1] + o[k + 1] + o[k - TG_N] + o[k + TG_N]) / 6;
        }
    }
    for (let k = 0; k < data.length; k++) data[k] = Math.round(tmp[k] * 255);
    const tex = track(new THREE.DataTexture(data, TG_N, TG_N, THREE.RedFormat, THREE.UnsignedByteType));
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    floorU = { uJTime: { value: 0 }, uJGlow: { value: 0 } };
    const fu = floorU;
    const mat = opts.ground.material as THREE.MeshStandardMaterial;
    const prev = mat.onBeforeCompile.bind(mat);
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey = () => `${prevKey()}-jungle-floor`;
    mat.onBeforeCompile = (shader, renderer) => {
      prev(shader, renderer);
      shader.uniforms.uJCanopy = { value: tex };
      shader.uniforms.uJTime = fu.uJTime;
      shader.uniforms.uJGlow = fu.uJGlow;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vJGW;").replace("#include <project_vertex>", "#include <project_vertex>\nvJGW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vJGW; uniform sampler2D uJCanopy; uniform float uJTime; uniform float uJGlow;
          float jh( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
          float jn( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
            return mix( mix( jh( i ), jh( i + vec2( 1.0, 0.0 ) ), f.x ), mix( jh( i + vec2( 0.0, 1.0 ) ), jh( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          {
            float jc = texture2D( uJCanopy, ( vJGW.xz + ${TG_HALF.toFixed(1)} ) / ${TG_N.toFixed(1)} ).r;
            if ( jc > 0.01 ) {
              // leaf litter and moss under the trees
              vec3 litter = mix( vec3( 0.20, 0.17, 0.08 ), vec3( 0.13, 0.22, 0.07 ), jn( vJGW.xz * 0.21 ) );
              vec3 c = mix( diffuseColor.rgb, litter, 0.55 );
              // sun-flecks: bright coins of light drifting as the leaves sway overhead
              vec2 p = vJGW.xz * 0.34 + vec2( sin( uJTime * 0.35 ), cos( uJTime * 0.27 ) ) * 0.25;
              float fleck = smoothstep( 0.62, 0.72, jn( p ) * 0.65 + jn( p * 2.3 + 7.0 ) * 0.35 );
              float shade = mix( 0.42, 1.25, fleck * ( 1.0 - uJGlow * 0.85 ) );
              diffuseColor.rgb = mix( diffuseColor.rgb, c * shade, jc );
            }
          }`,
        );
    };
    mat.needsUpdate = true;
  }

  // ── wildlife ──
  const monkeys: Monkeys = buildMonkeys(group, plan, { lowQuality: low, cut, grabCam });
  disposables.push(monkeys);
  calls += 1;
  tris += monkeys.tris;
  const birds: JungleBirds = buildJungleBirds(group, plan, { lowQuality: low });
  disposables.push(birds);
  calls += 1;
  tris += birds.tris;

  scene.add(group);
  void camPos;

  return {
    plan,
    cut,
    obstacles: plan.trees.filter((t) => t.type <= 2).map((t) => ({ x: t.x, z: t.z, r: t.trunkR * (t.type === 0 ? 2.1 : t.type === 1 ? 1.7 : 1.3) + 0.3 })),
    stats: { calls, tris: Math.round(tris), trees: plan.trees.length, clumps: plan.clumps.length, vines: plan.vines.length, monkeys: monkeys.count, birds: birds.count },
    update(dt, t, o) {
      U.uTime.value = t;
      U.uGlow.value = o.glow;
      cut.uJKid.value.copy(o.kid);
      shaftMat.uniforms.uTime.value = t;
      shaftMat.uniforms.uGlow.value = o.glow;
      if (floorU) {
        floorU.uJTime.value = t;
        floorU.uJGlow.value = o.glow;
      }
      monkeys.update(dt, t, o.kid);
      birds.update(dt, t, o.kid, o.glow);
    },
    setVisible(vis) {
      group.visible = vis;
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
    },
  };
}
