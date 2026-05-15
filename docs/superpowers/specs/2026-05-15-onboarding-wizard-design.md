# Onboarding Wizard — Design Spec (R02)

**Date:** 2026-05-15
**Roadmap ID:** R02
**Goal:** New family setup in <5 min. Every parent and kid understands the app on their first visit.

---

## Overview

Two independent first-run flows — one for parents, one for each kid. Both consist of a welcome screen (sells the benefits) followed by a guided tour (floating card overlay per page). Both are skippable. Completion is persisted in the DB so the flow never re-triggers.

---

## Parent Flow

### Welcome Screen

Shown immediately on the parent's first authenticated visit to `/parent/overview`.

- Full-screen card centred over a gradient backdrop
- Personalised: "Welcome to Cucaino, [Family Name]! 👋"
- 4 benefit bullets with emoji icons:
  - ✅ Set tasks once, repeat daily — no more reminding
  - ⭐ Stars make chores exciting — kids actually want to help
  - 🎁 Rewards they'll work toward — you decide what's worth earning
  - 📊 See everything at a glance — daily progress, streaks, family goals
- Primary CTA: "Show me around →" (starts tour)
- Secondary: "Skip intro" (marks tour seen, goes straight to dashboard)

### Tour

5-stop floating card overlay. Starts immediately after welcome screen CTA.

- Dark semi-transparent backdrop covers the page
- Card pinned to bottom-centre of screen
- Card anatomy: step counter ("Step N of 5"), page emoji + name, 1-sentence description, "Next →" button, "Skip tour ×" link
- On each "Next →": navigates to the next stop's route using `router.push()`
- On final stop: button reads "Done ✓" — dismisses tour and marks complete
- Skip at any point: dismisses tour and marks complete

**Tour stops:**

| Step | Route | Label | Description |
|------|-------|-------|-------------|
| 1 | `/parent/overview` | 📊 Overview | Your daily snapshot — see which kids have completed tasks and the family star balance at a glance. |
| 2 | `/parent/tasks` | ✅ Tasks | Create and schedule tasks for your kids. Assign points, set a time block, and they appear on each kid's daily list. |
| 3 | `/parent/rewards` | 🎁 Rewards | Set up what kids can earn with their stars. You control what's available and whether it needs your approval. |
| 4 | `/parent/requests` | 🔔 Requests | When a kid claims a reward that needs approval, it shows up here. Approve or deny with one tap. |
| 5 | `/parent/settings` | ⚙️ Settings | Manage your kids' profiles, set a parent PIN, and customise your family's setup. |

---

## Kid Flow

### Welcome Screen

Shown on the kid's first visit to `/kid/[kidId]/home`.

- Full-screen card centred on screen, uses the kid's theme colour as backdrop
- Kid's avatar (large, e.g. 52px emoji) + "Hey [Kid Name]! 👋"
- Subtext: "Ready to earn some stars?"
- Story arc row: 📋 Do tasks → ⭐ Earn stars → 🎁 Get rewards
- Motivating bullets:
  - 🏅 Build streaks by doing tasks every day
  - 🏆 Unlock badges as you level up
  - 🎯 Save stars for the rewards you want most
- Primary CTA: "Let's go! 🚀" (starts tour)
- No explicit skip — tapping outside or the CTA both advance

### Tour

4-stop floating card overlay. Starts immediately after welcome screen CTA.

- Same card pattern as parent tour (bottom-centre, dark backdrop)
- Kid-friendly copy — shorter sentences, encouraging tone

**Tour stops:**

| Step | Route | Label | Description |
|------|-------|-------|-------------|
| 1 | `/kid/[kidId]/home` | 🏠 Home | See your stars, streaks, and today's progress. This is your command centre! |
| 2 | `/kid/[kidId]/todo` | 📋 Schedule | Your daily tasks live here. Tick them off to earn stars — try to get them all done! |
| 3 | `/kid/[kidId]/rewards` | 🎁 Store | Spend your stars on rewards. Save up for the big ones or grab something small today. |
| 4 | `/play` | 🎮 Play | Quiz time! Answer questions, beat your score, and earn bonus stars. |

---

## Data Model

Two new boolean columns, both default `false`:

```sql
alter table public.families add column parent_tour_seen boolean not null default false;
alter table public.kids add column tour_seen boolean not null default false;
```

No RLS changes needed — existing family-scoped policies cover both columns.

---

## Components

### `WelcomeScreen`

Shared layout component, configured per side via props.

```ts
interface WelcomeScreenProps {
  variant: 'parent' | 'kid'
  familyName?: string   // parent variant
  kidName?: string      // kid variant
  kidAvatar?: string    // kid variant
  themeColor?: string   // kid variant — backdrop colour
  onContinue: () => void
  onSkip?: () => void   // parent only
}
```

Location: `components/onboarding/WelcomeScreen.tsx`

### `TourProvider` + `useTour`

React context that owns tour state. Wraps the parent layout and the kid shell independently.

```ts
interface TourConfig {
  steps: TourStep[]
}

interface TourStep {
  route: string
  label: string
  description: string
}

// Context value
interface TourContextValue {
  active: boolean
  currentStep: number
  totalSteps: number
  next: () => void
  skip: () => void
}
```

- `next()`: advances step, calls `router.push(steps[currentStep + 1].route)`, or calls `finish()` on last step
- `skip()` / `finish()`: sets `active = false`, calls server action to mark tour seen
- Location: `components/onboarding/TourProvider.tsx`

### `TourCard`

Fixed-position overlay rendered by `TourProvider` when `active === true`.

- Renders backdrop + card
- Reads current step from context
- Location: `components/onboarding/TourCard.tsx`

---

## Server Actions

Two new actions in `lib/actions/onboarding.ts`:

```ts
markParentTourSeen(): Promise<ActionResult>
markKidTourSeen(kidId: string): Promise<ActionResult>
```

Both update the respective DB flag and call `revalidatePath` on the relevant layout route.

---

## Integration Points

**Parent layout** (`app/parent/layout.tsx`):
- Fetch `family.parent_tour_seen` server-side
- Pass as prop to a client wrapper that initialises `TourProvider` if false
- Show `WelcomeScreen` before rendering children on first visit

**Kid home page** (`app/kid/[kidId]/home/page.tsx`):
- Fetch `kid.tour_seen` server-side
- Pass to a client component that shows `WelcomeScreen` then initialises `TourProvider` if false

---

## Edge Cases

- **Multiple kids:** Each kid has their own `tour_seen` flag — the tour runs independently per kid on their first login
- **Parent skips welcome:** Skipping the welcome screen also skips the tour (marks complete in one action)
- **Kid refreshes mid-tour:** Tour restarts from step 1 (in-memory state) — acceptable UX; the flag is only set on completion or skip
- **Tour navigates away from current page:** If a parent manually navigates during the tour, the card follows (TourProvider is in the layout, persists across nav)
