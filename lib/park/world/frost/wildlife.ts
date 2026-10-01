// Frostpeak's other animals — pure maths, deterministic, allocation-free per step (tested):
//   - seals lounging on the ice floes (lifting their heads, rolling onto their sides, flicking their
//     tails) that now and then scoot to the edge, slide into the sea — splash — swim a few loops
//     under the floe and haul themselves back out
//   - a narwhal pod cruising slowly round the island far offshore, coming up to breathe every so
//     often with their long tusks poking out of the water
//   - arctic terns wheeling over the colony and the bay, now and then folding their wings and
//     plunge-diving into the sea after a fish
import { FROST_FLOES, FROST_ISLAND, FROST_SHORE, FROST_WATER_Y, frostFloeR, frostRng, type FrostFloe } from "../../registry/frostIsland";

const TAU = Math.PI * 2;
const WY = FROST_WATER_Y;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const wrapA = (a: number) => a - Math.round(a / TAU) * TAU;

export interface Beast {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** wings (terns): flap angle; -1 = folded */
  flap: number;
  under: boolean;
}
const beast = (): Beast => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, flap: 0, under: false });

export const SEAL_LOUNGE = 0;
export const SEAL_SCOOT = 1;
export const SEAL_DIVE = 2;
export const SEAL_SWIM = 3;
export const SEAL_HAUL = 4;

interface Seal extends Beast {
  floe: FrostFloe;
  state: number;
  t: number;
  dur: number;
  /** where it lies on the floe (floe-local polar) */
  b: number;
  r: number;
  /** swimming round the floe */
  a: number;
  seed: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
}

export interface Wildlife {
  seals: Seal[];
  narwhals: Beast[];
  terns: Beast[];
  /** x, y, z, size, kind (0 big splash, 1 small splash) */
  ev: { buf: Float32Array; n: number };
  seed: number;
}

// ── true size ── (the Park kid is 2.26 units = a real ~1.4 m ten-year-old: 1 m = 1.6 units)
//   seal         ~2.2 m nose to tail flippers (a Weddell / harbour-type seal)  model 2.66
//   narwhal      ~4.5 m body (4–5.5 m), plus a ~2.2 m spiral tusk           model body 4.45
//   arctic tern  ~0.36 m long, ~0.8 m wingspan                              model 0.71 long, 1.34 span
/** world units per model unit for each beast (index.ts draws them at these scales) */
export const BEAST_K = { seal: (1.6 * 2.2) / 2.66, narwhal: (1.6 * 4.5) / 4.45, tern: (1.6 * 0.75) / 1.34 } as const;
/** the narwhal pod's youngster (a 2.5 m juvenile) */
export const NARWHAL_CALF = 0.6;

const SEAL_FLOES = [0, 2, 2, 4, 6, 8];
const TERN_N = 10;
const NARWHAL_N = 5;
/** the narwhals' loop round the island */
export const NARWHAL_R = 126;

export function makeWildlife(low: boolean, seed = 99): Wildlife {
  const rnd = frostRng(seed);
  const seals: Seal[] = SEAL_FLOES.slice(0, low ? 4 : 6).map((fi, k) => {
    const floe = FROST_FLOES[fi % FROST_FLOES.length];
    const b = (k * 2.4 + rnd()) % TAU;
    return {
      ...beast(),
      floe,
      state: SEAL_LOUNGE,
      t: rnd() * 30,
      dur: 25 + rnd() * 50,
      b,
      r: floe.r * (0.25 + rnd() * 0.3),
      a: 0,
      seed: Math.floor(rnd() * 10000),
      fromX: 0,
      fromZ: 0,
      toX: 0,
      toZ: 0,
      yaw: rnd() * TAU,
    };
  });
  return {
    seals,
    narwhals: Array.from({ length: low ? 3 : NARWHAL_N }, beast),
    terns: Array.from({ length: low ? 6 : TERN_N }, beast),
    ev: { buf: new Float32Array(32 * 5), n: 0 },
    seed,
  };
}

function emit(w: Wildlife, x: number, y: number, z: number, size: number, kind: number) {
  if (w.ev.n >= 32) return;
  const o = w.ev.n * 5;
  w.ev.buf[o] = x;
  w.ev.buf[o + 1] = y;
  w.ev.buf[o + 2] = z;
  w.ev.buf[o + 3] = size;
  w.ev.buf[o + 4] = kind;
  w.ev.n++;
}

function floePoint(f: FrostFloe, b: number, r: number, out: { x: number; z: number }) {
  out.x = f.x + Math.sin(b + f.rot) * r;
  out.z = f.z + Math.cos(b + f.rot) * r;
  return out;
}
const tmp = { x: 0, z: 0 };

