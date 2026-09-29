// The park's dreamy sky and light. A day <-> night cycle follows the real clock: soft pastel
// days, a golden hour, then a starry violet twilight where everything that can glow does.
// `glow` (0 = bright day, 1 = deep twilight) is the one number the rest of the world reads to
// light up flowers, jellyfish, fireflies and paths. Walking into the Glow Forest pulls the
// light towards twilight too, so it always feels magical in there.
import * as THREE from "three";
import { groundY } from "../registry/terrain";

export interface Atmosphere {
  /** 0 = full day, 1 = full twilight glow (after the forest pull) */
  readonly glow: number;
  /** 0..1 how deep into the Glow Forest the kid is */
  readonly forest: number;
  update(dt: number, t: number, focus: THREE.Vector3): void;
  dispose(): void;
}

interface Palette {
  top: THREE.Color;
  mid: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  sun: THREE.Color;
  hemiI: number;
  sunI: number;
}
const pal = (top: string, mid: string, horizon: string, fog: string, hemiSky: string, hemiGround: string, sun: string, hemiI: number, sunI: number): Palette => ({
  top: new THREE.Color(top),
  mid: new THREE.Color(mid),
  horizon: new THREE.Color(horizon),
  fog: new THREE.Color(fog),
  hemiSky: new THREE.Color(hemiSky),
  hemiGround: new THREE.Color(hemiGround),
  sun: new THREE.Color(sun),
  hemiI,
  sunI,
});

// day -> golden hour -> twilight (the glow world); lerped by the glow amount
const DAY = pal("#a9b8ff", "#ffc6e6", "#fff1d9", "#ffd6ea", "#ffffff", "#d6c8ff", "#ffffff", 0.95, 1.15);
const GOLDEN = pal("#8f7cff", "#ff9fcf", "#ffd49a", "#ffb9c9", "#ffe2f0", "#b8a0ff", "#ffc98a", 0.85, 0.9);
const TWILIGHT = pal("#0c0a34", "#2c1a66", "#a8469f", "#1d1650", "#7d82e8", "#2a2168", "#b3a4ff", 0.85, 0.34);

/** How glowy the real clock is: 0 by day, ramps through golden hour to 1 after dusk. */
export function clockGlow(hour: number): number {
  const s = (a: number, b: number, x: number) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  if (hour >= 12) return s(16.5, 19.5, hour); // evening: glow rises
  return 1 - s(5.5, 7.5, hour); // morning: glow fades at sunrise
}

function mixPalette(out: Palette, g: number) {
  // 0..0.5 day -> golden, 0.5..1 golden -> twilight
  const a = g < 0.5 ? DAY : GOLDEN;
  const b = g < 0.5 ? GOLDEN : TWILIGHT;
  const k = g < 0.5 ? g / 0.5 : (g - 0.5) / 0.5;
  for (const key of ["top", "mid", "horizon", "fog", "hemiSky", "hemiGround", "sun"] as const) out[key].copy(a[key]).lerp(b[key], k);
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * k;
  out.sunI = a.sunI + (b.sunI - a.sunI) * k;
}

