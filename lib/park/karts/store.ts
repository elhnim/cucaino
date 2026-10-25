// KartStore implementation backed by Supabase via server actions (lib/actions/karts.ts).
// Per the KartStore contract this never throws — if the action throws (offline, the migration
// isn't live yet, a network blip), callers just see an empty/no-op result, same spirit as
// lib/actions/home.ts falling back gracefully.
import { saveKartLap, getKartGhosts, getKartLeaderboard } from "@/lib/actions/karts";
import type { GhostLap, KartStore } from "./types";

export function createKartStore(): KartStore {
  return {
    async saveLap(lap: GhostLap) {
      try {
        await saveKartLap(lap);
      } catch {
        // best-effort: a lap that fails to save just isn't recorded as a new best
      }
    },
    async ghosts(trackId: string) {
      try {
        return await getKartGhosts(trackId);
      } catch {
        return [];
      }
    },
    async leaderboard(trackId: string) {
      try {
        return await getKartLeaderboard(trackId);
      } catch {
        return [];
      }
    },
  };
}
