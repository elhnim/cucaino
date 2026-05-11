# Tasks Merge — Design Spec
**Date:** 2026-05-11  
**Status:** Approved  
**Mockups:** `mockups/2026-05-11-tasks-merge/`

---

## Purpose

Consolidate three separate data concepts (Tasks, SchoolClass, SchoolItem) into a single **Task** with six categories. Parents manage everything from one screen and one form. Kids see everything in one unified view.

---

## Categories

Six categories, each pill shown in the "Add task" form:

| Icon | Label | Description |
|------|-------|-------------|
| 🧹 | Chore | Household responsibilities |
| 🏃 | Exercise | Physical activity |
| 🎹 | Music | Instrument practice — metronome always available on task card, no form config |
| 🎒 | Activity | Extracurriculars with location + packing list — no completion tracking |
| 🌱 | Habit | Self-improvement (reading, journaling, etc.) |
| 📚 | School Subject | Timetable entries — info-only, no completion tracking |

`personal` category is renamed to `habit` in the data model. `school_subject` is new.

---

## Add Task Form — Fields by Category

### Standard categories: Chore, Exercise, Music, Habit

| Field | Notes |
|-------|-------|
| Icon picker + Name | Required |
| Category pills | All 6 shown |
| Rule | Strict / Flexible |
| Assigned to | All kids or individual kids |
| Schedule | Every day / Weekdays / Weekends / Pick days |
| Times per day | 1× / 2× / 3× / 4× (default 1×) |
| Time of day | Dropdown (Before school / Morning / After school / Afternoon / Evening / Anytime) |
| Start time | Optional; 5-minute increment steps |
| Target | None / Timer / Reps / Checklist |
| Points | Kid ⭐ (per completion) + Family ⭐ |
| **Auto-set — Requires completion** | Always YES — displayed as locked badge, not a checkbox |
| **Auto-set — Kids can add** | Always NO for strict; eligible for flexible — displayed as locked badge |

Music has no additional fields. The metronome feature is always available on the task card during practice.

### Activity

Activities happen on the scheduled day or they don't — no Strict/Flexible rule. Fields shown:

| Field | Notes |
|-------|-------|
| Icon picker + Name | Required |
| Category pills | All 6 shown |
| Assigned to | All kids or individual kids |
| Schedule | Every day / Weekdays / Weekends / Pick days |
| Time of day | Dropdown |
| Start time | Optional; 5-minute increment steps |
| 📍 Location | Optional — where to drop off / pick up |
| 🎒 Packing list | Tag input — items shown as a reminder the evening before |
| Points | Optional (default 0) |

**Hidden for Activity:** Rule, Times per day, Target, Requires completion badge, Kids can add badge.

### School Subject

Parent-side form. Each kid has their own timetable — subjects assigned to one kid at a time.

| Field | Notes |
|-------|-------|
| Subject grid | 15 subjects in 3-column grid (see subject registry); one must be selected to enable Save |
| Custom name | Optional — overrides the subject label display |
| When subject = Custom (✏️) | "Subject name" field becomes required; Save blocked until filled |
| Assigned to | Single kid picker |
| Schedule | Every day / Weekdays / Weekends / Pick days |
| Start time + End time | Two inputs side by side; 5-minute increment steps |
| Room | Optional |
| Teacher | Optional |
| 🎒 Packing list | Tag input — items kids need to bring for this subject |

**Hidden for School Subject:** Rule, Times per day, Time of day, Target, Points, Requires completion badge, Kids can add badge. No info banner.

---

## Times per Day — Counter Behaviour

- Selector: 1× / 2× / 3× / 4× (shown for Chore, Exercise, Music, Habit only)
- Default: 1×
- On the kid's todo card: one card with a tap counter (0 / N). Each tap increments and awards points once. Card is complete when counter reaches N / N.
- Points label updates to "per completion" when times_per_day > 1
- "Requires completion" auto-set badge updates to "Yes × N" when times_per_day > 1

---

## Tasks List — Parent View

`/parent/tasks` shows all tasks in a **single flat scrollable list**.

### Filters

Two side-by-side dropdown controls above the list:

- **Category** — All / 🧹 Chore / 🏃 Exercise / 🎹 Music / 🎒 Activity / 🌱 Habit / 📚 School Subject
- **Kid** — All kids / [each kid by name]

Each dropdown shows the current selection value. Opening a dropdown dims the list and shows a panel with radio-select options (single selection per filter).

### Task cards

