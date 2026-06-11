// Client-only full-screen singleton. Every export is a safe no-op during SSR.
// Two layers: "immersive" (KidShell hides its header + bottom nav, signalled
// by the "game-fullscreen" window event) and true browser full-screen
// (Fullscreen API — only enterable inside a user gesture, so it's armed on
// the first tap, exactly like the audio unlock).

export const FULLSCREEN_EVENT = "game-fullscreen";

const isBrowser = typeof window !== "undefined";

let immersive = false;
let exitTimer: number | null = null;
let firstTapArmed = false;
const listeners = new Set<() => void>();

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // a broken subscriber must never break the others
    }
  });
}

function dispatch(active: boolean) {
  window.dispatchEvent(new CustomEvent(FULLSCREEN_EVENT, { detail: { active } }));
  notify();
}

export function requestBrowserFullscreen(): void {
  if (!isBrowser) return;
  try {
    const doc = document as FsDoc;
    if (document.fullscreenElement || doc.webkitFullscreenElement) return;
    const el = document.documentElement as FsEl;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } catch {
    // unsupported / permission denied — immersive mode still works
  }
}

export function exitBrowserFullscreen(): void {
  if (!isBrowser) return;
  try {
    const doc = document as FsDoc;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    }
  } catch {
    // already out / unsupported
  }
}

function onFirstTap(e: Event) {
  // The toggle button manages full-screen itself — if the kid's very first
  // tap is the ⤡ exit button, entering here would cause an enter-then-exit
  // flicker. Leave the listener armed; exitImmersive() disarms it.
  if ((e.target as Element | null)?.closest?.("[data-fullscreen-toggle]")) return;
  disarmFirstTap();
  requestBrowserFullscreen();
}

// "click" rather than "pointerdown": on touch devices pointerdown does not
// grant the transient user activation the Fullscreen API requires; click does.
function armFirstTap() {
  if (firstTapArmed) return;
  firstTapArmed = true;
  document.addEventListener("click", onFirstTap, true);
}

function disarmFirstTap() {
  if (!firstTapArmed) return;
  firstTapArmed = false;
  document.removeEventListener("click", onFirstTap, true);
}

export function enterImmersive(): void {
  if (!isBrowser) return;
  // Cancel any deferred exit — a remount within the window continues seamlessly.
  if (exitTimer !== null) {
    window.clearTimeout(exitTimer);
    exitTimer = null;
  }
  if (immersive) return;
  immersive = true;
  armFirstTap();
  dispatch(true);
}

export function exitImmersive(opts?: { deferMs?: number }): void {
  if (!isBrowser) return;
  const doExit = () => {
    exitTimer = null;
    if (!immersive) return;
    immersive = false;
    disarmFirstTap();
    exitBrowserFullscreen();
    dispatch(false);
  };
  if (exitTimer !== null) window.clearTimeout(exitTimer);
  if (opts?.deferMs) {
    exitTimer = window.setTimeout(doExit, opts.deferMs);
  } else {
    doExit();
  }
}

export function isImmersive(): boolean {
  return immersive;
}

export function isBrowserFullscreen(): boolean {
  if (!isBrowser) return false;
  const doc = document as FsDoc;
  return !!(document.fullscreenElement || doc.webkitFullscreenElement);
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

if (isBrowser) {
  // External exits (ESC, system gesture) only change the browser layer;
  // immersive state — and therefore the ⤡ icon — intentionally stays put.
  const sync = () => notify();
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync as EventListener);
}
