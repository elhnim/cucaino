import { describe, expect, it } from "vitest";
import { northernPeak, stepFlock, type FlockParams } from "./birds";

const P: FlockParams = { seek: 0.9, sep: 1.1, speed: 6, maxSpeed: 9 };

function flock(n: number) {
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (i % 4) * 0.3;
    pos[i * 3 + 1] = 10;
    pos[i * 3 + 2] = Math.floor(i / 4) * 0.3;
    vel[i * 3] = 1;
  }
  return { pos, vel };
}

describe("stepFlock", () => {
  it("birds follow a moving target and stay together", () => {
    const n = 11;
    const { pos, vel } = flock(n);
    const dt = 1 / 30;
    for (let k = 0; k < 900; k++) {
      const t = k * dt;
      const tx = Math.sin(t * 0.2) * 20;
      const tz = Math.cos(t * 0.16) * 18;
      stepFlock(pos, vel, n, tx, 12, tz, dt, P);
      if (k > 300) {
        for (let i = 0; i < n; i++) {
          expect(Math.hypot(pos[i * 3] - tx, pos[i * 3 + 2] - tz)).toBeLessThan(16);
          expect(Math.abs(pos[i * 3 + 1] - 12)).toBeLessThan(6);
        }
      }
    }
  });
  it("speeds stay in the cruise band and nothing goes NaN", () => {
    const n = 8;
    const { pos, vel } = flock(n);
    for (let k = 0; k < 600; k++) stepFlock(pos, vel, n, 0, 10, 0, 1 / 30, P);
    for (let i = 0; i < n; i++) {
      const sp = Math.hypot(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]);
      expect(Number.isFinite(sp)).toBe(true);
      expect(sp).toBeGreaterThanOrEqual(P.speed * 0.6 - 1e-4);
      expect(sp).toBeLessThanOrEqual(P.maxSpeed + 1e-4);
    }
  });
  it("birds keep a little apart", () => {
    const n = 10;
    const { pos, vel } = flock(n);
    let close = 0;
    let pairs = 0;
    for (let k = 0; k < 600; k++) {
      stepFlock(pos, vel, n, Math.sin(k / 60) * 10, 10, Math.cos(k / 60) * 10, 1 / 30, P);
      if (k > 200 && k % 20 === 0)
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            pairs++;
            if (Math.hypot(pos[i * 3] - pos[j * 3], pos[i * 3 + 1] - pos[j * 3 + 1], pos[i * 3 + 2] - pos[j * 3 + 2]) < 0.3) close++;
          }
    }
    expect(close / pairs).toBeLessThan(0.05);
  });
});

describe("northernPeak", () => {
  it("is up in the northern mountains", () => {
    const p = northernPeak();
    expect(p.z).toBeLessThan(-40);
    expect(p.y).toBeGreaterThan(12);
  });
});
