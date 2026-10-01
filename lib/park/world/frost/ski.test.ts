import { describe, expect, it } from "vitest";
import { K_FALL, K_LIFT, K_NDOWN, K_NUP, K_QUEUE, K_SKI, K_TOPQ, LIFT_LOOP, SKI_STATE_NAMES, liftPoint, makeSkiField, stepSkiField, type SkiField } from "./ski";
import { CHAIR_DROP, FROST_COLONY, FROST_OBSTACLES, FROST_SKI, FROST_SLIDES, FROST_ASCENT, FROST_TERRACE, frostChuteDistance, frostCourseLat, frostLandY, frostPisteAt, GATE_HALF } from "../../registry/frostIsland";
import { DOCKS, harbourKeepOut } from "../../registry/harbours";

const dt = 1 / 30;
function run(f: SkiField, secs: number, each?: (t: number) => void) {
  let t = 0;
  for (let k = 0; k < secs / dt; k++) {
    t += dt;
    stepSkiField(f, dt, t, null);
    each?.(t);
  }
}

describe("the Penguin Ski Run", { timeout: 120_000 }, () => {
  it("is laid out clear of the slides, the colony, the ramp, the dock and everything else", () => {
    const P = FROST_SKI.piste;
    for (let i = 0; i < P.x.length; i++) {
      expect(frostChuteDistance(P.x[i], P.z[i])).toBeGreaterThan(25);
      expect(Math.hypot(P.x[i] - FROST_COLONY.x, P.z[i] - FROST_COLONY.z)).toBeGreaterThan(40);
      expect(Math.hypot(P.x[i] - FROST_TERRACE.x, P.z[i] - FROST_TERRACE.z)).toBeGreaterThan(25);
      for (const a of FROST_ASCENT) expect(Math.hypot(P.x[i] - a.x, P.z[i] - a.z)).toBeGreaterThan(25);
      expect(harbourKeepOut(P.x[i], P.z[i], 4)).toBe(false);
      // the groomed snow is where the piste says, always downhill, never too steep
      expect(Math.abs((frostLandY(P.x[i], P.z[i]) ?? 0) - P.y[i])).toBeLessThan(0.15);
      if (i) {
        const g = (P.y[i - 1] - P.y[i]) / (P.u[i] - P.u[i - 1]);
        expect(g).toBeGreaterThan(0);
        expect(g).toBeLessThan(0.5);
      }
    }
    for (const d of DOCKS) expect(Math.hypot(d.x - FROST_SKI.bottom.x, d.z - FROST_SKI.bottom.z)).toBeGreaterThan(30);
    // no tree, rock or hut on the piste (pylons and huts are beside it)
    for (const o of FROST_OBSTACLES) {
      const at = frostPisteAt(o.x, o.z);
      if (at && at.s > 1.5) expect(at.d - o.r, `obstacle on the piste at ${o.x.toFixed(1)},${o.z.toFixed(1)}`).toBeGreaterThan(at.nursery ? 2.5 : 5);
    }
    // the slalom gates sit inside the piste
    expect(FROST_SKI.gates.length).toBeGreaterThanOrEqual(4);
    for (const g of FROST_SKI.gates) expect(Math.abs(g.lat) + GATE_HALF).toBeLessThan(P.hw - 0.5);
  });

  it("the chairlift goes round and round: chairs hang clear of the snow all the way up", () => {
    const o = { x: 0, y: 0, z: 0, yaw: 0 };
    for (let u = 0; u < LIFT_LOOP; u += 0.25) {
      liftPoint(u, o);
      const g = frostLandY(o.x, o.z) ?? 0;
      // (a seated emperor's feet + skis hang ~0.4 under the seat)
      expect(o.y - g, `u ${u}`).toBeGreaterThan(0.5);
      expect(o.y - g).toBeLessThan(CHAIR_DROP + 6);
    }
    // ...and it's a loop
    liftPoint(0, o);
    const a = { ...o };
    liftPoint(LIFT_LOOP, o);
    expect(Math.hypot(a.x - o.x, a.z - o.z)).toBeLessThan(1e-3);
  });

  it("skiers carve through the gates, stay on the piste, take the lift back up — a loop, over and over", () => {
    const f = makeSkiField(false);
    const seen = new Set<number>();
    const bad: string[] = [];
    const fail = (s: string) => bad.length < 6 && bad.push(s);
    let sprays = 0;
    run(f, 300, () => {
      for (const k of f.skiers) {
        seen.add(k.state);
        if (!Number.isFinite(k.x + k.y + k.z + k.yaw + k.pitch + k.roll)) fail(`nan ${k.i}`);
        if (k.state === K_SKI && k.s > 0.5) {
          const at = frostPisteAt(k.x, k.z);
          if (!at || at.nursery || at.d > FROST_SKI.piste.hw - 0.4) fail(`off the piste ${k.i} ${at?.d}`);
          // on its line through the gates (close to the racing line once it's settled)
          if (k.t > 2 && Math.abs(k.lat - frostCourseLat(k.s) * k.amp - k.off) > 1.9) fail(`off its line ${k.i}`);
        }
        if ((k.state === K_NDOWN || k.state === K_NUP) && !frostPisteAt(k.x, k.z)?.nursery) fail(`chick off the nursery slope ${k.i}`);
      }
      for (let e = 0; e < f.ev.n; e++) if (f.ev.buf[e * 5 + 4] === 2) sprays++;
    });
    expect(bad.join("; ")).toBe("");
    for (const s of [K_QUEUE, K_LIFT, K_TOPQ, K_SKI, K_FALL, K_NDOWN, K_NUP]) expect(seen.has(s), SKI_STATE_NAMES[s]).toBe(true);
    expect(f.runsDone).toBeGreaterThan(20);
    expect(f.rides).toBeGreaterThan(20);
    expect(f.falls).toBeGreaterThan(1);
    expect(sprays).toBeGreaterThan(f.runsDone * 3);
    // everyone (not just a few) gets runs in
    for (const k of f.skiers) if (k.kind !== 1 && k.state !== 12) expect(k.runs, `skier ${k.i}`).toBeGreaterThan(1);
  });

  it("nobody bumps into anybody (on the piste, in the queues, getting on and off the lift)", () => {
    const f = makeSkiField(false);
    let worst = Infinity;
    let who = "";
    run(f, 240, () => {
      const S = f.skiers;
      for (let a = 0; a < S.length; a++)
        for (let b = a + 1; b < S.length; b++) {
          const A = S[a];
          const B = S[b];
          // (the two seats of one chair are side by side, a seat apart)
                    const d = Math.hypot(A.x - B.x, A.z - B.z);
          const dy = Math.abs(A.y - B.y);
          const r = (A.size * 0.3 + B.size * 0.3) * 1.15;
          if (dy < 1.2 && d - r < worst) {
            worst = d - r;
            who = `${SKI_STATE_NAMES[A.state]}/${SKI_STATE_NAMES[B.state]} ${d.toFixed(2)}`;
          }
        }
    });
    expect(worst, who).toBeGreaterThan(0);
  });

  it("is light: about half the skiers on low quality, deterministic", () => {
    expect(makeSkiField(true).skiers.length).toBeLessThan(makeSkiField(false).skiers.length * 0.7);
    const a = makeSkiField(false);
    const b = makeSkiField(false);
    run(a, 30);
    run(b, 30);
    for (let i = 0; i < a.skiers.length; i++) expect(a.skiers[i].x).toBe(b.skiers[i].x);
    // (the slides are far away)
    expect(FROST_SLIDES.length).toBe(3);
  });
});
