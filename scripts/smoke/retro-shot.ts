// Screenshot harness for Retro Arcade games: runs a game headless-in-a-browser with scripted (or
// random) input and draws chosen frames to canvases, so a game can be reviewed — and its cabinet
// screen art captured — without playing it by hand. Bundle with:
//   npx esbuild scripts/smoke/retro-shot.ts --bundle --format=iife --outfile=<dir>/retro-shot.js
// Open <dir>/retro-shot.html?game=<id>&at=5,20,45&seed=7&mash=1 — one canvas per `at` second;
// window.__shots is set to { done: true } when every frame is drawn.
import { RETRO_GAMES } from "../../lib/retro/registry";
import { canvasGfx } from "../../lib/retro/canvas";
import { H, W, emptyInput, nullSfx, rng, type Button, type IO } from "../../lib/retro/engine";

const q = new URLSearchParams(location.search);
const def = RETRO_GAMES.find((g) => g.id === q.get("game")) ?? RETRO_GAMES[0];
const at = (q.get("at") ?? "4,15,40").split(",").map(Number);
const seed = Number(q.get("seed") ?? 7);
const mash = q.get("mash") !== "0";
const scale = Number(q.get("scale") ?? 3);

const BUTTONS: Button[] = ["left", "right", "up", "down", "a", "b"];
const r = rng(seed + 5);
let game = def.create(seed);
let held: Record<Button, boolean> = { left: false, right: false, up: false, down: false, a: false, b: false };
let ended = false;
const io: IO = { input: emptyInput(), sfx: nullSfx, time: 0, score: () => {}, gameOver: () => (ended = true), win: () => (ended = true) };
const out: HTMLCanvasElement[] = [];
for (const t of at) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  c.style.cssText = `width:${W * scale}px;height:${H * scale}px;image-rendering:pixelated;margin:6px;display:inline-block`;
  c.title = `${def.id} @ ${t}s`;
  document.body.appendChild(c);
  out.push(c);
}
const scratch = document.createElement("canvas");
scratch.width = W;
scratch.height = H;
const scratchGfx = canvasGfx(scratch.getContext("2d")!);
const last = Math.max(...at);
let shot = 0;
for (let f = 0; f <= last * 60 && shot < at.length; f++) {
  if (mash && f % 14 === 0) {
    const prev = held;
    held = { ...held };
    // (a kid who mostly goes forward and presses A a lot)
    for (const b of BUTTONS) if (r.chance(0.35)) held[b] = r.chance(b === "right" || b === "a" ? 0.65 : 0.35);
    if (held.left && held.right) held.left = false;
    if (held.up && held.down) held.down = false;
    io.input = { held, pressed: Object.fromEntries(BUTTONS.map((b) => [b, held[b] && !prev[b]])) as Record<Button, boolean>, tap: null, pointer: null };
  } else io.input = { ...io.input, pressed: { left: false, right: false, up: false, down: false, a: false, b: false }, tap: null };
  // start the game the way a kid does (A on the first frames)
  if (f < 3) io.input = { ...io.input, pressed: { ...io.input.pressed, a: f === 1 } };
  io.time = f / 60;
  game.update(io);
  if (ended) {
    game = def.create(seed + f);
    ended = false;
  }
  // draw EVERY frame, as the real player does (some games ease their camera inside draw()), and
  // keep the frame asked for
  if (f === Math.round(at[shot] * 60)) {
    game.draw(canvasGfx(out[shot].getContext("2d")!));
    shot++;
  } else game.draw(scratchGfx);
}
(window as unknown as { __shots: unknown }).__shots = { done: true, game: def.id, title: def.title };
