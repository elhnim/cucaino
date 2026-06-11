# Game Soundtracks & Sound Effects — Design

**Date:** 2026-06-11
**Status:** Approved by user (music + sound effects, on by default with remembered mute). Codex-reviewed; blockers and should-fixes applied.

## Goal

Every game in Cucaino gets a looping background soundtrack matched to its vibe, plus a small shared kit of sound effects (coins, correct/wrong, win fanfare). A speaker button in each game lets kids mute everything; the choice is remembered on the device.

Vibe descriptions below are **asset-selection guidance**, not acceptance criteria.

## Scope

### Games that get music (7 tracks)

| Game | GameAudio mount point | Track file | Vibe (guidance) |
|---|---|---|---|
| Star Pets | `components/pet/PetGame.tsx` | `pet.mp3` | Soft, cute, playful (music-box / ukulele) |
| Quiz | `components/play/QuizGame.tsx` | `quiz.mp3` | Upbeat game-show energy |
| Nugget Market | `components/trading/TradingHub.tsx` | `market.mp3` | Bouncy marketplace bustle |
| Invest | `components/invest/InvestHub.tsx` | `invest.mp3` | Calm, focused thinking music |
| AI Arcade | `app/play/arcade/page.tsx` (hub) + `app/play/arcade/[game]/page.tsx` (all 6 games) | `arcade.mp3` | Retro chiptune arcade |
| Dream Life | `components/dream-life/DreamLifeGame.tsx` | `dream-life.mp3` | Warm, adventurous life-journey theme |
| Money Town | `components/money-town/MoneyTownGame.tsx` | `money-town.mp3` | Fast, fun party energy |

The 6 arcade mini-games (Emoji Story, Would You Rather, What Am I?, Word Detective, Stump The AI, AI Lie Detector — `components/arcade/games/*.tsx`) all render via the single `[game]` route and share `arcade.mp3`; no per-game mounts inside them.

### Sound-effect events (per-game matrix)

| Effect | File | Fires when |
|---|---|---|
| Coin clink | `coin.mp3` | Nugget Market: buy/sell executed · Money Town: money gained · Dream Life: salary/settlement payout · CashGrab mini-game: money bag tapped |
| Correct ding | `correct.mp3` | Quiz: answer judged correct · arcade games: AI confirms a correct guess |
| Gentle wrong buzz | `wrong.mp3` | Quiz: answer judged wrong · arcade games: incorrect guess (soft, not harsh) |
| Button tap | `tap.mp3` | "Start game" / "Play again" primary buttons only — NOT on every button |
| Win fanfare | `win.mp3` | Dream Life win screen · Money Town winner screen · Quiz completion screen |
| Sparkle | `sparkle.mp3` | Pet trick performed · Dream Life power-up gained · pet level-up |

Events not listed here get **no** sound effect in this iteration.

### Explicitly NOT in scope

- Tuner and Metronome: `components/kid/Tuner.tsx` and `components/kid/Metronome.tsx` are **not modified at all** (practice tools, not games; metronome keeps its synthesized click).
- No music outside games (home, todo, rewards screens stay silent).
- No per-sound volume settings, no parent dashboard setting — one kid-facing mute toggle only.
- No database/schema changes. No new npm dependencies.

## Audio sources & licensing

Only assets **individually verified as CC0 or public domain** may be used — checked per file at download time, not assumed from the site:

- **Music:** FreePD.com (public-domain catalogue), OpenGameArt.org tracks explicitly tagged CC0
- **Sound effects:** Kenney.nl CC0 audio packs (or OpenGameArt CC0)

Every downloaded file is recorded in `public/audio/CREDITS.md` (title, author, source URL, license) as a courtesy and audit trail. A file whose license can't be verified is rejected.

**Size budget:** each music loop ≤ **1.2 MB** (MP3, 64–96 kbps, 30–90 s loop, re-encoded if needed); each effect ≤ 100 KB. Total `public/audio/` < **10 MB**. Audio loads lazily — only when a game opens; nothing on the critical path of other pages.

