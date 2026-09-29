// Floating islands: inverted rocky cones with grassy tops, a tree / ruin / crystals on each,
// dangling roots, and a waterfall pouring off the edge that dissolves into mist. All islands
// share ONE mesh (island geometry in island-local space + an `aIsl` index; the shader moves
// each island by its own matrix in uIslMat, so they bob and turn independently), one waterfall
// mesh, and their mist lives in the shared sprite layer (particles.ts).
import * as THREE from "three";
import { bakeTint, blob, col, displace, merge, mix, part, taperTube, transform, withConst } from "./geo";
import { noise3, rngOf, smoothstep } from "./noise";
import type { IslandSpot } from "./placement";
import { FOG_FACTOR_GLSL, HASH_GLSL, ISL_SLOTS, fxPatch, type FantasyUniforms } from "./shaders";
import { buildCrystalGeometry, buildMiniRuinGeometry, CRYSTAL_HUES } from "./stones";
import { buildTreeGeometry, tintFor } from "./trees";

const scratch = new THREE.Color();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const GRASS_TOP = col("#4d8a2c");
const GRASS_LIP = col("#3a6b24");
const ROCK_WARM = col("#b39a80");
const ROCK_COOL = col("#8d86a3");
const ROCK_DEEP = col("#5a4e6a");

/** the island body: a grassy, slightly domed top over a craggy inverted cone (faceted) */
function islandBody(R: number, seed: number, lowQuality: boolean): THREE.BufferGeometry {
  const radial = lowQuality ? 16 : 26;
  const depth = R * 1.55;
  // rings from the top centre outwards and down to the tip: [radius factor, y]
  const rings: [number, number][] = [
    [0.45, 0.35],
    [0.8, 0.2],
    [1.0, 0],
    [1.04, -0.55],
    [0.95, -1.4],
    [0.82, -depth * 0.2],
    [0.66, -depth * 0.38],
    [0.48, -depth * 0.56],
    [0.3, -depth * 0.74],
    [0.14, -depth * 0.9],
  ];
  const pos: number[] = [];
  const idx: number[] = [];
  pos.push(0, 0.42, 0);
  const ringR = (k: number, a: number) => {
    const [f] = rings[k];
    const wob = 1 + (noise3(Math.cos(a) * 2 + seed, k * 0.7, Math.sin(a) * 2, 3) - 0.5) * (k < 3 ? 0.25 : 0.55);
    return f * R * wob;
  };
  rings.forEach(([, y], k) => {
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2 + (k % 2) * (Math.PI / radial);
      const rr = ringR(k, a);
      const yy = y + (k > 3 ? (noise3(Math.cos(a) * 3, k, Math.sin(a) * 3 + seed, 6) - 0.5) * R * 0.25 : 0);
      pos.push(Math.cos(a) * rr, yy, Math.sin(a) * rr);
    }
  });
  pos.push(0, -depth, 0);
  const tip = pos.length / 3 - 1;
  for (let i = 0; i < radial; i++) idx.push(0, 1 + ((i + 1) % radial), 1 + i);
  for (let k = 0; k + 1 < rings.length; k++) {
    const a0 = 1 + k * radial;
    const b0 = 1 + (k + 1) * radial;
    for (let i = 0; i < radial; i++) {
      const i1 = (i + 1) % radial;
      if (k % 2 === 0) idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i);
      else idx.push(a0 + i, a0 + i1, b0 + i1, a0 + i, b0 + i1, b0 + i);
    }
  }
  const last = 1 + (rings.length - 1) * radial;
  for (let i = 0; i < radial; i++) idx.push(last + i, last + ((i + 1) % radial), tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return part(
    g,
    (p, n) => {
      if (p.y > -0.3 && n.y > 0.2) {
        mix(GRASS_TOP, col("#6f9a30"), noise3(p.x * 0.4, 0, p.z * 0.4, seed), scratch);
      } else if (p.y > -1.6) {
        mix(GRASS_LIP, ROCK_WARM, smoothstep(-0.5, -1.5, p.y), scratch);
      } else {
        const band = 0.5 + 0.5 * Math.sin(p.y * 1.1 + noise3(p.x * 0.3, p.y * 0.3, p.z * 0.3, seed) * 4);
        mix(ROCK_WARM, ROCK_COOL, band, scratch);
        scratch.lerp(ROCK_DEEP, smoothstep(-depth * 0.3, -depth, p.y) * 0.75);
        scratch.multiplyScalar(0.85 + 0.3 * noise3(p.x, p.y, p.z, 5));
      }
      return scratch;
    },
    [0, 0, 0],
    { faceted: true, faceColor: true },
  );
}

