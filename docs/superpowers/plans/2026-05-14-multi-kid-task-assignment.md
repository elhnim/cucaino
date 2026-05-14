# Multi-Kid Task Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `kid_id` column on tasks with a `kid_ids uuid[]` array so parents can assign a task to any subset of kids.

**Architecture:** One SQL migration adds `kid_ids`, backfills from `kid_id`, and drops the old column. The TypeScript type, mapTask, query filter, server actions, and two UI components are updated to match. No new tables or RLS changes needed.

**Tech Stack:** Next.js App Router · Supabase (PostgREST array operator `cs`) · TypeScript · React state

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/0008_task_kid_ids.sql` |
| Regenerate | `lib/supabase/database.types.ts` |
| Modify | `lib/domain/types.ts` |
| Modify | `lib/data/queries.ts` |
| Modify | `lib/actions/tasks.ts` |
| Modify | `components/parent/TaskFormModal.tsx` |
| Modify | `app/parent/tasks/[taskId]/edit/TaskEditClient.tsx` |
| Modify | `components/parent/TasksClient.tsx` |
| Modify | `app/parent/tasks/page.tsx` |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0008_task_kid_ids.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/0008_task_kid_ids.sql
ALTER TABLE tasks ADD COLUMN kid_ids uuid[];
UPDATE tasks SET kid_ids = ARRAY[kid_id] WHERE kid_id IS NOT NULL;
ALTER TABLE tasks DROP COLUMN kid_id;
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Call `mcp__supabase__apply_migration` with:
- `project_id`: `nuurkkhpvozudfmpruqm`
- `name`: `task_kid_ids`
- `query`: the SQL above

- [ ] **Step 3: Verify migration applied**

Call `mcp__supabase__execute_sql` with:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name IN ('kid_id', 'kid_ids');
```
Expected: one row — `kid_ids | ARRAY`. `kid_id` must not appear.

- [ ] **Step 4: Regenerate TypeScript database types**

Run: `npx supabase gen types typescript --project-id nuurkkhpvozudfmpruqm --schema public > lib/supabase/database.types.ts`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_task_kid_ids.sql lib/supabase/database.types.ts
git commit -m "feat: migrate tasks.kid_id to kid_ids uuid[] array"
```

---

## Task 2: Update domain type and data layer

**Files:**
- Modify: `lib/domain/types.ts` line 80
- Modify: `lib/data/queries.ts` lines 103 and 190

- [ ] **Step 1: Update Task interface in lib/domain/types.ts**

Replace line 80:
```ts
// Before
kidId: string | null; // null = both kids

// After
kidIds: string[] | null; // null = all kids
```

- [ ] **Step 2: Update mapTask in lib/data/queries.ts**

Replace line 103:
```ts
// Before
kidId: row.kid_id,

// After
kidIds: (row as any).kid_ids ?? null,
```

- [ ] **Step 3: Update listTasksForKid filter in lib/data/queries.ts**

Replace line 190:
```ts
// Before
.or(`kid_id.is.null,kid_id.eq.${kidId}`)

// After
.or(`kid_ids.is.null,kid_ids.cs.{${kidId}}`)
```

(`cs` is PostgREST's array-contains / `@>` operator.)

- [ ] **Step 4: Commit**

```bash
git add lib/domain/types.ts lib/data/queries.ts
git commit -m "feat: update Task type, mapTask, and listTasksForKid for kid_ids"
```

---

## Task 3: Update server actions

**Files:**
- Modify: `lib/actions/tasks.ts` lines 25, 59, 97, 108

- [ ] **Step 1: Update TaskFormData interface (line 25)**

```ts
// Before
kidId: string | null;

// After
kidIds: string[] | null;
```

- [ ] **Step 2: Update createTask insert (lines 59 and 97)**

Replace line 59:
```ts
// Before
kid_id: data.kidId,

// After
kid_ids: data.kidIds,
```

Replace line 97:
```ts
// Before
if (data.kidId) revalidatePath(`/kid/${data.kidId}/today`);

// After
data.kidIds?.forEach((id) => revalidatePath(`/kid/${id}/today`));
```

- [ ] **Step 3: Update updateTask (line 108)**

Replace line 108:
```ts
// Before
kid_id: data.kidId,

// After
kid_ids: data.kidIds,
```

- [ ] **Step 4: Commit**

```bash
git add lib/actions/tasks.ts
git commit -m "feat: update task actions for kid_ids array"
```

---

## Task 4: Update TaskFormModal UI (modal used for quick task creation)

**Files:**
- Modify: `components/parent/TaskFormModal.tsx` lines 100 and 343–372

- [ ] **Step 1: Update initial form data (line 100)**

```ts
// Before
kidId: task?.kidId ?? null,

