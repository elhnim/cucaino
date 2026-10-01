// Procedural chibi animation: no skeleton, just a few joints driven by a flat pose vector.
// Every frame: idle pose ⟶ blended with the locomotion pose (by ground speed) ⟶ blended with any
// playing actions (each fades in/out). Pure maths on preallocated arrays: cheap per frame.
import type { AnimCtx, Joint, Kit } from "./parts";

export type ChibiAction = "idle" | "walk" | "run" | "wave" | "cheer" | "eat" | "dance" | "sad" | "sleep" | "fetch";
type LayerAction = Exclude<ChibiAction, "idle" | "walk" | "run">;

// pose channels
const RIG_Y = 0, RIG_RY = 1, BODY_Y = 2, LEAN = 3, TWIST = 4, SWAY = 5, SQUASH = 6;
const HEAD_X = 7, HEAD_Y = 8, HEAD_Z = 9;
const ARM_LX = 10, ARM_LZ = 11, ARM_RX = 12, ARM_RZ = 13;
const LEG_LX = 14, LEG_LY = 15, LEG_RX = 16, LEG_RY = 17;
const TAIL_Y = 18, TAIL_X = 19, EAR_L = 20, EAR_R = 21, DROOP = 22;
const EYE_OPEN = 23, HAPPY = 24, MOUTH_OPEN = 25, FROWN = 26;
const N = 27;

/** one-shot durations (s) */
const DURATION: Record<LayerAction, number> = { wave: 1.8, cheer: 2.4, eat: 2.0, dance: 2.6, sad: 2.4, sleep: 4.5, fetch: 1.35 };
const FADE_IN = 0.22;
const FADE_OUT = 0.32;
const TAU = Math.PI * 2;

interface Layer {
  action: LayerAction;
  t: number;
  w: number;
  target: number;
  once: boolean;
}

