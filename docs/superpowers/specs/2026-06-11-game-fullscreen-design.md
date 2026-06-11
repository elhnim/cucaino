# Game Full-Screen Mode — Design

**Date:** 2026-06-11
**Status:** Approved by user. Codex-reviewed; blockers and should-fixes applied.

## Goal

Every game opens **app-immersive immediately** (KidShell header + bottom nav hide, game fills the viewport) and enters **browser full-screen on the kid's first eligible tap** (browsers forbid it before a gesture — same unlock trick as the game music; one tap starts both). A single round toggle button in the game corner exits full screen and re-enters it.

## Button semantics (single two-state toggle)

The button reflects the **immersive (chrome-hidden) state**, not the browser-fullscreen layer:

- **⤡ shown while immersive** (chrome hidden). Tap = full exit: restore header/nav AND exit browser full-screen AND cancel any pending first-tap listener.
- **⤢ shown while not immersive.** Tap = full enter: hide chrome AND request browser full-screen directly (the tap is the gesture).
- **External browser exit (ESC / system gesture):** chrome stays hidden, so the game is still immersive and the button **stays ⤡**. Tapping it performs the normal full exit (the browser-fullscreen part is a harmless no-op). No separate icon state for "immersive but not browser-fullscreen".

## Scope

### Mount points (12, exactly the GameAudio positions)

Each `<GameFullscreen …/>` is inserted immediately after the existing `<GameAudio …/>`. Placement column = the toggle's fixed position (40 px button directly below that game's speaker button, 8 px gap, right-3, z-30).

| # | File / return | Speaker is at | GameFullscreen className top |
|---|---|---|---|
| 1 | `components/pet/PetGame.tsx` main return | top-3 | `top-[60px]` |
| 2–4 | `components/play/QuizGame.tsx` setup, playing, finished returns | top-16 | `top-[112px]` |
| 5 | `components/trading/TradingHub.tsx` root | top-3 | `top-[60px]` |
| 6 | `components/invest/InvestHub.tsx` root | top-3 | `top-[60px]` |
| 7 | `components/arcade/ArcadeHub.tsx` root | top-16 | `top-[112px]` |
| 8 | `components/arcade/GameShell.tsx` root | top-16 | `top-[112px]` |
| 9–10 | `components/dream-life/DreamLifeGame.tsx` lobby + playing returns | top-14 | `top-[104px]` |
| 11–12 (+job-spin) | `components/money-town/MoneyTownGame.tsx` lobby, job-spin, board returns | top-14 | `top-[104px]` |

