# Onboarding Wizard — Design Spec (R02)

**Date:** 2026-05-15
**Roadmap ID:** R02
**Goal:** New family setup in <5 min. Every parent and kid understands the app on their first visit.

---

## Overview

Two independent first-run flows — one for parents, one for each kid. Each flow has three steps: goals screen → welcome screen → guided tour. All steps are skippable. Completion and goals are persisted in the DB — goals for product insight and future personalisation, flags so the flow never re-triggers.

---

## Parent Flow

### Step 1: Goals Screen

First thing shown on the parent's first authenticated visit to `/parent/overview`.

- Full-screen card, centred
- Heading: "What do you want for your family?" 
- Subtext: "Pick everything that applies."
- Multi-select — parent can choose any combination
- Options:
  - 🌟 "Build habits my kids stick to on their own"
  - ☀️ "Create a calm, smooth morning routine"
  - 📱 "Take the battle out of screen time"
  - 🎵 "Make music practice a daily habit"
  - 📚 "Stay on top of schoolwork together"
  - 💰 "Teach my kids the value of earning things"
  - ✏️ "Other" — reveals a free-text input
- CTA: "Continue →" (saves goals, advances to welcome screen)
- Secondary: "Skip" (saves nothing, advances)

### Step 2: Welcome Screen

- Full-screen card centred over a gradient backdrop
- Personalised: "Welcome to Cucaino, [Family Name]! 👋"
- 4 benefit bullets with emoji icons:
  - ✅ Set tasks once, repeat daily — no more reminding
  - ⭐ Stars make chores exciting — kids actually want to help
  - 🎁 Rewards they'll work toward — you decide what's worth earning
  - 📊 See everything at a glance — daily progress, streaks, family goals
- Primary CTA: "Show me around →" (starts tour)
- Secondary: "Skip intro" (marks tour seen, goes straight to dashboard)

### Step 3: Tour

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

### Step 1: Goals Screen

First thing shown on the kid's first visit to `/kid/[kidId]/home`.

- Full-screen card, uses the kid's theme colour as backdrop
- Kid's avatar (large) + "Hey [Kid Name]! What are you here for? 🤩"
- Multi-select — kid can choose any combination
- Options:
  - 🎁 "Get awesome prizes"
  - 🏆 "Collect all the badges"
  - 🔥 "Never break my streak"
  - 🎵 "Become a music superstar"
  - 💪 "Be my family's hero"
  - 🎮 "Dominate the quizzes"
  - ✏️ "Something else" — reveals a free-text input
- CTA: "Next →" (saves goals, advances to interests screen)

### Step 2: Interests Screen

- Full-screen card, same theme backdrop
- Kid's avatar + "What are you into? 🤩"
- Subtext: "Pick everything you love!"
- Multi-select — one merged list, tagged internally as `task`, `reward`, or `both`
- Options:

| Key | Emoji | Label | Tag |
|-----|-------|-------|-----|
| `sports` | ⚽ | Sports & fitness | task |
| `music` | 🎵 | Music | task |
| `art` | 🎨 | Art & crafts | task |
| `reading` | 📚 | Reading & books | task |
| `gaming` | 🎮 | Video games | both |
| `cooking` | 🍳 | Cooking & baking | task |
| `outdoors` | 🌿 | Outdoors & nature | task |
| `tech` | 💻 | Technology & coding | task |
| `animals` | 🐾 | Animals & pets | task |
| `drama` | 🎭 | Drama & performance | task |
| `treats` | 🍦 | Treats & sweets | reward |
| `screen_time` | 📱 | Screen time & devices | reward |
| `movies` | 🎬 | Movies & TV shows | reward |
| `shopping` | 🛍️ | Shopping & new stuff | reward |
| `days_out` | 🎡 | Days out & adventures | reward |
| `other` | ✏️ | Something else | both |

- "Something else" reveals a free-text input
- CTA: "Next →" (saves interests, advances to welcome screen)
- Secondary: "Skip"

### Step 3: Welcome Screen

- Full-screen card centred on screen, uses the kid's theme colour as backdrop
- Kid's avatar + "Hey [Kid Name]! 👋"
- Subtext: "Ready to earn some stars?"
- Story arc row: 📋 Do tasks → ⭐ Earn stars → 🎁 Get rewards
- Motivating bullets:
  - 🏅 Build streaks by doing tasks every day
  - 🏆 Unlock badges as you level up
  - 🎯 Save stars for the rewards you want most
- Primary CTA: "Show me around! →" (starts tour)
- Secondary: "Skip"

### Step 4: Tour

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

New columns on `families`:

```sql
alter table public.families
  add column parent_tour_seen boolean not null default false,
  add column parent_goals text[] not null default '{}',
  add column parent_goals_other text;
```

New columns on `kids`:

```sql
alter table public.kids
  add column tour_seen boolean not null default false,
  add column goals text[] not null default '{}',
  add column goals_other text,
  add column interests text[] not null default '{}',
  add column interests_other text;
```