function rngFrom(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export { rngFrom };

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
/** wrap an angle to (-π, π] so spins blend back to 0 without unwinding */
const wrap = (a: number) => a - TAU * Math.round(a / TAU);
const ease = (x: number) => {
  const u = clamp(x, 0, 1);
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
};

export class ChibiAnimator {
  private base = new Float32Array(N);
  private tmp = new Float32Array(N);
  private out = new Float32Array(N);
  private layers: Layer[] = [];
  private forced: "walk" | "run" | null = null;
  private forcedLeft = 0;
  private t = 0;
  private phase = 0;
  private move = 0;
  private runW = 0;
  private rand: () => number;
  private ph: number; // personality phase offset
  private hopEvery: number;
  // idle events
  private blinkIn: number;
  private blinkT = 0;
  private lookIn: number;
  private look = 0;
  private lookTarget = 0;
  private hopIn: number;
  private hopT = -1;
  private twitchIn: number;
  private twitchT = -1;
  private twitchSide = 1;
  private glowAmt = 0;
  // swimming: blends over everything below the action layers (strokes + kicks, or treading water)
  private swimTarget = 0;
  private swimW = 0;
  private swimMoving = 0;
  private swimPh = 0;
  // tobogganing on the tummy (Frostpeak's penguin slides): arms out ahead like a superhero
  private slideTarget = 0;
  private slideW = 0;
  private ctx: AnimCtx = { t: 0, dt: 0, phase: 0, move: 0, run: 0, w: {}, glow: 0 };

  constructor(private k: Kit, private height: number, seed: number) {
    this.rand = rngFrom(seed);
    const r = this.rand;
    this.ph = r() * TAU;
    this.hopEvery = 7 + r() * 9;
    this.blinkIn = 1 + r() * 3;
    this.lookIn = 1.5 + r() * 3;
    this.hopIn = 3 + r() * this.hopEvery;
    this.twitchIn = 1 + r() * 3;
    this.apply(this.base);
  }

  /** in the water? `moving` = swimming along (strokes) rather than treading water */
  setSwim(on: boolean, moving: boolean) {
    this.swimTarget = on ? 1 : 0;
    this.swimMoving += ((moving ? 1 : 0) - this.swimMoving) * 0.12;
  }

  /** lying on the tummy, sliding head-first (the engine lays the rig down along the slope) */
  setSlide(on: boolean) {
    this.slideTarget = on ? 1 : 0;
  }

  setGlow(a: number) {
    this.glowAmt = clamp(Number.isFinite(a) ? a : 0, 0, 1);
    for (const m of this.k.glows) m.emissiveIntensity = this.glowAmt * (m.userData.glowStrength ?? 1);
  }

  play(action: ChibiAction, once = false) {
    if (action === "idle") {
      this.forced = null;
      for (const l of this.layers) l.target = 0;
      return;
    }
    if (action === "walk" || action === "run") {
      this.forced = action;
      this.forcedLeft = once ? 1.4 : Infinity;
      for (const l of this.layers) l.target = 0;
      return;
    }
    const top = this.layers[this.layers.length - 1];
    if (top && top.action === action && top.target === 1) {
      // same action again: keep it going (and restart the one-shot clock)
      top.once = once;
      if (once) top.t = Math.min(top.t, 0.2);
      return;
    }
    for (const l of this.layers) l.target = 0;
    this.layers.push({ action, t: 0, w: 0, target: 1, once });
    if (this.layers.length > 3) this.layers.shift();
  }

  update(dtIn: number, speedIn: number) {
    const dt = clamp(Number.isFinite(dtIn) ? dtIn : 0, 0, 0.1);
    const speed = Number.isFinite(speedIn) ? Math.max(0, speedIn) : 0;
    this.t += dt;
    const t = this.t;
    const r = this.rand;

    if (this.forced) {
      this.forcedLeft -= dt;
      if (this.forcedLeft <= 0) this.forced = null;
    }
    const moving = speed > 0.2 || this.forced !== null;
    const running = speed > 4 || this.forced === "run";
    const kMove = 1 - Math.exp(-dt * 9);
    this.move += ((moving ? 1 : 0) - this.move) * kMove;
    this.runW += ((running ? 1 : 0) - this.runW) * (1 - Math.exp(-dt * 5));
    let f: number;
    if (speed > 0.2) f = clamp(speed / (this.height * 0.9), running ? 2.3 : 1.4, running ? 3.6 : 2.6);
    else f = this.forced === "run" ? 2.9 : 1.8;
    if (this.k.gait === "hop") f *= 0.62;
    if (this.move > 0.01) this.phase = (this.phase + dt * TAU * f) % (TAU * 1000);

    // idle events
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.16;
      this.blinkIn = r() < 0.2 ? 0.28 : 2 + r() * 3;
    }
    if (this.blinkT > 0) this.blinkT = Math.max(0, this.blinkT - dt);
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookTarget = r() < 0.35 ? 0 : (r() - 0.5) * 1.1 * this.k.lookScale;
      this.lookIn = 2.2 + r() * 4;
    }
    this.look += (this.lookTarget * (1 - this.move) - this.look) * (1 - Math.exp(-dt * 3.5));
    const calm = this.move < 0.1 && this.layers.every((l) => l.w < 0.05);
    this.hopIn -= dt;
    if (this.hopIn <= 0) {
      if (calm && this.hopT < 0) this.hopT = 0;
      this.hopIn = this.hopEvery * (0.6 + r() * 0.8);
    }
    if (this.hopT >= 0) {
      this.hopT += dt;
      if (this.hopT > 0.62) this.hopT = -1;
    }
    this.twitchIn -= dt;
    if (this.twitchIn <= 0) {
      this.twitchT = 0;
      this.twitchSide = r() < 0.5 ? 1 : -1;
      this.twitchIn = 1.5 + r() * 3;
    }
    if (this.twitchT >= 0) {
      this.twitchT += dt;
      if (this.twitchT > 0.3) this.twitchT = -1;
    }

    // base = idle ⟶ locomotion
    const B = this.base;
    this.idlePose(B, t);
    if (this.move > 0.001) {
      const L = this.tmp;
      this.locoPose(L, this.phase, this.runW, t);
      const m = smooth(this.move);
      for (let i = 0; i < N; i++) B[i] += (L[i] - B[i]) * m;
    }

    // swimming
    this.swimW += (this.swimTarget - this.swimW) * (1 - Math.exp(-dt * 6));
    if (this.swimW > 0.001) {
      this.swimPh = (this.swimPh + dt * TAU * (0.55 + 0.5 * this.swimMoving)) % (TAU * 1000);
      const S = this.tmp;
      this.swimPose(S, this.swimPh, this.swimMoving, t);
      const m = smooth(this.swimW);
      for (let i = 0; i < N; i++) B[i] += (S[i] - B[i]) * m;
    }

    // tobogganing
    this.slideW += (this.slideTarget - this.slideW) * (1 - Math.exp(-dt * 8));
    if (this.slideW > 0.001) {
      const S = this.tmp;
      this.slidePose(S, t);
      const m = smooth(this.slideW);
      for (let i = 0; i < N; i++) B[i] += (S[i] - B[i]) * m;
    }

    // action layers
    const O = this.out;
    O.set(B);
    const w = this.ctx.w;
    for (const key in w) w[key] = 0;
    for (const l of this.layers) {
      l.t += dt;
      if (l.once && l.t >= DURATION[l.action] - FADE_OUT) l.target = 0;
      l.w = l.target > l.w ? Math.min(1, l.w + dt / FADE_IN) : Math.max(0, l.w - dt / FADE_OUT);
      const A = this.tmp;
      A.set(B);
      this.actionPose(A, l.action, l.t);
      const s = smooth(l.w);
      for (let i = 0; i < N; i++) O[i] += (A[i] - O[i]) * s;
      w[l.action] = Math.max(w[l.action] ?? 0, s);
    }
    for (let i = this.layers.length - 1; i >= 0; i--) if (this.layers[i].target === 0 && this.layers[i].w === 0) this.layers.splice(i, 1);

    this.apply(O);
    if (this.k.animate) {
      const c = this.ctx;
      c.t = t;
      c.dt = dt;
      c.phase = this.phase;
      c.move = this.move;
      c.run = this.runW;
      c.glow = this.glowAmt;
      this.k.animate(c);
    }
  }

  private idlePose(P: Float32Array, t: number) {
    P.fill(0);
    const ph = this.ph;
    const br = Math.sin(t * 2.3 + ph);
    P[SQUASH] = 0.022 * br;
    P[BODY_Y] = 0.003 * br;
    P[HEAD_X] = 0.03 * Math.sin(t * 1.1 + ph);
    P[HEAD_Y] = this.look;
    P[HEAD_Z] = 0.05 * Math.sin(t * 0.8 + ph);
    P[ARM_LZ] = 0.05 * Math.sin(t * 2.3 + ph);
    P[ARM_RZ] = 0.05 * Math.sin(t * 2.3 + ph + 0.4);
    P[TAIL_Y] = 0.3 * Math.sin(t * 1.8 + ph);
    P[TAIL_X] = 0.05 * Math.sin(t * 1.3 + ph);
    if (this.twitchT >= 0) {
      const v = 0.32 * Math.sin((Math.PI * this.twitchT) / 0.3);
      if (this.twitchSide > 0) P[EAR_L] = v;
      else P[EAR_R] = v;
    }
    P[EYE_OPEN] = 1;
    if (this.hopT >= 0) {
      const u = this.hopT;
      // crouch, pop up, land with a squash
      if (u < 0.12) P[SQUASH] -= 0.07 * Math.sin((Math.PI * u) / 0.24);
      else if (u < 0.47) {
        const j = Math.sin((Math.PI * (u - 0.12)) / 0.35);
        P[RIG_Y] = 0.075 * j;
        P[SQUASH] += 0.05 * j;
        P[ARM_LZ] += 0.5 * j;
        P[ARM_RZ] += 0.5 * j;
        P[EAR_L] -= 0.15 * j;
        P[EAR_R] -= 0.15 * j;
      } else P[SQUASH] -= 0.07 * Math.sin((Math.PI * (u - 0.47)) / 0.15);
    }
    const g = this.k.gait;
    if (g === "hover") {
      P[RIG_Y] += 0.028 * Math.sin(t * 2.6 + ph);
      P[LEG_LX] = P[LEG_RX] = 0.3 + 0.1 * Math.sin(t * 2.6 + ph + 1);
    } else if (g === "hop") {
      P[RIG_Y] += 0.035 * Math.sin(t * 2 + ph);
      P[LEAN] = 0.06 * Math.sin(t * 1.3 + ph);
    }
  }

  /** Swimming: alternating windmill strokes + a flutter kick when moving; arms sculling out to the
   *  sides and legs treading water when still. (The engine lays the whole rig forward while swimming.) */
  private swimPose(P: Float32Array, p: number, moving: number, t: number) {
    this.idlePose(P, t);
    const still = 1 - moving;
    const s = Math.sin(p);
    // strokes: each arm reaches up over the head (= forward, lying down) and pulls back to the hip
    const strokeL = 1.35 + 1.45 * s;
    const strokeR = 1.35 - 1.45 * s;
    const tread = Math.sin(t * 2.4);
    P[ARM_LX] = strokeL * moving + 0.25 * tread * still;
    P[ARM_RX] = strokeR * moving - 0.25 * tread * still;
    P[ARM_LZ] = 0.28 * moving + (0.95 + 0.35 * tread) * still;
    P[ARM_RZ] = 0.28 * moving + (0.95 + 0.35 * tread) * still;
    // flutter kick / eggbeater
    const kick = Math.sin(p * 2.6);
    P[LEG_LX] = 0.42 * kick * moving + 0.45 * tread * still;
    P[LEG_RX] = -0.42 * kick * moving - 0.45 * tread * still;
    P[LEG_LY] = P[LEG_RY] = 0;
    // roll with the strokes, head lifted to look ahead, ears swept back, tail wiggling
    P[TWIST] = 0.22 * s * moving;
    P[SWAY] = 0.1 * Math.sin(p + 0.6) * moving + 0.04 * tread * still;
    P[HEAD_X] = -0.42 * moving - 0.08 * still;
    P[HEAD_Z] = 0.08 * s * moving;
    P[EAR_L] = P[EAR_R] = -0.28 * moving;
    P[TAIL_Y] = 0.6 * Math.sin(p * 2);
    P[RIG_Y] = 0.03 * Math.sin(p * 2) * moving + 0.02 * tread * still;
    P[SQUASH] = 0.02 * Math.sin(p * 2);
    P[MOUTH_OPEN] = 0.2 + 0.2 * moving;
    P[HAPPY] = 0.6;
  }

  /** Belly-sliding: arms stretched out ahead (overhead, lying down), legs straight out behind with a
   *  happy little flutter, head up to see where we're going, a big grin. */
  private slidePose(P: Float32Array, t: number) {
    this.idlePose(P, t);
    const w = Math.sin(t * 9);
    P[ARM_LX] = 2.85 + 0.08 * w;
    P[ARM_RX] = 2.85 - 0.08 * w;
    P[ARM_LZ] = 0.22;
    P[ARM_RZ] = 0.22;
    P[LEG_LX] = 0.18 + 0.12 * Math.sin(t * 11);
    P[LEG_RX] = 0.18 - 0.12 * Math.sin(t * 11);
    P[LEG_LY] = P[LEG_RY] = 0;
    P[HEAD_X] = -0.55;
    P[HEAD_Y] = 0.1 * Math.sin(t * 1.7);
    P[EAR_L] = P[EAR_R] = -0.35;
    P[TAIL_Y] = 0.5 * Math.sin(t * 6);
    P[TWIST] = 0;
    P[SWAY] = 0;
    P[RIG_Y] = 0;
    P[SQUASH] = 0.03;
    P[MOUTH_OPEN] = 0.75;
    P[HAPPY] = 1;
    P[EYE_OPEN] = 1;
  }

  private locoPose(P: Float32Array, phase: number, r: number, t: number) {
    this.idlePose(P, t);
    const s = Math.sin(phase), c = Math.cos(phase);
    const b = 0.5 - 0.5 * Math.cos(2 * phase); // 0 at foot contact, 1 mid-stride
    const g = this.k.gait;
    P[RIG_Y] = (0.02 + 0.05 * r) * b;
    P[SQUASH] = (0.035 + 0.035 * r) * (2 * b - 1);
    P[BODY_Y] = 0;
    const legA = 0.55 + 0.3 * r;
    P[LEG_LX] = -legA * s;
    P[LEG_RX] = legA * s;
    P[LEG_LY] = (0.03 + 0.02 * r) * Math.max(0, c);
    P[LEG_RY] = (0.03 + 0.02 * r) * Math.max(0, -c);
    const armA = 0.6 + 0.45 * r;
    P[ARM_LX] = armA * s;
    P[ARM_RX] = -armA * s;
    P[ARM_LZ] = 0.12 * r;
    P[ARM_RZ] = 0.12 * r;
    P[LEAN] = 0.06 + 0.2 * r;
    P[SWAY] = 0.05 * s * (1 - 0.5 * r);
    P[TWIST] = 0.08 * s;
    P[HEAD_X] = -0.04 * r + 0.035 * (b - 0.5) - 0.05 * r;
    P[HEAD_Z] = -0.035 * s;
    P[HEAD_Y] = 0;
    P[TAIL_Y] = 0.35 * Math.sin(2 * phase);
    P[EAR_L] = P[EAR_R] = 0.12 * (b - 0.5) * (1 + r);
    P[MOUTH_OPEN] = 0.45 * r;
    if (g === "hover") {
      P[RIG_Y] = 0.03 * Math.sin(phase) + 0.028 * Math.sin(t * 2.6);
      P[LEG_LX] = 0.35 + 0.12 * s;
      P[LEG_RX] = 0.35 - 0.12 * s;
      P[LEG_LY] = P[LEG_RY] = 0;
      P[LEAN] = 0.2 + 0.15 * r;
      P[SQUASH] = 0.02 * Math.sin(2 * phase);
    } else if (g === "hop") {
      const h = Math.abs(Math.sin(phase));
      P[RIG_Y] = (0.1 + 0.06 * r) * h;
      P[SQUASH] = 0.07 * h - 0.035 - 0.05 * Math.max(0, 0.25 - h) * 4;
      P[LEAN] = -0.22 * Math.sin(2 * phase) + 0.08;
      P[SWAY] = 0;
      P[TWIST] = 0;
    } else if (g === "crawl") {
      P[RIG_Y] = 0.012 * b;
      P[LEAN] = 0.02;
      P[LEG_LX] *= 0.6;
      P[LEG_RX] *= 0.6;
      P[SQUASH] *= 0.6;
    } else if (g === "scuttle") {
      P[SWAY] = 0.1 * s;
      P[TWIST] = 0;
      P[LEAN] = 0.03;
      P[LEG_LX] *= 0.7;
      P[LEG_RX] *= 0.7;
    }
  }

  private actionPose(P: Float32Array, a: LayerAction, t: number) {
    const hover = this.k.gait === "hover" || this.k.gait === "hop";
    switch (a) {
      case "wave": {
        // big chibi heads swallow an arm raised straight up: wave out to the side, a bit forward
        P[ARM_RZ] = 1.65 + 0.38 * Math.sin(t * 11);
        P[ARM_RX] = -0.55;
        P[HEAD_Z] = 0.14;
        P[HEAD_Y] *= 0.3;
        P[SWAY] = -0.05;
        P[MOUTH_OPEN] = 0.6;
        P[TAIL_Y] = 0.45 * Math.sin(t * 9);
        P[EAR_L] = 0.12 * Math.sin(t * 5.5);
        break;
      }
      case "cheer": {
        const u = t % 1.2;
        const j = u < 0.5 ? Math.sin((Math.PI * u) / 0.5) : 0;
        P[RIG_Y] = 0.2 * j + (hover ? P[RIG_Y] * 0.3 : 0);
        P[SQUASH] = u < 0.5 ? 0.08 * j - 0.02 : u < 0.78 ? -0.1 * Math.sin((Math.PI * (u - 0.5)) / 0.28) : 0;
        P[ARM_LZ] = P[ARM_RZ] = 1.85 + 0.25 * Math.sin(t * 16);
        P[ARM_LX] = P[ARM_RX] = -0.45;
        P[LEG_LX] = P[LEG_RX] = -0.45 * j;
        P[LEG_LY] = P[LEG_RY] = 0.02 * j;
        P[RIG_RY] = Math.floor(t / 1.2) % 2 === 0 ? wrap(TAU * ease(u / 0.5)) : 0;
        P[LEAN] = -0.05;
        P[SWAY] = 0;
        P[HEAD_X] = -0.15;
        P[HEAD_Y] = 0;
        P[HAPPY] = 1;
        P[MOUTH_OPEN] = 0.95;
        P[TAIL_Y] = 0.6 * Math.sin(t * 18);
        P[EAR_L] = P[EAR_R] = -0.18;
        break;
      }
      case "eat": {
        const m = Math.sin(t * 13);
        P[HEAD_X] = 0.22 + 0.09 * m;
        P[HEAD_Y] = 0;
        P[MOUTH_OPEN] = 0.5 + 0.42 * m;
        P[ARM_LX] = P[ARM_RX] = -1.05;
        P[ARM_LZ] = P[ARM_RZ] = -0.28;
        P[HAPPY] = t % 1.6 > 0.8 ? 1 : 0;
        P[SQUASH] += 0.02 * m;
        P[TAIL_Y] = 0.4 * Math.sin(t * 7);
        break;
      }
      case "dance": {
        const w = t * 5.5;
        const sw = Math.sin(w);
        P[SWAY] = 0.18 * sw;
        P[RIG_Y] = 0.05 * Math.abs(sw) + (hover ? P[RIG_Y] * 0.3 : 0);
        const u = t % 2.6;
        P[RIG_RY] = 0.45 * Math.sin(w * 0.5) * (u > 2 ? 1 - ease((u - 2) / 0.3) : 1) + (u > 2 ? wrap(TAU * ease((u - 2) / 0.6)) : 0);
        P[ARM_LZ] = 1.15 + 0.6 * sw;
        P[ARM_RZ] = 1.15 - 0.6 * sw;
        P[ARM_LX] = P[ARM_RX] = -0.4;
        P[HEAD_Z] = -0.2 * sw;
        P[HEAD_Y] = 0;
        P[LEG_LX] = P[LEG_RX] = 0;
        P[LEG_LY] = 0.04 * Math.max(0, sw);
        P[LEG_RY] = 0.04 * Math.max(0, -sw);
        P[HAPPY] = 1;
        P[MOUTH_OPEN] = 0.6;
        P[TAIL_Y] = 0.6 * sw;
        P[SQUASH] = 0.04 * Math.cos(2 * w);
        break;
      }
      case "sad": {
        P[HEAD_X] = 0.38 + 0.02 * Math.sin(t * 1.5);
        P[HEAD_Y] = 0;
        P[HEAD_Z] = 0.08;
        P[DROOP] = 1;
        P[EAR_L] = P[EAR_R] = 0;
        P[ARM_LZ] = P[ARM_RZ] = -0.3;
        P[ARM_LX] = P[ARM_RX] = 0.15;
        P[LEAN] = 0.1;
        P[SQUASH] = -0.04 + 0.015 * Math.sin(t * 1.6);
        P[TAIL_X] = 0.7;
        P[TAIL_Y] *= 0.2;
        P[EYE_OPEN] = 0.55;
        P[MOUTH_OPEN] = 0;
        P[FROWN] = 1;
        break;
      }
      case "sleep": {
        const br = Math.sin(t * 1.7);
        P[RIG_Y] = hover ? -this.k.hover * 0.85 : -0.045;
        P[RIG_RY] = 0;
        P[LEG_LX] = P[LEG_RX] = hover ? 0.2 : -1.35;
        P[LEG_LY] = P[LEG_RY] = hover ? 0 : 0.03;
        P[LEAN] = 0.1;
        P[SWAY] = 0;
        P[TWIST] = 0;
        P[HEAD_X] = 0.28 + 0.03 * br;
        P[HEAD_Y] = 0;
        P[HEAD_Z] = 0.32;
        P[ARM_LZ] = P[ARM_RZ] = -0.15;
        P[ARM_LX] = P[ARM_RX] = -0.6;
        P[SQUASH] = 0.035 * br;
        P[DROOP] = 0.6;
        P[EAR_L] = P[EAR_R] = 0;
        P[EYE_OPEN] = 0;
        P[HAPPY] = 0;
        P[MOUTH_OPEN] = 0;
        P[TAIL_Y] = 0.9;
        P[TAIL_X] = 0.4;
        break;
      }
      case "fetch": {
        const u = t % 0.45;
        const j = Math.sin((Math.PI * u) / 0.45);
        P[RIG_Y] = 0.1 * j + (hover ? P[RIG_Y] * 0.3 : 0);
        P[SQUASH] = 0.06 * j - 0.03;
        P[LEAN] = -0.1;
        P[HEAD_X] = -0.2;
        P[HEAD_Y] = 0;
        P[ARM_LZ] = P[ARM_RZ] = 0.8 + 0.3 * j;
        P[ARM_LX] = P[ARM_RX] = -0.5;
        P[LEG_LX] = P[LEG_RX] = -0.25 * j;
        P[TAIL_Y] = 0.6 * Math.sin(t * 20);
        P[MOUTH_OPEN] = 0.7;
        P[EAR_L] = P[EAR_R] = -0.2 * j;
        break;
      }
    }
  }

  private apply(P: Float32Array) {
    const k = this.k;
    k.rig.position.y = k.hover + P[RIG_Y];
    k.rig.rotation.y = P[RIG_RY];
    const b = k.body;
    b.g.position.y = b.p0.y + P[BODY_Y];
    b.g.rotation.set(b.r0.x + P[LEAN], b.r0.y + P[TWIST], b.r0.z + P[SWAY]);
    const sq = P[SQUASH];
    b.g.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    rot(k.head, P[HEAD_X], P[HEAD_Y], P[HEAD_Z]);
    if (k.armL) rot(k.armL, P[ARM_LX], 0, P[ARM_LZ]);
    if (k.armR) rot(k.armR, P[ARM_RX], 0, -P[ARM_RZ]);
    if (k.legL) {
      rot(k.legL, P[LEG_LX], 0, 0);
      k.legL.g.position.y = k.legL.p0.y + P[LEG_LY];
    }
    if (k.legR) {
      rot(k.legR, P[LEG_RX], 0, 0);
      k.legR.g.position.y = k.legR.p0.y + P[LEG_RY];
    }
    if (k.tail) rot(k.tail, P[TAIL_X], P[TAIL_Y], 0);
    const d = P[DROOP];
    if (k.earL) rot(k.earL, -d * 0.35, 0, -(P[EAR_L] + d * 0.6));
    if (k.earR) rot(k.earR, -d * 0.35, 0, P[EAR_R] + d * 0.6);
    // eyes: blink, sleep "u u", happy "^ ^"
    let blink = 1;
    if (this.blinkT > 0) blink = 1 - Math.sin(Math.PI * (1 - this.blinkT / 0.16));
    const open = P[EYE_OPEN] * blink;
    const happy = P[HAPPY] > 0.5;
    const arcs = happy || P[EYE_OPEN] < 0.25;
    const sy = Math.max(0.08, open);
    for (const [eye, closed] of [[k.eyeL, k.closedL], [k.eyeR, k.closedR]] as const) {
      if (!eye) continue;
      eye.g.visible = !arcs;
      eye.g.scale.y = sy;
      closed.g.visible = arcs;
      closed.g.rotation.set(closed.r0.x, closed.r0.y, closed.r0.z + (happy ? Math.PI : 0));
    }
    if (k.mouth) {
      const mo = P[MOUTH_OPEN];
      const showOpen = mo > 0.08;
      k.mouthOpen.g.visible = showOpen;
      k.mouthOpen.g.scale.set(0.8 + 0.2 * mo, Math.max(0.2, mo), 1);
      k.mouth.g.visible = !showOpen;
      k.mouth.g.rotation.set(k.mouth.r0.x, k.mouth.r0.y, k.mouth.r0.z + (P[FROWN] > 0.5 ? Math.PI : 0));
    }
  }
}

function rot(j: Joint, x: number, y: number, z: number) {
  j.g.rotation.set(j.r0.x + x, j.r0.y + y, j.r0.z + z);
}