export function stepWildlife(w: Wildlife, dtIn: number, t: number): void {
  const dt = clamp(dtIn, 0, 0.1);
  w.ev.n = 0;
  // ── seals ──
  for (const s of w.seals) {
    s.t += dt;
    const f = s.floe;
    const ph = s.seed * 0.13;
    switch (s.state) {
      case SEAL_LOUNGE: {
        floePoint(f, s.b, s.r, tmp);
        s.x = tmp.x;
        s.z = tmp.z;
        s.y = f.top;
        s.under = false;
        // lift the head now and then, roll onto a side for a snooze, flick the tail
        const look = smooth(0.55, 0.8, Math.sin(t * 0.21 + ph));
        const snooze = smooth(0.6, 0.85, Math.sin(t * 0.09 + ph * 2));
        s.pitch = -0.28 * look + Math.sin(t * 2.4 + ph) * 0.03 * (1 - snooze);
        s.roll = snooze * 1.1 * (s.seed % 2 ? 1 : -1);
        s.yaw += Math.sin(t * 0.3 + ph) * 0.05 * dt;
        if (s.t > s.dur) {
          // off to the edge for a swim
          s.state = SEAL_SCOOT;
          s.t = 0;
          s.fromX = s.x;
          s.fromZ = s.z;
          const eb = Math.atan2(s.x - f.x, s.z - f.z) - f.rot + (s.seed % 3) * 0.4;
          floePoint(f, eb, frostFloeR(f, eb) - 0.4, tmp);
          s.toX = tmp.x;
          s.toZ = tmp.z;
        }
        break;
      }
      case SEAL_SCOOT: {
        // humping along to the edge
        const u = clamp(s.t / 2.6, 0, 1);
        s.x = s.fromX + (s.toX - s.fromX) * u;
        s.z = s.fromZ + (s.toZ - s.fromZ) * u;
        s.yaw += wrapA(Math.atan2(s.toX - s.fromX, s.toZ - s.fromZ) - s.yaw) * Math.min(1, dt * 5);
        s.y = f.top + Math.abs(Math.sin(s.t * 6)) * 0.12;
        s.pitch = Math.sin(s.t * 6) * 0.12;
        s.roll *= 1 - Math.min(1, dt * 4);
        if (u >= 1) {
          s.state = SEAL_DIVE;
          s.t = 0;
          s.fromX = s.x;
          s.fromZ = s.z;
        }
        break;
      }
      case SEAL_DIVE: {
        // slide in nose first — splash
        const u = clamp(s.t / 0.9, 0, 1);
        s.x = s.fromX + Math.sin(s.yaw) * u * 2.4 * BEAST_K.seal;
        s.z = s.fromZ + Math.cos(s.yaw) * u * 2.4 * BEAST_K.seal;
        s.y = f.top + (WY - 1.3 - f.top) * u * u;
        s.pitch = 0.7 * u;
        if (s.t - dt < 0.45 && s.t >= 0.45) emit(w, s.x, WY, s.z, 1.0, 0);
        if (u >= 1) {
          s.state = SEAL_SWIM;
          s.t = 0;
          s.dur = 10 + ((s.seed + Math.floor(t)) % 11);
          s.a = Math.atan2(s.x - f.x, s.z - f.z);
          s.under = true;
        }
        break;
      }
      case SEAL_SWIM: {
        // loops round under the floe
        const dir = s.seed % 2 ? 1 : -1;
        const R = f.r + 4 + Math.sin(t * 0.4 + ph) * 1.5;
        s.a += (dir * 2.3 * dt) / R;
        s.x = f.x + Math.sin(s.a) * R;
        s.z = f.z + Math.cos(s.a) * R;
        const dy = WY - 1.6 - Math.sin(t * 0.7 + ph) * 0.8;
        s.y += (dy - s.y) * Math.min(1, dt * 1.5);
        s.yaw = s.a + (dir * Math.PI) / 2;
        s.pitch = Math.sin(t * 0.7 + ph) * 0.2;
        s.roll = -dir * 0.35;
        s.under = true;
        if (s.t > s.dur) {
          s.state = SEAL_HAUL;
          s.t = 0;
          s.fromX = s.x;
          s.fromZ = s.z;
          s.b = s.a - f.rot + dir * 0.4;
          s.r = f.r * (0.2 + ((s.seed * 7) % 5) * 0.08);
          floePoint(f, s.b, s.r, tmp);
          s.toX = tmp.x;
          s.toZ = tmp.z;
          emit(w, s.x, WY, s.z, 0.6, 1);
        }
        break;
      }
      case SEAL_HAUL: {
        // a heave up onto the ice
        const u = clamp(s.t / 1.4, 0, 1);
        s.x = s.fromX + (s.toX - s.fromX) * smooth(0, 1, u);
        s.z = s.fromZ + (s.toZ - s.fromZ) * smooth(0, 1, u);
        s.y = WY - 0.8 + (f.top - WY + 0.8) * smooth(0, 0.6, u) + Math.sin(Math.PI * u) * 0.5;
        s.yaw += wrapA(Math.atan2(s.toX - s.fromX, s.toZ - s.fromZ) - s.yaw) * Math.min(1, dt * 6);
        s.pitch = -0.4 * (1 - u);
        s.roll *= 1 - Math.min(1, dt * 4);
        s.under = u < 0.3;
        if (u >= 1) {
          s.state = SEAL_LOUNGE;
          s.t = 0;
          s.dur = 30 + ((s.seed * 3 + Math.floor(t)) % 40);
        }
        break;
      }
    }
  }
  // ── narwhals: a pod cruising round the island, surfacing to breathe ──
  {
    const v = 2.3;
    const a0 = (t * v) / NARWHAL_R + 0.8;
    const cyc = (t % 26) / 26;
    for (let k = 0; k < w.narwhals.length; k++) {
      const n = w.narwhals[k];
      // (spaced for true-size, 7-unit narwhals)
      const back = k * 3.2 * BEAST_K.narwhal;
      const side = (k % 2 ? 1 : -1) * (k ? 2.2 + (k % 3) * 0.6 : 0) * BEAST_K.narwhal;
      const a = a0 - back / NARWHAL_R;
      const R = NARWHAL_R + side;
      n.x = FROST_ISLAND.x + Math.sin(a) * R;
      n.z = FROST_ISLAND.z + Math.cos(a) * R;
      n.yaw = a + Math.PI / 2;
      const lag = smooth(0.62 + k * 0.012, 0.72 + k * 0.012, cyc) * (1 - smooth(0.9 + k * 0.01, 0.98, cyc));
      const deep = WY - 4.5 - Math.sin(t * 0.3 + k) * 1.2;
      n.y = deep + (WY - 0.45 - deep) * lag + Math.sin(t * 1.2 + k) * 0.08;
      n.pitch = -0.28 * lag + Math.sin(t * 0.9 + k * 1.3) * 0.08 + (lag > 0 && lag < 1 ? -0.12 : 0);
      n.roll = Math.sin(t * 0.5 + k) * 0.1;
      n.under = true;
    }
  }
  // ── terns ──
  for (let k = 0; k < w.terns.length; k++) {
    const b = w.terns[k];
    const period = 22 + (k % 5) * 3;
    const u = ((t + k * 7.3) % period) / period;
    const R = 9 + (k % 4) * 4;
    const sp = (0.32 + (k % 3) * 0.06) * (k % 2 ? 1 : -1);
    const cx = k % 3 === 0 ? FROST_SHORE.entry.x : FROST_SHORE.land.x + (k % 2 ? 8 : -6);
    const cz = k % 3 === 0 ? FROST_SHORE.entry.z : FROST_SHORE.land.z + (k % 2 ? -6 : 8);
    const a = t * sp + k * 1.7;
    let x = cx + Math.sin(a) * R;
    let z = cz + Math.cos(a) * R;
    let y = 13 + (k % 3) * 4 + Math.sin(t * 0.4 + k) * 1.5;
    let pitch = 0;
    let flap = Math.sin(t * 9 + k * 2) * 0.7;
    b.yaw = a + (sp > 0 ? Math.PI / 2 : -Math.PI / 2);
    b.roll = sp > 0 ? -0.4 : 0.4;
    b.under = false;
    // the plunge: over the bay (out to sea from the colony's beach), fold, dive, splash, climb back
    if (u > 0.84) {
      const d = (u - 0.84) / 0.16;
      const px = FROST_SHORE.entry.x + (FROST_SHORE.entry.x - FROST_ISLAND.x) * 0.1 + Math.sin(k * 2.1) * 8;
      const pz = FROST_SHORE.entry.z + (FROST_SHORE.entry.z - FROST_ISLAND.z) * 0.1 + Math.cos(k * 2.1) * 8;
      const dive = smooth(0, 0.4, d);
      const climb = smooth(0.5, 1, d);
      x = x + (px - x) * dive * (1 - climb);
      z = z + (pz - z) * dive * (1 - climb);
      const yDive = WY + 0.1;
      y = y + (yDive - y) * dive * (1 - climb);
      pitch = d < 0.45 ? 1.2 * dive : -0.6 * (1 - climb);
      flap = d < 0.45 ? -1 : Math.sin(t * 14 + k) * 0.9;
      if (d > 0.4 && d < 0.5) b.roll = 0;
      const prevD = ((((t - dt + k * 7.3) % period) / period) - 0.84) / 0.16;
      if (prevD < 0.42 && d >= 0.42) emit(w, x, WY, z, 0.4, 1);
    }
    b.x = x;
    b.y = y;
    b.z = z;
    b.pitch = pitch;
    b.flap = flap;
  }
}