(Money Town has 3 returns — 13 total insertions; "12" refers to the GameAudio parity, Money Town's job-spin included.)

These conditional returns are **mutually exclusive per screen** — at most ONE GameFullscreen instance is ever mounted at a time (arcade hub and GameShell are separate routes). The manager therefore needs no reference counting: `enterImmersive()` while already immersive is an idempotent no-op that cancels any pending deferred exit (this is exactly what makes return-switches seamless), and the latest call wins.

**Quiz "finished" (results screen) stays immersive** — it mounts the toggle like the other Quiz returns. Only Dream Life and Money Town win-screen returns omit it (their unmount restores chrome, mirroring how their music stops there).

### Explicitly NOT in scope

- Tuner, Metronome/practice, timetable, parent screens, todo/home/rewards: no GameFullscreen mounts, no behavior change. Observable invariants: header/nav visibility on those screens is unchanged; no new event listeners fire there.
- No persistence — immersive is the default every game mount; an exit lasts only until the next mount.
- No orientation locking, no scaling/zoom changes.

## Behavior rules

1. **Game mount** → `enterImmersive()`: chrome hides immediately; a one-time `pointerdown` listener (capture, document) is armed to request browser full-screen on the first tap. **Exclusion:** taps on the toggle button itself (or inside it) are ignored by this listener — guarded via `closest('[data-fullscreen-toggle]')` — so a kid whose first tap is the ⤡ button gets a clean exit, not an enter-then-exit flicker.
2. **⤡ tap** → full exit (chrome back, browser FS exited, pending listener disarmed). Nothing re-enters until ⤢ tap or next game mount.
3. **⤢ tap** → full enter (chrome hidden, browser FS requested synchronously in the gesture).
4. **Game unmount** → `exitImmersive({ deferMs: 200 })`: deferred full exit; any `enterImmersive` within the window cancels it. Covers arcade hub ↔ mini-game, Quiz setup→playing→finished, Money Town lobby→job-spin→board with zero chrome flash.
5. **External browser exit** (ESC etc.) → manager hears `fullscreenchange`, updates `isBrowserFullscreen()` only. Button stays ⤡ per the semantics above.
6. **Fullscreen API unavailable or rejected** (`document.fullscreenEnabled === false` and no webkit fallback, permission denial, or any rejected promise — typical for the installed standalone PWA): browser-FS calls are silent no-ops — no thrown errors, no unhandled rejections, console stays clean; chrome hiding and the toggle keep working fully.

## Architecture

### Files

```
lib/fullscreen/fullscreen-manager.ts   — client-only module (no React)
components/games/GameFullscreen.tsx    — drop-in component per game
components/kid/KidShell.tsx            — listens, hides header + nav
```

### `lib/fullscreen/fullscreen-manager.ts`

Client-only module (SSR no-op guards), mirroring `sound-manager.ts` patterns:

- `enterImmersive()` — cancels pending deferred exit; if already immersive, returns. Else: set flag, dispatch `game-fullscreen` CustomEvent (`detail: { active: true }`) on `window`, arm the one-time `pointerdown` capture listener (with the toggle-button exclusion) that calls `requestBrowserFullscreen()`.
- `exitImmersive(opts?: { deferMs?: number })` — immediate or deferred: clear flag, dispatch `{ active: false }`, disarm pending listener, `exitBrowserFullscreen()`.
- `requestBrowserFullscreen()` / `exitBrowserFullscreen()` — feature-detected (`document.fullscreenEnabled`, `documentElement.requestFullscreen` with `webkitRequestFullscreen` fallback; `document.exitFullscreen` / `webkitExitFullscreen`); all promise rejections caught and swallowed.
- `isImmersive()`, `isBrowserFullscreen()`, `subscribe(cb)` — for button state; listens to `fullscreenchange`/`webkitfullscreenchange`.

### `components/games/GameFullscreen.tsx`

`"use client"` drop-in: `<GameFullscreen className?="…" />`

- Mount: `enterImmersive()`. Unmount: `exitImmersive({ deferMs: 200 })`.
- Button spec: `type="button"`, `data-fullscreen-toggle`, fixed, `w-10 h-10 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-lg active:scale-95 transition-transform z-30 right-3` + per-game top from the table. Subscribes to the manager; icon ⤡ when `isImmersive()`, ⤢ otherwise; `aria-label` "Exit full screen" / "Enter full screen". Initial render assumes immersive (matches mount behavior; mute-style hydration-safe state sync in an effect).

### `components/kid/KidShell.tsx`

New listener mirroring the existing `quiz-active` pattern (~line 199): `game-fullscreen` event sets `isGameFullscreen`; when true, the `<header>` and bottom `<nav>` are not rendered (conditional render). Children container keeps `flex-1` so the game fills `h-dvh`. State syncs on mount from `isImmersive()` (covers KidShell remounting while a game is active).

## Error handling

- SSR: all manager functions no-op without `window`.
- Fullscreen API absent/rejected: per Behavior rule 6.
- KidShell unmount/remount during immersive (route changes): mount-time sync per above.

## Acceptance criteria

1. `npm run typecheck` and `npm run build` pass.
2. Opening each of the 7 games hides the kid header and bottom nav; navigating away restores them.
3. In a regular browser with Fullscreen API: the kid's first non-toggle tap inside a game also enters browser full-screen; ⤡ exits both layers; ⤢ re-enters both.
4. ESC/system exit from browser full-screen leaves chrome hidden and the button on ⤡; the button still exits/re-enters correctly afterwards.
5. Arcade hub ↔ mini-game navigation and Quiz/Money-Town internal return-switches never flash the header/nav.
6. Quiz results screen stays immersive with a working toggle.
7. Non-game screens (tuner, practice, todo, home, rewards, parent): header/nav visibility unchanged, zero new console errors.
8. When `document.fullscreenEnabled` is false or the API rejects (installed PWA): chrome hiding and the toggle still work; no thrown errors or unhandled rejections.