export interface SkyIslands {
  mesh: THREE.Mesh;
  falls: THREE.Mesh;
  /** mist + splash sprites in island-local coords: [x, y, z, island, size] */
  mist: [number, number, number, number, number][];
  update(t: number): void;
  dispose(): void;
}

export function buildSkyIslands(U: FantasyUniforms, spots: IslandSpot[], opts: { lowQuality?: boolean }): SkyIslands {
  const low = !!opts.lowQuality;
  const parts: THREE.BufferGeometry[] = [];
  const fallParts: THREE.BufferGeometry[] = [];
  const mist: [number, number, number, number, number][] = [];
  spots.forEach((s, i) => {
    const r = rngOf(s.seed);
    const add = (g: THREE.BufferGeometry) => parts.push(withConst(g, "aIsl", i));
    add(islandBody(s.r, s.seed % 1000, low));
    // dangling roots under the grassy lip
    for (let k = 0; k < (low ? 6 : 12); k++) {
      const a = r() * Math.PI * 2;
      const rr = s.r * (0.85 + r() * 0.12);
      const len = 2 + r() * 5;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      const root = taperTube([V(x, -0.8, z), V(x * 1.02, -0.8 - len * 0.5, z * 1.02), V(x * 0.98 + (r() - 0.5), -0.8 - len, z * 0.98)], { segs: 5, radial: 3, rx: (t) => 0.14 * (1 - t) + 0.04 });
      add(part(root, (p) => mix(col("#3f5a2a"), col("#6b8a3a"), smoothstep(-0.8, -0.8 - len, p.y), scratch), [0, 0, 0]));
    }
    // boulders on top
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2;
      const d = s.r * (0.4 + r() * 0.4);
      const b = displace(new THREE.IcosahedronGeometry(0.6 + r() * 0.7, 1), (p) => p.multiplyScalar(0.8 + noise3(p.x * 2, p.y * 2, p.z * 2, k) * 0.4));
      transform(b, Math.cos(a) * d, 0.3, Math.sin(a) * d, r() * 3, V(1, 0.7, 1));
      add(part(b, (p, n) => mix(ROCK_COOL, col("#5d7f2e"), smoothstep(0.4, 0.8, n.y), scratch), [0, 0, 0], { faceted: true, faceColor: true }));
    }
    // what stands on top
    if (s.top === "tree") {
      const species = i % 2 === 0 ? "spirit" : "oak";
      const tree = buildTreeGeometry(species, low, s.seed).geometry;
      bakeTint(tree, tintFor(species, i % 2 === 0 ? 0.75 : 0.3));
      transform(tree, s.r * 0.15, 0.3, -s.r * 0.2, r() * 6, 1.25);
      add(tree);
      // a small companion tree
      const t2 = buildTreeGeometry("birch", low, s.seed + 1).geometry;
      bakeTint(t2, tintFor("birch", 0.9));
      transform(t2, -s.r * 0.45, 0.2, s.r * 0.35, r() * 6, 0.75);
      add(t2);
    } else if (s.top === "ruin") {
      for (const g of buildMiniRuinGeometry(s.seed)) {
        transform(g, 0, 0.3, -s.r * 0.1, 0, 0.9);
        add(g);
      }
    } else {
      for (let k = 0; k < 4; k++) {
        const g = buildCrystalGeometry(rngOf(s.seed + k));
        bakeTint(g, CRYSTAL_HUES[(k + i) % 3]);
        const a = (k / 4) * Math.PI * 2 + r();
        const d = k === 0 ? 0 : s.r * 0.45;
        transform(g, Math.cos(a) * d, 0.2, Math.sin(a) * d, r() * 6, k === 0 ? 2.2 : 1.1 + r() * 0.5);
        add(g);
      }
    }
    // the waterfall: a ribbon from a spring on top, over the lip, falling ~30 units into mist
    const dir = new THREE.Vector2(Math.cos(s.fall), Math.sin(s.fall));
    const fallLen = 26 + r() * 10;
    const path: THREE.Vector3[] = [];
    const topPts = 5;
    for (let k = 0; k < topPts; k++) {
      const u = k / (topPts - 1);
      const d = s.r * (0.3 + u * 0.72);
      path.push(V(dir.x * d, 0.47 - u * 0.4, dir.y * d));
    }
    const fallPts = 14;
    for (let k = 1; k <= fallPts; k++) {
      const u = k / fallPts;
      const d = s.r * 1.02 + Math.sqrt(u) * 3.2;
      path.push(V(dir.x * d, 0.05 - u * fallLen, dir.y * d));
    }
    fallParts.push(withConst(waterRibbon(path, (u) => (u < 0.2 ? 1.6 : 1.6 + (u - 0.2) * 3.2)), "aIsl", i));
    // mist where it dissolves, and a little splash at the lip
    for (let k = 0; k < (low ? 8 : 16); k++) {
      const u = 0.55 + r() * 0.45;
      const d = s.r * 1.02 + Math.sqrt(u) * 3.2;
      mist.push([dir.x * d + (r() - 0.5) * 3, 0.05 - u * fallLen, dir.y * d + (r() - 0.5) * 3, i, 5 + r() * 5]);
    }
    for (let k = 0; k < 3; k++) mist.push([dir.x * s.r * 1.08, -0.6 - k * 1.2, dir.y * s.r * 1.08, i, 2.5 + r() * 1.5]);
  });

  const geo = merge(parts);
  const mat = fxPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, emissive: new THREE.Color("#34405a") }), U, { island: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = "fantasy-sky-islands";

  const fallGeo = merge(fallParts);
  const fallMat = waterfallMaterial(U);
  const falls = new THREE.Mesh(fallGeo, fallMat);
  falls.frustumCulled = false;
  falls.renderOrder = 2;
  falls.name = "fantasy-waterfalls";

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  return {
    mesh,
    falls,
    mist,
    update(t) {
      spots.forEach((s, i) => {
        p.set(s.x, s.y + Math.sin(t * 0.33 + i * 1.7) * 1.3, s.z);
        e.set(Math.sin(t * 0.21 + i) * 0.025, s.rot + t * 0.01 * (i % 2 ? 1 : -1), Math.cos(t * 0.17 + i * 2) * 0.025);
        q.setFromEuler(e);
        m.compose(p, q, one);
        U.uIslMat.value[i].copy(m);
      });
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      fallGeo.dispose();
      fallMat.dispose();
    },
  };
}

