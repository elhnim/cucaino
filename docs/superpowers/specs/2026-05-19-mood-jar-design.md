# Mood Jar — Design Spec

## Overview

A home screen widget where kids tap emoji moods any time throughout the day. Each mood appears as a bubble inside a glass jar; tapping the same mood again makes its bubble grow. Parents see a summary on the parent home kid card.

## Behaviour

- Kids can log a mood any time — multiple entries per day, no limit.
- 6 moods: 😊 Happy · 😢 Sad · 😠 Angry · 😰 Worried · 😌 Calm · 🤩 Excited
- Each mood has one bubble in the jar. The bubble grows with each tap of that mood.
- Bubble size: `fontSize = Math.min(64, 16 + count * 6)` px. First tap = 22 px, caps at 64 px (~8 taps).
- Each mood has a fixed position slot inside the jar so bubbles don't overlap.
- Jar fill level rises with total tap count across all moods, capped at full at 12 total taps.
- Jar resets visually each day (queries `WHERE date = today`).
- Taps are optimistic — UI updates instantly, server action fires in background with no await.

## Data Model

### Table: `public.mood_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `family_id` | uuid FK | References `families(id)`, RLS anchor |
| `kid_id` | uuid FK | References `kids(id)` |
| `mood` | text NOT NULL | Emoji string e.g. `"😊"` |
| `date` | date NOT NULL | `DEFAULT CURRENT_DATE` |
| `logged_at` | timestamptz NOT NULL | `DEFAULT now()` |

RLS: `family_scope` policy — `family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid())`.

Index on `(kid_id, date)`.

### Domain type

```ts
export interface MoodEntry {
  id: string;
  familyId: string;
  kidId: string;
  mood: string;
  date: string;
  loggedAt: string;
}
```

## Queries & Actions

### `listTodayMoodCounts(kidId: string): Promise<Record<string, number>>`

Returns a map of emoji → tap count for today. Example: `{ "😊": 4, "😢": 1 }`.

```sql
SELECT mood, COUNT(*) as count
FROM mood_entries
WHERE kid_id = $1 AND date = CURRENT_DATE
GROUP BY mood
```

### `logMood(kidId: string, mood: string): Promise<void>` (server action)

Inserts one row. Resolves `family_id` via the families table. No `revalidatePath` needed (optimistic UI handles display; parent view refreshes on next navigation).

## Components

### `MoodJarWidget` (`components/kid/MoodJarWidget.tsx`)

Client component.

**Props:**
```ts
interface MoodJarWidgetProps {
  kidId: string;
  initialCounts: Record<string, number>;
  accent: string;
}
```

**State:** `counts: Record<string, number>` — initialised from `initialCounts`.

**Render:**
- SVG jar (same amber/honey style as the mockup) with a fill rect whose height is proportional to total taps / 12.
- 6 emoji bubbles absolutely positioned inside the jar area, each in a fixed slot. Font size derived from `counts[mood]`.
- Row of 6 tap buttons below the jar. Each is a circular button showing the emoji. Tapping calls `handleTap(mood)`.
- `handleTap`: `setCounts(prev => ({ ...prev, [mood]: (prev[mood] ?? 0) + 1 }))` then `logMood(kidId, mood)` (fire-and-forget).

### `KidHomeWidgets` additions

- Add `"mood"` to `SORTABLE_IDS`, `WIDGET_LABELS` (`"🫙 Mood Jar"`), `DEFAULT_WIDTHS` (`"full"`).
- Add `moodCounts: Record<string, number>` and `kidId` (already present) to `KidHomeWidgetsProps`.
- `WidgetContent` case `"mood"`: renders `<MoodJarWidget kidId={kid.id} initialCounts={moodCounts} accent={theme.accent} />`.

## Data Fetching

### Kid home page (`app/kid/[kidId]/home/page.tsx`)

Add `listTodayMoodCounts(kid.id)` to the `Promise.all`. Pass result as `moodCounts` to `<KidHomeWidgets />`.

### Parent home page (`app/parent/page.tsx`)

Add `listTodayMoodCounts(kid.id)` to the per-kid `Promise.all`. Pass `moodCounts` into `kidCards`.

### Parent home widgets (`components/parent/ParentHomeWidgets.tsx`)

Add `moodCounts: Record<string, number>` to `KidCardData`. In the kid card, show the dominant mood (highest count) as a small pill: e.g. `😊 ×4`. If no moods logged today, show nothing.

## Files

| Action | File |
|---|---|
| Create | `supabase/migrations/0025_mood_entries.sql` |
| Modify | `lib/domain/types.ts` |
| Modify | `lib/data/queries.ts` |
| Create | `lib/actions/mood.ts` |
| Create | `components/kid/MoodJarWidget.tsx` |
| Modify | `components/kid/KidHomeWidgets.tsx` |
| Modify | `app/kid/[kidId]/home/page.tsx` |
| Modify | `app/parent/page.tsx` |
| Modify | `components/parent/ParentHomeWidgets.tsx` |