## Architecture

### Files

```
public/audio/music/{pet,quiz,market,invest,arcade,dream-life,money-town}.mp3
public/audio/sfx/{coin,correct,wrong,tap,win,sparkle}.mp3
public/audio/CREDITS.md
lib/audio/sound-manager.ts        — client-only singleton (no React)
components/audio/GameAudio.tsx    — drop-in component per game
```

### `lib/audio/sound-manager.ts`

Plain TypeScript module (browser-only guards for SSR):

- `playMusic(trackId)` — one `HTMLAudioElement`, `loop = true`, fades in over **600 ms** to volume **0.35**. If the same track is already playing, it's a no-op (this is what keeps arcade music seamless). If a different track is playing, it fades out over **400 ms** then the new one fades in. A new `playMusic` call cancels any in-flight fade.
- `stopMusic({ deferMs })` — fades out over 400 ms and releases. With `deferMs` (used by GameAudio unmount, 200 ms), the stop is scheduled; any `playMusic` call within the window cancels it.
- `playSfx(name)` — pool of **4** `Audio` elements per effect, round-robin; if all 4 are busy the oldest is restarted. Volume **0.6**.
- `setMuted(bool)` / `getMuted()` — initial value read from `localStorage` key `cucaino-audio-muted` at module init (default unmuted); toggling updates the in-memory flag immediately (music pauses/resumes, SFX suppressed) **and** writes back to localStorage. If localStorage is unavailable or throws (private mode), fall back to in-memory state, default unmuted, fail silently.
- **Autoplay policy:** browsers block audio until a user gesture. The manager queues the requested track and attaches a one-time `pointerdown` listener (capture, on `document`); music fades in on the kid's first tap anywhere. The speaker button shows the mute **preference** (not the unlocked state); tapping it is itself a gesture, so it also unlocks audio. No errors, no console spam.

### `components/audio/GameAudio.tsx`

Client component mounted once inside each game:

```tsx
<GameAudio track="pet" />
```

- On mount: `playMusic(track)`. On unmount: `stopMusic({ deferMs: 200 })`.
- **Route-transition rule:** moving between the arcade hub and a mini-game unmounts one `GameAudio` and mounts another with the same `track="arcade"` within the 200 ms window → the deferred stop is cancelled and music continues seamlessly. Leaving the arcade (or any game) entirely → no new `playMusic` arrives → music fades out.
- Renders the 🔊/🔇 toggle: fixed circular button, **top-right corner**, ~40 px tap target, ~12 px inset (adjusted per game if it would overlap existing chrome like the back button — then it sits beside it), `z-index` above game content but below modal overlays. Styled to match the game's existing button chrome.

### SFX wiring

Games call `playSfx('coin')` etc. exactly at the events in the per-game matrix above. No other sounds.

## Error handling

- Audio file 404 / decode failure: silent no-op (games never break because of sound).
- SSR: all manager functions no-op when `window` is undefined.
- localStorage unavailable: in-memory mute state, default unmuted, no errors thrown.
- Corrupt localStorage value: treated as unmuted.

## Acceptance criteria (Definition of Done)

1. `npm run build` and `npm run typecheck` pass.
2. Each of the 7 games plays its own distinct looping track after the kid's first tap; navigating away fades it out.
3. Arcade music continues uninterrupted between the arcade hub and its 6 mini-games; it stops when leaving `/play/arcade` entirely.
4. Mute button appears in every game per the placement rule; toggling it silences/restores music and SFX immediately; the setting survives page reloads and applies across all games.
5. Every event in the SFX matrix plays its mapped sound; no sounds fire outside the matrix.
6. Total size of `public/audio/` < 10 MB with each track ≤ 1.2 MB; `CREDITS.md` lists every file's title, author, source URL, and CC0/PD license.
7. `git diff` shows zero changes to `components/kid/Tuner.tsx` and `components/kid/Metronome.tsx`.
