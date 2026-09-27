// Cucaino Retro Arcade — a tiny fantasy console for original NES/SNES-style games.
//
// Every game renders into a 256x224 pixel screen (SNES resolution) through `Gfx`, reads a
// D-pad + A/B `Input`, and makes chiptune noises through `Sfx`. Games never touch the DOM
// themselves: sprites are plain pixel-art strings and the host turns them into canvases.
// That keeps every game runnable headless, so tests can play each one for thousands of
// frames with random buttons to make sure nothing ever crashes.

export const W = 256;
export const H = 224;

export type Button = "left" | "right" | "up" | "down" | "a" | "b";

export interface Input {
  /** held this frame */
  held: Record<Button, boolean>;
  /** went down this frame */
  pressed: Record<Button, boolean>;
  /** a tap/click on the screen this frame, in screen pixels (for aim-and-tap games) */
  tap: { x: number; y: number } | null;
  /** where the finger/mouse is, if it's over the screen */
  pointer: { x: number; y: number; down: boolean } | null;
}

/** Pixel art: one string per row, one char per pixel. "." (or space) is transparent. */
export interface Sprite {
  rows: string[];
  pal: Record<string, string>;
}

export function sprite(rows: string[], pal: Record<string, string>): Sprite {
  return { rows, pal };
}
export const spriteW = (s: Sprite) => s.rows[0]?.length ?? 0;
export const spriteH = (s: Sprite) => s.rows.length;

export interface Gfx {
  clear(color: string): void;
  rect(x: number, y: number, w: number, h: number, color: string): void;
  /** 1px outline */
  box(x: number, y: number, w: number, h: number, color: string): void;
  circle(x: number, y: number, r: number, color: string): void;
  line(x1: number, y1: number, x2: number, y2: number, color: string): void;
  sprite(s: Sprite, x: number, y: number, opts?: { flipX?: boolean; flipY?: boolean; scale?: number }): void;
  /** 8px pixel font; align defaults to left */
  text(str: string, x: number, y: number, color: string, opts?: { align?: "left" | "center" | "right"; size?: number }): void;
  /** shift everything drawn after this (for scrolling); reset with camera(0, 0) */
  camera(x: number, y: number): void;
  alpha(a: number): void;
}

export type SfxName = "jump" | "shoot" | "hit" | "coin" | "explode" | "powerup" | "die" | "blip" | "win" | "bounce" | "laser" | "step";

export interface Sfx {
  play(name: SfxName): void;
  /** a single chiptune note */
  tone(freq: number, dur: number, wave?: OscillatorType, vol?: number): void;
}

/** What a running game can do to the outside world. */
export interface IO {
  input: Input;
  sfx: Sfx;
  /** seconds since this round started */
  time: number;
  /** add points to the score shown by the host */
  score(points: number): void;
  /** the round is over (the host shows GAME OVER and the score) */
  gameOver(): void;
  /** optional: the kid finished the game (shows YOU WIN!) */
  win(): void;
}

export interface GameInstance {
  /** fixed 1/60 s steps */
  update(io: IO): void;
  draw(g: Gfx): void;
}

export interface RetroGameDef {
  id: string;
  title: string;
  /** a one-line pitch for the cabinet */
  blurb: string;
  /** genre tag on the cabinet */
  genre: "Action" | "Platformer" | "Shooter" | "Puzzle" | "Racing" | "Sports" | "Adventure" | "Classic";
  emoji: string;
  /** cabinet colour */
  color: string;
  /** what the buttons do, shown before starting */
  controls: string;
  /** which on-screen controls this game uses */
  pad: { dpad: "4" | "lr" | "ud" | "none"; a?: string; b?: string; tap?: boolean };
  create(seed: number): GameInstance;
}

// ── helpers shared by the games ──

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Small fast seeded RNG so a game can be replayed/tested deterministically. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + next() * (hi - lo),
    int: (lo: number, hi: number) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

/** The retro palette every game shares (NES-ish, a touch candier). */
export const PAL = {
  black: "#0d0b1a",
  night: "#1b1535",
  navy: "#26306b",
  blue: "#3c6cf0",
  sky: "#6cb6ff",
  cyan: "#5ef2ff",
  teal: "#1fb3a3",
  green: "#3ecf55",
  lime: "#b6f24a",
  yellow: "#ffe14d",
  orange: "#ff9a3c",
  red: "#ff4a4a",
  pink: "#ff6fcf",
  purple: "#9a5cff",
  brown: "#9a5a32",
  tan: "#f2c48d",
  white: "#ffffff",
  grey: "#9aa0b8",
  dark: "#4a4e6a",
} as const;

export function emptyInput(): Input {
  const b = () => ({ left: false, right: false, up: false, down: false, a: false, b: false });
  return { held: b(), pressed: b(), tap: null, pointer: null };
}

/** A Gfx that draws nothing — for headless tests. */
export function nullGfx(): Gfx {
  const noop = () => {};
  return { clear: noop, rect: noop, box: noop, circle: noop, line: noop, sprite: noop, text: noop, camera: noop, alpha: noop };
}

export const nullSfx: Sfx = { play: () => {}, tone: () => {} };
