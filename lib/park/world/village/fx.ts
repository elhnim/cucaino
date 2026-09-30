// Coralcove's fire, light and smoke (island-local coordinates):
//   - one additive mesh for the festival bonfire's dancing flames, the bakery oven's glow and the
//     lighthouse's sweeping beams (all animated in the shader)
//   - one set of glowing points: the lanterns' halos (lit one by one by the lantern-lighter),
//     the bonfire's glow and sparks, the lighthouse lamp, and fireflies over the gardens at night
//   - one set of soft smoke puffs from the bakery chimney and the huts' roof tips
// Everything is preallocated; update() only writes into existing arrays.
import * as THREE from "three";
import { VILLAGE_FIRE, VILLAGE_ISLAND, VILLAGE_LANTERNS, VILLAGE_LIGHTHOUSE, VILLAGE_OVEN, VILLAGE_SMOKE, villageGroundY, villageRng } from "../../registry/villageIsland";

const X0 = VILLAGE_ISLAND.x;
const Z0 = VILLAGE_ISLAND.z;

export interface FxUniforms {
  uTime: { value: number };
  uFire: { value: number };
  uOven: { value: number };
  uBeam: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}

const FOG = /* glsl */ `
  uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
  float fogK( float d ) { return smoothstep( uFogNear, uFogFar, d ); }
`;

