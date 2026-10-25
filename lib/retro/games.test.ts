import { describe, expect, it } from "vitest";
import { RETRO_GAMES } from "./registry";
import { emptyInput, nullGfx, nullSfx, rng, type Button, type IO } from "./engine";

const BUTTONS: Button[] = ["left", "right", "up", "down", "a", "b"];

/** Mash buttons like a kid would (held for a while, lots of A/B) and tap the screen. */
function play(gameIndex: number, seed: number, frames: number) {
  const def = RETRO_GAMES[gameIndex];
  let game = def.create(seed);
  let rounds = 1;
  const r = rng(seed + 99);
  const gfx = nullGfx();
  let held: Record<Button, boolean> = { left: false, right: false, up: false, down: false, a: false, b: false };
  let score = 0;
  let ended = false;
  const io: IO = { input: emptyInput(), sfx: nullSfx, time: 0, score: (p) => (score += p), gameOver: () => (ended = true), win: () => (ended = true) };
  for (let f = 0; f < frames; f++) {
    if (f % 12 === 0) {
      const prev = held;
      held = { ...held };
      for (const b of BUTTONS) if (r.chance(0.3)) held[b] = r.chance(b === "right" ? 0.7 : 0.45);
      if (held.left && held.right) held.left = false;
      io.input = { held, pressed: Object.fromEntries(BUTTONS.map((b) => [b, held[b] && !prev[b]])) as Record<Button, boolean>, tap: r.chance(0.3) ? { x: r.range(0, 256), y: r.range(0, 224) } : null, pointer: { x: r.range(0, 256), y: r.range(0, 224), down: r.chance(0.5) } };
    } else io.input = { ...io.input, pressed: { left: false, right: false, up: false, down: false, a: false, b: false }, tap: null };
    io.time = f / 60;
    game.update(io);
    if (f % 3 === 0) game.draw(gfx);
    if (ended && f % 60 === 0) {
      // start a fresh round and keep mashing, so every game gets the full play time
      game = def.create(seed + f);
      ended = false;
      rounds++;
    }
  }
  return { score, ended, rounds };
}

describe("retro arcade", () => {
  it("has unique ids and complete cabinet info", () => {
    const ids = new Set(RETRO_GAMES.map((g) => g.id));
    expect(ids.size).toBe(RETRO_GAMES.length);
    for (const g of RETRO_GAMES) {
      expect(g.title.length, g.id).toBeGreaterThan(2);
      expect(g.blurb.length, g.id).toBeGreaterThan(5);
      expect(g.controls.length, g.id).toBeGreaterThan(3);
    }
  });

  for (const [i, g] of RETRO_GAMES.entries()) {
    it(`${g.title}: survives 5 minutes of button mashing on 3 seeds`, () => {
      for (const seed of [1, 42, 777]) {
        const r = play(i, seed, 60 * 60 * 5);
        expect(Number.isFinite(r.score), g.id).toBe(true);
        expect(r.score, g.id).toBeGreaterThanOrEqual(0);
      }
    });
  }
});
