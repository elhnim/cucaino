# Game Full-Screen Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Games open with KidShell chrome hidden (immersive) and enter browser full-screen on the kid's first tap, with a ⤡/⤢ toggle to exit/re-enter.

**Architecture:** Mirrors the shipped game-audio pattern: a client-only singleton (`lib/fullscreen/fullscreen-manager.ts`) owns immersive state + browser Fullscreen API + the first-tap unlock; a drop-in component (`components/games/GameFullscreen.tsx`) mounts beside every `<GameAudio/>`; KidShell listens to a `game-fullscreen` window event (same pattern as its existing `quiz-active` listener) and conditionally renders header + nav.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind. No new dependencies. No test runner in repo — verification is typecheck, build, and dev smoke checks.

**Spec:** `docs/superpowers/specs/2026-06-11-game-fullscreen-design.md`

---

### Task 1: `lib/fullscreen/fullscreen-manager.ts`

**Files:**
- Create: `lib/fullscreen/fullscreen-manager.ts`

- [ ] **Step 1: Create the file** with exactly this content:

```ts
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

function onFirstTap(e: PointerEvent) {
  // The toggle button manages full-screen itself — if the kid's very first
  // tap is the ⤡ exit button, entering here would cause an enter-then-exit
  // flicker. Leave the listener armed; exitImmersive() disarms it.
  if ((e.target as Element | null)?.closest?.("[data-fullscreen-toggle]")) return;
  disarmFirstTap();
  requestBrowserFullscreen();
}

function armFirstTap() {
  if (firstTapArmed) return;
  firstTapArmed = true;
  document.addEventListener("pointerdown", onFirstTap, true);
}

function disarmFirstTap() {
  if (!firstTapArmed) return;
  firstTapArmed = false;
  document.removeEventListener("pointerdown", onFirstTap, true);
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
```

- [ ] **Step 2:** Run `npm run typecheck` — expect exit 0.
- [ ] **Step 3: Commit**

```powershell
git add lib/fullscreen/fullscreen-manager.ts
git commit -m "feat(fullscreen): immersive + browser-fullscreen manager with first-tap unlock"
```

---

### Task 2: `components/games/GameFullscreen.tsx`

**Files:**
- Create: `components/games/GameFullscreen.tsx`

- [ ] **Step 1: Create the file** with exactly this content:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  enterImmersive,
  exitImmersive,
  isImmersive,
  requestBrowserFullscreen,
  subscribe,
} from "@/lib/fullscreen/fullscreen-manager";

const DEFAULT_CLASS =
  "fixed top-[60px] right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur " +
  "shadow flex items-center justify-center text-lg active:scale-95 transition-transform";

/**
 * Drop into a game beside <GameAudio/>: hides the KidShell chrome on mount
 * (immersive), restores it on unmount (deferred 200ms so sibling-return
 * remounts don't flash the chrome), and renders the ⤡/⤢ toggle. Default
 * position sits directly below a speaker button at top-3; games whose speaker
 * is lower pass a className with the matching top from the spec table.
 */
