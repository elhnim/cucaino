import { describe, expect, it } from "vitest";
import { STATIC_ENTITIES, PROGRESS_GROUPS, CATEGORY_CHIPS, MAP_DOCKS } from "./entities";
import { STATIONS } from "../registry/railway";
import { SETTLEMENTS } from "../registry/settlements";
import { WONDERS } from "../registry/wonders";
import { WORLD_PLACES } from "../registry/worldMap";
// only this *test* reaches into harbours.ts directly — entities.ts keeps its own copy instead
// (see MAP_DOCKS's comment) so the map bundle never pulls in three.js; this is the drift check.
import { DOCKS } from "../registry/harbours";

describe("map entities (registry-driven, never hard-coded)", () => {
  it("has a unique id for every entity", () => {
    const ids = new Set<string>();
    for (const e of STATIC_ENTITIES) {
      expect(ids.has(e.id), `duplicate ${e.id}`).toBe(false);
      ids.add(e.id);
    }
  });

  it("includes every station, settlement, wonder and world place — so a new one just appears", () => {
    const ids = new Set(STATIC_ENTITIES.map((e) => e.id));
    for (const s of STATIONS) expect(ids.has(s.id)).toBe(true);
    for (const s of SETTLEMENTS) expect(ids.has(s.id)).toBe(true);
    for (const w of WONDERS) expect(ids.has(w.id)).toBe(true);
    for (const w of WORLD_PLACES) expect(ids.has(w.id)).toBe(true);
  });

  it("includes the Quest Board and home", () => {
    expect(STATIC_ENTITIES.some((e) => e.category === "quest")).toBe(true);
    expect(STATIC_ENTITIES.some((e) => e.category === "home")).toBe(true);
  });

  it("every entity has a readable name, emoji and finite position", () => {
    for (const e of STATIC_ENTITIES) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.emoji.length).toBeGreaterThan(0);
      expect(Number.isFinite(e.x)).toBe(true);
      expect(Number.isFinite(e.z)).toBe(true);
      expect(e.priority).toBeGreaterThan(0);
    }
  });

  it("progress groups cover wonders, villages and islands with no duplicate ids inside a group", () => {
    for (const g of PROGRESS_GROUPS) {
      expect(g.ids.length).toBeGreaterThan(0);
      expect(new Set(g.ids).size).toBe(g.ids.length);
    }
  });

  it("category chips are unique", () => {
    expect(new Set(CATEGORY_CHIPS.map((c) => c.category)).size).toBe(CATEGORY_CHIPS.length);
  });

  it("MAP_DOCKS (copied so the map stays three.js-free) matches the real registry/harbours.ts DOCKS", () => {
    expect(MAP_DOCKS.length).toBe(DOCKS.length);
    for (const real of DOCKS) {
      const copy = MAP_DOCKS.find((d) => d.id === real.id);
      expect(copy, `MAP_DOCKS is missing "${real.id}" — update its copy in entities.ts`).toBeTruthy();
      expect(copy!.name).toBe(real.name);
      expect(copy!.x).toBeCloseTo(real.x, 0);
      expect(copy!.z).toBeCloseTo(real.z, 0);
    }
  });
});
