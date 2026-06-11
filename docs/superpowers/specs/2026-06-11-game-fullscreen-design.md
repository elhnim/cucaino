# Game Full-Screen Mode — Design

**Date:** 2026-06-11
**Status:** Approved by user (full screen by default: hide app chrome AND browser bars; exit button)

## Goal

Every game opens full screen by default: the KidShell header and bottom nav hide so the game fills the viewport, and on the kid's first tap the browser itself enters true full-screen (browsers forbid it before a gesture — same unlock trick as the game music). A small ⤡ button in the game corner exits full screen (chrome and browser bars return) and turns into ⤢ to re-enter.

## Scope

### Games that go full screen (same 12 mount points as GameAudio)

| Game | Mount file (beside the existing `<GameAudio …/>`) |
|---|---|
| Star Pets | `components/pet/PetGame.tsx` (main return) |
| Quiz | `components/play/QuizGame.tsx` (setup, playing, finished returns) |
| Nugget Market | `components/trading/TradingHub.tsx` |
| Invest | `components/invest/InvestHub.tsx` |
| AI Arcade | `components/arcade/ArcadeHub.tsx` + `components/arcade/GameShell.tsx` |
| Dream Life | `components/dream-life/DreamLifeGame.tsx` (lobby + playing returns) |
| Money Town | `components/money-town/MoneyTownGame.tsx` (lobby + job-spin + board returns) |

Win-screen returns (Dream Life, Money Town) do NOT mount it — leaving a game or reaching a win screen restores chrome automatically via unmount.

### Explicitly NOT in scope

- Tuner, Metronome/practice, timetable, parent screens, todo/home/rewards: untouched.
- No persistence — full screen is the default every time a game opens; an exit only lasts until the next game mount.
- No orientation locking, no scaling/zoom changes.

## Behavior rules

1. **Game mount** → app chrome (KidShell header + bottom nav) hides immediately; game area becomes full height. A one-time `pointerdown` listener requests browser full-screen on the kid's first tap (combined with the audio unlock tap — one tap does both).
2. **Exit button tap** → exits browser full-screen AND restores header/nav; button flips to ⤢. The pending first-tap listener is cancelled — once exited, nothing re-enters until the kid taps ⤢ or remounts a game.
3. **Re-enter (⤢) tap** → hides chrome again and requests browser full-screen directly (the tap itself is the gesture).
4. **Game unmount** (navigate away, win screen) → chrome restored, browser full-screen exited. Same 200 ms deferred-restore trick as the audio: arcade hub ↔ mini-game transitions and Quiz/Money-Town internal mode switches don't flash the chrome.
5. **External exit** (ESC key, system gesture, iPad swipe) → manager hears `fullscreenchange`, syncs the button to ⤢; app chrome STAYS hidden (the kid only loses the browser-bar layer; the game still fills the app viewport). Tapping ⤡/⤢ still works as expected.
6. **Installed PWA / unsupported browsers** (`document.fullscreenEnabled` false, no webkit fallback): browser-fullscreen calls are silent no-ops; chrome hiding still works fully. All failures (rejected promises) are silently swallowed — games never break because of full-screen.

## Architecture

### Files

```
lib/fullscreen/fullscreen-manager.ts   — client-only module (no React)
components/games/GameFullscreen.tsx    — drop-in component per game
components/kid/KidShell.tsx            — listens, hides header + nav
```

### `lib/fullscreen/fullscreen-manager.ts`

Client-only module (SSR no-op guards), mirroring `sound-manager.ts` patterns:

- `enterImmersive()` — marks immersive state, dispatches `game-fullscreen` CustomEvent (`detail: { active: true }`) on `window`, arms the one-time `pointerdown` listener (capture, document) that calls `requestBrowserFullscreen()`.
- `exitImmersive({ deferMs })` — with `deferMs` (200, used on unmount) schedules the exit; any `enterImmersive` within the window cancels it (seamless remounts). Exit = dispatch `{ active: false }`, disarm pending listener, exit browser full-screen.
- `requestBrowserFullscreen()` / `exitBrowserFullscreen()` — feature-detected: `document.documentElement.requestFullscreen()` with `webkitRequestFullscreen` fallback; promise rejections swallowed.
- `isImmersive()`, `isBrowserFullscreen()`, `subscribe(cb)` — for the button state; also listens to `fullscreenchange`/`webkitfullscreenchange` to sync after ESC/system exits.

### `components/games/GameFullscreen.tsx`

`"use client"` drop-in, API mirrors GameAudio:

```tsx
<GameFullscreen className?="…" />
```

- Mount: `enterImmersive()`. Unmount: `exitImmersive({ deferMs: 200 })`.
- Renders the toggle: fixed circular button, same styling family as the speaker button, positioned directly **below** the game's GameAudio button (default `top-14 right-3`; games whose speaker sits at `top-14`/`top-16` pass a className putting it one slot lower). `z-30`.
- Icon: `⤡` when immersive (tap = exit), `⤢` when not (tap = re-enter). `aria-label` accordingly.

### `components/kid/KidShell.tsx`

New listener mirroring the existing `quiz-active` pattern (~line 199): `game-fullscreen` event sets `isGameFullscreen`; when true, the `<header>` and bottom `<nav>` are not rendered (conditional render). Children container keeps `flex-1` so the game fills `h-dvh`.

## Error handling

- SSR: all manager functions no-op without `window`.
- Fullscreen API absent/rejected (PWA standalone, older iPads, permission denials): silent no-op; chrome hiding unaffected.
- Multiple GameFullscreen instances across conditional returns: manager state is idempotent (`enterImmersive` while immersive is a no-op that just cancels pending exits).

## Acceptance criteria

1. `npm run typecheck` and `npm run build` pass.
2. Opening each of the 7 games hides the kid header and bottom nav; leaving the game restores them.
3. In a regular browser, the kid's first tap inside a game also enters browser full-screen; the ⤡ button exits both layers; ⤢ re-enters.
4. ESC/system exit from browser full-screen flips the button to ⤢ without breaking the game or chrome state.
5. Arcade hub ↔ mini-game navigation does not flash the header/nav (deferred restore).
6. Quiz internal mode changes (setup → playing → finished) keep chrome hidden throughout.
7. Tuner, practice, parent, and non-game kid screens behave exactly as before.
8. In the installed PWA, games still hide header/nav with no errors despite the Fullscreen API being unavailable.
