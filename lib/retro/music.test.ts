import { describe, expect, it } from "vitest";
import { composeTune } from "./music";
import { RETRO_GAMES } from "./registry";

describe("retro music", () => {
  it("gives every game its own tune, the same every time", () => {
    const seen = new Set<string>();
    for (const g of RETRO_GAMES) {
      const a = composeTune(g);
      const b = composeTune(g);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      const sig = a.lead.slice(0, 12).map((n) => `${n.at}:${n.midi}`).join(",");
      expect(seen.has(sig), `${g.id} shares its melody with another game`).toBe(false);
      seen.add(sig);
    }
  });

  it("writes playable loops: notes inside the loop, in a sensible range, every channel busy", () => {
    for (const g of RETRO_GAMES) {
      const t = composeTune(g);
      expect(t.bpm).toBeGreaterThanOrEqual(100);
      expect(t.bpm).toBeLessThanOrEqual(180);
      expect(t.steps).toBe(256);
      expect(t.lead.length, g.id).toBeGreaterThan(40);
      expect(t.bass.length, g.id).toBeGreaterThan(20);
      expect(t.drums.length, g.id).toBeGreaterThan(30);
      for (const n of [...t.lead, ...t.arp, ...t.bass]) {
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.at).toBeLessThan(t.steps);
        expect(n.len).toBeGreaterThanOrEqual(1);
        expect(n.midi).toBeGreaterThanOrEqual(28);
        expect(n.midi).toBeLessThanOrEqual(96);
      }
    }
  });

  it("racing is faster than puzzles", () => {
    const race = RETRO_GAMES.filter((g) => g.genre === "Racing").map((g) => composeTune(g).bpm);
    const puzzle = RETRO_GAMES.filter((g) => g.genre === "Puzzle").map((g) => composeTune(g).bpm);
    expect(Math.min(...race)).toBeGreaterThan(Math.max(...puzzle));
  });
});
