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

**Cucaino** is a tablet-first web app for kids' daily routines, chores, music practice, rewards and learning games — the kid side is **Cucaino Park**, a candy-world 3D theme park; the parent side is a simple 2D control room (`/parent/*`).

**Stack:** Next.js App Router · React 19 · TypeScript · Tailwind CSS · Supabase · Netlify

### Routing

- `/select-kid` — kid picker: a candy 3D meadow where each kid stands as their animal (`lib/park/world/pickerScene.ts`); kid PINs are verified server-side (`verifyKidPin`), never sent to the browser
- `/park/[kidId]` — **Cucaino Park, the kid app**: a candy-world 3D theme park (`components/park/ParkApp.tsx`, engine `lib/park/`). Quests (chores) on the Quest Board, Dream Park builder (tickets), Pet Meadow, Prize Shop/Trophy Hall, Friends Café, rides (Quiz Coaster, Mini Golf) and games opened in in-park windows. `?enter=quests|shop|friends|pet|rides` deep-links into a place. `/kid/[kidId]/world`, `/todo`, `/today` redirect here.
- `/kid/[kidId]/(shell)/{home,rewards,progress,profile,practice,timetable,tuner,play,...}` — flat kid views wrapped by `KidShell` (the `(shell)` group holds the layout; URLs unchanged). `/home` is the "simple view" fallback if a device can't run 3D; `/practice/[taskId]` is the Practice Stage opened from quests
  - KidShell nav tabs lead INTO the park (`/park/<id>?enter=…`) and a floating 🎡 Park button is on every KidShell page
  - Pages opened from the park render in an in-park iframe window (`components/game/WorldPageWindow.tsx`); `lib/embed.ts` makes KidShell hide its chrome when framed, and a framed park closes the window instead of nesting
  - `/progress` exists but is NOT linked in the kid nav
- `/parent/{overview,kids,tasks,rewards,requests,feedback,quizzes}` — Parent dashboard (mobile-first)
- `/play` and `/play/[bankId]` — Quiz hub and live quiz (nav bar injected via `?kid=<id>` query param so KidShell wraps all play screens)
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

### Kid daily task additions

Kids can self-add flexible tasks to a single day without mutating the task library. The table `kid_daily_task_additions (kid_id, task_id, date)` stores date-scoped additions. The todo page merges these into the task list only for today. Use `addTaskToDay(taskId, kidId)` server action and `listKidDailyAdditions(kidId, date)` query — never `createTask` from the kid flow.

Tasks eligible for self-add: `rule = 'flexible'` and `kid_id IS NULL` (family-level templates only).

### Cucaino Park (3D kid app)

- Engine: `lib/park/engine/ParkWorld.ts` (one renderer; animated Kenney Cube Pets kid + pet; joystick + tap-to-walk; door triggers; build mode; ride mode; pet behaviours). Loaded lazily via `lib/park/loadPark.ts` (prefetched from the kid picker) — keep three.js OUT of the park page's first-load JS.
- Art: Kenney CC0 kits built by `node scripts/park-assets.mjs` (list in `scripts/park-assets.json`) into `public/park-assets/*.glb` (meshopt). Recoloured to candy at load (`lib/park/assets/candy.ts`, tested) with one shared toon material. Model files must never live under `/park/` (auth-protected route prefix).
- Island layout: `lib/park/registry/island.ts` — trails (a loop + plaza trails + one trail per land), walk routing along them, the stream/pond/bridges and hills. The 3D world (`lib/park/world/{buildPark,nature,ocean}.ts`) and the storybook map (`components/park/MiniMap.tsx`) both read it, so move a land in `places.ts` and everything follows (the Dream Park grid is `DREAM_ZONE` in `lib/park/builder/rules.ts`).
- Registries (one entry = one thing): `lib/park/registry/{places,pieces,animals}.ts`, arcade games in `components/park/RidesMenu.tsx`, mini golf holes in `lib/game3d/minigolf/courses.ts`, daily hooks in `lib/game3d/registry/hooks.ts`. See `EXTENDING.md`.
- Dream Park tickets: table `kid_parks` + RPC `increment_kid_tickets` (migration 0049). 1 ticket per completed/approved quest, removed on undo — awarded inside `lib/actions/completions.ts`. Tickets never touch stars/cash. Builder rules are pure + tested (`lib/park/builder/rules.ts`) and re-checked server-side in `lib/actions/park.ts`.
- Pet Meadow uses the existing Star Pets actions (`lib/actions/pet.ts`) unchanged.
- Smoke harnesses (no auth, mock data): `scripts/smoke/park-harness.ts`, `scripts/smoke/picker-harness.ts` (bundle with esbuild, serve with `scripts/smoke/serve.mjs`).

### Supabase schema

Migrations live in `supabase/migrations/0001_initial.sql`. Auto-generated TypeScript types are at `lib/supabase/database.types.ts` — regenerate with `supabase gen types typescript` after schema changes.

Active migrations:
- `0001_initial.sql` — base schema
- `0006_*` — gamification SQL functions (badge progress, family points)
- `0007_indexes.sql` — composite index on `quiz_banks(is_builtin DESC, name)`; table `kid_daily_task_additions` with RLS `family_scope` policy

### Environment variables

Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Performance patterns

- `getKid` is wrapped with `React.cache()` so multiple server components in one render hit the DB only once.
- Do **not** call `router.refresh()` from `TodoTaskCard` after task completion — it triggers a full RSC re-fetch and kills INP. Optimistic state updates immediately; counts/stars update on next navigation via `revalidatePath`.
- Profile route has `app/kid/[kidId]/(shell)/profile/loading.tsx` to stream a skeleton and eliminate blank-screen TTFB.
- `netlify/functions/keepalive.mts` pings Supabase every 10 minutes (cron) to prevent free-tier project sleeping.

### Task completion insert

`INSERT` into `task_completions` **must** include `family_id` (NOT NULL, no default) and `family_points_awarded`. Missing `family_id` causes silent RLS rejection — no error, completion just doesn't save. Revert optimistic UI on failure.

### Build version

`next.config.ts` injects `NEXT_PUBLIC_APP_VERSION` (git short hash) at build time so the running version is visible in the parent settings screen.

### Netlify hook

`.claude/settings.json` runs `node scripts/netlify-watch.mjs` after every Bash tool use to sync Netlify deployments. Do not remove this hook.

## Pre-push checklist

Before every `git push`, run `npm run build` and confirm it succeeds with no errors.
