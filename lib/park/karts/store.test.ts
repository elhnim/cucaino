import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GhostLap } from "./types";

const saveKartLap = vi.fn();
const getKartGhosts = vi.fn();
const getKartLeaderboard = vi.fn();

vi.mock("@/lib/actions/karts", () => ({
  saveKartLap: (...args: unknown[]) => saveKartLap(...args),
  getKartGhosts: (...args: unknown[]) => getKartGhosts(...args),
  getKartLeaderboard: (...args: unknown[]) => getKartLeaderboard(...args),
}));

// import after the mock so store.ts picks up the mocked module
const { createKartStore } = await import("./store");

const lap: GhostLap = {
  kidId: "kid-1",
  name: "Mia",
  animal: "animal-fox",
  colour: "#ff0099",
  trackId: "cucaino-karts",
  lapMs: 42_000,
  samples: [],
};

describe("createKartStore", () => {
  beforeEach(() => {
    saveKartLap.mockReset();
    getKartGhosts.mockReset();
    getKartLeaderboard.mockReset();
  });

  it("delegates saveLap/ghosts/leaderboard to the server actions", async () => {
    saveKartLap.mockResolvedValue({ ok: true, saved: true });
    getKartGhosts.mockResolvedValue([lap]);
    getKartLeaderboard.mockResolvedValue([{ kidId: "kid-1", name: "Mia", animal: "animal-fox", lapMs: 42_000 }]);

    const store = createKartStore();
    await store.saveLap(lap);
    expect(saveKartLap).toHaveBeenCalledWith(lap);

    const ghosts = await store.ghosts("cucaino-karts");
    expect(ghosts).toEqual([lap]);
    expect(getKartGhosts).toHaveBeenCalledWith("cucaino-karts");

    const board = await store.leaderboard("cucaino-karts");
    expect(board).toEqual([{ kidId: "kid-1", name: "Mia", animal: "animal-fox", lapMs: 42_000 }]);
    expect(getKartLeaderboard).toHaveBeenCalledWith("cucaino-karts");
  });

  it("never throws when saveLap's action fails (offline / migration not live yet)", async () => {
    saveKartLap.mockRejectedValue(new Error("relation \"kart_laps\" does not exist"));
    const store = createKartStore();
    await expect(store.saveLap(lap)).resolves.toBeUndefined();
  });

  it("falls back to an empty list when ghosts()'s action throws", async () => {
    getKartGhosts.mockRejectedValue(new Error("network error"));
    const store = createKartStore();
    await expect(store.ghosts("cucaino-karts")).resolves.toEqual([]);
  });

  it("falls back to an empty list when leaderboard()'s action throws", async () => {
    getKartLeaderboard.mockRejectedValue(new Error("network error"));
    const store = createKartStore();
    await expect(store.leaderboard("cucaino-karts")).resolves.toEqual([]);
  });
});
