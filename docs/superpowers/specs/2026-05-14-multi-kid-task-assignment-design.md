# Multi-Kid Task Assignment

**Date:** 2026-05-14  
**Status:** Approved

## Problem

Tasks can currently be assigned to either one kid (`kid_id = uuid`) or all kids (`kid_id = null`). There is no way to assign a task to a specific subset of kids (e.g. two out of three).

## Decision

Use **Option A — array column `kid_ids uuid[]`** on the `tasks` table.

- `kid_ids = null` → all kids (unchanged semantics)
- `kid_ids = [uuid1, uuid2]` → specific subset of kids
- New kids added to the family do NOT automatically inherit tasks assigned to a specific subset

---

## Schema

### Migration

```sql
-- 1. Add new column
ALTER TABLE tasks ADD COLUMN kid_ids uuid[];

-- 2. Backfill from existing kid_id
UPDATE tasks SET kid_ids = ARRAY[kid_id] WHERE kid_id IS NOT NULL;
-- Rows where kid_id IS NULL keep kid_ids = NULL (means "all kids")

-- 3. Drop old column
ALTER TABLE tasks DROP COLUMN kid_id;
```

RLS policies remain unchanged — they filter by `family_id`, not `kid_id`.

---

## Data Layer

### TypeScript type (`lib/domain/types.ts`)

```ts
// Before
kidId: string | null;

// After
kidIds: string[] | null;
```

### Query (`lib/data/queries.ts` — `listTasksForKid`)

```ts
// Before
.or(`kid_id.is.null,kid_id.eq.${kidId}`)

// After
.or(`kid_ids.is.null,kid_ids.cs.{${kidId}}`)
```

`cs` is PostgREST's array-contains operator (`@>`).

### Server actions (`lib/actions/tasks.ts`)

- `createTask` and `updateTask` replace `kidId: string | null` with `kidIds: string[] | null`
- Insert/update passes `kid_ids: kidIds` to Supabase

---

## UI

### Parent task form — "Assigned to" section

- Becomes a **multi-select chip group**
- "All kids" chip sits first; selecting it clears all individual kid selections and sets `kidIds = null`
- Individual kid chips can each be toggled on/off
- Selecting any individual kid deselects "All kids"
- Visual style unchanged: selected = indigo background, unselected = gray

### Everything else

No changes to kid-side views, todo list, task cards, or completion flow. The assignment change is transparent once `listTasksForKid` returns the right tasks.

---

## Out of Scope

- No per-kid scheduling differences (same days/time for all assigned kids)
- No UI to show which kids a task is assigned to from the kid's perspective
