// The park's dreamy sky and light. A day <-> night cycle follows the real clock: soft pastel
// days, a golden hour, then a starry violet twilight where everything that can glow does.
// `glow` (0 = bright day, 1 = deep twilight) is the one number the rest of the world reads to
// light up flowers, jellyfish, fireflies and paths. Walking into the Glow Forest pulls the
// light towards twilight too, so it always feels magical in there.
import * as THREE from "three";
import { groundY } from "../registry/terrain";
import { seaDepth } from "./sea/wander";

export interface Atmosphere {
  /** 0 = full day, 1 = full twilight glow (after the forest pull) */
  readonly glow: number;
  /** 0..1 how deep into the Glow Forest the kid is */
  readonly forest: number;
  /** the park's time of day, 0..24 (a whole day every 15 minutes) */
  readonly hour: number;
  update(dt: number, t: number, focus: THREE.Vector3): void;
  /** the camera dipped below the sea: deep-blue fog, no sky, teal light (depth in metres) */
  setUnderwater(under: boolean, depth: number): void;
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
// the storybook look: a clear sunny sky over misty green-grey hills (the train-diorama reference)
const DAY_SB = pal("#7fb0dc", "#b9d7e0", "#dbe9da", "#c9ddcc", "#ffffff", "#b6cf9f", "#fff4dc", 1.0, 1.3);
const GOLDEN_SB = pal("#7c8fd8", "#f3b8a8", "#ffd9a0", "#e8c9b0", "#fff0dc", "#c8b890", "#ffcf8a", 0.9, 0.95);
const TWILIGHT = pal("#0c0a34", "#2c1a66", "#a8469f", "#1d1650", "#7d82e8", "#2a2168", "#b3a4ff", 0.85, 0.34);

/** One full park day (day and night) lasts this long. */
export const PARK_DAY_SECONDS = 15 * 60;
/** The park's time of day (0..24) at a given moment: a fast day on a shared clock. */
export function parkHour(nowMs: number): number {
  return ((nowMs / 1000 / PARK_DAY_SECONDS) * 24 + 8) % 24;
}

/** How glowy the real clock is: 0 by day, ramps through golden hour to 1 after dusk. */
export function clockGlow(hour: number): number {
  const s = (a: number, b: number, x: number) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  if (hour >= 12) return s(16.5, 19.5, hour); // evening: glow rises
  return 1 - s(5.5, 7.5, hour); // morning: glow fades at sunrise
}

function mixPalette(out: Palette, g: number, storybook = false) {
  // 0..0.5 day -> golden, 0.5..1 golden -> twilight
  const day = storybook ? DAY_SB : DAY;
  const golden = storybook ? GOLDEN_SB : GOLDEN;
  const a = g < 0.5 ? day : golden;
  const b = g < 0.5 ? golden : TWILIGHT;
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
  opts: { forest: { x: number; z: number; radius: number }; hour?: () => number; lowQuality?: boolean; storybook?: boolean },
): Atmosphere {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  // a whole day (dawn -> day -> golden hour -> glowing night) every PARK_DAY_SECONDS, on a shared
  // clock so everyone's park is at the same time of day
  const hourNow = opts.hour ?? (() => parkHour(Date.now()));

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
  let hourCur = hourNow();
  // the sun's direction across the day: rises in the east, high at noon, sets in the west
  // (clamped so shadows never get absurdly long); at night the "sun" is the moon's light
  const sunDir = new THREE.Vector3();
  const sunDirFor = (h: number, out: THREE.Vector3) => {
    const day = Math.min(1, Math.max(0, (h - 6) / 12)); // 0 at 6am .. 1 at 6pm
    const az = -Math.PI / 2 + day * Math.PI; // east (-x) -> south -> west (+x)
    const el = 0.35 + Math.sin(day * Math.PI) * 0.8; // ~20 deg at the ends, ~66 deg at noon
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * 0.6 + 0.35).normalize();
  };
  let under = false;
  let underDepth = 0;
  const bgSaved = scene.background;
  // under the sea: bright turquoise near the surface -> clear reef blue -> open-ocean blue; dusk
  const waterTop = new THREE.Color("#3ccfd9");
  const waterReef = new THREE.Color("#23a6d8");
  const waterDeep = new THREE.Color("#1a6fc6");
  const waterNight = new THREE.Color("#12357a");
  // the Midnight Rift, far below the reef: deep navy, then near-black
  const waterAbyss = new THREE.Color("#0b2352");
  const waterMidnight = new THREE.Color("#030916");
  const abyssSky = new THREE.Color("#b4c6ff");
  const abyssGround = new THREE.Color("#5a6fa8");
  const underCol = new THREE.Color();

