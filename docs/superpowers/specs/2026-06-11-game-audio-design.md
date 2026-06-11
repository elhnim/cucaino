# Game Soundtracks & Sound Effects — Design

**Date:** 2026-06-11
**Status:** Approved by user (music + sound effects, on by default with remembered mute)

## Goal

Every game in Cucaino gets a looping background soundtrack matched to its vibe, plus a small shared kit of sound effects (coins, correct/wrong, win fanfare). A speaker button in each game lets kids mute everything; the choice is remembered on the device.

## Scope

### Games that get music (7 tracks)

| Game | Entry component | Track file | Vibe |
|---|---|---|---|
| Star Pets | `components/pet/PetGame.tsx` | `pet.mp3` | Soft, cute, playful (music-box / ukulele) |
| Quiz | `components/play/QuizGame.tsx` | `quiz.mp3` | Upbeat game-show energy |
| Nugget Market | trading game component | `market.mp3` | Bouncy marketplace bustle |
| Invest | invest game component | `invest.mp3` | Calm, focused thinking music |
| AI Arcade (hub + all 6 mini-games) | `components/arcade/ArcadeHub.tsx` + `components/arcade/games/*` | `arcade.mp3` | Retro chiptune arcade |
| Dream Life | `components/dream-life/DreamLifeGame.tsx` | `dream-life.mp3` | Warm, adventurous life-journey theme |
| Money Town | `components/money-town/MoneyTownGame.tsx` | `money-town.mp3` | Fast, fun party energy |

### Shared sound-effect kit (used by all games)

| Effect | File | Used for |
|---|---|---|
| Coin clink | `coin.mp3` | Earning/spending money (Nugget Market, Money Town, CashGrab, Dream Life) |
| Correct ding | `correct.mp3` | Right answers (Quiz, arcade games) |
| Gentle wrong buzz | `wrong.mp3` | Wrong answers (Quiz, arcade games) — soft, not harsh |
| Button tap | `tap.mp3` | Major game buttons (start game, confirm) |
| Win fanfare | `win.mp3` | Win/finish screens (Dream Life win, Money Town winner, quiz complete) |
| Sparkle | `sparkle.mp3` | Level-ups, pet tricks, power-ups |

### Explicitly NOT in scope

- Tuner and Metronome are untouched (practice tools, not games; metronome keeps its synthesized click).
- No music outside games (home, todo, rewards screens stay silent).
- No per-sound volume settings, no parent dashboard setting — one kid-facing mute toggle only.
- No database/schema changes. No new npm dependencies.

## Audio sources & licensing

All assets must be **CC0 / public domain** — zero cost, no attribution legally required:

- **Music:** FreePD.com (Kevin MacLeod public-domain catalogue), OpenGameArt.org CC0 tracks
- **Sound effects:** Kenney.nl CC0 audio packs (or OpenGameArt CC0)

Every downloaded file is recorded in `public/audio/CREDITS.md` (title, author, source URL, license) as a courtesy and audit trail.

**Size budget:** each music loop compressed to ≤ ~1 MB (mono or low-bitrate stereo MP3, 64–96 kbps, 30–90 s loop); effects a few KB each. Total added assets **< 10 MB**. Audio loads lazily — only when a game opens; nothing on the critical path of other pages.

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

- `playMusic(trackId)` — one `HTMLAudioElement`, `loop = true`, volume ~0.35, short fade-in; switching tracks fades out the old one
- `stopMusic()` — fade out and release
- `playSfx(name)` — pooled `Audio` elements so rapid sounds (coin taps) overlap cleanly; volume ~0.6
- `setMuted(bool)` / `getMuted()` — persisted to `localStorage` key `cucaino-audio-muted` (default unmuted); muting silences both music and effects
- **Autoplay policy:** browsers block audio until a user gesture. The manager queues the requested track and attaches a one-time `pointerdown` listener; music fades in on the kid's first tap. No errors, no console spam.

### `components/audio/GameAudio.tsx`

Client component mounted once inside each game:

```tsx
<GameAudio track="pet" />
```

- On mount: requests its track. On unmount: stops music (leaving a game = silence).
- Renders the 🔊/🔇 toggle as a fixed circular button in the game's top corner, styled to match existing game chrome, z-indexed above game content but below modals' close buttons.
- Arcade: mounted once in the arcade hub page **and** each arcade game page with the same `track="arcade"` — the manager detects "same track already playing" and keeps it running seamlessly between hub and mini-games.

### SFX wiring

Games call `playSfx('coin')` etc. at obvious moments only (answer judged, money earned, win screen shown, game started). Light touch — no sound on every tap of every button.

## Error handling

- Audio file 404 / decode failure: silent no-op (games never break because of sound).
- SSR: all manager functions no-op when `window` is undefined.
- Mute state read once at startup; corrupt localStorage value treated as unmuted.

## Acceptance criteria (Definition of Done)

1. `npm run build` and `npm run typecheck` pass.
2. Each of the 7 games plays its own distinct looping track after the kid's first tap; navigating away stops it.
3. Arcade music continues uninterrupted between the arcade hub and its 6 mini-games.
4. Mute button works in every game; the setting survives page reloads and applies across all games.
5. Quiz plays correct/wrong sounds; money games play coin sounds; win screens play the fanfare.
6. Total size of `public/audio/` < 10 MB; `CREDITS.md` lists every file's source and CC0/PD license.
7. Tuner and Metronome behave exactly as before.
