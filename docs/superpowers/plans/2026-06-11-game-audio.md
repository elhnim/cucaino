# Game Soundtracks & Sound Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every game gets a looping CC0 background track plus shared sound effects, with a kid-facing mute button remembered per device.

**Architecture:** A framework-free singleton (`lib/audio/sound-manager.ts`) owns one music `HTMLAudioElement`, pooled SFX elements, autoplay unlock, and localStorage mute persistence. A drop-in client component (`components/audio/GameAudio.tsx`) mounts per game: plays its track on mount, deferred-stops on unmount (200 ms — so remounts with the same track continue seamlessly), and renders the 🔊/🔇 button. Games call `playSfx()` at the events in the spec matrix.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind. No new npm dependencies. No test runner exists in this repo — verification is `npm run typecheck`, `npm run build`, file-size audits, and a dev-server smoke check.

**Spec:** `docs/superpowers/specs/2026-06-11-game-audio-design.md`

**Pre-sourced assets:** Verified CC0/public-domain files are already downloaded to `C:\Users\MinhHoang\AppData\Local\Temp\cucaino-audio\` (music as `music__<slot>__<Title>.mp3`, SFX in `sfx\` as `sfx__<slot>__<orig>.ogg`, plus 4 Kenney source zips). If that folder is gone, re-download using the URLs recorded in Task 1's CREDITS.md content.

---

### Task 1: Audio assets — re-encode, place in `public/audio/`, write CREDITS.md

**Files:**
- Create: `public/audio/music/{pet,quiz,market,invest,arcade,dream-life,money-town}.mp3`
- Create: `public/audio/sfx/{coin,correct,wrong,tap,win,sparkle}.mp3`
- Create: `public/audio/CREDITS.md`

- [ ] **Step 1: Confirm ffmpeg is available**

Run (PowerShell): `ffmpeg -version`
Expected: version banner. If "not recognized": `winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements`, then open the command via full path or new shell (`$env:Path` refresh: `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`).

- [ ] **Step 2: Confirm source files exist**

Run (PowerShell): `Get-ChildItem "$env:TEMP\cucaino-audio" -Recurse -File | Select-Object Name, Length`
Expected: 14 `music__*.mp3` files, 12 `sfx\sfx__*.ogg` files. The primaries used below: pet="And Just Like That", quiz="Comic Game Loop - Mischief", market="Busybody", invest="Meditating Beat", arcade="Bit Bit Loop", dream-life="Inventing Flight", money-town="Going Bananas"; SFX: coin=chips-collide-1, correct=confirmation_001, wrong=error_004, tap=click_001, win=jingles_PIZZI09, sparkle=powerUp5.

- [ ] **Step 3: Re-encode music to ≤ 1.2 MB each and SFX to MP3** (run from repo root, PowerShell):

```powershell
$src = "$env:TEMP\cucaino-audio"
New-Item -ItemType Directory -Force "public\audio\music" | Out-Null
New-Item -ItemType Directory -Force "public\audio\sfx" | Out-Null

$pick = @{ pet="And Just Like That"; quiz="Mischief"; market="Busybody"; invest="Meditating"; arcade="Bit Bit"; "dream-life"="Inventing"; "money-town"="Bananas" }
foreach ($s in $pick.Keys) {
  $in = Get-ChildItem "$src\music__$($s)__*.mp3" | Where-Object Name -like "*$($pick[$s])*" | Select-Object -First 1
  $out = "public\audio\music\$s.mp3"
  # gain is baked into the files (volume=0.35 music / 0.6 SFX): iPad Safari ignores the volume property
  ffmpeg -y -loglevel error -i $in.FullName -af "volume=0.35" -codec:a libmp3lame -b:a 80k -ac 2 $out
  if ((Get-Item $out).Length -gt 1.2MB) {
    # too long at 80kbps: trim to a 90s loop with a 2s tail fade
    ffmpeg -y -loglevel error -i $in.FullName -t 90 -af "afade=t=out:st=88:d=2,volume=0.35" -codec:a libmp3lame -b:a 80k -ac 2 $out
  }
}

foreach ($s in @("coin","correct","wrong","tap","win","sparkle")) {
  $in = Get-ChildItem "$src\sfx\sfx__$($s)__*.ogg" | Select-Object -First 1
  ffmpeg -y -loglevel error -i $in.FullName -af "volume=0.6" -codec:a libmp3lame -b:a 96k "public\audio\sfx\$s.mp3"
}

