// Small 2D (x, z) geometry helpers shared by the island's registries (trails, the river, the lake,
// the jungle). Pure maths, no three.js.

export type P2 = [number, number];

/** Smooth a polyline with Catmull-Rom so it bends gently (samples every ~step units). */
export function smooth(pts: P2[], step = 2.4, closed = false): P2[] {
  if (pts.length < 2) return pts;
  const out: P2[] = [];
  const n = pts.length;
  const get = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

/** where segment ab crosses segment cd (or null) */
export function segHit(a: P2, b: P2, c: P2, d: P2): P2 | null {
  const r0 = b[0] - a[0];
  const r1 = b[1] - a[1];
  const q0 = d[0] - c[0];
  const q1 = d[1] - c[1];
  const den = r0 * q1 - r1 * q0;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * q1 - (c[1] - a[1]) * q0) / den;
  const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r0 * t, a[1] + r1 * t] : null;
}

/** nearest point on a polyline: distance, segment index and the fraction along that segment */
export function nearestOnPolyline(pts: P2[], x: number, z: number): { d: number; i: number; u: number } {
  let best = Infinity;
  let bi = 0;
  let bu = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0];
    const az = pts[i][1];
    const ex = pts[i + 1][0] - ax;
    const ez = pts[i + 1][1] - az;
    const l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const dx = ax + ex * u - x;
    const dz = az + ez * u - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bi = i;
      bu = u;
    }
  }
  return { d: Math.sqrt(best), i: bi, u: bu };
}

/** cumulative lengths along a polyline (same length as pts, starting at 0) */
export function cumLength(pts: P2[]): Float64Array {
  const out = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) out[i] = out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return out;
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
