# Cucaino

Tablet-first web app for the kids: daily routine, chores, music practice,
school-bag reminders, rewards, and a take-turns quiz game.

The folder is still named `kids-app/` for now — only the project name
changed. Rename the folder if/when convenient (will require a `cd` change).

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS
- Supabase (planned — currently stubbed in `lib/data/stub.ts`)
- Hosting: Netlify (chosen over Vercel for the Netlify-native DX; Supabase still handles data + auth + realtime)

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/select-kid`.

## What's running

| Route | What it is |
| --- | --- |
| `/select-kid` | Tablet picker — tap an avatar to start |
| `/kid/[id]/today` | Themed timeline: school bag, time blocks, bedtime pack |
| `/kid/[id]/week` | 7-day strip showing activities + tasks |
| `/kid/[id]/rewards` | Browse + redeem rewards |
| `/kid/[id]/progress` | Streaks, points, badges |
| `/play` | Quiz hub (take-turns or solo) |
| `/play/[bankId]` | Live quiz |
| `/parent` | Mobile-first parent dashboard |
| `/parent/{tasks,rewards,requests,kids,quizzes}` | Manage everything |

## Adding new pages or sections

See [EXTENDING.md](./EXTENDING.md). The codebase uses small registries so
most additions are one-file changes.

## Where to look

```
app/                    Routes (kid, parent, play)
components/             UI — kid/, parent/, play/, sections/, cards/
lib/
  domain/types.ts       Shared types (mirror future Supabase schema)
  domain/schedule.ts    Pure helpers — section builders, day logic
  themes/presets.ts     Theme registry
  registry/             Section + category registries
  data/stub.ts          Stub data layer (single seam to replace with Supabase)
docs/mockup.html        Original interactive mockup (reference)
```

## Stub data

Everything currently reads from `lib/data/stub.ts`. Two kids (Liam 🦊 ages
10, theme: Adventure; Mia 🐼 age 8, theme: Magical), a handful of tasks,
school items, rewards, and quiz banks. Replace function bodies with
Supabase queries when wiring; signatures stay the same.

## Design spec

Approved spec at `~/.claude/plans/clever-wobbling-bachman.md`. Phases:

- **Phase 1 (this build):** auth + tasks + points + activities + school
  bag + themes + tiny take-turns quiz
- **Phase 2:** timer + metronome + tuner + streaks + badges + rewards
  redemption
- **Phase 3:** family pool + cosmetics + PWA + history charts
- **Phase 4:** Kahoot-style multi-device quiz with Supabase Realtime
