// Sea spray in one draw call: water drops (thrown up, falling back), mist (a whale's blow billowing
// up and drifting off), and foam (spreading out on the surface and fading). A fixed pool, recycled;
// update is allocation-free.
import * as THREE from "three";
import { WATER_Y } from "../../registry/terrain";

export const DROP = 0;
export const MIST = 1;
export const FOAM = 2;

export interface Spray {
  points: THREE.Points;
  /** `n` particles of `kind` at (x, y, z): thrown up at ~`up` m/s, `spread` m/s sideways */
  emit(kind: number, x: number, y: number, z: number, n: number, up: number, spread: number, size: number, life: number): void;
  update(dt: number, glow: number): void;
  dispose(): void;
}

const drawSize = new THREE.Vector2();

export function buildSpray(n: number, seed = 4711): Spray {
  const pos = new Float32Array(n * 3).fill(0);
  const life = new Float32Array(n);
  const size = new Float32Array(n);
  const kind = new Float32Array(n);
  const vel = new Float32Array(n * 3);
  const age = new Float32Array(n);
  const span = new Float32Array(n);
  for (let i = 0; i < n; i++) pos[i * 3 + 1] = -500;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aLife", new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
  const uPx = { value: 800 };
  const uNight = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uPx, uNight },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aLife; attribute float aSize; attribute float aKind; uniform float uPx;
      varying float vA; varying float vK;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        float age = 1.0 - aLife;
        float s = aSize;
        vK = aKind;
        if ( aKind < 0.5 ) {
          vA = smoothstep( 0.0, 0.3, aLife ) * 0.95;
        } else if ( aKind < 1.5 ) {
          s *= 0.4 + age * 2.6; // a blow billows out as it rises
          vA = smoothstep( 0.0, 0.75, aLife ) * smoothstep( 1.0, 0.94, aLife ) * 0.34;
        } else {
          s *= 0.6 + age * 1.1;
          vA = smoothstep( 0.0, 0.6, aLife ) * 0.5;
        }
        if ( aLife <= 0.0 ) { vA = 0.0; s = 0.0; }
        gl_PointSize = min( 256.0, s * projectionMatrix[1][1] * uPx * 0.5 / max( 0.5, -mvPosition.z ) );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uNight; varying float vA; varying float vK;
      void main() {
        float d = length( gl_PointCoord - 0.5 ) * 2.0;
        if ( d > 1.0 ) discard;
        float a = vK < 0.5 ? smoothstep( 1.0, 0.3, d ) : vK < 1.5 ? pow( 1.0 - d, 1.5 ) : pow( 1.0 - d, 1.2 );
        // (moonlit at twilight: a soft pale blue, not a glowing white)
        vec3 c = mix( vec3( 0.97, 0.99, 1.0 ), vec3( 0.3, 0.4, 0.62 ), uNight );
        if ( vK < 0.5 ) c *= 0.92 + 0.08 * ( 1.0 - d );
        gl_FragColor = vec4( c, a * vA );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.name = "sea-spray";
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.onBeforeRender = ((renderer: THREE.WebGLRenderer) => {
    renderer.getDrawingBufferSize(drawSize);
    uPx.value = drawSize.y;
  }) as unknown as THREE.Object3D["onBeforeRender"];
  let next = 0;
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  let dirty = true;
  return {
    points,
    emit(k, x, y, z, count, up, spread, sz, lf) {
      for (let c = 0; c < count; c++) {
        const i = next;
        next = (next + 1) % n;
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd());
        pos[i * 3] = x + Math.sin(a) * r * spread * 0.12;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z + Math.cos(a) * r * spread * 0.12;
        vel[i * 3] = Math.sin(a) * r * spread;
        vel[i * 3 + 1] = k === FOAM ? 0 : up * (0.55 + rnd() * 0.6);
        vel[i * 3 + 2] = Math.cos(a) * r * spread;
        span[i] = lf * (0.7 + rnd() * 0.6);
        age[i] = 0;
        life[i] = 1;
        size[i] = sz * (0.6 + rnd() * 0.8);
        kind[i] = k;
      }
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aKind.needsUpdate = true;
      dirty = true;
    },
    update(dt, glow) {
      uNight.value = glow;
      if (!dirty) return;
      let alive = 0;
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) continue;
        age[i] += dt;
        const l = 1 - age[i] / span[i];
        const j = i * 3;
        const k = kind[i];
        if (k === DROP) {
          vel[j + 1] -= 11 * dt;
          vel[j] *= 1 - dt * 0.3;
          vel[j + 2] *= 1 - dt * 0.3;
        } else if (k === MIST) {
          // the blow slows, spreads and drifts downwind
          const drag = 1 - Math.min(1, dt * 1.15);
          vel[j] = vel[j] * drag + dt * 0.7;
          vel[j + 1] = vel[j + 1] * drag + dt * 0.25;
          vel[j + 2] = vel[j + 2] * drag + dt * 0.4;
        } else {
          const drag = 1 - Math.min(1, dt * 0.9);
          vel[j] *= drag;
          vel[j + 2] *= drag;
          pos[j + 1] = WATER_Y + 0.12;
        }
        pos[j] += vel[j] * dt;
        pos[j + 1] += vel[j + 1] * dt;
        pos[j + 2] += vel[j + 2] * dt;
        if (l <= 0 || (k === DROP && pos[j + 1] < WATER_Y - 0.2 && vel[j + 1] < 0)) {
          life[i] = 0;
          pos[j + 1] = -500;
        } else {
          life[i] = l;
          alive++;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
      dirty = alive > 0;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