/** a water ribbon along `path` (island local), width w(u); uv.x across, uv.y = distance, aT = 0..1 */
function waterRibbon(path: THREE.Vector3[], w: (u: number) => number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path, false, "centripetal");
  const n = 64;
  const len = curve.getLength();
  const pos: number[] = [];
  const uv: number[] = [];
  const at: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const S = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, P);
    curve.getTangentAt(u, T);
    S.crossVectors(T, up);
    if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
    S.normalize();
    const hw = w(u) / 2;
    pos.push(P.x - S.x * hw, P.y - S.y * hw, P.z - S.z * hw, P.x + S.x * hw, P.y + S.y * hw, P.z + S.z * hw);
    uv.push(0, u * len, 1, u * len);
    at.push(u, u);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(at, 1));
  g.setIndex(idx);
  return g.toNonIndexed();
}

function waterfallMaterial(U: FantasyUniforms) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: U.uTime, uGlow: U.uGlow, uIslMat: U.uIslMat },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aIsl; attribute float aT;
      uniform mat4 uIslMat[${ISL_SLOTS}];
      varying vec2 vUv; varying float vT;
      void main() {
        vUv = uv; vT = aT;
        vec4 wp = uIslMat[ int( aIsl + 0.5 ) ] * vec4( position, 1.0 );
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uGlow;
      varying vec2 vUv; varying float vT;
      ${HASH_GLSL}
      ${FOG_FACTOR_GLSL}
      void main() {
        float across = vUv.x;
        float d = vUv.y;
        float edge = smoothstep( 0.0, 0.2, across ) * smoothstep( 1.0, 0.8, across );
        float falling = smoothstep( 0.12, 0.2, vT );
        float speed = mix( 1.5, 9.0, falling );
        float s1 = fnoise( vec2( across * 10.0, d * 0.3 - uTime * speed * 0.3 ) );
        float s2 = fnoise( vec2( across * 26.0 + 3.1, d * 0.9 - uTime * speed * 0.9 ) );
        float foam = smoothstep( 0.5, 0.9, s1 * 0.6 + s2 * 0.55 );
        vec3 deep = vec3( 0.16, 0.5, 0.82 );
        vec3 light = vec3( 0.82, 0.96, 1.0 );
        vec3 col = mix( deep, light, 0.3 + 0.7 * foam );
        col += vec3( 0.2, 0.9, 1.0 ) * uGlow * ( 0.25 + foam * 0.6 );
        float a = edge * ( 0.6 + 0.4 * foam );
        // dissolve into mist on the way down
        float dissolve = smoothstep( 0.45, 1.0, vT );
        a *= 1.0 - smoothstep( s2 * 0.6 + 0.1, s2 * 0.6 + 0.5, dissolve );
        a *= 1.0 - fantasyFog();
        gl_FragColor = vec4( col, a * 0.92 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