Get-ChildItem "public\audio" -Recurse -File | Select-Object FullName, Length
```

Expected: 7 music MP3s each ≤ 1,258,291 bytes; 6 SFX MP3s each ≤ 100 KB.

- [ ] **Step 4: Audition the files** — play 2–3 seconds of each (e.g. `ffplay -autoexit -t 3 <file>` or open in default player) OR, if running unattended, at minimum verify each decodes: `foreach ($f in Get-ChildItem public\audio -Recurse -Filter *.mp3) { ffmpeg -v error -i $f.FullName -f null NUL }` — expected: no output (no decode errors). If a SFX sounds wrong, swap in an alternate from the Kenney zips in the temp folder (alternates: coin=chip-lay-1, correct=confirmation_002, wrong=error_008, tap=click_002, win=jingles_NES09, sparkle=glass_005).

- [ ] **Step 5: Write `public/audio/CREDITS.md`** with exactly this content:

```markdown
# Audio credits

All files are CC0 / public domain — verified per file on the source page at download time.
No attribution is legally required; this file is a courtesy record and audit trail.

## Music (public/audio/music/)

FreePD.com shut down in 2025; files were retrieved from Wayback Machine snapshots of the
original site, where every category page states: "100% Free Music — Free for Commercial Use,
Free Of Royalties, Free Of Attribution, Creative Commons 0." Public-domain dedication is
irrevocable. Download URL pattern: `https://web.archive.org/web/<snapshot>id_/https://freepd.com/music/<Title>.mp3`
(snapshots: 20250106221458 upbeat, 20250104052211 comedy, 20241217205507 electronic, 20250108092110 scoring).
All tracks re-encoded to 80 kbps MP3 (some trimmed to 90 s) for size.

| File | Title | Author | Source page | License |
|---|---|---|---|---|
| pet.mp3 | And Just Like That | Bryan Teoh | freepd.com/upbeat.php (archived) | CC0 / PD |
| quiz.mp3 | Comic Game Loop - Mischief | Kevin MacLeod | freepd.com/comedy.php (archived) | CC0 / PD |
| market.mp3 | Busybody | Bryan Teoh | freepd.com/comedy.php (archived) | CC0 / PD |
| invest.mp3 | Meditating Beat | Kevin MacLeod | freepd.com/electronic.php (archived) | CC0 / PD |
| arcade.mp3 | Bit Bit Loop | Kevin MacLeod | freepd.com/electronic.php (archived) | CC0 / PD |
| dream-life.mp3 | Inventing Flight | Bryan Teoh | freepd.com/upbeat.php (archived) | CC0 / PD |
| money-town.mp3 | Going Bananas | Bryan Teoh | freepd.com/comedy.php (archived) | CC0 / PD |

## Sound effects (public/audio/sfx/)

All from Kenney.nl asset packs. Each pack page states "License: Creative Commons CC0".
Re-encoded from OGG to 96 kbps MP3 for Safari/iPad compatibility.

| File | Original | Pack | Source page | License |
|---|---|---|---|---|
| coin.mp3 | chips-collide-1.ogg | Casino Audio | kenney.nl/assets/casino-audio | CC0 |
| correct.mp3 | confirmation_001.ogg | Interface Sounds | kenney.nl/assets/interface-sounds | CC0 |
| wrong.mp3 | error_004.ogg | Interface Sounds | kenney.nl/assets/interface-sounds | CC0 |
| tap.mp3 | click_001.ogg | Interface Sounds | kenney.nl/assets/interface-sounds | CC0 |
| win.mp3 | jingles_PIZZI09.ogg | Music Jingles | kenney.nl/assets/music-jingles | CC0 |
| sparkle.mp3 | powerUp5.ogg | Digital Audio | kenney.nl/assets/digital-audio | CC0 |
```

(If Step 4 swapped any file, update the Original column accordingly.)

- [ ] **Step 6: Verify total size budget**

Run: `"{0:N1} MB" -f ((Get-ChildItem public\audio -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)`
Expected: < 10 MB.

- [ ] **Step 7: Commit**

```powershell
git add public/audio
git commit -m "feat(audio): add CC0 game soundtracks and sound-effect kit with credits"
```

---

### Task 2: `lib/audio/sound-manager.ts`

**Files:**
- Create: `lib/audio/sound-manager.ts`

- [ ] **Step 1: Create the file** with exactly this content:

```ts
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

// Fade timers are per-element: a new track's fade-in must never cancel the old
// track's fade-out (whose onDone pauses and releases it).
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```powershell
git add lib/audio/sound-manager.ts
git commit -m "feat(audio): sound-manager singleton — looping music, SFX pool, persisted mute, autoplay unlock"
```

---

### Task 3: `components/audio/GameAudio.tsx`

**Files:**
- Create: `components/audio/GameAudio.tsx`

- [ ] **Step 1: Create the file** with exactly this content:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  getMuted,
  playMusic,
  setMuted,
  stopMusic,
  type MusicTrack,
} from "@/lib/audio/sound-manager";

