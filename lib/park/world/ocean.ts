// The sea around Cucaino Park: a sandy beach ring, a shimmering ocean that glows with plankton
// at twilight, and majestic sea life — glowing jellyfish (some even drift through the air over
// the Glow Forest), breaching whales with glowing markings, gliding manta rays, leaping dolphin
// pods and turtles. All procedural and cheap: one mesh per creature part, animated by matrices.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeSparkTexture } from "./atmosphere";
import { getToonRamp } from "../assets/loader";
import { ISLAND_R, coastR } from "../registry/island";
import { groundY } from "../registry/terrain";

export const BEACH_IN = ISLAND_R; // where grass meets the sand (plus the coast wobble)
export const SHORE_R = ISLAND_R + 14; // where the sand meets the water

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
  update(dt: number, t: number, glow: number, fog: THREE.Fog): void;
  dispose(): void;
}

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
    const a = rnd() * Math.PI * 2;
    const rad = (BEACH_IN + 2 + rnd() * (SHORE_R - BEACH_IN - 1)) * (coastR(a) / ISLAND_R);
    mm.compose(new THREE.Vector3(Math.sin(a) * rad, groundY(Math.sin(a) * rad, Math.cos(a) * rad) + 0.02, Math.cos(a) * rad), qq.setFromAxisAngle(up, rnd() * 6), new THREE.Vector3(1, 0.5, 1.3).multiplyScalar(0.6 + rnd() * 0.8));
    shells.setMatrixAt(i, mm);
    shells.setColorAt(i, new THREE.Color(shellCols[i % shellCols.length]));
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = (BEACH_IN + 3 + rnd() * (SHORE_R - BEACH_IN - 2)) * (coastR(a) / ISLAND_R);
    mm.compose(new THREE.Vector3(Math.sin(a) * rad, groundY(Math.sin(a) * rad, Math.cos(a) * rad) + 0.05, Math.cos(a) * rad), qq.setFromAxisAngle(up, rnd() * 6), new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.6));
    stars.setMatrixAt(i, mm);
    stars.setColorAt(i, new THREE.Color(starCols[i % starCols.length]));
  }

  // ── the ocean: gentle waves, turquoise shallows -> deep blue, foam at the shore, glowing plankton at night ──
  const waterMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uGlow: { value: 0 },
        uShore: { value: SHORE_R },
        uFogColor: { value: new THREE.Color() },
        uFogNear: { value: 150 },
        uFogFar: { value: 430 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; varying float vR; varying vec2 vXZ; varying float vWave; varying float vDist;
        void main() {
          vec3 p = position;
          vec4 w = modelMatrix * vec4(p, 1.0);
          float r = length(w.xz);
          float wave = sin(w.x * 0.08 + uTime * 0.9) * 0.35 + sin(w.z * 0.11 - uTime * 1.1) * 0.28 + sin((w.x + w.z) * 0.05 + uTime * 0.6) * 0.4;
          float shoreDamp = smoothstep(${SHORE_R.toFixed(1)}, ${(SHORE_R + 25).toFixed(1)}, r);
          w.y += wave * shoreDamp - 0.25;
          vWave = wave; vR = r; vXZ = w.xz;
          vec4 mv = viewMatrix * w;
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uGlow; uniform float uShore; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
        varying float vR; varying vec2 vXZ; varying float vWave; varying float vDist;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float ang = atan(vXZ.x, vXZ.y);
          float shore = uShore * (1.0 + (sin(ang * 4.0 + 0.5) * 5.0 + sin(ang * 9.0 + 2.0) * 2.5) / ${ISLAND_R.toFixed(1)});
          float depth = smoothstep(shore, shore + 90.0, vR);
          vec3 shallow = mix(vec3(0.45, 0.93, 0.93), vec3(0.16, 0.52, 0.72), uGlow);
          vec3 deep = mix(vec3(0.24, 0.55, 0.95), vec3(0.05, 0.08, 0.3), uGlow);
          vec3 col = mix(shallow, deep, depth);
          // sparkles on the wave tops (sun glints by day, starlight by night)
          // round glints: a random dot in some cells, twinkling
          vec2 q = vXZ * 0.9;
          vec2 cell = floor(q);
          float g = hash(cell + floor(uTime * 1.5));
          float dotG = 1.0 - smoothstep(0.08, 0.22, length(fract(q) - 0.5));
          col += step(0.97, g) * dotG * smoothstep(0.1, 0.7, vWave) * vec3(1.0) * 0.7;
          // foam lapping at the shore
          float foam = smoothstep(shore + 3.5 + sin(uTime * 1.3 + vXZ.x * 0.2) * 1.2, shore, vR);
          col = mix(col, vec3(1.0, 0.98, 0.96), foam * 0.85);
          // glowing plankton near the shore and on crests at twilight
          vec2 pq = vXZ * 1.6;
          float pk = step(0.9, hash(floor(pq) + floor(uTime * 0.5))) * (1.0 - smoothstep(0.05, 0.3, length(fract(pq) - 0.5)));
          float near = 1.0 - smoothstep(shore + 2.0, shore + 45.0, vR);
          col += uGlow * pk * (0.4 + near) * vec3(0.3, 1.0, 0.95) * 0.7;
          float fog = smoothstep(uFogNear, uFogFar, vDist);
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, 0.96);
        }`,
    }),
  );
  const water = add(new THREE.Mesh(track(wobbleToCoast(new THREE.RingGeometry(SHORE_R - 6, 600, low ? 120 : 200, low ? 24 : 40))), waterMat));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;

  // ── glowing jellyfish (in the sea, and drifting through the air above the Glow Forest) ──
  const bellGeo = track(jellyBellGeometry());
  const tentGeo = track(jellyTentacleGeometry());
  const jellyMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false }));
  const tentMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false }));
  const nSea = low ? 14 : 26;
  const nSky = low ? 6 : 12;
  const nJ = nSea + nSky;
  const bells = add(new THREE.InstancedMesh(bellGeo, jellyMat, nJ));
  const tents = add(new THREE.InstancedMesh(tentGeo, tentMat, nJ));
  const jellyCols = ["#7af7ff", "#ff8ae6", "#b99bff", "#9dffc9", "#ffd07a"];
  const jellies: { x: number; y: number; z: number; s: number; ph: number; sky: boolean; drift: number }[] = [];
  for (let i = 0; i < nJ; i++) {
    const sky = i >= nSea;
    const a = rnd() * Math.PI * 2;
    const rad = sky ? Math.sqrt(rnd()) * opts.skyJellies.radius : SHORE_R + 8 + rnd() * 70;
    jellies.push({
      x: (sky ? opts.skyJellies.x : 0) + Math.sin(a) * rad,
      y: sky ? 6 + rnd() * 7 : 0.6 + rnd() * 0.8,
      z: (sky ? opts.skyJellies.z : 0) + Math.cos(a) * rad,
      s: sky ? 0.8 + rnd() * 0.7 : 1.6 + rnd() * 1.8,
      ph: rnd() * 10,
      sky,
      drift: 0.2 + rnd() * 0.3,
    });
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

  // ── whales: slow and majestic, with glowing markings; now and then one breaches ──
  const whaleBody = track(whaleGeometry());
  const whaleSpots = track(whaleSpotsGeometry());
  const whaleMat = toon("#5a7bd6");
  const whaleGlowMat = track(new THREE.MeshBasicMaterial({ color: "#8ff7ff" }));
  const whales: { g: THREE.Group; a: number; rad: number; speed: number; breachAt: number; breachT: number; spout: number }[] = [];
  for (let i = 0; i < (low ? 2 : 3); i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(whaleBody, whaleMat), new THREE.Mesh(whaleSpots, whaleGlowMat));
    g.scale.setScalar(2.6 + i * 0.4);
    add(g);
    whales.push({ g, a: (i / 3) * Math.PI * 2, rad: SHORE_R + 60 + i * 28, speed: 0.018 + i * 0.004, breachAt: 8 + i * 9, breachT: -1, spout: 0 });
  }
  // spout + splash particles
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
      sp.set([x, y, z], i * 3);
      sv.set([(rnd() - 0.5) * spread, up * (0.6 + rnd() * 0.6), (rnd() - 0.5) * spread], i * 3);
      sl[i] = 1.2 + rnd() * 0.6;
    }
  };

  // ── manta rays gliding and hopping, dolphin pods leaping, turtles paddling ──
  const mantaGeo = track(mantaGeometry());
  const mantas = add(new THREE.InstancedMesh(mantaGeo, toon("#6a5ab8"), low ? 3 : 6));
  const mantaState = Array.from({ length: mantas.count }, (_, i) => ({ a: rnd() * 6.28, rad: SHORE_R + 24 + rnd() * 70, speed: 0.03 + rnd() * 0.02, ph: rnd() * 10, dir: i % 2 ? 1 : -1 }));
  const dolphinGeo = track(dolphinGeometry());
  const dolphins = add(new THREE.InstancedMesh(dolphinGeo, toon("#8fb6e8"), low ? 4 : 8));
  const pods = [
    { a: 1, rad: SHORE_R + 32, speed: 0.04 },
    { a: 4, rad: SHORE_R + 48, speed: -0.036 },
  ];
  const turtleGeo = track(turtleGeometry());
  const turtles = add(new THREE.InstancedMesh(turtleGeo, toon("#5fbf7f"), low ? 3 : 6));
  const turtleState = Array.from({ length: turtles.count }, () => ({ a: rnd() * 6.28, rad: SHORE_R + 12 + rnd() * 40, speed: (rnd() < 0.5 ? -1 : 1) * (0.008 + rnd() * 0.006), ph: rnd() * 10 }));

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const dayJelly = new THREE.Color("#ffffff");

  return {
    update(dt, t, glow, fog) {
      waterMat.uniforms.uTime.value = t;
      waterMat.uniforms.uGlow.value = glow;
      waterMat.uniforms.uFogColor.value.copy(fog.color);
      waterMat.uniforms.uFogNear.value = fog.near;
      waterMat.uniforms.uFogFar.value = fog.far;

      // jellies: pulse (squash/stretch), bob, drift
      jellies.forEach((j, i) => {
        const pulse = Math.sin(t * 2.2 + j.ph);
        const sy = j.s * (1 + pulse * 0.14);
        const sxz = j.s * (1 - pulse * 0.09);
        const x = j.x + Math.sin(t * 0.1 * j.drift + j.ph) * (j.sky ? 3 : 6);
        const z = j.z + Math.cos(t * 0.08 * j.drift + j.ph) * (j.sky ? 3 : 6);
        const y = j.y + Math.sin(t * 0.8 + j.ph) * (j.sky ? 0.9 : 0.25) + Math.max(0, pulse) * 0.2;
        tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(Math.sin(t * 0.7 + j.ph) * 0.12, 0, Math.cos(t * 0.6 + j.ph) * 0.12)), tmpS.set(sxz, sy, sxz));
        bells.setMatrixAt(i, tmpM);
        tmpM.compose(tmpV, tmpQ, tmpS.set(sxz, j.s * (1 - pulse * 0.1), sxz));
        tents.setMatrixAt(i, tmpM);
        jhp.set([x, y + 0.5 * j.s, z], i * 3);
      });
      bells.instanceMatrix.needsUpdate = true;
      tents.instanceMatrix.needsUpdate = true;
      jellyHaloGeo.attributes.position.needsUpdate = true;
      jellyMat.color.copy(dayJelly).multiplyScalar(0.85 + glow * 0.9);
      jellyMat.opacity = 0.62 + glow * 0.3;
      haloMat.opacity = 0.15 + glow * 0.75;
      haloMat.size = 6 + glow * 6;

      // whales swim a slow lap, occasionally breaching with a big splash + spout
      for (const w of whales) {
        w.a += w.speed * dt;
        w.breachAt -= dt;
        const x = Math.sin(w.a) * w.rad;
        const z = Math.cos(w.a) * w.rad;
        const heading = w.a + Math.PI / 2;
        let y = -0.9 + Math.sin(t * 0.4 + w.rad) * 0.25; // back just breaking the surface
        let pitch = 0;
        if (w.breachAt <= 0 && w.breachT < 0) {
          w.breachT = 0;
          w.breachAt = 22 + rnd() * 25;
        }
        if (w.breachT >= 0) {
          w.breachT += dt;
          const u = w.breachT / 3.2;
          y = -2 + Math.sin(Math.min(1, u) * Math.PI) * 9;
          pitch = -(0.9 - u * 1.8);
          if (w.breachT > 0.05 && w.breachT - dt <= 0.05) emit(x, 0.5, z, 26, 8, 6);
          if (w.breachT > 3.0 && w.breachT - dt <= 3.0) emit(x, 0.5, z, 40, 11, 9);
          if (u >= 1) w.breachT = -1;
        } else {
          w.spout -= dt;
          if (w.spout <= 0) {
            w.spout = 9 + rnd() * 8;
            emit(x, 1.6, z, 14, 10, 1.2);
          }
        }
        w.g.position.set(x, y, z);
        w.g.rotation.set(pitch, heading, Math.sin(t * 0.5 + w.rad) * 0.05, "YXZ");
      }
      whaleGlowMat.color.setRGB(0.55 + glow * 0.45, 0.95, 1).multiplyScalar(0.5 + glow * 0.6);

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

      // mantas glide in wide arcs, flapping, with a joyful hop now and then
      mantaState.forEach((m, i) => {
        m.a += m.speed * m.dir * dt;
        const hop = Math.max(0, Math.sin(t * 0.35 + m.ph) - 0.93) * 60;
        const x = Math.sin(m.a) * m.rad;
        const z = Math.cos(m.a) * m.rad;
        const flap = Math.sin(t * 3 + m.ph) * 0.15;
        tmpM.compose(tmpV.set(x, 0.2 + hop, z), tmpQ.setFromEuler(tmpE.set(-hop * 0.08, m.a + (m.dir > 0 ? Math.PI / 2 : -Math.PI / 2), flap)), tmpS.set(3, 3 * (1 + flap), 3));
        mantas.setMatrixAt(i, tmpM);
      });
      mantas.instanceMatrix.needsUpdate = true;

      // dolphin pods: each dolphin arcs out of the water one after another
      let di = 0;
      for (const p of pods) {
        p.a += p.speed * dt;
        for (let k = 0; k < dolphins.count / pods.length; k++, di++) {
          const a = p.a - k * 0.035 * Math.sign(p.speed);
          const x = Math.sin(a) * (p.rad + (k % 2) * 3);
          const z = Math.cos(a) * (p.rad + (k % 2) * 3);
          const phase = (t * 0.55 + k * 0.23) % 1;
          const jump = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) : 0;
          const y = -1.2 + jump * 4.5;
          const pitch = phase < 0.35 ? Math.cos((phase / 0.35) * Math.PI) * 0.9 : 0;
          if (phase < 0.35 && ((t * 0.55 + k * 0.23 - dt * 0.55) % 1) > phase + 0.5) emit(x, 0.3, z, 6, 5, 2);
          tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(-pitch, a + (p.speed > 0 ? Math.PI / 2 : -Math.PI / 2), 0, "YXZ")), tmpS.set(1.6, 1.6, 1.6));
          dolphins.setMatrixAt(di, tmpM);
        }
      }
      dolphins.instanceMatrix.needsUpdate = true;

      turtleState.forEach((s, i) => {
        s.a += s.speed * dt;
        const x = Math.sin(s.a) * s.rad;
        const z = Math.cos(s.a) * s.rad;
        tmpM.compose(tmpV.set(x, -0.15 + Math.sin(t + s.ph) * 0.08, z), tmpQ.setFromEuler(tmpE.set(0, s.a + (s.speed > 0 ? Math.PI / 2 : -Math.PI / 2), Math.sin(t * 1.5 + s.ph) * 0.06)), tmpS.set(1.4, 1.4, 1.4));
        turtles.setMatrixAt(i, tmpM);
      });
      turtles.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const o of added) scene.remove(o);
      for (const d of disposables) d.dispose();
    },
  };
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

function whaleGeometry() {
  const body = new THREE.SphereGeometry(1, 18, 12);
  body.scale(1.1, 0.9, 3.2);
  const head = new THREE.SphereGeometry(1, 14, 10);
  head.scale(1.05, 0.95, 1.3);
  head.translate(0, 0.05, 2.2);
  const tail = new THREE.ConeGeometry(0.55, 2.4, 10);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0.05, -3.8);
  const fluke = new THREE.SphereGeometry(1, 12, 6);
  fluke.scale(1.8, 0.12, 0.7);
  fluke.translate(0, 0.05, -5);
  const finL = new THREE.SphereGeometry(1, 8, 6);
  finL.scale(1.2, 0.1, 0.45);
  finL.rotateY(0.5);
  finL.translate(1.3, -0.4, 0.8);
  const finR = finL.clone();
  finR.scale(-1, 1, 1);
  return mergeGeometries([body, head, tail, fluke, finL, finR].map((g) => g.toNonIndexed()))!;
}

function whaleSpotsGeometry() {
  // Pandora-ish glowing dots along the back and sides
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const z = 2.4 - i * 0.45;
    for (const side of [-1, 1]) {
      const s = new THREE.SphereGeometry(0.09 + (i % 3) * 0.02, 6, 4);
      s.translate(side * (0.55 - Math.abs(z) * 0.06), 0.72 - Math.abs(z) * 0.06, z);
      parts.push(s);
    }
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