// After
kidIds: task?.kidIds ?? null,
```

- [ ] **Step 2: Replace Assigned to section (lines 343–372)**

```tsx
{/* Assigned to */}
<div>
  <label className="text-xs font-bold text-gray-500">Assigned to</label>
  <div className="flex gap-2 mt-1 flex-wrap">
    <button
      type="button"
      onClick={() => set("kidIds", null)}
      className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
        form.kidIds === null
          ? "bg-indigo-600 text-white border-indigo-600"
          : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
      }`}
    >
      All kids
    </button>
    {kids.map((kid) => {
      const selected = form.kidIds?.includes(kid.id) ?? false;
      return (
        <button
          key={kid.id}
          type="button"
          onClick={() => {
            const current = form.kidIds ?? [];
            const next = current.includes(kid.id)
              ? current.filter((id) => id !== kid.id)
              : [...current, kid.id];
            set("kidIds", next.length === 0 ? null : next);
          }}
          className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
            selected
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
          }`}
        >
          {kid.avatar} {kid.name}
        </button>
      );
    })}
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add components/parent/TaskFormModal.tsx
git commit -m "feat: multi-select kid assignment in TaskFormModal"
```

---

## Task 5: Update TaskEditClient UI (full edit page)

**Files:**
- Modify: `app/parent/tasks/[taskId]/edit/TaskEditClient.tsx` lines 43, 271–297, and form submission

- [ ] **Step 1: Update state declaration (line 43)**

```tsx
// Before
const [kidId, setKidId] = useState<string | null>(task?.kidId ?? null);

// After
const [kidIds, setKidIds] = useState<string[] | null>(task?.kidIds ?? null);
```

- [ ] **Step 2: Replace Assigned to section (lines 271–297)**

```tsx
{/* Assigned to */}
<div className="bg-white rounded-2xl shadow p-4 space-y-2">
  <div className="text-sm font-bold text-gray-700">Assigned to</div>
  <div className="flex flex-wrap gap-2">
    <button
      type="button"
      onClick={() => setKidIds(null)}
      className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
        kidIds === null ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
      }`}
    >
      All kids
    </button>
    {kids.map((k) => {
      const selected = kidIds?.includes(k.id) ?? false;
      return (
        <button
          key={k.id}
          type="button"
          onClick={() =>
            setKidIds((prev) => {
              const current = prev ?? [];
              const next = current.includes(k.id)
                ? current.filter((id) => id !== k.id)
                : [...current, k.id];
              return next.length === 0 ? null : next;
            })
          }
          className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
            selected ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          {k.avatar} {k.name}
        </button>
      );
    })}
  </div>
</div>
```

- [ ] **Step 3: Update form submission — find the object passed to updateTask and replace kidId with kidIds**

Search for `kidId,` or `kidId:` in the form data object (line ~74 area) and replace:
```ts
// Before
kidId,

// After
kidIds,
```

- [ ] **Step 4: Commit**

```bash
git add "app/parent/tasks/[taskId]/edit/TaskEditClient.tsx"
git commit -m "feat: multi-select kid assignment in TaskEditClient"
```

---

## Task 6: Update TasksClient audience display

**Files:**
- Modify: `components/parent/TasksClient.tsx` lines 43–44

- [ ] **Step 1: Replace audience derivation**

```tsx
// Before
const kid = t.kidId ? kidById.get(t.kidId) : null;
const audience = kid ? `${kid.avatar} ${kid.name}` : "All kids";

// After
const audience =
  t.kidIds === null
    ? "All kids"
    : t.kidIds
        .map((id) => {
          const k = kidById.get(id);
          return k ? `${k.avatar} ${k.name}` : "";
        })
        .filter(Boolean)
        .join(", ");
```

- [ ] **Step 2: Commit**

```bash
git add components/parent/TasksClient.tsx
git commit -m "feat: update task audience display for kid_ids array"
```

---

## Task 7: Update parent tasks page filter logic

**Files:**
- Modify: `app/parent/tasks/page.tsx` (around lines 113–118)

- [ ] **Step 1: Read the current filter logic**

Read `app/parent/tasks/page.tsx` lines 100–130 to locate the line that filters tasks by the selected kid.

- [ ] **Step 2: Update filter to use kid_ids**

The filter currently checks `task.kidId === selectedKid`. Replace with logic that includes:
- Tasks where `kidIds` is `null` (all kids) — always visible regardless of active kid filter
- Tasks where `kidIds` includes the selected kid

```ts
// Before (approximate)
.filter((t) => !kidFilter || t.kidId === kidFilter)

// After
.filter((t) => !kidFilter || t.kidIds === null || t.kidIds.includes(kidFilter))
```

- [ ] **Step 3: Commit**

```bash
git add "app/parent/tasks/page.tsx"
git commit -m "feat: update parent task filter for kid_ids array"
```

---

## Task 8: Build verification and manual test

- [ ] **Step 1: Run full build**

```bash
npm run build
```
Expected: clean with no TypeScript errors.

- [ ] **Step 2: Run dev server**

```bash
npm run dev
```

- [ ] **Step 3: Manual test checklist**

1. `/parent/tasks` — task list loads, existing tasks show correct audience ("All kids" or kid names)
2. Create a new task via the task form — "Assigned to" shows multi-select chips; select two kids, save
3. Open each assigned kid's `/kid/[kidId]/todo` — task appears for both assigned kids only
4. Open a non-assigned kid's `/kid/[kidId]/todo` — task does NOT appear
5. Edit the task — both selected kids are pre-highlighted
6. Change assignment to "All kids" — task now appears for every kid
7. Filter parent task list by a specific kid — tasks assigned to that kid (plus "All kids" tasks) appear

- [ ] **Step 4: Push**

```bash
git push
```
