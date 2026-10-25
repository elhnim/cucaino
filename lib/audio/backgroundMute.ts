// Every sound in the app goes quiet the moment the app isn't on screen — switched away from,
// phone locked, app closed — and picks up again when the kid comes back.
//
// The app makes sound from about ten independent places (the park's ambience, the carousel's
// music, the karts, the Retro Arcade's chiptunes, the drum game, the tuner, the metronome, the
// practice timer, the mp3 music/sfx manager, read-aloud speech). Rather than teach each one about
// app lifecycles, this installs ONE guard, once, before any of them makes a sound:
//   - every AudioContext created afterwards is tracked; hidden -> the running ones are suspended,
//     and nothing can resume() one while the app stays hidden (some sound code resumes its
//     context on its own timer); visible again -> exactly the ones that were running resume;
//   - every <audio>/new Audio() that plays is tracked; hidden -> the playing ones pause (and a
//     play() while hidden is held back); visible -> they play on;
//   - speech is cancelled.
// Pure DOM plumbing with no app imports, so it can run as early as possible.

interface Win {
  document: { visibilityState: string; addEventListener(type: string, fn: () => void): void };
  addEventListener(type: string, fn: () => void): void;
  speechSynthesis?: { cancel(): void };
  AudioContext?: unknown;
  webkitAudioContext?: unknown;
  HTMLMediaElement?: unknown;
}
type Ctx = { state: string; suspend(): Promise<void>; resume(): Promise<void> };
type Media = { paused: boolean; pause(): void; play(): Promise<void>; addEventListener(type: string, fn: () => void, o?: { once: boolean }): void };
type CtxClass = { new (...a: unknown[]): Ctx; prototype: Ctx; __cucainoTracked?: boolean };
type MediaClass = { prototype: Media & { __cucainoPlay?: unknown } };

export interface BackgroundMute {
  /** for tests: is the app currently treated as away? */
  readonly away: boolean;
  sleep(): void;
  wake(): void;
}

export function installBackgroundMute(win: Win): BackgroundMute {
  const w = win as Win & { __cucainoBgMute?: BackgroundMute };
  if (w.__cucainoBgMute) return w.__cucainoBgMute;

  const contexts = new Set<Ctx>();
  const wasRunning = new Set<Ctx>();
  const playing = new Set<Media>();
  const toReplay = new Set<Media>();
  let away = win.document.visibilityState === "hidden";

  // ── Web Audio ──
  for (const key of ["AudioContext", "webkitAudioContext"] as const) {
    const Orig = win[key] as CtxClass | undefined;
    if (!Orig || Orig.__cucainoTracked) continue;
    const realResume = Orig.prototype.resume;
    Orig.prototype.resume = function (this: Ctx) {
      if (away) {
        wasRunning.add(this);
        return Promise.resolve();
      }
      return realResume.call(this);
    };
    const Tracked = class extends Orig {
      constructor(...a: unknown[]) {
        super(...a);
        contexts.add(this);
        if (away) {
          wasRunning.add(this);
          this.suspend().catch(() => {});
        }
      }
    } as unknown as CtxClass;
    Tracked.__cucainoTracked = true;
    (win as unknown as Record<string, unknown>)[key] = Tracked;
  }

  // ── <audio> / new Audio() ──
  const ME = win.HTMLMediaElement as MediaClass | undefined;
  const realPlay = ME?.prototype.play;
  if (ME && realPlay && !ME.prototype.__cucainoPlay) {
    ME.prototype.__cucainoPlay = realPlay;
    ME.prototype.play = function (this: Media) {
      if (away) {
        toReplay.add(this);
        return Promise.resolve();
      }
      if (!playing.has(this)) {
        playing.add(this);
        this.addEventListener("ended", () => playing.delete(this), { once: true });
      }
      return realPlay.call(this);
    };
  }

  const sleep = () => {
    if (away) return;
    away = true;
    for (const c of contexts) {
      if (c.state === "closed") contexts.delete(c);
      else if (c.state === "running") {
        wasRunning.add(c);
        c.suspend().catch(() => {});
      }
    }
    for (const el of playing)
      if (!el.paused) {
        toReplay.add(el);
        el.pause();
      }
    try {
      win.speechSynthesis?.cancel();
    } catch {
      /* no speech */
    }
  };
  const wake = () => {
    if (!away) return;
    away = false;
    for (const c of wasRunning) if (c.state !== "closed") c.resume().catch(() => {});
    wasRunning.clear();
    for (const el of toReplay) el.play().catch(() => {});
    toReplay.clear();
  };

  win.document.addEventListener("visibilitychange", () => (win.document.visibilityState === "hidden" ? sleep() : wake()));
  win.addEventListener("pagehide", sleep);
  win.addEventListener("pageshow", () => win.document.visibilityState !== "hidden" && wake());

  const api: BackgroundMute = {
    get away() {
      return away;
    },
    sleep,
    wake,
  };
  w.__cucainoBgMute = api;
  return api;
}
