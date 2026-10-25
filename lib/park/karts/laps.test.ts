import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sanitizeLap, sanitizeSamples, sanitizeTrackId, MAX_GHOST_SAMPLES } from "./laps";

describe("kart lap sanitization", () => {
  it("accepts a well-formed lap and rounds/caps its fields", () => {
    const res = sanitizeLap({
      kidId: "kid-1",
      name: "Mia",
      animal: "animal-fox",
      colour: "#ff0099",
      trackId: "cucaino-karts",
      lapMs: 42_123.456,
      samples: [
        { t: 0, x: 1.23456, z: -2.98765, yaw: 0.1, speed: 3.3333, lap: 0, progress: 0.5 },
        { t: 0.1, x: 2, z: 3, yaw: 0.2, speed: 4, lap: 1, progress: 1.4 }, // progress out of range
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lap.kidId).toBe("kid-1");
    expect(res.lap.lapMs).toBe(42123); // rounded to an integer
    expect(res.lap.samples[0].x).toBe(1.23); // rounded to 2 decimals
    expect(res.lap.samples[1].progress).toBe(1); // clamped to 0..1
  });

  it("rejects a lap missing a racer or track", () => {
    expect(sanitizeLap({ trackId: "t", lapMs: 1000 })).toEqual({ ok: false, error: "Missing racer." });
    expect(sanitizeLap({ kidId: "k", lapMs: 1000 })).toEqual({ ok: false, error: "Missing track." });
  });

  it("rejects nonsense lap times", () => {
    expect(sanitizeLap({ kidId: "k", trackId: "t", lapMs: 0 }).ok).toBe(false);
    expect(sanitizeLap({ kidId: "k", trackId: "t", lapMs: -5 }).ok).toBe(false);
    expect(sanitizeLap({ kidId: "k", trackId: "t", lapMs: Number.NaN }).ok).toBe(false);
    expect(sanitizeLap({ kidId: "k", trackId: "t", lapMs: 999 * 60 * 1000 }).ok).toBe(false);
  });

  it("falls back to safe defaults for a missing name/animal/colour", () => {
    const res = sanitizeLap({ kidId: "k", trackId: "t", lapMs: 1000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lap.name).toBe("Racer");
    expect(res.lap.animal).toBe("");
    expect(res.lap.colour).toBe("#ffffff");
    expect(res.lap.samples).toEqual([]);
  });

  it("never stores more than MAX_GHOST_SAMPLES points", () => {
    const samples = Array.from({ length: MAX_GHOST_SAMPLES + 500 }, (_, i) => ({
      t: i / 10,
      x: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      lap: 0,
      progress: 0,
    }));
    const out = sanitizeSamples(samples);
    expect(out.length).toBe(MAX_GHOST_SAMPLES);
  });

  it("tolerates garbage samples without throwing", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => sanitizeSamples([null, undefined, 42, "x", {}] as any)).not.toThrow();
    const out = sanitizeSamples([null, {}]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ t: 0, x: 0, z: 0, yaw: 0, speed: 0, lap: 0, progress: 0 });
  });

  it("sanitizes a track id (trims, caps length, rejects empty)", () => {
    expect(sanitizeTrackId("  cucaino-karts  ")).toBe("cucaino-karts");
    expect(sanitizeTrackId("")).toBeNull();
    expect(sanitizeTrackId(123)).toBeNull();
    expect(sanitizeTrackId("x".repeat(100))?.length).toBeLessThanOrEqual(40);
  });
});

describe("migration 0052_kart_laps.sql sanity", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "..", "supabase", "migrations", "0052_kart_laps.sql"),
    "utf8",
  );

  it("creates the kart_laps table with the required columns", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.kart_laps/);
    expect(sql).toMatch(/family_id\s+uuid\s+NOT NULL REFERENCES public\.families/);
    expect(sql).toMatch(/kid_id\s+uuid\s+NOT NULL REFERENCES public\.kids/);
    expect(sql).toMatch(/track_id\s+text\s+NOT NULL/);
    expect(sql).toMatch(/lap_ms\s+integer\s+NOT NULL CHECK \(lap_ms > 0\)/);
    expect(sql).toMatch(/ghost\s+jsonb\s+NOT NULL/);
  });

  it("keeps only the best lap per kid per track", () => {
    expect(sql).toMatch(/UNIQUE \(kid_id, track_id\)/);
  });

  it("has the leaderboard index and RLS family_scope policy", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS kart_laps_leaderboard_idx ON public\.kart_laps \(family_id, track_id, lap_ms\)/);
    expect(sql).toMatch(/ALTER TABLE public\.kart_laps ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY "family_scope" ON public\.kart_laps/);
    expect(sql).toMatch(/FOR ALL USING \(family_id = public\.current_family_id\(\)\)/);
  });

  it("authorizes the private karts:<familyId> realtime channel", () => {
    expect(sql).toMatch(/realtime\.messages/);
    expect(sql).toMatch(/realtime\.topic\(\) = 'karts:' \|\| \(SELECT public\.current_family_id\(\)\)::text/);
  });
});