export default function GameFullscreen({ className }: { className?: string }) {
  // Initial true matches mount behavior; synced from the manager after mount.
  const [immersive, setImmersiveState] = useState(true);

  useEffect(() => {
    enterImmersive();
    return () => exitImmersive({ deferMs: 200 });
  }, []);

  useEffect(() => {
    setImmersiveState(isImmersive());
    return subscribe(() => setImmersiveState(isImmersive()));
  }, []);

  const toggle = () => {
    if (isImmersive()) {
      exitImmersive();
    } else {
      enterImmersive();
      requestBrowserFullscreen(); // synchronously inside the tap gesture
    }
  };

  return (
    <button
      type="button"
      data-fullscreen-toggle
      onClick={toggle}
      aria-label={immersive ? "Exit full screen" : "Enter full screen"}
      className={className ?? DEFAULT_CLASS}
    >
      {immersive ? "⤡" : "⤢"}
    </button>
  );
}
```

- [ ] **Step 2:** Run `npm run typecheck` — expect exit 0.
- [ ] **Step 3: Commit**

```powershell
git add components/games/GameFullscreen.tsx
git commit -m "feat(fullscreen): GameFullscreen drop-in toggle component"
```

---

### Task 3: KidShell hides chrome on `game-fullscreen`

**Files:**
- Modify: `components/kid/KidShell.tsx`

- [ ] **Step 1: Add import** (top of file, beside the other `@/` imports):

```tsx
import { FULLSCREEN_EVENT, isImmersive } from "@/lib/fullscreen/fullscreen-manager";
```

- [ ] **Step 2: Add state + listener** directly after the existing `isQuizActive` block (~line 199–204, the `quiz-active` listener — mirror its shape):

```tsx
const [isGameFullscreen, setIsGameFullscreen] = useState(false);
useEffect(() => {
  setIsGameFullscreen(isImmersive()); // KidShell can remount mid-game (route changes)
  const handler = (e: Event) => setIsGameFullscreen((e as CustomEvent).detail?.active ?? false);
  window.addEventListener(FULLSCREEN_EVENT, handler);
  return () => window.removeEventListener(FULLSCREEN_EVENT, handler);
}, []);
```

- [ ] **Step 3: Conditionally render header and nav.** The component returns `<main className={"h-dvh …"}>` containing `<header …>…</header>` (~line 231) and `<nav className="bg-white border-t …">…</nav>` (~line 364). Wrap BOTH (not the children container, not `KidOverridesApplier`, not `BadgeUnlockModal`):

```tsx
{!isGameFullscreen && (
  <header /* …existing header exactly as-is… */ >
    …
  </header>
)}
```

```tsx
{!isGameFullscreen && (
  <nav /* …existing nav exactly as-is… */ >
    …
  </nav>
)}
```

The children container (`<div className="flex-1 overflow-y-auto scroll-area">`) stays unchanged — `flex-1` makes it fill `h-dvh` when header/nav are gone.

- [ ] **Step 4:** Run `npm run typecheck` — expect exit 0.
- [ ] **Step 5: Commit**

```powershell
git add components/kid/KidShell.tsx
git commit -m "feat(fullscreen): KidShell hides header and nav while a game is immersive"
```

---

### Task 4: Mount `GameFullscreen` in all games (13 insertions)

**Files (modify):** the 8 game files below. In each, add the import and insert `<GameFullscreen …/>` immediately AFTER the existing `<GameAudio …/>` line(s) — find them with Grep for `<GameAudio`.

```tsx
import GameFullscreen from "@/components/games/GameFullscreen";
```

| File | Insert after each GameAudio in… | Insertion |
|---|---|---|
| `components/pet/PetGame.tsx` | main return (1×) | `<GameFullscreen />` (default top-[60px]) |
| `components/trading/TradingHub.tsx` | root (1×) | `<GameFullscreen />` |
| `components/invest/InvestHub.tsx` | root (1×) | `<GameFullscreen />` |
| `components/play/QuizGame.tsx` | setup, playing, finished returns (3×) | `<GameFullscreen className="fixed top-[112px] right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-lg active:scale-95 transition-transform" />` |
| `components/arcade/ArcadeHub.tsx` | root (1×) | same `top-[112px]` className as Quiz |
| `components/arcade/GameShell.tsx` | root (1×) | same `top-[112px]` className as Quiz |
| `components/dream-life/DreamLifeGame.tsx` | lobby + playing returns (2×); NOT the win-screen return | `<GameFullscreen className="fixed top-[104px] right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-lg active:scale-95 transition-transform" />` |
| `components/money-town/MoneyTownGame.tsx` | lobby + job-spin + board returns (3×); NOT the win return | same `top-[104px]` className as Dream Life |

- [ ] **Step 1:** Apply all insertions per the table (Quiz finished/results return DOES get one — only Dream Life and Money Town win screens are excluded).
- [ ] **Step 2:** Run `npm run typecheck` then `npm run build` — both exit 0.
- [ ] **Step 3: Commit**

```powershell
git add components/pet/PetGame.tsx components/trading/TradingHub.tsx components/invest/InvestHub.tsx components/play/QuizGame.tsx components/arcade/ArcadeHub.tsx components/arcade/GameShell.tsx components/dream-life/DreamLifeGame.tsx components/money-town/MoneyTownGame.tsx
git commit -m "feat(fullscreen): games open immersive by default with exit toggle"
```

---

### Task 5: Verification

- [ ] **Step 1:** `npm run typecheck` and `npm run build` — exit 0.
- [ ] **Step 2:** Grep `<GameFullscreen` across components/ — expect exactly 13 occurrences in the 8 files above; grep app/ and the not-in-scope components (Tuner, Metronome, parent) — expect 0.
- [ ] **Step 3:** Dev smoke: `npm run dev` (background), load `/select-kid` — confirm 200 and no `game-fullscreen` console errors server-side. (True browser-fullscreen behavior needs a device check — note it for the user.)
- [ ] **Step 4:** Confirm `git diff <base>..HEAD --name-only -- components/kid/Tuner.tsx components/kid/Metronome.tsx` is empty.

---

## Self-review notes

- Spec coverage: manager (Task 1 = behavior rules 1–6, button-exclusion guard, fullscreenchange sync), toggle component + button spec (Task 2), KidShell conditional render + remount sync (Task 3), 13 mounts incl. Quiz-finished-stays-immersive and win-screen exclusions (Task 4), acceptance 1/2/5/6/7 partially verifiable headless (Task 5); acceptance 3/4/8 (true browser FS, ESC, PWA) require a hands-on device check — flagged to user at the end.
- Type consistency: `FULLSCREEN_EVENT`, `enterImmersive`, `exitImmersive({deferMs})`, `isImmersive`, `isBrowserFullscreen`, `subscribe`, `requestBrowserFullscreen` used identically across tasks.