No RLS changes needed — existing family-scoped policies cover all new columns.

**Parent goal keys** (stored in `parent_goals` array):
`habits`, `morning`, `screen_time`, `music`, `school`, `value`, `other`

**Kid goal keys** (stored in `goals` array):
`prizes`, `badges`, `streak`, `music`, `hero`, `quizzes`, `other`

---

## Components

### `GoalsScreen`

Shown first for both parent and kid flows.

```ts
interface GoalsOption {
  key: string
  emoji: string
  label: string
}

interface GoalsScreenProps {
  variant: 'parent' | 'kid'
  kidName?: string
  kidAvatar?: string
  themeId?: ThemeId
  options: GoalsOption[]
  onContinue: (selected: string[], otherText: string) => void
  onSkip?: () => void
}
```

Location: `components/onboarding/GoalsScreen.tsx`

### `InterestsScreen`

Shown after goals screen, kid flow only.

```ts
interface InterestOption {
  key: string
  emoji: string
  label: string
  tag: 'task' | 'reward' | 'both'
}

interface InterestsScreenProps {
  kidName: string
  kidAvatar: string
  themeId: ThemeId
  options: InterestOption[]
  onContinue: (selected: string[], otherText: string) => void
  onSkip: () => void
}
```

Location: `components/onboarding/InterestsScreen.tsx`

### `WelcomeScreen`

Shown after goals screen (parent) or interests screen (kid).

```ts
interface WelcomeScreenProps {
  variant: 'parent' | 'kid'
  familyName?: string
  kidName?: string
  kidAvatar?: string
  themeId?: ThemeId
  onContinue: () => void
  onSkip?: () => void
}
```

Location: `components/onboarding/WelcomeScreen.tsx`

### `TourProvider` + `useTour`

React context that owns tour state. Wraps the parent layout and kid layout independently.

```ts
interface TourStep {
  route: string
  label: string
  description: string
}

interface TourContextValue {
  active: boolean
  currentStep: number
  totalSteps: number
  start: () => void
  next: () => void
  skip: () => void
}
```

- `start()`: sets `active = true`, navigates to step 0 route
- `next()`: advances step and navigates, or calls `finish()` on last step
- `skip()` / `finish()`: sets `active = false`, calls server action to mark tour seen

Location: `components/onboarding/TourContext.tsx`

### `TourCard`

Fixed-position overlay rendered when `active === true`.

- Renders backdrop + card
- Reads current step from `useTour()` context
- Location: `components/onboarding/TourCard.tsx`

### `ParentOnboardingWrapper`

Client wrapper placed in parent layout. Manages the three-step flow.

```ts
interface ParentOnboardingWrapperProps {
  parentTourSeen: boolean
  familyName: string
  children: React.ReactNode
}
```

Internal state: `phase: 'goals' | 'welcome' | 'touring' | 'done'`

Location: `components/onboarding/ParentOnboardingWrapper.tsx`

### `KidOnboardingWrapper`

Client wrapper placed in kid layout. Same state machine as parent wrapper.

```ts
interface KidOnboardingWrapperProps {
  tourSeen: boolean
  kidId: string
  kidName: string
  kidAvatar: string
  themeId: ThemeId
  children: React.ReactNode
}
```

Internal state: `phase: 'goals' | 'interests' | 'welcome' | 'touring' | 'done'`

Location: `components/onboarding/KidOnboardingWrapper.tsx`

---

## Server Actions

New file `lib/actions/onboarding.ts`:

```ts
saveParentGoals(goals: string[], goalsOther: string): Promise<ActionResult>
markParentTourSeen(): Promise<ActionResult>
saveKidGoals(kidId: string, goals: string[], goalsOther: string): Promise<ActionResult>
saveKidInterests(kidId: string, interests: string[], interestsOther: string): Promise<ActionResult>
markKidTourSeen(kidId: string): Promise<ActionResult>
```

---

## Integration Points

**Parent layout** (`app/parent/layout.tsx`):
- Fetch `family.parent_tour_seen` + `family.name` server-side
- Wrap children with `ParentOnboardingWrapper`; if `!parent_tour_seen`, wrapper shows goals → welcome → tour

**Kid layout** (`app/kid/[kidId]/layout.tsx`):
- Fetch `kid.tour_seen`, `kid.name`, `kid.avatar`, `kid.theme_id` server-side
- Wrap children with `KidOnboardingWrapper`; if `!tour_seen`, wrapper shows goals → welcome → tour

---

## Edge Cases

- **Multiple kids:** Each kid has their own `tour_seen` flag — the flow runs independently per kid on their first login
- **Parent skips goals:** Goals saved as empty array, flow advances to welcome screen
- **Parent skips welcome:** Marks tour seen in one action, goes straight to dashboard
- **Kid refreshes mid-tour:** Tour restarts from step 1 (in-memory state) — acceptable; flag only set on completion or skip
- **Tour navigates away:** Card follows (TourProvider is in the layout, persists across nav)
- **"Other" field empty:** Saved as empty string, not stored if blank
