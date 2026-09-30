// Underwater light & particles (all ShaderMaterials, fog-aware, allocation-free per frame):
//   jellyMaterial     translucent glowing jellyfish (pulse + trailing tentacles in the shader)
//   buildGlowSprites  soft halos (pearls, jellies, treasure, runes) — per-point colour + size
//   buildSnow         marine snow / plankton in a box that wraps round the kid (glows at twilight)
//   buildBubbles      bubble streams rising from vents (animated entirely on the GPU)
//   buildRays         god rays slanting down from the surface, recycled round the kid
//   buildCeiling      the underside of the sea surface: Snell's window, ripples, sparkle
//   buildFloorCaustics a patch draped on the sea floor round the kid with dancing caustics
import * as THREE from "three";
import { seaFloorY } from "../sea/wander";
import { CAUSTIC_GLSL, FOG_K_GLSL, WATER_Y_GLSL, fxUniforms, type UwUniforms } from "./shaders";
import { rngOf } from "../fantasy/noise";

const OUT_GLSL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// ── jellyfish ──
export function jellyMaterial(U: UwUniforms, k: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
    uniforms: fxUniforms(U, { uJellyK: k }),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec2 aJ;
      uniform float uTime;
      varying float vPart; varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vAng; varying float vNear;
      void main() {
        vec3 org = instanceMatrix[3].xyz;
        float ph = org.x * 0.37 + org.z * 0.23;
        float pulse = sin( uTime * 1.9 + ph );
        vec3 p = position;
        if ( aJ.x < 0.5 ) {
          float rim = aJ.y;
          p.xz *= 1.0 - pulse * 0.14 * rim * rim;
          p.y *= 1.0 + pulse * 0.09;
        } else {
          float u = aJ.y;
          p.x += sin( uTime * 1.2 + ph + u * 3.2 ) * u * u * 0.45;
          p.z += cos( uTime * 1.05 + ph * 1.3 + u * 2.7 ) * u * u * 0.45;
          p.xz *= 1.0 - pulse * 0.1 * ( 1.0 - u );
          p.y += pulse * 0.08 * ( 1.0 - u ) - max( 0.0, pulse ) * u * 0.25;
        }
        vec4 wp = modelMatrix * instanceMatrix * vec4( p, 1.0 );
        vec4 mvPosition = viewMatrix * wp;
        vN = normalize( mat3( viewMatrix ) * mat3( modelMatrix ) * mat3( instanceMatrix ) * normal );
        vV = normalize( -mvPosition.xyz );
        vPart = aJ.x; vAlong = aJ.y;
        vAng = atan( position.x, position.z );
        // fade out when the camera is right next to (or inside) a jelly
        vNear = smoothstep( 1.2, 5.0, -mvPosition.z );
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3( 1.0 );
        #endif
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uJellyK; uniform float uTime;
      varying float vPart; varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vAng; varying float vNear;
      ${FOG_K_GLSL}
      void main() {
        float fres = 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) );
        vec3 c; float a;
        if ( vPart < 0.5 ) {
          float canals = smoothstep( 0.8, 1.0, cos( vAng * 8.0 ) ) * smoothstep( 0.05, 0.4, vAlong );
          float rim = smoothstep( 0.82, 1.0, vAlong );
          float spots = smoothstep( 0.9, 1.0, cos( vAng * 16.0 ) ) * rim;
          c = vCol * ( 0.35 + fres * fres * 0.95 + canals * 0.55 + rim * 0.55 ) + vec3( 1.0 ) * spots * 0.4;
          a = 0.16 + fres * 0.5 + canals * 0.2 + rim * 0.3;
        } else if ( vPart < 1.5 ) {
          c = vCol * 1.1;
          a = ( 1.0 - vAlong ) * 0.55;
        } else {
          c = mix( vCol, vec3( 1.0 ), 0.3 ) * 0.9;
          a = ( 1.0 - vAlong * 0.8 ) * 0.35;
        }
        c *= uJellyK * ( 1.0 - uwFog() ) * vNear;
        gl_FragColor = vec4( c, clamp( a, 0.0, 1.0 ) );
        ${OUT_GLSL}
      }`,
  });
}

// ── soft glow sprites ──
export interface GlowSprites {
  points: THREE.Points;
  /** write sprite i (position, colour already HDR-scaled, size in metres) */
  set(i: number, x: number, y: number, z: number, r: number, g: number, b: number, size: number): void;
  commit(): void;
  dispose(): void;
}

const drawSize = new THREE.Vector2();
function pixelScale(u: { value: number }) {
  return (renderer: THREE.WebGLRenderer) => {
    renderer.getDrawingBufferSize(drawSize);
    u.value = drawSize.y;
  };
}

export function buildGlowSprites(U: UwUniforms, n: number): GlowSprites {
  const pos = new Float32Array(n * 3);
  const colr = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colr, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const uPx = { value: 800 };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    uniforms: fxUniforms(U, { uPx }),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 aColor; attribute float aSize; uniform float uPx; uniform float uTime;
      varying vec3 vC;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        vC = aColor * ( 0.85 + 0.15 * sin( uTime * 2.3 + position.x * 3.1 + position.z ) ) * smoothstep( 1.0, 4.0, -mvPosition.z );
        gl_PointSize = aSize * projectionMatrix[1][1] * uPx * 0.5 / max( 0.5, -mvPosition.z );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying vec3 vC;
      ${FOG_K_GLSL}
      void main() {
        float d = length( gl_PointCoord - 0.5 ) * 2.0;
        if ( d > 1.0 ) discard;
        float a = pow( 1.0 - d, 2.2 ) * 0.8 + pow( max( 0.0, 1.0 - d * 3.0 ), 2.0 ) * 0.5;
        gl_FragColor = vec4( vC * a * ( 1.0 - uwFog() ), 1.0 );
        ${OUT_GLSL}
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.onBeforeRender = pixelScale(uPx) as unknown as THREE.Object3D["onBeforeRender"];
  return {
    points,
    set(i, x, y, z, r, g, b, s) {
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      colr[i * 3] = r;
      colr[i * 3 + 1] = g;
      colr[i * 3 + 2] = b;
      size[i] = s;
    },
    commit() {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

// ── marine snow / plankton ──
export function buildSnow(U: UwUniforms, n: number, box: number, center: { value: THREE.Vector3 }): THREE.Points {
  const r = rngOf(515);
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = r() * box;
    pos[i * 3 + 1] = r() * box;
    pos[i * 3 + 2] = r() * box;
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const uPx = { value: 800 };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    uniforms: fxUniforms(U, { uPx, uCenter: center, uBox: { value: box } }),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aSeed; uniform float uPx; uniform float uTime; uniform vec3 uCenter; uniform float uBox; uniform float uGlow;
      varying float vA; varying float vS;
      void main() {
        vec3 drift = vec3( sin( uTime * 0.13 + aSeed * 6.0 ) * 0.4 + uTime * 0.08, -uTime * ( 0.05 + aSeed * 0.06 ), cos( uTime * 0.11 + aSeed * 4.0 ) * 0.4 );
        vec3 lo = uCenter - uBox * 0.5;
        vec3 w = lo + mod( position + drift - lo, uBox );
        vec3 rel = abs( w - uCenter ) / ( uBox * 0.5 );
        float edge = 1.0 - smoothstep( 0.7, 1.0, max( rel.x, max( rel.y, rel.z ) ) );
        float under = smoothstep( ${WATER_Y_GLSL} - 0.2, ${WATER_Y_GLSL} - 1.2, w.y );
        vA = edge * under;
        vS = aSeed;
        vec4 mvPosition = viewMatrix * vec4( w, 1.0 );
        float sz = mix( 0.035, 0.09, aSeed ) * ( 1.0 + uGlow * step( 0.75, aSeed ) * 1.5 );
        gl_PointSize = max( 1.0, sz * projectionMatrix[1][1] * uPx * 0.5 / max( 0.3, -mvPosition.z ) );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uGlow; uniform float uTime;
      varying float vA; varying float vS;
      ${FOG_K_GLSL}
      void main() {
        float d = length( gl_PointCoord - 0.5 ) * 2.0;
        if ( d > 1.0 ) discard;
        float a = pow( 1.0 - d, 1.6 );
        vec3 day = vec3( 0.75, 0.9, 0.85 ) * 0.35;
        float plankton = step( 0.75, vS ) * ( 0.6 + 0.4 * sin( uTime * 3.0 + vS * 40.0 ) );
        vec3 dusk = mix( vec3( 0.25, 0.4, 0.5 ) * 0.3, vec3( 0.3, 1.0, 0.9 ) * 1.3, plankton );
        vec3 c = mix( day, dusk, uGlow ) * a * vA * ( 1.0 - uwFog() * 0.8 );
        gl_FragColor = vec4( c, 1.0 );
        ${OUT_GLSL}
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  pts.onBeforeRender = pixelScale(uPx) as unknown as THREE.Object3D["onBeforeRender"];
  return pts;
}

// ── bubbles rising from vents ──
export function buildBubbles(U: UwUniforms, vents: { x: number; y: number; z: number }[], per: number): THREE.Points {
  const r = rngOf(626);
  const n = vents.length * per;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 2);
  vents.forEach((v, vi) => {
    for (let k = 0; k < per; k++) {
      const i = vi * per + k;
      pos.set([v.x + (r() - 0.5) * 0.3, v.y, v.z + (r() - 0.5) * 0.3], i * 3);
      seed[i * 2] = r();
      seed[i * 2 + 1] = 0.5 + r() * 0.8;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 2));
  const uPx = { value: 800 };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: fxUniforms(U, { uPx }),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec2 aSeed; uniform float uPx; uniform float uTime;
      varying float vA;
      void main() {
        float h = ${WATER_Y_GLSL} - position.y;
        float speed = 0.9 * aSeed.y;
        float life = fract( uTime * speed / max( 1.0, h ) + aSeed.x );
        vec3 w = position;
        w.y += life * h;
        w.x += sin( uTime * 3.0 + aSeed.x * 30.0 + life * 8.0 ) * 0.12 * life;
        w.z += cos( uTime * 2.6 + aSeed.x * 20.0 + life * 7.0 ) * 0.12 * life;
        vA = smoothstep( 0.0, 0.05, life ) * smoothstep( 1.0, 0.94, life );
        vec4 mvPosition = viewMatrix * vec4( w, 1.0 );
        float sz = ( 0.06 + 0.12 * aSeed.x ) * ( 0.7 + life * 0.8 );
        gl_PointSize = max( 1.0, sz * projectionMatrix[1][1] * uPx * 0.5 / max( 0.3, -mvPosition.z ) );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uGlow;
      varying float vA;
      ${FOG_K_GLSL}
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float d = length( q ) * 2.0;
        if ( d > 1.0 ) discard;
        float rim = smoothstep( 0.6, 0.95, d ) * smoothstep( 1.0, 0.92, d );
        float glint = smoothstep( 0.28, 0.0, length( q - vec2( -0.16, -0.16 ) ) );
        float a = ( rim * 0.8 + glint * 0.9 + 0.08 ) * vA * ( 1.0 - uwFog() );
        vec3 c = mix( vec3( 0.85, 0.97, 1.0 ), vec3( 0.6, 0.9, 1.1 ), uGlow );
        gl_FragColor = vec4( c, a );
        ${OUT_GLSL}
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  pts.onBeforeRender = pixelScale(uPx) as unknown as THREE.Object3D["onBeforeRender"];
  return pts;
}

// ── god rays ──
export interface Rays {
  mesh: THREE.InstancedMesh;
  update(kid: THREE.Vector3): void;
  dispose(): void;
}

export function buildRays(U: UwUniforms, n: number, strength: { value: number }): Rays {
  const geo = new THREE.CylinderGeometry(0.6, 1, 1, 12, 1, true);
  geo.translate(0, -0.5, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
    uniforms: fxUniforms(U, { uRayK: strength }),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying float vEdge; varying float vY; varying float vSeed; varying float vNear;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
        vec4 mvPosition = viewMatrix * wp;
        // (a ray right on top of the camera would wash the whole view: fade what's close, and the
        // whole ray while the camera is in or beside its column)
        vec3 axO = ( modelMatrix * vec4( instanceMatrix[3].xyz, 1.0 ) ).xyz;
        vec3 axD = normalize( mat3( modelMatrix ) * instanceMatrix[1].xyz );
        float rad = length( instanceMatrix[0].xyz );
        vec3 toCam = cameraPosition - axO;
        float axDist = length( toCam - axD * dot( toCam, axD ) );
        vNear = smoothstep( 2.5, 12.0, -mvPosition.z ) * smoothstep( rad * 1.1, rad * 2.6 + 2.0, axDist );
        vec3 nv = normalize( mat3( viewMatrix ) * mat3( modelMatrix ) * mat3( instanceMatrix ) * normal );
        vEdge = abs( dot( nv, normalize( -mvPosition.xyz ) ) );
        vY = -position.y;
        vSeed = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.29;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uGlow; uniform float uRayK;
      varying float vEdge; varying float vY; varying float vSeed; varying float vNear;
      ${FOG_K_GLSL}
      void main() {
        float soft = pow( vEdge, 3.0 );
        float ends = smoothstep( 0.0, 0.12, vY ) * pow( 1.0 - vY, 1.6 );
        float flick = 0.6 + 0.4 * sin( uTime * 0.7 + vSeed * 9.0 ) * sin( uTime * 0.31 + vSeed * 3.0 );
        vec3 day = vec3( 0.8, 1.0, 0.95 ) * 0.26;
        vec3 dusk = vec3( 0.4, 0.6, 1.0 ) * 0.08;
        vec3 c = mix( day, dusk, uGlow ) * soft * ends * flick * uRayK * ( 1.0 - uwFog() * 0.85 ) * vNear;
        gl_FragColor = vec4( c, 1.0 );
        ${OUT_GLSL}
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  const r = rngOf(8080);
  const rays = Array.from({ length: n }, () => ({ ox: 0, oz: 0, w: 1.2 + r() * 2.4, len: 18, seed: r(), placed: false }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.28, 0.9, 0.1, "YXZ"));
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const R = 42;
  let seedK = 1;
  const rnd = () => ((seedK = (seedK * 16807) % 2147483647) / 2147483647);
  return {
    mesh,
    update(kid) {
      let dirty = false;
      for (let i = 0; i < n; i++) {
        const ray = rays[i];
        const dx = ray.ox - kid.x;
        const dz = ray.oz - kid.z;
        if (!ray.placed || dx * dx + dz * dz > R * R) {
          // drop it somewhere round the kid (mostly ahead of wherever they're going, within the fog)
          const a = rnd() * Math.PI * 2;
          const d = ray.placed ? R * (0.6 + rnd() * 0.35) : Math.sqrt(rnd()) * R;
          ray.ox = kid.x + Math.sin(a) * d;
          ray.oz = kid.z + Math.cos(a) * d;
          const floor = seaFloorY(ray.ox, ray.oz);
          ray.len = Math.min(26, Math.max(3, -0.25 - floor + 3));
          ray.placed = true;
          m.compose(v.set(ray.ox, -0.3, ray.oz), q, s.set(ray.w, ray.len, ray.w));
          mesh.setMatrixAt(i, m);
          dirty = true;
        }
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

// ── the underside of the surface ──
export function buildCeiling(U: UwUniforms, radius: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 48, 0, Math.PI * 2);
  geo.rotateX(Math.PI / 2); // faces down: invisible from above
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: fxUniforms(U),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uGlow; uniform sampler2D uCausticTex;
      varying vec3 vW;
      ${CAUSTIC_GLSL}
      void main() {
        vec3 toEye = cameraPosition - vW;
        float cosA = clamp( -toEye.y / length( toEye ), 0.0, 1.0 );
        // Snell's window: bright sky straight up, a mirror of the deep blue at grazing angles
        float window = smoothstep( 0.55, 0.8, cosA );
        vec2 rp = vW.xz * 0.6 + vec2( uTime * 0.3, -uTime * 0.2 );
        float rip = uwCaustic( vW.xz * 2.2 ) ;
        vec3 sky = mix( vec3( 0.75, 0.97, 1.0 ), vec3( 0.2, 0.25, 0.55 ), uGlow );
        vec3 deep = mix( vec3( 0.2, 0.62, 0.72 ), vec3( 0.05, 0.14, 0.32 ), uGlow );
        vec3 c = mix( deep, sky, window ) + rip * mix( vec3( 0.35, 0.5, 0.5 ), vec3( 0.12, 0.3, 0.45 ), uGlow ) * ( 0.35 + window );
        // sun glints dancing on the underside
        float glint = step( 0.992, fract( sin( dot( floor( rp * 3.0 ), vec2( 12.9, 78.2 ) ) + floor( uTime * 2.0 ) ) * 43758.5 ) );
        c += glint * window * vec3( 1.2 ) * ( 1.0 - uGlow );
        gl_FragColor = vec4( c, 0.92 );
        #include <fog_fragment>
        ${OUT_GLSL}
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

// ── caustics draped on the sea floor round the kid ──
export interface FloorCaustics {
  mesh: THREE.Mesh;
  /** `reach` = how far out to cover (the fog's far distance, so the edge is never seen) */
  update(kid: THREE.Vector3, reach: number): void;
  dispose(): void;
}

export function buildFloorCaustics(U: UwUniforms, cells: number): FloorCaustics {
  const n = cells + 1;
  const pos = new Float32Array(n * n * 3);
  const idx: number[] = [];
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const a = j * n + i;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  let cell = 2;
  let half = (cells * cell) / 2;
  const uCentre = { value: new THREE.Vector2() };
  const uHalf = { value: half };
  // multiplies the floor: absorbs light with depth (so bright sand turns sea-teal) and brightens it
  // where caustics dance. Fades to x1 at its edge and into the fog.
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    fog: true,
    uniforms: fxUniforms(U, { uCentre, uHalf }),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() {
        vW = position;
        vec4 mvPosition = viewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uCausticK; uniform sampler2D uCausticTex; uniform vec2 uCentre; uniform float uHalf; uniform float uGlow;
      varying vec3 vW;
      ${CAUSTIC_GLSL}
      ${FOG_K_GLSL}
      void main() {
        float under = smoothstep( ${WATER_Y_GLSL} - 0.1, ${WATER_Y_GLSL} - 0.9, vW.y );
        float deep = smoothstep( -1.0, -20.0, vW.y );
        float depthK = mix( 1.0, 0.45, smoothstep( -2.0, -22.0, vW.y ) );
        float edge = 1.0 - smoothstep( uHalf * 0.8, uHalf * 0.99, length( vW.xz - uCentre ) );
        float k = under * edge * ( 1.0 - uwFog() );
        // (clear tropical water: the sand stays sandy, turning a little aqua with depth)
        vec3 absorb = vec3( 1.16, 1.07, 0.84 ) * mix( vec3( 1.0 ), vec3( 0.74, 0.9, 1.0 ), deep ) * mix( 1.0, 0.8, uGlow );
        float c = uwCaustic( vW.xz ) * uCausticK * depthK;
        vec3 m = absorb * ( 1.0 + c * vec3( 1.1, 1.35, 1.4 ) );
        gl_FragColor = vec4( mix( vec3( 1.0 ), m, k ), 1.0 );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  let cx = Infinity;
  let cz = Infinity;
  return {
    mesh,
    update(kid, reach) {
      // size the patch to the view distance (in steps, so it isn't rebuilt every frame)
      const want = Math.min(4, Math.max(1, Math.ceil(((reach * 1.12) / (cells / 2)) * 4) / 4));
      const resize = want !== cell;
      if (resize) {
        cell = want;
        half = (cells * cell) / 2;
        uHalf.value = half;
      }
      const sx = Math.round(kid.x / (cell * 2)) * cell * 2;
      const sz = Math.round(kid.z / (cell * 2)) * cell * 2;
      if (!resize && sx === cx && sz === cz) return;
      cx = sx;
      cz = sz;
      uCentre.value.set(sx, sz);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = sx - half + i * cell;
          const z = sz - half + j * cell;
          const k = (j * n + i) * 3;
          pos[k] = x;
          pos[k + 1] = seaFloorY(x, z) + 0.05;
          pos[k + 2] = z;
        }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
