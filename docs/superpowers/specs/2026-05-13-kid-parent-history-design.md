# Kid & Parent History — Design Spec

**Date:** 2026-05-13  
**Status:** Approved

## Problem

Kids have no way to review what they've completed or what rewards they've claimed. Parents have no way to see a per-kid record of activity. Both are working blind after the fact.

## Solution

A compact chronological history feed — task completions and reward claims together, grouped by day — accessible to both kids and parents via existing navigation patterns without adding new nav tabs.

---

## Kid-side History

### Access

Avatar menu (top-left of the header in `KidShell`) → new "My history" entry → `/kid/[kidId]/history`

`KidAvatarMenu` in `components/kid/KidShell.tsx` already has "Edit profile" and "Switch profile". "My history" is added as the first item.

### Page: `/kid/[kidId]/history`

- New server component at `app/kid/[kidId]/history/page.tsx`
- Wrapped by the existing `KidShell` layout (no layout changes needed)
- Loads last **14 days** of history

### Layout

Compact list, grouped by day, newest first.

**Day header row:**  
`Tue 13 May` · `+23 ⭐` (net stars for the day — tasks earned minus rewards spent)

**Task completion row:**  
`[icon] Task name` · `+N ⭐` (green)

**Reward claim row:**  
`[icon] Reward name` · `Reward claimed` (subtext) · `−N ⭐` (red)  
Row has a warm amber background tint (`#fffbeb`) to visually distinguish from task rows.

**Empty state:** "No activity in the last 14 days." centred message.

**Skipped days:** Days with zero completions and zero claims are not shown.

**Reward filter:** Only `approved` and `delivered` reward requests appear. `pending` and `denied` are excluded.

---

## Parent-side History

### Access

Each kid card on the parent home page (`/parent`) gets a `"View history →"` link that navigates to `/parent/history/[kidId]`.

### Page: `/parent/history/[kidId]`

- New server component at `app/parent/history/[kidId]/page.tsx`
- Wrapped by the existing `ParentShell` layout
- Loads last **30 days** of history (parents need more lookback)
- Header shows kid avatar + name

### Layout

Same compact list as the kid side. No functional differences — parents see the same data for the selected kid.

---

## Data Layer

### New query: `listKidHistory`

```ts
listKidHistory(kidId: string, days: number): Promise<HistoryEntry[]>
```

**`HistoryEntry` type:**
```ts
type HistoryEntry =
  | { kind: "task"; date: string; taskName: string; taskIcon: string; pointsAwarded: number }
  | { kind: "reward"; date: string; rewardName: string; rewardIcon: string; pointsSpent: number }
```

**Implementation:**
- Fetch `task_completions` for the kid within the date range, join task `name` and `icon` from `tasks`
- Fetch `reward_requests` for the kid within the date range where `status IN ('approved', 'delivered')`, join reward `name`, `icon`, `cost_points` from `rewards`
- Merge both arrays, sort by `date` descending then by created timestamp descending within a day
- Exported from `lib/data/queries.ts`, re-exported through `lib/data/stub.ts`

### Parent home page change

`app/parent/page.tsx` — add `"View history →"` link to each kid card pointing to `/parent/history/[kid.id]`. No new data fetch required on that page.

---

## Files Changed / Created

| File | Change |
|------|--------|
| `lib/domain/types.ts` | Add `HistoryEntry` union type |
| `lib/data/queries.ts` | Add `listKidHistory` query |
| `lib/data/stub.ts` | Re-export `listKidHistory` |
| `components/kid/KidShell.tsx` | Add "My history" to `KidAvatarMenu` |
| `app/kid/[kidId]/history/page.tsx` | New — kid history page |
| `app/parent/history/[kidId]/page.tsx` | New — parent view of kid history |
| `app/parent/page.tsx` | Add "View history →" link to each kid card |

---

## Out of Scope

- Pagination (14/30 days is enough for now; can add later)
- Filtering by task category or reward type
- Expandable day cards
- Denied reward requests shown with a separate status