/** bonfire flames (aWhich 0), oven flames (1), lighthouse beams (2) */
export function buildFlames(U: FxUniforms): THREE.Mesh {
  const pos: number[] = [];
  const which: number[] = [];
  const uvh: number[] = [];
  const pivot: number[] = [];
  const quad = (cx: number, cy: number, cz: number, a: number, w: number, h: number, kind: number, px = 0, py = 0, pz = 0) => {
    // a flame "diamond" facing angle a: bottom, left, right, top
    const dx = Math.cos(a) * w;
    const dz = -Math.sin(a) * w;
    const b = [cx, cy, cz];
    const l = [cx - dx, cy + h * 0.35, cz - dz];
    const r = [cx + dx, cy + h * 0.35, cz + dz];
    const t = [cx, cy + h, cz];
    for (const [p, v] of [
      [b, 0],
      [l, 0.35],
      [t, 1],
      [b, 0],
      [t, 1],
      [r, 0.35],
    ] as [number[], number][]) {
      pos.push(p[0], p[1], p[2]);
      which.push(kind);
      uvh.push(v);
      pivot.push(px, py, pz);
    }
  };
  const fx = VILLAGE_FIRE.x - X0;
  const fz = VILLAGE_FIRE.z - Z0;
  const fy = (villageGroundY(VILLAGE_FIRE.x, VILLAGE_FIRE.z) ?? 2.8) + 0.2;
  const rnd = villageRng(55);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI;
    const off = i < 3 ? 0 : 0.35;
    const oa = rnd() * Math.PI * 2;
    quad(fx + Math.sin(oa) * off, fy, fz + Math.cos(oa) * off, a, 0.42 + rnd() * 0.2, 1.3 + rnd() * 1.0 - off, 0);
  }
  const ox = VILLAGE_OVEN.x - X0 + Math.sin(VILLAGE_OVEN.rot) * 0.85;
  const oz = VILLAGE_OVEN.z - Z0 + Math.cos(VILLAGE_OVEN.rot) * 0.85;
  const oy = (villageGroundY(VILLAGE_OVEN.x, VILLAGE_OVEN.z) ?? 2.5) + 0.4;
  for (let i = 0; i < 3; i++) quad(ox + (i - 1) * 0.12, oy, oz, VILLAGE_OVEN.rot + Math.PI / 2, 0.14, 0.4, 1);
  // the lighthouse beams: two long soft wedges from the lamp, swept round by the shader
  const lx = VILLAGE_LIGHTHOUSE.x - X0;
  const lz = VILLAGE_LIGHTHOUSE.z - Z0;
  const ly = VILLAGE_LIGHTHOUSE.y + 9.55;
  for (const s of [1, -1]) {
    const L = 34;
    const W = 4.5;
    const tip = [lx, ly, lz];
    const e1 = [lx + s * L, ly - 1.5 - W * 0.5, lz - W];
    const e2 = [lx + s * L, ly - 1.5 - W * 0.5, lz + W];
    const e3 = [lx + s * L, ly - 1.5 + W * 0.5, lz];
    for (const [p, v] of [
      [tip, 0],
      [e1, 1],
      [e2, 1],
      [tip, 0],
      [e3, 1],
      [e1, 1],
      [tip, 0],
      [e2, 1],
      [e3, 1],
    ] as [number[], number][]) {
      pos.push(p[0], p[1], p[2]);
      which.push(2);
      uvh.push(v);
      pivot.push(lx, ly, lz);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aWhich", new THREE.Float32BufferAttribute(which, 1));
  geo.setAttribute("aH", new THREE.Float32BufferAttribute(uvh, 1));
  geo.setAttribute("aPivot", new THREE.Float32BufferAttribute(pivot, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aWhich; attribute float aH; attribute vec3 aPivot;
      uniform float uTime; uniform float uFire; uniform float uOven; uniform float uBeam;
      varying float vH; varying float vWhich; varying float vK; varying float vDist;
      void main() {
        vec3 p = position;
        float k = aWhich < 0.5 ? uFire : ( aWhich < 1.5 ? uOven : uBeam );
        if ( aWhich < 1.5 ) {
          // flicker: the tips lick sideways and the height breathes
          float ph = position.x * 3.1 + position.z * 2.3;
          float grow = ( 0.55 + 0.45 * k ) * ( 0.85 + 0.2 * sin( uTime * 7.0 + ph ) + 0.1 * sin( uTime * 13.0 + ph * 2.0 ) );
          p.y += ( grow - 1.0 ) * aH * ( aWhich < 0.5 ? 1.8 : 0.4 );
          p.x += sin( uTime * 9.0 + ph + p.y * 3.0 ) * 0.14 * aH;
          p.z += cos( uTime * 8.0 + ph - p.y * 2.0 ) * 0.14 * aH;
        } else {
          // sweep round the lamp
          float a = uTime * 0.7;
          vec3 d = p - aPivot;
          p = aPivot + vec3( d.x * cos( a ) - d.z * sin( a ), d.y, d.x * sin( a ) + d.z * cos( a ) );
        }
        vH = aH; vWhich = aWhich; vK = k;
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${FOG}
      varying float vH; varying float vWhich; varying float vK; varying float vDist;
      void main() {
        vec3 col; float a;
        if ( vWhich < 1.5 ) {
          col = mix( vec3( 1.0, 0.95, 0.55 ), vec3( 1.0, 0.45, 0.12 ), smoothstep( 0.1, 0.6, vH ) );
          col = mix( col, vec3( 0.9, 0.15, 0.1 ), smoothstep( 0.6, 1.0, vH ) );
          a = ( 1.0 - smoothstep( 0.55, 1.0, vH ) * 0.8 ) * ( 0.35 + 0.65 * vK );
        } else {
          col = vec3( 1.0, 0.95, 0.7 );
          a = ( 1.0 - vH ) * 0.22 * vK;
        }
        a *= 1.0 - fogK( vDist );
        gl_FragColor = vec4( col * a, a );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "village-flames";
  mesh.renderOrder = 3;
  return mesh;
}

// ── points (glow + smoke) ──

function pointsMaterial(U: FxUniforms, additive: boolean, uPx: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uPx },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute float aSize;
      uniform float uPx;
      varying vec4 vCol; varying float vDist;
      void main() {
        vCol = aCol;
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vDist = -mv.z;
        gl_PointSize = aSize * uPx / max( 0.5, -mv.z );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${FOG}
      varying vec4 vCol; varying float vDist;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float r = length( q ) * 2.0;
        if ( r > 1.0 ) discard;
        float f = 1.0 - fogK( vDist );
        ${
          additive
            ? `float k = pow( 1.0 - r, 2.2 ) + ( 1.0 - smoothstep( 0.0, 0.18, r ) ) * 0.8;
        gl_FragColor = vec4( vCol.rgb * k * vCol.a * f, 1.0 );`
            : `float k = smoothstep( 1.0, 0.55, r ) * ( 0.8 + 0.2 * smoothstep( 0.2, 0.9, q.y + 0.5 ) );
        gl_FragColor = vec4( mix( vCol.rgb, uFogColor, 1.0 - f ), vCol.a * k * f );`
        }
      }`,
  });
}

export interface VillageFx {
  flames: THREE.Mesh;
  glow: THREE.Points;
  smoke: THREE.Points;
  update(dt: number, t: number, o: { glow: number; fire: number; oven: number; lit: Uint8Array; lighting: number }): void;
  dispose(): void;
}

const FIREFLIES = 26;
const SPARKS = 18;
const PUFFS = 7;

export function buildFx(U: FxUniforms, low: boolean): VillageFx {
  const uPx = { value: 600 };
  const vp = new THREE.Vector4();
  const setPx = (r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => {
    r.getCurrentViewport(vp);
    const pc = cam as THREE.PerspectiveCamera;
    uPx.value = vp.w / (2 * Math.tan(((pc.fov ?? 45) * Math.PI) / 360));
  };
  const flames = buildFlames(U);

  // ── glow points ──
  const nL = VILLAGE_LANTERNS.length;
  const nFly = low ? FIREFLIES / 2 : FIREFLIES;
  const nSpark = low ? SPARKS / 2 : SPARKS;
  const nG = nL + 3 + nFly + nSpark;
  const gPos = new Float32Array(nG * 3);
  const gCol = new Float32Array(nG * 4);
  const gSize = new Float32Array(nG);
  VILLAGE_LANTERNS.forEach((l, i) => {
    gPos.set([l.x - X0, l.y, l.z - Z0 + 0.45], i * 3);
  });
  const fireY = (villageGroundY(VILLAGE_FIRE.x, VILLAGE_FIRE.z) ?? 2.8) + 0.9;
  const iFire = nL;
  const iOven = nL + 1;
  const iLamp = nL + 2;
  gPos.set([VILLAGE_FIRE.x - X0, fireY, VILLAGE_FIRE.z - Z0], iFire * 3);
  const oy = (villageGroundY(VILLAGE_OVEN.x, VILLAGE_OVEN.z) ?? 2.5) + 0.6;
  gPos.set([VILLAGE_OVEN.x - X0 + Math.sin(VILLAGE_OVEN.rot) * 1.05, oy, VILLAGE_OVEN.z - Z0 + Math.cos(VILLAGE_OVEN.rot) * 1.05], iOven * 3);
  gPos.set([VILLAGE_LIGHTHOUSE.x - X0, VILLAGE_LIGHTHOUSE.y + 9.55, VILLAGE_LIGHTHOUSE.z - Z0], iLamp * 3);
  const rnd = villageRng(909);
  // fireflies drift round a few homes: the gardens, the lagoon's banks, the fire circle
  const flyHomes: [number, number][] = [
    [-37, -12],
    [-29, -19],
    [9, 2],
    [33, -10],
    [-25, 12],
    [17, 36],
  ];
  const fly = Array.from({ length: nFly }, (_, i) => {
    const [hx, hz] = flyHomes[i % flyHomes.length];
    return { hx, hz, hy: (villageGroundY(hx + X0, hz + Z0) ?? 2.5) + 0.6, ph: rnd() * 10, r: 1.5 + rnd() * 2.5, sp: 0.3 + rnd() * 0.4 };
  });
  const spark = Array.from({ length: nSpark }, () => ({ t0: rnd() * 2, sp: 0.8 + rnd() * 0.8, a: rnd() * Math.PI * 2, r: rnd() * 0.5 }));
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute("aCol", new THREE.BufferAttribute(gCol, 4).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute("aSize", new THREE.BufferAttribute(gSize, 1).setUsage(THREE.DynamicDrawUsage));
  gGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 90);
  const glow = new THREE.Points(gGeo, pointsMaterial(U, true, uPx));
  glow.name = "village-glow";
  glow.renderOrder = 4;
  glow.onBeforeRender = setPx;

  // ── smoke ──
  const emit = low ? VILLAGE_SMOKE.slice(0, 5) : VILLAGE_SMOKE;
  const nS = emit.length * PUFFS;
  const sPos = new Float32Array(nS * 3);
  const sCol = new Float32Array(nS * 4);
  const sSize = new Float32Array(nS);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute("aCol", new THREE.BufferAttribute(sCol, 4).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute("aSize", new THREE.BufferAttribute(sSize, 1).setUsage(THREE.DynamicDrawUsage));
  sGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 90);
  const smoke = new THREE.Points(sGeo, pointsMaterial(U, false, uPx));
  smoke.name = "village-smoke";
  smoke.renderOrder = 1;
  smoke.onBeforeRender = setPx;
  const wind = { x: 0.86, z: 0.5 };

  return {
    flames,
    glow,
    smoke,
    update(dt, t, o) {
      void dt;
      const g = o.glow;
      // lantern halos: dark by day; lit ones glow warm, flickering a little
      for (let i = 0; i < nL; i++) {
        const on = o.lit[i] ? 1 : 0;
        const k = on * (0.35 + 0.65 * g) * (0.9 + 0.1 * Math.sin(t * 6 + i * 1.7));
        gCol[i * 4] = 1.0;
        gCol[i * 4 + 1] = 0.72;
        gCol[i * 4 + 2] = 0.38;
        gCol[i * 4 + 3] = k;
        gSize[i] = 1.8 + g * 0.5;
      }
      const fk = o.fire * (0.9 + 0.1 * Math.sin(t * 8.3) * Math.sin(t * 5.1));
      gCol[iFire * 4] = 1;
      gCol[iFire * 4 + 1] = 0.55;
      gCol[iFire * 4 + 2] = 0.2;
      gCol[iFire * 4 + 3] = fk * (0.2 + g * 0.45);
      gSize[iFire] = 2.5 + o.fire * 2.5;
      gCol[iOven * 4] = 1;
      gCol[iOven * 4 + 1] = 0.5;
      gCol[iOven * 4 + 2] = 0.18;
      gCol[iOven * 4 + 3] = o.oven * 0.8;
      gSize[iOven] = 1.8;
      gCol[iLamp * 4] = 1;
      gCol[iLamp * 4 + 1] = 0.95;
      gCol[iLamp * 4 + 2] = 0.7;
      gCol[iLamp * 4 + 3] = 0.3 + g * 1.2;
      gSize[iLamp] = 3 + g * 4;
      // fireflies (night only)
      for (let i = 0; i < nFly; i++) {
        const f = fly[i];
        const j = nL + 3 + i;
        const a = t * f.sp + f.ph;
        gPos[j * 3] = f.hx + Math.sin(a) * f.r + Math.sin(a * 2.3) * 0.6;
        gPos[j * 3 + 1] = f.hy + Math.sin(a * 1.7) * 0.5 + 0.4;
        gPos[j * 3 + 2] = f.hz + Math.cos(a * 0.8) * f.r;
        const blink = Math.max(0, Math.sin(t * 2.2 + f.ph * 3));
        gCol[j * 4] = 0.75;
        gCol[j * 4 + 1] = 1.0;
        gCol[j * 4 + 2] = 0.55;
        gCol[j * 4 + 3] = Math.max(0, g - 0.35) * blink * 1.6;
        gSize[j] = 0.45;
      }
      // sparks rising off the bonfire
      for (let i = 0; i < nSpark; i++) {
        const s = spark[i];
        const j = nL + 3 + nFly + i;
        const age = (t * s.sp + s.t0) % 2.2;
        gPos[j * 3] = VILLAGE_FIRE.x - X0 + Math.sin(s.a + age) * (s.r + age * 0.3);
        gPos[j * 3 + 1] = fireY + age * 1.6;
        gPos[j * 3 + 2] = VILLAGE_FIRE.z - Z0 + Math.cos(s.a + age) * (s.r + age * 0.3);
        gCol[j * 4] = 1;
        gCol[j * 4 + 1] = 0.7;
        gCol[j * 4 + 2] = 0.3;
        gCol[j * 4 + 3] = o.fire * (1 - age / 2.2) * (0.6 + g);
        gSize[j] = 0.3;
      }
      gGeo.attributes.position.needsUpdate = true;
      gGeo.attributes.aCol.needsUpdate = true;
      gGeo.attributes.aSize.needsUpdate = true;
      // smoke puffs: rise, drift downwind, swell and fade
      for (let e = 0; e < emit.length; e++) {
        const em = emit[e];
        const life = em.big ? 5.5 : 4.5;
        const strength = em.big ? 0.35 + o.oven * 0.65 : 0.5;
        for (let k = 0; k < PUFFS; k++) {
          const j = e * PUFFS + k;
          const age = (t + (k / PUFFS) * life + e * 0.37) % life;
          const u = age / life;
          const rise = age * (em.big ? 1.1 : 0.8);
          sPos[j * 3] = em.x - X0 + wind.x * age * 0.6 * u + Math.sin(age * 1.3 + e) * 0.2;
          sPos[j * 3 + 1] = em.y + rise;
          sPos[j * 3 + 2] = em.z - Z0 + wind.z * age * 0.6 * u;
          const shadeK = 0.95 - g * 0.45;
          sCol[j * 4] = shadeK;
          sCol[j * 4 + 1] = shadeK;
          sCol[j * 4 + 2] = shadeK + g * 0.08;
          sCol[j * 4 + 3] = Math.min(1, u * 6) * (1 - u) * (em.big ? 0.75 : 0.5) * strength;
          sSize[j] = (em.big ? 1.1 : 0.8) + u * (em.big ? 2.6 : 1.8);
        }
      }
      sGeo.attributes.position.needsUpdate = true;
      sGeo.attributes.aCol.needsUpdate = true;
      sGeo.attributes.aSize.needsUpdate = true;
      void o.lighting;
    },
    dispose() {
      flames.geometry.dispose();
      (flames.material as THREE.Material).dispose();
      gGeo.dispose();
      (glow.material as THREE.Material).dispose();
      sGeo.dispose();
      (smoke.material as THREE.Material).dispose();
    },
  };
}
