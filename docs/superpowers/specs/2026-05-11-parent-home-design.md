# Parent Home Screen — Design Spec
**Date:** 2026-05-11  
**Status:** Approved  
**Mockups:** `mockups/parent-overview/`

---

## Purpose

The Home screen (`/parent`) is the parent's daily triage dashboard. It answers two questions at a glance: "Is there anything special happening today?" and "How are the kids going with their tasks?"

---

## Layout

Three vertical sections, top to bottom, inside a scrollable content area:

1. **Header** — fixed, sticky at top
2. **Today's Heads-Up** — conditional, hidden when no activities
3. **Kids** — one card per kid, always shown

**Navigation:** Fixed bottom nav bar with 5 items (Home, Tasks, Rewards, Quizzes, Settings). Always visible. Content area between header and nav scrolls freely.

---

## Header

- Greeting: "Good morning / afternoon / evening, [Parent display name] 👋"
- Date: e.g. "Sunday, 11 May 2026"
- Parent avatar (emoji) on the right — tappable, opens profile/sign-out menu

---

## Section 1 — Today's Heads-Up

**Visibility:** Hidden entirely when no activities exist for today. No empty/placeholder state shown.

**Data source:** Tasks with `category = "activity"` scheduled for today (from the kid timetable / tasks), plus school items that are out-of-the-norm (non-recurring items flagged for the day).

**Structure:** One unified card with up to two subsections — "Before school" and "After school" — separated by a divider. Each subsection only renders if it has at least one activity.

### Activity row

Each activity row shows:
- Kid avatar (emoji in theme-colour circle, 28px)
- Activity name: `[Kid name] — [Activity name]`
- Location + time: `📍 [Location] · Drop-off/Pick-up [time]`
- Packing items: displayed as small pill chips directly below the location line, coloured in the kid's theme colour

**Section labels:** "🌅 Before school" in orange, "🎒 After school" in purple — uppercase, small, bold.

---

## Section 2 — Kids

**Label:** "Today" with a faint kid count on the right.

One card per kid. Cards are ordered by kid creation date (consistent with the rest of the app).

### Kid card — base state (no pending request)

- Kid avatar (44px, theme-colour background)
- Kid name (bold, 15px)
- Theme name + age
- Points balance pill (amber)
- Streak pill (orange, fire emoji)
- Task progress bar in kid's theme colour
- Progress label: "X / Y" tasks done
- When all tasks complete: "🎉 All tasks done!" green banner replaces progress bar

### Kid card — with pending request

Same as base state, plus a request section below a divider:
- Card border tinted to kid's theme colour
- Reward icon + "Wants [Reward name]"
- Cost and balance on one line: "Costs X ⭐ · Has Y ⭐ · [time] ago"
- Balance shown in green if sufficient, amber if borderline
- Two action buttons: **✕ Deny** (red outline, 1/3 width) and **✓ Approve** (green filled, 2/3 width)

A kid card can only show one pending request at a time (the most recent). If a kid has multiple pending requests, only the latest is shown inline; the parent can see the rest from the Rewards/Requests flow.

---

## Bottom Navigation

Five fixed items, always visible:

| Position | Label | Icon | Route |
|----------|-------|------|-------|
| 1 | Home | House | `/parent` |
| 2 | Tasks | Checklist | `/parent/tasks` |
| 3 | Rewards | Gift | `/parent/rewards` |
| 4 | Quizzes | Question mark | `/parent/quizzes` |
| 5 | Settings | Cog | `/parent/settings` |

Active item highlighted in indigo (`#6366f1`). Inactive items in gray.

---

## States

| State | Heads-Up | Kids section |
|-------|----------|-------------|
| Activities + requests | Shown with before/after school | Cards with inline request panels |
| Activities, no requests | Shown | Clean progress cards only |
| No activities, requests | Hidden | Cards with inline request panels |
| No activities, no requests | Hidden | Clean progress cards only |

---

## Data Requirements

- `listTasksForKid` — already exists; filter for `category = "activity"` + today's schedule
- `listSchoolItems` — for packing list items attached to activities  
- `listCompletionsToday` — for progress bar X/Y count
- `listRewardRequests` — pending requests per kid (most recent per kid only on this screen)
- Kid points balance + streak from `getKid` / `listKids`

---

## Implementation Notes

- The Heads-Up section draws from existing `Task` data (`category = "activity"`, `location`, `packingList` fields) — no new data model required
- Approve/Deny buttons call existing `approveRequest` / `denyRequest` server actions (currently non-functional — this redesign makes them work)
- Parent nav bar component (`ParentShell`) must be updated: move nav from top to bottom fixed position
- `revalidatePath("/parent")` after approve/deny so kid balance + request panel updates