Each card shows: icon, name, category tag, schedule info, points badge, and a **📌 Strict** (amber) or **🔄 Flexible** (blue) rule tag inline. Activity and School Subject cards show no rule tag. A `›` arrow opens the edit form.

---

## Kid Todo Screen — School Section

The school section in the kid's daily todo view (`/kid/[kidId]/todo`) shows school_subject tasks for the active day as coloured pills (e.g. 🧮 Maths, 📚 English). At the end of the pill row is a dashed `+ Add subject` button.

Tapping `+ Add subject` opens a bottom sheet with a **school-subject-only** form (no category picker). Fields: subject grid, which days (Mon–Fri toggles), start + end time (5-minute steps), room, teacher, packing list. Save is disabled until a subject is selected.

Kids cannot add any other task category from this screen.

---

## School Items — Deprecation

`/parent/school-items` shows a prominent amber banner:

> **School Items are moving to Tasks**  
> Packing reminders now live on Activity tasks — add a Location and Packing List to any activity. Existing items here still work but won't be added to new schedules.  
> → Create an Activity task instead

Existing school items remain visible and functional below the banner.

---

## Data Requirements

### New DB columns on `tasks` table

```sql
subject       text          -- school_subject only (math, english, science…)
custom_label  text          -- school_subject: overrides subject label display
end_time      text          -- school_subject: "HH:MM" paired with start_time
room          text          -- school_subject: optional room label
teacher       text          -- school_subject: optional teacher name
times_per_day integer       -- default 1; chore/exercise/music/habit only
```

### Category rename

`personal` → `habit` in the `TaskCategory` enum and category registry.

### Deprecated tables (kept, not deleted)

`school_classes` and `school_items` remain in the DB. Their management UIs show deprecation notices. New data goes into `tasks`.

---

## Rewards List — Parent View

`/parent/rewards` shows all family rewards in a **flat scrollable list**, split into Active and Paused sections.

### Filters

Two side-by-side dropdowns above the list:

- **Type** — All / 🍬 Treat / 🔓 Privilege / ✨ Experience / 🎀 Prize
- **Who** — All / 👤 Individual / 👨‍👩‍👧‍👦 Team

### Reward cards

Each card shows: icon, name, type badge (colour-coded), individual/team badge, approval badge if required, cost in ⭐, and a `›` arrow to edit. Paused rewards are dimmed with a red ⏸ Paused tag.

### Add Reward form

Bottom sheet with fields:

| Field | Notes |
|-------|-------|
| Icon picker + Name | Required |
| Type | 2×2 grid: 🍬 Treat / 🔓 Privilege / ✨ Experience / 🎀 Prize |
| Who | Individual / Team (2-column grid) |
| Available to | All kids or specific kids |
| Cost | Points required to redeem |
| Recurrence | Recurring / One-off |
| Redemption limit | Max times per day/week/month (optional, blank = unlimited) |
| Requires approval | Toggle — parent must approve before delivery |

---

## Quizzes — Parent View

`/parent/quizzes` shows quiz sets only — no question library in the app. The full question bank is seeded data managed outside the app; the quiz engine auto-selects questions matching each kid's age from their profile.

### List (Q-01)

Flat scrollable list of all quiz sets. Two dropdown filters: **Theme** and **Difficulty**. All sets are equally editable via `›` — no built-in vs custom distinction.

Each card: emoji icon, name, theme tags, difficulty tag, questions-per-session count.

### Theme filter open (Q-01b)

Tapping Theme opens a dropdown panel with a 2-column grid of all themes. Single-select with "All" default. Dim overlay behind.

### Add / Edit Quiz Set (Q-02)

Bottom sheet with:

| Field | Notes |
|-------|-------|
| Emoji + Name | Required |
| Themes | Multi-select pill grid (all 10 themes) |
| Max difficulty | Easy / Medium / Hard 3-button toggle |
| Questions per session | Number input |

Age band hidden — quiz engine matches age automatically from kid profiles.

---

## Settings — Parent View

`/parent/settings` is a grouped list screen with four sections.

### S-01 Settings main

| Section | Rows |
|---------|------|
| Family | Family name (editable) · Parents & Guardians (member count) |
| Kids | One row per kid (emoji, name, age, theme) · Add a kid |
| Preferences | Timezone · Week starts on · Holiday mode (toggle) |
| App | Send feedback · Version · Sign out (red) |

### S-02 Parents & Guardians

Lists all members with avatar, name, email, and role (Admin). Current user tagged "You". Other members have a red Remove button. Below the list, an email invite field with a Send Invite button. Both parents are admins with full access.

### S-03 Edit Kid

