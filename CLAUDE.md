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
- Island layout: `lib/park/registry/island.ts` — trails (a loop + plaza trails + one trail per land), walk routing along them, the stream/pond/bridges and hills. The 3D world (`lib/park/world/{buildPark,ocean}.ts`) and the storybook map (`components/park/map/`, artwork in `lib/park/map/artwork.ts`) both read it, so move a land in `places.ts` and everything follows (the Dream Park grid is `DREAM_ZONE` in `lib/park/builder/rules.ts`).
- The island is ~3 km across: the park keeps its old south-west shore (`PARK_SHORE`, radius `ISLAND_R` round the plaza) and the Wildlands (`WILDLANDS`) rise behind it. For "how far from the coast" always use `seaDist(x, z)` (true signed distance; `COAST_GLSL` in shaders) — `coastR(angle)` is only for placing things at a heading. Ground is streamed: `registry/terrain.ts` bakes the height field lazily per tile (`groundYFar` = no-bake approximation for far things; open deep sea never bakes), `world/fantasy/terrainChunks.ts` draws it as quadtree blocks built a few rows per frame, `terrainWindow.ts` gives the grass/leaf shaders textures that follow the kid, `wilds.ts` streams the Wildlands' trees and rocks. Keep anything new near the kid lazy and budgeted — load must stay light.
- Travel on the big island: the Wildlands Railway (`registry/railway.ts` route + 5 STATIONS; rail heights + track levelling in `terrain.ts` railHeights; streamed track/stations/train in `world/railway/`; ParkWorld `boardTrain`/`leaveTrain`/`railOffer`/`railStop`), dragon autopilot (`ParkWorld.flyTo`/`canFlyTo`, used by the map's Island tab), jeeps (`car` rideables) behind every Wildlands station. The Great Falls/Wild River/Great Lake live in `registry/wildWater.ts` (the park's `waterways.ts` lookups fall through to it). The map is ONE continuous pinch-zoomable map (`components/park/map/`: `index.tsx` orchestrates the mini HUD `MiniHud.tsx`, the big `MapScreen.tsx` + shared `MapCanvas.tsx`, the Where-to search `WhereToPanel.tsx` and the trip bar `TripBar.tsx`; Park / Island / World are just quick-zoom chips). Its logic is pure and tested in `lib/park/map/` — `camera.ts` (pan/zoom + zoom bands), `cluster.ts` (de-cluttering), `entities.ts` (every registry → one flat list of map things; add a place to a registry and it appears), `planner.ts` (walk / train / dragon / boat trip options with ETAs), `tripMachine.ts` (guided trip legs), `foundSet.ts` (per-kid discoveries, `cucaino:found:<kidId>`), `artwork.ts` (storybook geometry + relief rasters: the island raster is drawn everywhere and the close raster feathered on top — never a hard-edged tile). Keep three.js out of `lib/park/map/**`. `registry/worldMap.ts` holds the island framing and destinations. Smoke: `scripts/smoke/map-mock-harness.tsx`.
- Wildlands settlements (villages/towns of fantasy folk): `registry/settlements.ts` (one generated entry per settlement: site, huts, paths, work spots, villagers' schedules + chat lines with true kid-level facts, activities), `world/settlements/` (streamed in within ~550 m, out past ~750 m; one merged props mesh + the shared folk crowd `world/village/crowd.ts`, also used by Coralcove). Terrain levelling, tree/wildlife keep-out, map pins and dragon flyTo all follow the registry. Activities surface as `ParkWorld.activityOffer` (e.g. Lakeside's pier → `components/park/FishingGame.tsx`, logic in `lib/park/fishing/`, catches in `registry/fishFacts.ts`). Settlement stamp heights in terrain.ts are lazy (`stampLazy`) so the park never samples the Wildlands at load.
- Settlements so far: Lakeside (fishing), Treetop (rainforest treehouses near the Great Falls; "drumming" → `components/park/DrumGame.tsx`), Highstone (mountain village + yaks near the Lone Peak; "weaving" → `WeaveGame.tsx`). Sites are chosen on REAL ground: `registry/landform.ts` holds the natural height (`rawHeight`, `smoothedHeight`, `footprintStats`) as a leaf module so settlements can measure slope without importing terrain.ts; pads level to `settlePadHeight()` (the real ground, never a scaled-down height — that digs pits). Footpaths village↔station in `registry/footpaths.ts`. Sea fishing boats: `world/sea/fishingBoatsPlan.ts` (pure f(time)) + `fishingBoats.ts` (hulls lofted with `characters/boats.ts` `hull()`).
- Sunnybrook, the market town (`registry/town.ts`, `world/settlements/styles/town.ts`; activity "market" → `components/park/MarketGame.tsx`), is the trade hub. Village looks live in `world/settlements/styles/{common,lakeside,treetop,mountain,town}.ts` + small life in `critters.ts`. Paint patterns must be separate small shapes or per-segment stripes — never a colour threshold across big flat faces (reads as glitchy triangles). Never run a heavy site search at module load: store the site as numbers (e.g. `TOWN_SITE`) and re-run the search in a test.
- Travelling traders: `registry/trade.ts` (GOODS, TRADE_POSTS — a settlement joins by setting `trade: { makes, wants }` on its SettlementDef — and TRADE_ROUTES by cart road / boat / train), `registry/cartRoad.ts` (the dirt road beside the railway; split out to avoid a terrain↔harbours import cycle), `world/trade/plan.ts` (a trader's state is a pure function of park time — no simulation when far), `world/trade/index.ts` (streamed, ~8 draw calls, shared folk crowd; carts give way to the kid).
- Cucaino Karts: track just outside the park by Park Station (`registry/kartTrack.ts` KART_SITE, outdoor scenery `world/karts/`), races run as a ride (`lib/game3d/interiors/karts.ts`; HUD + lobby `components/park/KartRace.tsx`; pure logic `lib/park/karts/{track,physics,ai,race,ghost}.ts`). Live family races over a private Supabase Realtime broadcast+presence channel `karts:<familyId>` (`lib/park/karts/net.ts`), ghosts/leaderboard in table `kart_laps` (`lib/actions/karts.ts`, migration 0052 — also adds the realtime.messages policies for the private channel). The fun layer is separate and pure: `lib/park/karts/items.ts` (item boxes → rocket/banana/bubble/star, coins, drift boost, the jump ramp; never touches physics.ts — the race loop turns it into a power multiplier or a one-off shove), sounds in `lib/park/karts/sound.ts` (WebAudio synth), the race scene's look in `lib/game3d/interiors/kartScenery.ts`. Controls are one finger: slide anywhere to steer, tap to use the item. Changing the circuit (`RAW` in track.ts) means re-running the site search (`findKartTrackSite`), updating `KART_SITE`/`KART_ROTATION`, the karts land + door in places.ts, the box/coin distances in items.ts, and bumping `TRACK_ID` in KartRace.tsx (lap times are per track). Smoke: `scripts/smoke/kart-harness.tsx` (`window.__kartAuto = true` before Race! drives a whole race).
- Natural Wonders: `registry/wonders.ts` (WONDERS: place, facts, viewpoints; first arrival → `ParkWorld.onWonder` toast + fact card; viewpoint signs → `signOffer`; pins on the Island map). So far: Victoria Falls (the Great Falls widened into 3 curtains + a carved, raised gorge `wildGorgeWallY` and the arch bridge `VIC_BRIDGE` in `registry/wildWater.ts`; `world/waterways/{falls,wildBridge}.ts`) and Mount Everest (`EVEREST_PEAK`/`EVEREST_SUMMIT` in `registry/landform.ts`, Base Camp settlement `registry/everestBaseCamp.ts`, glacier/flag `world/everestDecor.ts`, the in-world guided climb: `registry/everestRoute.ts` + ParkWorld `boardClimb`/`setClimbProgress`/`leaveClimb`, HUD `components/park/EverestClimb.tsx`, logic `lib/park/climbing/`). Also Parícutin (`registry/paricutin*.ts`, `world/paricutinDecor.ts`, `components/park/VolcanoClimb.tsx`) and the Grand Canyon (`registry/grandCanyon.ts`, `world/grandCanyonDecor.ts`, `components/park/CanyonRide.tsx`; switch `CANYON_OPEN`). The canyon is the pattern for anything with CLIFFS: the streamed height field can't hold a near-vertical face, so the gorge is ONE modelled surface (`buildCanyonSurface`, lofted along the axis with columns on every cliff's foot and top, coloured per fragment by world height), `canyonWalkY()` makes that surface (and the ledge trail `CANYON_TRAIL`) the ground via `harbours.worldFloorY`, and the height field under it is deliberately sunk out of sight (`canyonTerraceFracSoft`) — never two competing surfaces. Guided walks/rides share `registry/climbRoutes.ts` + ParkWorld `boardClimb`. Any `InstancedMesh` must be created with capacity ≥ the count later drawn (an overrun blanks whole frames). Settlement sites (Lakeside/Treetop/Highstone/town/base camp/kart) are FROZEN numbers with tests that re-run each search — terrain changes must not silently move them.
- Island roads: `registry/roads.ts` (a leaf module: frozen road polylines `ROAD_SEGMENTS` with heights, `BRIDGES`, `TUNNELS`, `CAR_PARKS`, roundabouts `ROAD_JUNCTIONS`, `LEVEL_CROSSINGS`, and the pure driving rule `roadConfine` — out in the Wildlands a `car` mount is held to the road corridor, bridge decks, tunnel floors and car parks, sliding along the edge). terrain.ts stamps plain lazy flat beds under them (no special priority — never change how stamps blend for the roads' sake: that moved ground island-wide); the visible ribbon, roundabout rings and car-park aprons in `world/roads/index.ts` are DRAPED over the real ground (`drapeY`), streamed by section like the railway. A roundabout is where its roads END: every leg's first/last point is the junction centre and leaves it radially (the ribbon is trimmed at the ring), inside the ring's disc only the ring band is drivable (`roadConfine` carries a car round the island), and station roundabouts stand ~40 units back from the line with a level crossing down the line for any road to the far side — never route a road through a platform or leave a ring on a stub (roads.test.ts checks 3+ legs per ring). Jeeps wait in every car park (`registry/rideables.ts`). Roads must stay clear of the kart circuit, the park (r 152) and wonder footprints — roads.test.ts checks; the Park Station end was laid out with a small grid router (kept in the session scratchpad, not the repo). Smoke: aerial shots by overriding the camera after `composer.render`.
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
