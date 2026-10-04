// Pure validation + sanitization for kart lap reports, shared by the server action
// (lib/actions/karts.ts) and its tests. Kept dependency-free (no Supabase) so it can be
// unit-tested directly, same spirit as lib/park/builder/rules.ts.
import type { GhostLap, KartPose } from "./types";

/** Biggest ghost we'll store: ~1500 samples at ~10 Hz is 2.5 minutes of replay, plenty for any
 *  kid-sized lap, and keeps `ghost` jsonb rows small. */
export const MAX_GHOST_SAMPLES = 1500;
const MAX_TRACK_ID_LEN = 40;
const MAX_NAME_LEN = 40;
const MAX_ANIMAL_LEN = 40;
const MAX_COLOUR_LEN = 16;
/** generous upper bound on a single lap — anything slower is almost certainly a stuck/garbage
 *  timer, not a real kid lap */
const MAX_LAP_MS = 30 * 60 * 1000;

function round2(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.round(v * 100) / 100;
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, v));
}

/** Round + clamp every sample and cap the array length. Never throws. */
export function sanitizeSamples(samples: unknown): KartPose[] {
  if (!Array.isArray(samples)) return [];
  return samples.slice(0, MAX_GHOST_SAMPLES).map((raw) => {
    const s = (raw ?? {}) as Partial<KartPose>;
    return {
      t: round2(s.t),
      x: round2(s.x),
      z: round2(s.z),
      yaw: round2(s.yaw),
      speed: round2(s.speed),
      lap: Math.max(0, Math.round(typeof s.lap === "number" && Number.isFinite(s.lap) ? s.lap : 0)),
      progress: clamp01(s.progress),
    };
  });
}

export function sanitizeTrackId(trackId: unknown): string | null {
  if (typeof trackId !== "string" || !trackId.trim()) return null;
  return trackId.trim().slice(0, MAX_TRACK_ID_LEN);
}

export type LapValidation = { ok: true; lap: GhostLap } | { ok: false; error: string };

/**
 * Validate + sanitize a lap report before it ever reaches the database: caps string lengths,
 * rounds numbers to 2 decimals, caps the sample count, and rejects nonsense lap times.
 * Pure — the server action (lib/actions/karts.ts) separately checks that the kid belongs to
 * the caller's own family, which this function has no way to know.
 */
export function sanitizeLap(input: unknown): LapValidation {
  const l = (input ?? {}) as Partial<GhostLap>;
  if (typeof l.kidId !== "string" || !l.kidId.trim()) return { ok: false, error: "Missing racer." };
  const trackId = sanitizeTrackId(l.trackId);
  if (!trackId) return { ok: false, error: "Missing track." };
  if (typeof l.lapMs !== "number" || !Number.isFinite(l.lapMs) || l.lapMs <= 0 || l.lapMs > MAX_LAP_MS) {
    return { ok: false, error: "Bad lap time." };
  }
  return {
    ok: true,
    lap: {
      kidId: l.kidId,
      name: (typeof l.name === "string" ? l.name : "Racer").slice(0, MAX_NAME_LEN) || "Racer",
      animal: (typeof l.animal === "string" ? l.animal : "").slice(0, MAX_ANIMAL_LEN),
      colour: (typeof l.colour === "string" && l.colour ? l.colour : "#ffffff").slice(0, MAX_COLOUR_LEN),
      trackId,
      lapMs: Math.round(l.lapMs),
      samples: sanitizeSamples(l.samples),
    },
  };
}
