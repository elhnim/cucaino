import { describe, expect, it } from "vitest";
import { capSamples, GhostRecorder, ghostLapMs, GHOST_SAMPLE_HZ, MAX_GHOST_SAMPLES, replayAt } from "./ghost";
import type { KartPose } from "./types";

function poseAt(t: number): KartPose {
  return { t, x: t * 0.1, z: 0, yaw: 0, speed: 10, lap: 1, progress: (t % 1000) / 1000 };
}

describe("ghost recording", () => {
  it("samples at ~10 Hz even when ticked much faster", () => {
    const rec = new GhostRecorder();
    for (let t = 0; t < 2000; t += 16) rec.push(poseAt(t)); // ~60 Hz ticks
    // ~2 s of recording at 10 Hz should be roughly 20 samples, comfortably not ~125 (60 Hz)
    expect(rec.samples.length).toBeGreaterThan(15);
    expect(rec.samples.length).toBeLessThan(25);
  });

  it("never exceeds the sample cap", () => {
    const rec = new GhostRecorder();
    for (let t = 0; t < 1000 * 1000; t += 1000 / GHOST_SAMPLE_HZ) rec.push(poseAt(t));
    expect(rec.samples.length).toBeLessThanOrEqual(MAX_GHOST_SAMPLES);
  });

  it("reset clears the recording", () => {
    const rec = new GhostRecorder();
    rec.push(poseAt(0));
    rec.push(poseAt(200));
    expect(rec.samples.length).toBe(2);
    rec.reset();
    expect(rec.samples.length).toBe(0);
    rec.push(poseAt(0));
    expect(rec.samples.length).toBe(1);
  });
});

describe("ghost replay", () => {
  const samples: KartPose[] = [0, 100, 200, 300].map(poseAt);

  it("round-trips an exact sample", () => {
    const pose = replayAt({ samples }, 200);
    expect(pose).toMatchObject({ x: 20, z: 0, speed: 10 });
  });

  it("interpolates between samples", () => {
    const pose = replayAt({ samples }, 150);
    expect(pose!.x).toBeCloseTo(15, 5);
  });

  it("holds the first pose before the recording starts, and the last pose after it ends", () => {
    expect(replayAt({ samples }, -50)).toMatchObject({ x: 0 });
    expect(replayAt({ samples }, 9999)).toMatchObject({ x: 30 });
  });

  it("returns null for an empty ghost", () => {
    expect(replayAt({ samples: [] }, 0)).toBeNull();
  });

  it("wraps yaw the short way round", () => {
    const wrap: KartPose[] = [
      { ...poseAt(0), yaw: Math.PI - 0.1 },
      { ...poseAt(100), yaw: -Math.PI + 0.1 },
    ];
    const pose = replayAt({ samples: wrap }, 50)!;
    // the short way round a wrap at +-PI passes through PI/-PI, not through 0
    expect(Math.abs(pose.yaw)).toBeGreaterThan(Math.PI - 0.2);
  });

  it("ghostLapMs is the last sample's time", () => {
    expect(ghostLapMs({ samples })).toBe(300);
    expect(ghostLapMs({ samples: [] })).toBe(0);
  });

  it("capSamples trims evenly while keeping the first and last sample", () => {
    const many = Array.from({ length: 3000 }, (_, i) => poseAt(i * 100));
    const trimmed = capSamples(many, 1500);
    expect(trimmed.length).toBe(1500);
    expect(trimmed[0]).toEqual(many[0]);
    expect(trimmed[trimmed.length - 1]).toEqual(many[many.length - 1]);
  });

  it("capSamples is a no-op under the cap", () => {
    const few = [poseAt(0), poseAt(100)];
    expect(capSamples(few, 1500)).toEqual(few);
  });
});