export function makeSparkTexture(): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildAtmosphere(
  scene: THREE.Scene,
  opts: { forest: { x: number; z: number; radius: number }; hour?: () => number; lowQuality?: boolean },
): Atmosphere {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const hourNow = opts.hour ?? (() => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  });

  // ── sky dome: gradient + twinkling stars that come out as it glows ──
  const skyMat = track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGlow: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform float uGlow; uniform float uTime;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(-0.05, 0.28, h));
          col = mix(col, uTop, smoothstep(0.25, 0.9, h));
          // soft aurora ribbons at twilight
          float aur = sin(vDir.x * 6.0 + uTime * 0.15) * sin(vDir.z * 5.0 - uTime * 0.1);
          col += uGlow * smoothstep(0.55, 1.0, aur) * smoothstep(0.15, 0.5, h) * vec3(0.25, 0.55, 0.55) * 0.55;
          // stars
          vec3 cell = floor(vDir * 180.0);
          float s = hash(cell);
          float star = step(0.9965, s) * smoothstep(0.02, 0.2, h);
          star *= 0.6 + 0.4 * sin(uTime * (1.5 + s * 3.0) + s * 40.0);
          col += star * uGlow * vec3(1.0, 0.95, 1.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(470, 32, 20)), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // sun by day, a big friendly moon at twilight
  const spark = track(makeSparkTexture());
  const sunDisc = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: spark, color: "#fff6c8", fog: false, depthWrite: false, transparent: true })));
  sunDisc.scale.setScalar(70);
  const moon = new THREE.Mesh(track(new THREE.CircleGeometry(12, 32)), track(new THREE.MeshBasicMaterial({ color: "#fff4fb", fog: false, transparent: true })));
  const moonHalo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: spark, color: "#c9b8ff", fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending })));
  moonHalo.scale.setScalar(80);
  scene.add(sunDisc, moon, moonHalo);

  // ── lights + fog (driven every frame) ──
  scene.fog = new THREE.Fog(0xffd6ea, 150, 430);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd6c8ff, 0.95);
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(-30, 50, 25);
  sun.castShadow = !opts.lowQuality;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.5;
  scene.add(hemi, sun, sun.target);

  // ── fireflies / floating spores: faint sparkly pollen by day, glowing wisps at night ──
  const N = opts.lowQuality ? 260 : 620;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  const col = new Float32Array(N * 3);
  const palette = [new THREE.Color("#9ff7ff"), new THREE.Color("#ffd1ff"), new THREE.Color("#fff3a8"), new THREE.Color("#b6ffcf")];
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    // denser in the forest, the rest spread over the park
    const inForest = i < N * 0.45;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (inForest ? opts.forest.radius + 6 : 140);
    pos[i * 3] = (inForest ? opts.forest.x : 0) + Math.sin(a) * r;
    pos[i * 3 + 2] = (inForest ? opts.forest.z : 0) + Math.cos(a) * r;
    pos[i * 3 + 1] = groundY(pos[i * 3], pos[i * 3 + 2]) + 0.6 + rnd() * (inForest ? 7 : 5);
    seed[i] = rnd() * 100;
    const c = palette[i % palette.length];
    col.set([c.r, c.g, c.b], i * 3);
  }
  const fGeo = track(new THREE.BufferGeometry());
  fGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  fGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  fGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const fMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { uTime: { value: 0 }, uGlow: { value: 0 }, uMap: { value: spark }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform float uGlow; uniform float uScale;
        varying vec3 vCol; varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * 0.35 + aSeed;
          p.x += sin(t * 1.3) * 1.6 + sin(t * 0.37) * 2.4;
          p.y += sin(t * 0.9) * 0.8;
          p.z += cos(t * 1.1) * 1.6 + cos(t * 0.29) * 2.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float blink = 0.55 + 0.45 * sin(uTime * (1.2 + fract(aSeed) * 2.0) + aSeed * 7.0);
          vA = blink * mix(0.18, 1.0, uGlow);
          vCol = color;
          gl_PointSize = uScale * mix(5.0, 16.0, uGlow) * (60.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying vec3 vCol; varying float vA;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vCol * tex.rgb, tex.a * vA);
        }`,
    }),
  );
  const fireflies = new THREE.Points(fGeo, fMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  const cur = pal("#000", "#000", "#000", "#000", "#000", "#000", "#000", 1, 1);
  let glow = clockGlow(hourNow());
  let forestAmt = 0;
  let clockT = 0;
  let clockGlowNow = glow;

  return {
    get glow() {
      return glow;
    },
    get forest() {
      return forestAmt;
    },
    update(dt, t, focus) {
      clockT -= dt;
      if (clockT <= 0) {
        clockT = 20; // re-read the clock now and then
        clockGlowNow = clockGlow(hourNow());
      }
      const d = Math.hypot(focus.x - opts.forest.x, focus.z - opts.forest.z);
      const wantForest = 1 - Math.min(1, Math.max(0, (d - opts.forest.radius * 0.35) / (opts.forest.radius * 0.9)));
      forestAmt += (wantForest - forestAmt) * Math.min(1, dt * 1.5);
      const target = Math.max(clockGlowNow, forestAmt * 0.92);
      glow += (target - glow) * Math.min(1, dt * 1.2);

      mixPalette(cur, glow);
      skyMat.uniforms.uTop.value.copy(cur.top);
      skyMat.uniforms.uMid.value.copy(cur.mid);
      skyMat.uniforms.uHorizon.value.copy(cur.horizon);
      skyMat.uniforms.uGlow.value = glow;
      skyMat.uniforms.uTime.value = t;
      (scene.fog as THREE.Fog).color.copy(cur.fog);
      (scene.fog as THREE.Fog).near = 150 - glow * 70;
      hemi.color.copy(cur.hemiSky);
      hemi.groundColor.copy(cur.hemiGround);
      hemi.intensity = cur.hemiI;
      sun.color.copy(cur.sun);
      sun.intensity = cur.sunI * 1.25;
      // the shadow camera follows the player (snapped to texels so shadows don't shimmer)
      const snap = 96 / 2048;
      const fx = Math.round(focus.x / snap) * snap;
      const fz = Math.round(focus.z / snap) * snap;
      sun.target.position.set(fx, focus.y, fz);
      sun.position.set(fx - 45, focus.y + 80, fz + 38);

      // sun sinks and the moon rises as it glows
      sunDisc.position.set(-160, 220 - glow * 260, -300);
      (sunDisc.material as THREE.SpriteMaterial).opacity = 1 - glow;
      moon.position.set(170, 60 + glow * 110, -320);
      moon.lookAt(0, 0, 0);
      (moon.material as THREE.MeshBasicMaterial).opacity = glow;
      moonHalo.position.copy(moon.position);
      (moonHalo.material as THREE.SpriteMaterial).opacity = glow * 0.6;

      fMat.uniforms.uTime.value = t;
      fMat.uniforms.uGlow.value = glow;
    },
    dispose() {
      scene.remove(sky, sunDisc, moon, moonHalo, hemi, sun, fireflies);
      for (const d of disposables) d.dispose();
    },
  };
}
