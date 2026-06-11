// Client-only audio singleton. Every export is a safe no-op during SSR.
// Music: one looping HTMLAudioElement, 600ms fade-in to 0.35, 400ms fade-out.
// SFX: pool of 4 elements per effect so rapid sounds overlap.
// Mute: persisted to localStorage "cucaino-audio-muted" ("1" = muted).
// Autoplay: browsers block audio until a user gesture — the first requested
// track is queued and started by a one-time document pointerdown listener.

export type MusicTrack =
  | "pet"
  | "quiz"
  | "market"
  | "invest"
  | "arcade"
  | "dream-life"
  | "money-town";

export type SfxName = "coin" | "correct" | "wrong" | "tap" | "win" | "sparkle";

const MUSIC_VOLUME = 1.0; // attenuation is baked into the MP3s (iPad Safari ignores the volume property)
const SFX_VOLUME = 1.0;
const FADE_IN_MS = 600;
const FADE_OUT_MS = 400;
const FADE_STEP_MS = 50;
const SFX_POOL_SIZE = 4;
const MUTE_KEY = "cucaino-audio-muted";

const isBrowser = typeof window !== "undefined";

let muted = false;
if (isBrowser) {
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // localStorage unavailable (private mode etc.) — stay unmuted, in-memory only
  }
}

let unlocked = false;
let pendingTrack: MusicTrack | null = null;

let music: HTMLAudioElement | null = null;
let currentTrack: MusicTrack | null = null;
let stopTimer: number | null = null;

const sfxPools = new Map<SfxName, { els: HTMLAudioElement[]; next: number }>();

const fadeTimers = new WeakMap<HTMLAudioElement, number>();

function clearFade(el: HTMLAudioElement) {
  const t = fadeTimers.get(el);
  if (t !== undefined) {
    window.clearInterval(t);
    fadeTimers.delete(el);
  }
}

function fadeTo(el: HTMLAudioElement, target: number, ms: number, onDone?: () => void) {
  clearFade(el);
  const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
  const delta = (target - el.volume) / steps;
  let n = 0;
  const timer = window.setInterval(() => {
    n += 1;
    el.volume = Math.min(1, Math.max(0, el.volume + delta));
    if (n >= steps) {
      clearFade(el);
      el.volume = target;
      onDone?.();
    }
  }, FADE_STEP_MS);
  fadeTimers.set(el, timer);
}

function startMusic(track: MusicTrack) {
  const el = new Audio(`/audio/music/${track}.mp3`);
  el.loop = true;
  el.volume = 0;
  music = el;
  currentTrack = track;
  if (muted) return; // keep the reference; unmute resumes it
  el.play()
    .then(() => fadeTo(el, MUSIC_VOLUME, FADE_IN_MS))
    .catch(() => {
      // play() rejected (file missing / still locked) — never break the game
    });
}

if (isBrowser) {
  document.addEventListener(
    "pointerdown",
    () => {
      unlocked = true;
      if (pendingTrack) {
        const t = pendingTrack;
        pendingTrack = null;
        startMusic(t);
      }
    },
    { once: true, capture: true },
  );
}

export function playMusic(track: MusicTrack): void {
  if (!isBrowser) return;
  // Cancel any deferred stop — a remount with the same track continues seamlessly.
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (!unlocked) {
    pendingTrack = track;
    return;
  }
  if (currentTrack === track && music) {
    if (!muted && music.paused) {
      music.play().then(() => fadeTo(music!, MUSIC_VOLUME, FADE_IN_MS)).catch(() => {});
    } else if (!muted) {
      fadeTo(music, MUSIC_VOLUME, FADE_IN_MS); // cancel an in-flight fade-out
    }
    return;
  }
  if (music) {
    const old = music;
    fadeTo(old, 0, FADE_OUT_MS, () => {
      old.pause();
      old.src = "";
    });
  }
  startMusic(track);
}

export function stopMusic(opts?: { deferMs?: number }): void {
  if (!isBrowser) return;
  const doStop = () => {
    stopTimer = null;
    pendingTrack = null;
    if (music) {
      const el = music;
      fadeTo(el, 0, FADE_OUT_MS, () => {
        el.pause();
        el.src = "";
      });
      music = null;
      currentTrack = null;
    }
  };
  if (stopTimer !== null) window.clearTimeout(stopTimer);
  if (opts?.deferMs) {
    stopTimer = window.setTimeout(doStop, opts.deferMs);
  } else {
    doStop();
  }
}

export function playSfx(name: SfxName): void {
  if (!isBrowser || muted || !unlocked) return;
  let pool = sfxPools.get(name);
  if (!pool) {
    pool = {
      els: Array.from({ length: SFX_POOL_SIZE }, () => {
        const el = new Audio(`/audio/sfx/${name}.mp3`);
        el.volume = SFX_VOLUME;
        return el;
      }),
      next: 0,
    };
    sfxPools.set(name, pool);
  }
  const el = pool.els[pool.next]; // round-robin: if all busy, the oldest restarts
  pool.next = (pool.next + 1) % SFX_POOL_SIZE;
  el.currentTime = 0;
  el.play().catch(() => {});
}

export function getMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // in-memory only
  }
  if (music) {
    if (value) {
      const el = music;
      fadeTo(el, 0, FADE_OUT_MS, () => el.pause());
    } else {
      music.play().then(() => fadeTo(music!, MUSIC_VOLUME, FADE_IN_MS)).catch(() => {});
    }
  }
}