  return {
    setUnderwater(u, depth) {
      under = u;
      underDepth = depth;
      sky.visible = sunDisc.visible = moon.visible = moonHalo.visible = fireflies.visible = !u;
      if (!u) {
        (scene.fog as THREE.Fog).far = 430;
        scene.background = bgSaved;
      }
    },
    get glow() {
      return glow;
    },
    get forest() {
      return forestAmt;
    },
    get hour() {
      return hourCur;
    },
    update(dt, t, focus) {
      clockT -= dt;
      if (clockT <= 0) {
        clockT = 0.5; // re-read the clock often (a park day only lasts 15 minutes)
        hourCur = hourNow();
        clockGlowNow = clockGlow(hourCur);
      }
      const d = Math.hypot(focus.x - opts.forest.x, focus.z - opts.forest.z);
      const wantForest = 1 - Math.min(1, Math.max(0, (d - opts.forest.radius * 0.35) / (opts.forest.radius * 0.9)));
      forestAmt += (wantForest - forestAmt) * Math.min(1, dt * 1.5);
      const target = Math.max(clockGlowNow, forestAmt * 0.92);
      glow += (target - glow) * Math.min(1, dt * 1.2);

      mixPalette(cur, glow, opts.storybook);
      skyMat.uniforms.uTop.value.copy(cur.top);
      skyMat.uniforms.uMid.value.copy(cur.mid);
      skyMat.uniforms.uHorizon.value.copy(cur.horizon);
      skyMat.uniforms.uGlow.value = glow;
      skyMat.uniforms.uTime.value = t;
      (scene.fog as THREE.Fog).color.copy(cur.fog);
      // (the storybook valley stays clear; the haze gathers on the far hills)
      (scene.fog as THREE.Fog).near = (opts.storybook ? 210 : 150) - glow * 70;
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
      sunDirFor(hourCur, sunDir);
      sun.position.set(fx + sunDir.x * 95, focus.y + sunDir.y * 95, fz + sunDir.z * 95);

      // sun sinks and the moon rises as it glows
      // the sky (and sun and moon) travel with you: out at sea, far from the island, you'd
      // otherwise sail out of the sky dome (camera far plane 600 m, dome 470 m)
      sky.position.set(focus.x, 0, focus.z);
      sunDisc.position.set(focus.x + sunDir.x * 380, sunDir.y * 380 - glow * 200, focus.z + sunDir.z * 380);
      (sunDisc.material as THREE.SpriteMaterial).opacity = 1 - glow;
      moon.position.set(focus.x + 170, 60 + glow * 110, focus.z - 320);
      moon.lookAt(focus.x, 0, focus.z);
      (moon.material as THREE.MeshBasicMaterial).opacity = glow;
      moonHalo.position.copy(moon.position);
      (moonHalo.material as THREE.SpriteMaterial).opacity = glow * 0.6;

      fMat.uniforms.uTime.value = t;
      fMat.uniforms.uGlow.value = glow;

      if (under) {
        // clear, bright tropical water: ~85 m visibility over the lagoon and reef, ~55 m out over
        // the deep; bright turquoise near the surface fading to a clear blue as you go down (never
        // near-black). At twilight it's a deep dusky blue, still readable, and the glowing
        // creatures carry the scene.
        const s01 = (a: number, b: number, x: number) => {
          const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
          return u * u * (3 - 2 * u);
        };
        const open = s01(12, 20, seaDepth(focus.x, focus.z)); // 0 lagoon/reef .. 1 over the deep
        const down = s01(1.5, 16, underDepth); // how far below the surface the camera is
        // below ~25 m (only possible down in the Midnight Rift) the light fades: deep navy by ~50 m,
        // near-black by ~100 m, with shorter visibility, so the glowing creatures carry the scene
        // (0 above 25 m: the reef and the lagoon look exactly as before)
        const abyss = s01(25, 62, underDepth);
        const midnight = s01(58, 112, underDepth);
        underCol.copy(waterTop).lerp(waterReef, Math.max(down * 0.8, open * 0.6)).lerp(waterDeep, open * (0.35 + down * 0.65));
        underCol.lerp(waterNight, glow * 0.82);
        if (abyss > 0) underCol.lerp(waterAbyss, Math.min(1, abyss * 1.3)).lerp(waterMidnight, midnight * 0.92);
        const fog = scene.fog as THREE.Fog;
        fog.color.copy(underCol);
        fog.far = (86 - open * 30 - down * 6) * (1 - glow * 0.22);
        fog.near = fog.far * 0.24;
        if (abyss > 0) {
          // (kid-friendly, not realistic: down in the rift you can see *further*, ~65 m, so the
          // walls 25-40 m away still frame the view; the dark comes from the colour, not the fog)
          fog.far += (66 - fog.far) * abyss;
          fog.far *= 1 - midnight * 0.12;
          fog.near = fog.far * (0.24 + abyss * 0.08);
        }
        scene.background = underCol;
        // strong ambient (sky light scattered all round + the bright sand bouncing it up) and the
        // sun from above, so creatures show their colours
        hemi.color.set("#e4fdff");
        hemi.groundColor.set("#86d4d2");
        hemi.intensity = (0.95 - down * 0.15 - open * 0.08) * (1 - glow * 0.4);
        sun.color.set("#fff9e6");
        sun.intensity = (1.12 - down * 0.3) * (1 - glow * 0.62);
        if (abyss > 0) {
          // a cold, dim blue from all round (never pitch black: the kid stays readable) and hardly
          // any sunlight from above
          hemi.color.lerp(abyssSky, Math.min(1, abyss * 1.5));
          hemi.groundColor.lerp(abyssGround, Math.min(1, abyss * 1.5));
          // (kept fairly strong so the kid and the creatures always read; the rift's rock dims
          // itself with depth in its own shader)
          hemi.intensity *= 1 - abyss * 0.12;
          sun.color.lerp(abyssSky, abyss);
          sun.intensity *= 1 - Math.min(1, abyss * 1.25) * 0.94;
        }
      }
    },
    dispose() {
      scene.remove(sky, sunDisc, moon, moonHalo, hemi, sun, fireflies);
      for (const d of disposables) d.dispose();
    },
  };
}