const DEFAULT_CLASS =
  "fixed top-3 right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur " +
  "shadow flex items-center justify-center text-lg active:scale-95 transition-transform";

/**
 * Drop into a game once: starts the game's looping track on mount and stops it
 * on unmount (deferred 200ms so a remount with the same track — e.g. arcade hub
 * → arcade game — continues seamlessly). Renders the 🔊/🔇 toggle button.
 * Pass className to reposition where the default top-right slot collides with
 * existing chrome.
 */
export default function GameAudio({
  track,
  className,
}: {
  track: MusicTrack;
  className?: string;
}) {
  // Mute preference is read after mount to avoid a hydration mismatch.
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setIsMuted(getMuted());
  }, []);

  useEffect(() => {
    playMusic(track);
    return () => stopMusic({ deferMs: 200 });
  }, [track]);

  const toggle = () => {
    const next = !isMuted;
    setMuted(next); // a tap is itself the unlock gesture
    setIsMuted(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isMuted ? "Turn sound on" : "Turn sound off"}
      className={className ?? DEFAULT_CLASS}
    >
      {isMuted ? "🔇" : "🔊"}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```powershell
git add components/audio/GameAudio.tsx
git commit -m "feat(audio): GameAudio drop-in component — per-game music + mute toggle"
```

---

### Task 4: Mount `GameAudio` in all 7 games

All mount targets are `"use client"` components (verified). Pattern for each: add the import, then place `<GameAudio track="..." />` as the FIRST child inside the listed root wrapper. Where a component has multiple conditional `return`s, mount in EACH listed return — the 200 ms deferred stop keeps music seamless across mode switches.

**Files (modify):**
- `components/pet/PetGame.tsx` — root div ~line 589 → `<GameAudio track="pet" />`
- `components/play/QuizGame.tsx` — setup return (~line 151), playing return (~line 267), finished return (~line 373) → `<GameAudio track="quiz" className="fixed top-16 right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-lg active:scale-95 transition-transform" />` (offset below the sticky header whose timer occupies top-right)
- `components/trading/TradingHub.tsx` — root div ~line 76 → `<GameAudio track="market" />`
- `components/invest/InvestHub.tsx` — root div ~line 53 → `<GameAudio track="invest" />`
- `components/arcade/ArcadeHub.tsx` — root div ~line 34 → `<GameAudio track="arcade" />`
- `components/arcade/GameShell.tsx` — root div ~line 18 → `<GameAudio track="arcade" className="fixed top-16 right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-lg active:scale-95 transition-transform" />` (sticky header has the Sparks badge top-right)
- `components/dream-life/DreamLifeGame.tsx` — lobby return (~line 78) AND playing return (~line 121) → `<GameAudio track="dream-life" className="fixed top-14 right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-lg active:scale-95 transition-transform" />` (header has Help button top-right). NOT mounted on the win-screen return — music fades out and the fanfare takes over.
- `components/money-town/MoneyTownGame.tsx` — lobby return (~line 62) AND board return (~line 99) → `<GameAudio track="money-town" />`. NOT on the win return.

- [ ] **Step 1: Add import to each of the 8 files**

```tsx
import GameAudio from "@/components/audio/GameAudio";
```

- [ ] **Step 2: Insert the mount(s)** as listed above. Example shape (PetGame):

```tsx
return (
  <div className="max-w-md mx-auto ...">   {/* existing root, unchanged */}
    <GameAudio track="pet" />
    {/* ...existing children unchanged... */}
```

Line numbers are a guide, not gospel — match on the quoted root wrapper className. Visually sanity-check each placement choice against any top-right chrome in that game; adjust the className offsets if a collision is obvious in the code.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```powershell
git add components/pet/PetGame.tsx components/play/QuizGame.tsx components/trading/TradingHub.tsx components/invest/InvestHub.tsx components/arcade/ArcadeHub.tsx components/arcade/GameShell.tsx components/dream-life/DreamLifeGame.tsx components/money-town/MoneyTownGame.tsx
git commit -m "feat(audio): mount per-game soundtracks with mute toggle in all 7 games"
```

---

### Task 5: SFX wiring — Quiz + Arcade

**Files:**
- Modify: `components/play/QuizGame.tsx`
- Modify: `components/arcade/games/WhatAmI.tsx` (+ any other arcade game with a judged win/lose state)

- [ ] **Step 1: QuizGame — correct/wrong on answer.** In `handleAnswer` (~line 100), the current shape is:

```tsx
setRevealed(true);
if (choiceIndex !== null && currentQuestion?.choices[choiceIndex]?.isCorrect) {
  // ...points...
}
```

Change to:

```tsx
const isCorrect =
  choiceIndex !== null && !!currentQuestion?.choices[choiceIndex]?.isCorrect;
playSfx(isCorrect ? "correct" : "wrong");
setRevealed(true);
if (isCorrect) {
  // ...points (unchanged)...
}
```

Add the import: `import { playSfx } from "@/lib/audio/sound-manager";`

- [ ] **Step 2: QuizGame — win fanfare on the results screen.** Find the state value that selects the finished return (~line 373). Add a `useEffect` that fires `playSfx("win")` once when the game enters the finished state, e.g.:

```tsx
useEffect(() => {
  if (mode === "finished") playSfx("win");
}, [mode]);
```

(Adapt `mode === "finished"` to the actual state variable/value used by the component — read the component first.)

- [ ] **Step 3: QuizGame — tap on Start (~line 250) and Play again (~line 410):** change `onClick={start}` to:

```tsx
onClick={() => { playSfx("tap"); start(); }}
```

- [ ] **Step 4: Arcade games — correct/wrong on judged guesses.** In `WhatAmI.tsx` `handleGuess` (~lines 63–71):

```tsx
if (normalised === answer) {
  playSfx("correct");
  setGameState("won");
  return;
}
if (currentClueIndex >= data.clues.length - 1) {
  playSfx("wrong");
  setGameState("lost");
  return;
}
```

Then run `Grep` for `setGameState("won")|setGameState("lost")|"won"|"lost"` across `components/arcade/games/*.tsx`; apply the same correct/wrong pairing in WordDetective, StumpTheAI, and AILieDetector wherever a guess is explicitly judged. EmojiStory and WouldYouRather have no judged outcome — **no SFX there** (per spec matrix). Add the `playSfx` import to each touched file.

- [ ] **Step 5: Typecheck, then commit**

```powershell
npm run typecheck
git add components/play/QuizGame.tsx components/arcade/games
git commit -m "feat(audio): quiz and arcade sound effects — correct/wrong, win fanfare, start tap"
```

---

### Task 6: SFX wiring — money games (Nugget Market, Money Town)

**Files:**
- Modify: `components/trading/AssetDetailSheet.tsx`
- Modify: `components/money-town/ResultCard.tsx`
- Modify: `components/money-town/MoneyTownGame.tsx`
- Modify: `components/money-town/GameLobby.tsx`

- [ ] **Step 1: Nugget Market — coin on executed trade.** Read `components/trading/AssetDetailSheet.tsx` and locate the buy/sell confirm handler (it calls a server action and then updates UI on success). Immediately after the success branch (NOT on failure), add `playSfx("coin")`. Add the import.

- [ ] **Step 2: Money Town — coin on cash gain.** `ResultCard.tsx` renders the cash badge at ~lines 57–60 (`result.cashDelta !== 0`). Add a mount effect:

```tsx
useEffect(() => {
  if (result.cashDelta > 0) playSfx("coin");
}, [result.cashDelta]);
```

(`ResultCard` remounts per result; if it's reused, key the effect off the result identity instead — check how it's rendered at `MoneyTownGame.tsx:128–134`.)

- [ ] **Step 3: Money Town — win fanfare.** In `MoneyTownGame.tsx`, the win branch is `if (state.phase === 'win' && state.winnerId)` (~line 81). Add at component top level:

```tsx
useEffect(() => {
  if (state.phase === "win") playSfx("win");
}, [state.phase]);
```

- [ ] **Step 4: Money Town — tap on Start.** `GameLobby.tsx` `startGame` (~line 70): add `playSfx("tap");` as the first line of the function. Also check `components/money-town/WinScreen.tsx` for a Play-again button and give it the same treatment.

- [ ] **Step 5: Typecheck, then commit**

```powershell
npm run typecheck
git add components/trading/AssetDetailSheet.tsx components/money-town
git commit -m "feat(audio): money-game sound effects — trade and cash coins, winner fanfare, start tap"
```

---

### Task 7: SFX wiring — Pet, CashGrab, Dream Life

**Files:**
- Modify: `components/pet/PetGame.tsx`
- Modify: `components/games/CashGrab.tsx`
- Modify: `components/dream-life/DreamLifeGame.tsx`
- Modify: `components/dream-life/SettlementOverlay.tsx`
- Modify: `components/dream-life/ReactionPrompt.tsx`
- Modify: `components/dream-life/Lobby.tsx`

- [ ] **Step 1: PetGame — sparkle on trick.** In `doTrick` (~lines 557–584), inside the success callback right before `setNotice(...)`, add `playSfx("sparkle")`. Import already-needed `playSfx`.

- [ ] **Step 2: PetGame — sparkle on level-up.** At ~line 461, immediately after `setLevelUp({ ... })`, add `playSfx("sparkle")`.

- [ ] **Step 3: CashGrab — coin on money-bag tap.** In `tap()` (~lines 68–71):

```tsx
const tap = (id: number, type: 'cash' | 'expense') => {
  setBags(prev => prev.map(b => b.id === id ? { ...b, dismissed: true } : b))
  if (type === 'cash') {
    playSfx("coin");
    setGrabbed(g => g + 1)
  }
}
```

- [ ] **Step 4: Dream Life — coin on settlement payout.** `SettlementOverlay.tsx` renders the salary/settlement table. Add a mount effect: `useEffect(() => { playSfx("coin"); }, []);` (the overlay mounts once per settlement).

- [ ] **Step 5: Dream Life — win fanfare.** In `DreamLifeGame.tsx`, win branch is `if (state.turnStage === "gameOver" && state.winnerId)` (~line 97). Add:

```tsx
useEffect(() => {
  if (state.turnStage === "gameOver") playSfx("win");
}, [state.turnStage]);
```

- [ ] **Step 6: Dream Life — sparkle on power-up.** Read `components/dream-life/ReactionPrompt.tsx`; find where a power-up is gained/confirmed (dispatch of the reaction that grants it) and add `playSfx("sparkle")` there. If power-ups are granted in the reducer instead, put the sound at the dispatch call site — never inside the pure reducer (`lib/domain` stays I/O-free).

- [ ] **Step 7: Dream Life — tap on START LIFE.** `Lobby.tsx` ~line 200 `onClick={start}` → `onClick={() => { playSfx("tap"); start(); }}`.

- [ ] **Step 8: Typecheck, then commit**

```powershell
npm run typecheck
git add components/pet/PetGame.tsx components/games/CashGrab.tsx components/dream-life
git commit -m "feat(audio): pet, cash-grab and dream-life sound effects — sparkles, coins, win fanfare"
```

---

### Task 8: Verification pass

- [ ] **Step 1:** `npm run typecheck` — exit 0.
- [ ] **Step 2:** `npm run build` — exit 0 (also satisfies the repo's pre-push checklist).
- [ ] **Step 3: Size audit:** `"{0:N1} MB" -f ((Get-ChildItem public\audio -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)` → < 10 MB, and no single music file > 1.2 MB.
- [ ] **Step 4: Spec guard:** `git diff main@{u} --stat -- components/kid/Tuner.tsx components/kid/Metronome.tsx` → empty (untouched).
- [ ] **Step 5: Dev-server smoke test:** start `npm run dev` (background); `Invoke-WebRequest http://localhost:3000/audio/music/pet.mp3 -Method Head` → 200 with audio/mpeg content type. If a browser harness is available (Playwright was used for dream-life walkthroughs — check `scripts/` and `tests/`), load `/play/pet?kid=<id>`, simulate a click, and assert no console errors; otherwise note manual check for the user: open any game on the tablet, tap once, music should fade in; tap 🔊 to mute; reload — should stay muted.
- [ ] **Step 6: Final commit if anything changed, then report.** Do NOT push without the build green (repo rule).

---

## Self-review notes

- Spec coverage: 7 tracks (Task 1+4), SFX matrix (Tasks 5–7 cover every row: coin → Market/MoneyTown/DreamLife/CashGrab; correct+wrong → Quiz/arcade; tap → Quiz/MoneyTown/DreamLife starts; win → DreamLife/MoneyTown/Quiz; sparkle → pet trick/level-up + dream-life power-up), mute persistence + autoplay unlock (Task 2), placement rules + arcade continuity (Tasks 3–4), CREDITS + budgets (Task 1), error handling (Task 2 code), Tuner/Metronome untouched (Task 8 guard).
- Known judgment calls the executor must make in-file (flagged, not placeholders): exact finished-state variable in QuizGame (5.2), trade success branch in AssetDetailSheet (6.1), power-up grant site in ReactionPrompt (7.6) — each step says how to find it.
