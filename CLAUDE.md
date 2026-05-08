# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (http://localhost:3000)
npm run build      # Production build (uses --webpack flag via netlify.toml)
npm run lint       # Next.js ESLint
npm run typecheck  # TypeScript check (tsc --noEmit)
```

All scripts use `cross-env NODE_OPTIONS="--max-http-header-size=32768"` — required for Supabase auth headers.

No test runner is configured.

## Architecture

**Cucaino** is a tablet-first web app for kids' daily routines, chores, music practice, school-bag reminders, rewards, and take-turns quizzes.

**Stack:** Next.js App Router · React 19 · TypeScript · Tailwind CSS · Supabase · Netlify

### Routing

- `/select-kid` — Home screen (tablet kid picker)
- `/kid/[kidId]/{today,week,rewards,progress,profile,practice,timetable,tuner}` — Kid-side views, all parameterised by kid ID
- `/parent/{overview,kids,tasks,rewards,requests,feedback,quizzes}` — Parent dashboard (mobile-first)
- `/play` and `/play/[bankId]` — Quiz hub and live quiz
- `/auth/callback`, `/login`, `/signup` — Auth flow

### Data layer

All pages import from `lib/data/stub.ts`, which is a shim that re-exports from `lib/data/queries.ts` (Supabase). This single seam means swapping the data source only touches `stub.ts`, not any UI code.

Supabase clients:
- `lib/supabase/server.ts` — SSR client (server components, server actions)
- `lib/supabase/client.ts` — Browser client (RLS-protected, anon key)
- `middleware.ts` — Refreshes the session cookie on every request

### Registry-driven extensibility

Rather than hard-coded logic, the app uses small registries:

| Registry | Purpose |
|---|---|
| `lib/themes/presets.ts` | 6 kid themes (Adventure, Magical, Galactic, Ocean, Dino, Garden) |
| `lib/registry/category-registry.ts` | Task category display metadata |
| `lib/registry/section-registry.ts` | Timeline section type definitions |
| `lib/registry/subject-registry.ts` | School subject labels & colours |

See `EXTENDING.md` for step-by-step guides on adding new pages, themes, categories, and quiz banks.

### Schedule / timeline logic

`lib/domain/schedule.ts` contains all pure business logic for building timeline sections and filtering tasks by day/week. No I/O — safe to unit test in isolation.

### Domain types

`lib/domain/types.ts` mirrors the Postgres schema. Key types: `Kid`, `Task`, `TaskCompletion`, `Reward`, `RewardRequest`, `SchoolItem`, `SchoolClass`, `QuizBank`, `QuizQuestion`, `Family`. Enums: `TaskCategory`, `ThemeId`, `Subject`, `QuizCategory`.

### Supabase schema

Migrations live in `supabase/migrations/0001_initial.sql`. Auto-generated TypeScript types are at `lib/supabase/database.types.ts` — regenerate with `supabase gen types typescript` after schema changes.

### Environment variables

Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Build version

`next.config.ts` injects `NEXT_PUBLIC_APP_VERSION` (git short hash) at build time so the running version is visible in the parent settings screen.

### Netlify hook

`.claude/settings.json` runs `node scripts/netlify-watch.mjs` after every Bash tool use to sync Netlify deployments. Do not remove this hook.
