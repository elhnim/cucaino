# Cucaino Kid-Side → All-Canvas Game World (Phaser)

**Status:** Draft for review · **Date:** 2026-06-12 · **Owner:** Minh + Claude

## 1. Goal

Turn the entire **kid side** of Cucaino into a single, continuous Phaser game world — a candyland the child explores, where doing routines/chores feels like playing. Every kid-facing surface (world home, My Day tasks, Store, Play hub, Pet, mini-games, Profile, kid picker) is rendered **inside one Phaser canvas**, not as separate web pages.

The **parent dashboard stays React/web, unchanged.** Auth (login/signup) stays web. The canvas takes over once a kid is selected.

This decision was made knowingly: it is more work and more battery than a hybrid, in exchange for one cohesive game feel. The candy HTML mockups in `mockups/2026-06-12-game-world/` define the visual target; they will be reproduced in-canvas.

## 2. Hard constraints

- **Devices:** must feel native on **iPad (landscape)** and **iPhone (portrait)**. Phaser Scale Manager `FIT` + per-scene responsive layout that re-flows for aspect ratio, not just scales.
- **Text entry carve-out:** the only non-canvas UI. At the moment a human must type (login password, new kid name, custom task text, search), a native HTML `<input>` is overlaid via the DOM, focused (so iOS shows the real keyboard), then removed on commit. Nowhere else is DOM UI used inside the kid experience.
- **Data layer is reused as-is.** All reads/writes continue through `lib/data/stub.ts` (→ `queries.ts`) and the existing server actions. The canvas never talks to Supabase directly; it calls a thin TypeScript **data bridge** (plain async functions) that wrap the existing queries/actions. No schema changes.
- **Performance:** 60fps target on a 2019 iPad / iPhone 11. Texture atlases, capped particle counts, scenes sleep when not visible, world pauses when a panel is open.
- **Offline/PWA:** existing PWA shell stays. Canvas assets are precached by the service worker.

## 3. How it sits inside Next.js

- A new route group renders **one** full-viewport client component, `KidGameApp`, that boots a single `Phaser.Game`. Routes like `/kid/[kidId]/...` are collapsed: instead of many pages, the URL carries *where in the world* the child is, and `KidGameApp` maps the path → a Phaser scene/state on mount and on history navigation. (Deep links still work: `/kid/123/store` boots straight into the Store scene.)
- `KidGameApp` is `dynamic(() => ..., { ssr: false })` — Phaser is browser-only.
- The parent app and auth pages are untouched React routes.
- Server data is fetched in the route's server component and passed to `KidGameApp` as initial props (kid, pet, today's tasks, rewards, balances) so the world opens instantly with no in-canvas spinner. Subsequent mutations go through the data bridge → server actions → `revalidatePath`.

## 4. Phaser structure

**One `Phaser.Game`, Scale `FIT`, multiple scenes:**

| Scene | Replaces today's | Notes |
|---|---|---|
| `BootScene` | — | config, scale, input |
| `PreloadScene` | `loading.tsx` | loads atlases with a candy progress bar |
| `WorldScene` | home | the roaming candyland; pet wanders; tappable buildings; camera pans to a building on tap |
| `MyDayScene` | `/todo` | task "cards" as in-world objects or a panel layer; tick → stamp + star burst + pet cheer |
| `StoreScene` | `/rewards` | reward shelf; buy flow; locked items |
| `PlayHubScene` | `/play` | game tiles with animal mascots |
| `PetScene` | pet game | the existing pet logic, re-skinned with CraftPix sprite atlases |
| `MiniGameScene(s)` | Money Town etc. | physics mini-games |
| `ProfileScene` | `/profile` | avatar, level bar, badges, pet, look |
| `PickerScene` | `/select-kid` | "Who's playing" avatar cards |
| `HudLayer` (parallel scene) | KidShell nav | persistent avatar + coins + stars; bottom "map/back" control; runs above world scenes |

**Cross-cutting systems (plain TS modules, engine-agnostic where possible):**
- `dataBridge.ts` — async wrappers over existing queries/actions (the ONLY I/O seam).
- `nativeInput.ts` — the DOM `<input>` overlay summon/dismiss helper.
- `layout.ts` — responsive anchor/scale helpers for portrait vs landscape.
- `sound.ts` — SFX/music (CraftPix + existing audio).
- `theme.ts` — candy palette + the 6 kid themes mapped to canvas tints/backgrounds.

## 5. Asset pipeline

- Source: purchased CraftPix PNG packs in `art-source/craftpix/` (gitignored). See [[project_craftpix_assets]].
- Build step: pack per-frame PNGs into **texture atlases** (sprite sheet + JSON) per character/scene to cut draw calls and load time. Tooling: a small Node script using `free-tex-packer-core` (or similar) run offline; output committed to `public/game/atlases/`.
- Characters ship Idle/Walk/Jump/etc. frame folders → one atlas + Phaser animation config per creature.
- Backgrounds and UI nine-slices exported at the resolutions we actually use.

## 6. Auth & entry flow

1. Web login/signup (unchanged, native forms).
2. `PickerScene` ("Who's playing") — first canvas scene after auth, or a web picker that hands off; TBD in Phase 1 (leaning: keep picker web, enter canvas on kid select, to keep the multi-kid/parent-link plumbing simple).
3. Kid selected → boot `KidGameApp` → `WorldScene`.

## 7. Risks & mitigations

- **Scope (months).** → Ship as vertical slices behind a feature flag; old React kid routes stay live until each scene reaches parity.
- **Text/accessibility.** → Native-input carve-out; revisit a11y (large-text, screen-reader) per scene; document gaps.
- **Battery/heat on iPhone.** → Pause the render loop when a full-screen panel is open or the tab is hidden; cap particles; throttle idle world to 30fps.
- **Two tech stacks to maintain (canvas kid side + React parent side).** → Shared types and the data bridge keep the seam thin; accept the cost (explicit decision).
- **Regression risk to working app.** → Feature flag + keep `lib/data` untouched; per-scene parity checklist vs the route it replaces.

## 8. Phased delivery (the important part)

**Phase 0 — Spike / vertical slice (prove the architecture before committing months):**
- Add Phaser; build `BootScene`+`PreloadScene`+`WorldScene`+`HudLayer`+`PetScene` for ONE kid, behind a flag at e.g. `/kid/[kidId]/world`.
- Wire the data bridge for: load kid, load pet, feed/play pet, load today's task count for the HUD.
- Prove on real iPad + iPhone: 60fps, responsive both orientations, native-input summon works, deep-link boot works.
- **Gate:** Minh reviews the running slice. Go/no-go on the full rewrite. (If "no-go", we still have a great Phaser pet + world home and fall back to hybrid for the rest — no loss.)

**Phase 1 — Core loop:** MyDayScene (ticking tasks, the daily heart of the app) + StoreScene, at full parity with `/todo` and `/rewards`. Switch the flag for these.

**Phase 2 — Play & identity:** PlayHubScene, ProfileScene, PickerScene; migrate Money Town mini-games into MiniGameScene(s).

**Phase 3 — Polish & cutover:** theme support, sound pass, celebrations, perf hardening; retire the old React kid routes; remove the flag.

## 9. Out of scope

- Parent dashboard redesign (stays as-is).
- New gameplay features beyond what each replaced screen already does (parity first; new fun is additive later).
- Schema/database changes.
