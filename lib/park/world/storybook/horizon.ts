// The painted misty horizon: layered silhouettes of forested ridges far out beyond the coast,
// like the painted backdrop of a model railway. Four rings (one draw call) with a tree-line top
// (./plan.ts treeLine), nearer = greener, farther = paler and greyer, their feet melting into the
// haze. They travel with the focus, so wherever you sail the horizon stays put — backdrop only,
// never somewhere you can reach. No scene fog (they paint their own), drawn early, behind everything.
import * as THREE from "three";
import { RIDGES, treeLine, type RidgeLayer } from "./plan";

export interface Horizon {
  mesh: THREE.Mesh;
  update(focus: THREE.Vector3, fog: THREE.Color | null, glow: number): void;
  dispose(): void;
}

/** the ridge colours by day (nearest first) and the mist they fade into */
const DAY_RIDGE = ["#4f8a52", "#74a075", "#98b89c", "#b8cbbd"].map((h) => new THREE.Color(h));
const DAY_MIST = new THREE.Color("#dfe9e2");
const DUSK_RIDGE = ["#2c2d5c", "#3b3a6e", "#4e4a80", "#655d93"].map((h) => new THREE.Color(h));

function ringGeometry(L: RidgeLayer, layer: number, segs: number, pos: number[], att: number[]) {
  const bottom = -12;
  const top = treeLine(L, layer, segs);
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    const x0 = Math.sin(a0) * L.dist;
    const z0 = Math.cos(a0) * L.dist;
    const x1 = Math.sin(a1) * L.dist;
    const z1 = Math.cos(a1) * L.dist;
    const y0 = top[k];
    const y1 = top[k + 1];
    pos.push(x0, bottom, z0, x1, bottom, z1, x0, y0, z0, x0, y0, z0, x1, bottom, z1, x1, y1, z1);
    // aRidge = (layer, the tree line's height in this column)
    att.push(layer, y0, layer, y1, layer, y0, layer, y0, layer, y1, layer, y1);
  }
}

export function buildHorizon(opts: { lowQuality?: boolean } = {}): Horizon {
  const segs = opts.lowQuality ? 900 : 1500;
  const pos: number[] = [];
  const att: number[] = [];
  // nearest ring first: it fills the depth buffer first, so the rings behind it are cheap
  RIDGES.forEach((L, i) => ringGeometry(L, i, segs, pos, att));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aRidge", new THREE.Float32BufferAttribute(att, 2));
  geo.computeBoundingSphere();
  const uniforms = {
    uRidge: { value: DAY_RIDGE.map((c) => c.clone()) },
    uMist: { value: DAY_MIST.clone() },
  };
  const mat = new THREE.ShaderMaterial({
    fog: false,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec2 aRidge;
      varying float vLayer; varying float vY; varying float vTop; varying vec3 vW;
      void main() {
        vLayer = aRidge.x;
        vTop = aRidge.y;
        vY = position.y;
        vW = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uRidge[4]; uniform vec3 uMist;
      varying float vLayer; varying float vY; varying float vTop; varying vec3 vW;
      float h1(float n) { return fract(sin(n * 91.345) * 47453.21); }
      void main() {
        int li = int(vLayer + 0.5);
        vec3 ridge = uRidge[0];
        if (li == 1) ridge = uRidge[1];
        else if (li == 2) ridge = uRidge[2];
        else if (li == 3) ridge = uRidge[3];
        // painted tree clumps: faint lighter / darker columns across the face
        float ang = atan(vW.x, vW.z) * 240.0;
        vec3 col = ridge * (1.0 + h1(floor(ang)) * 0.06 - 0.03);
        // sunlit crowns along the top, a shadowy band just below them (the painted tree line)
        float below = vTop - vY;
        col *= 1.0 + 0.1 * (1.0 - smoothstep(0.0, 2.2, below)) - 0.07 * smoothstep(2.0, 4.0, below) * (1.0 - smoothstep(6.0, 16.0, below));
        // the feet of each ridge melt into the mist (valley haze)
        float mist = 1.0 - smoothstep(-2.0, 10.0 + vLayer * 5.0, vY);
        col = mix(col, uMist, mist * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "storybook-horizon";
  // straight after the sky dome, before the world: it writes depth, so everything nearer covers it
  mesh.renderOrder = -9;
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = false;
  const mistNow = new THREE.Color();
  return {
    mesh,
    update(focus, fog, glow) {
      mesh.position.set(focus.x, 0, focus.z);
      // mist: our soft green-grey by day, leaning to the scene's fog (golden hour, twilight) as it glows
      mistNow.copy(DAY_MIST).lerp(fog ?? DAY_MIST, 0.2 + glow * 0.65);
      uniforms.uMist.value.copy(mistNow);
      for (let i = 0; i < 4; i++) {
        const c = uniforms.uRidge.value[i];
        c.copy(DAY_RIDGE[i]).lerp(DUSK_RIDGE[i], glow);
        // farther ridges sit deeper in the haze
        c.lerp(mistNow, 0.08 + i * 0.1);
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