Sub-page per kid: emoji avatar (tappable to change), name, date of birth (shows calculated age), theme picker, PIN, and a red Remove kid row at the bottom.

### S-04 Holiday mode ON

Same as S-01 but with an amber banner at the top: "Holiday mode is on — Strict tasks are paused. Kids only see flexible tasks and activities." The holiday mode toggle shows as on.

---

## Login Screen (L-01)

`/login` — full-screen gradient background (indigo-100 → purple-50 → pink-100). Centered white card:

- Brand mark: ✨ Cucaino above the card
- Heading: "Hello! 👋"
- Subheading: "Sign in to your Cucaino family."
- Email field (focused state: indigo border)
- Password field
- "Sign in" primary button (indigo)
- Footer link: "New here? Create an account" → `/signup`

---

## Select Profile Screen (SP-01 / SP-02)

`/select-kid` renamed conceptually to **Select Profile** — shows all family members (kids and parents) as equal profile cards.

### SP-01 Profile grid

- Brand: ✨ Cucaino at top
- Heading: "Knock knock... 🚪 / Who's there?"
- `auto-fit` grid (`minmax(150px, 1fr)`) — auto-organises to fill screen width (e.g. 4 profiles → 2×2, 3 profiles → 3 across)
- Cards are square (`aspect-ratio: 1`)

**Kid profile card** (white, shadow):
- Theme-coloured avatar circle with emoji (e.g. 🦄 on purple, 🚀 on blue)
- Name in theme colour, bold
- ⭐ points + 🔥 streak day badges
- Progress bar (tasks done / total), shows count below
- 🔒 PIN badge (top-right corner) if PIN is set

**Parent profile card** — same white square format as kids:
- Indigo-tinted avatar circle with parent emoji (e.g. 👩)
- Name in indigo (e.g. "Mum")
- Small "PARENT" pill badge below name
- 🔒 PIN badge if PIN is set

### SP-02 PIN entry modal

Shown when tapping any profile that has a PIN set. Overlays the blurred grid:
- Profile avatar ring (coloured border matching theme)
- "Enter [Name]'s PIN" heading
- 4 dot indicators (filled indigo = entered, empty gray = remaining)
- 3×4 numpad (1–9, blank, 0, ⌫)
- "Cancel" link at bottom

---

## Parent Profile — Settings

`/parent/profile` (accessible from the Settings screen via the parent's name/avatar row).

### PP-01 My Profile

Hero section at the top: 80px emoji avatar with an indigo pencil-badge overlay (tap to open avatar picker). Display name below (e.g. "Mum"), email address below that.

Two grouped sections:

| Section | Rows |
|---------|------|
| Account | Display name (editable text row) · Email (display-only, labelled "Managed by login") |
| Security | Parent PIN (shows current state: "Set" or "Not set"; tap to change/remove) |

Below the sections: a 5-column × 4-row emoji avatar grid (20 options). Selected emoji has an indigo border and indigo-tinted background.

### PP-02 Change PIN

Full-screen PIN entry sheet:

- Lock icon header, "Enter a new 4-digit PIN" heading + short description
- 4 circular dot indicators (filled indigo = entered digit, empty gray = remaining)
- 3×4 numpad (digits 1–9, blank, 0, backspace)
- "Remove PIN" link in red at the bottom (only shown when a PIN is already set)

---

## Mockup Reference

| Screen | File |
|--------|------|
| Default (category picker) | `01-form-default.html` |
| Chore — 1× per day | `02-form-chore.html` |
| Chore — 2× per day (brush teeth) | `02b-form-chore-2x.html` |
| Music | `03-form-music.html` |
| Activity | `04-form-activity.html` |
| School Subject — subject picker | `05-form-school-picker.html` |
| School Subject — Maths selected | `06-form-school-filled.html` |
| School Subject — Custom | `07-form-school-other.html` |
| School Items — deprecation | `09-school-items-deprecation.html` |
| Kid todo — school section + add subject | `10-kid-timetable.html` |
| Kid add subject sheet | `11-kid-add-subject.html` |
| Tasks list — filters closed | `12-tasks-all.html` |
| Tasks list — Category dropdown open | `12b-tasks-filter-open.html` |
| Rewards list | `13-rewards.html` |
| Add Reward form | `14-reward-form.html` |
| Quizzes flow (Q-01, Q-01b, Q-02) | `15-quizzes.html` |
| Settings flow (S-01 – S-04) | `16-settings.html` |
| Parent profile (PP-01 – PP-02) | `17-parent-profile.html` |
| Login + Select Profile (L-01, SP-01, SP-02) | `18-login-select.html` |
