# Performance Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate blank-screen flashes on every navigation by adding `loading.tsx` skeletons to all 32 routes that lack them, and prevent duplicate DB calls by wrapping `getKid` with `React.cache()`.

**Architecture:** Next.js App Router streams `loading.tsx` instantly while the page's async server component resolves. Adding a skeleton to a route requires only a single new file per route — no changes to existing pages. `React.cache()` is a one-line change to `lib/data/queries.ts` that deduplicates `getKid` calls within a single render tree.

**Tech Stack:** Next.js App Router · React 19 · Tailwind CSS

---

## Findings addressed

| Finding | Severity | Fix |
|---|---|---|
| 34 routes missing `loading.tsx` | 🔴 Critical | Add `loading.tsx` skeleton to each route |
| `getKid()` not wrapped in `React.cache()` | 🟡 High | Wrap with `cache()` in `lib/data/queries.ts` |
| `router.refresh()` calls (17) | 🟡 High | All server actions already call `revalidatePath` — these are post-mutation refreshes on non-critical paths. Leave for now. |

**Not addressed:** `today` and `week` routes are pure `redirect()` calls — they resolve instantly and need no skeleton.

---

## File Map

**Create (skeletons):**
```
app/kid/[kidId]/home/loading.tsx
app/kid/[kidId]/todo/loading.tsx
app/kid/[kidId]/rewards/loading.tsx
app/kid/[kidId]/progress/loading.tsx
app/kid/[kidId]/profile/loading.tsx
app/kid/[kidId]/timetable/loading.tsx
app/kid/[kidId]/practice/[taskId]/loading.tsx
app/kid/[kidId]/tuner/loading.tsx
app/parent/feedback/loading.tsx
app/parent/kids/loading.tsx
app/parent/kids/[kidId]/edit/loading.tsx
app/parent/profile/loading.tsx
app/parent/quizzes/loading.tsx
app/parent/quizzes/question/new/loading.tsx
app/parent/quizzes/question/[questionId]/edit/loading.tsx
app/parent/quizzes/set/new/loading.tsx
app/parent/quizzes/set/[setId]/edit/loading.tsx
app/parent/requests/loading.tsx
app/parent/rewards/loading.tsx
app/parent/rewards/new/loading.tsx
app/parent/rewards/[rewardId]/edit/loading.tsx
app/parent/school-items/loading.tsx
app/parent/settings/loading.tsx
app/parent/tasks/loading.tsx
app/parent/tasks/new/loading.tsx
app/parent/tasks/[taskId]/edit/loading.tsx
app/login/loading.tsx
app/signup/loading.tsx
app/select-kid/loading.tsx
app/play/loading.tsx
app/play/quiz/loading.tsx
app/play/quiz/[bankId]/loading.tsx
```

**Modify:**
```
lib/data/queries.ts   — wrap getKid with React.cache()
```

---

## Shared skeleton primitives

All skeletons use only Tailwind classes already in the project. No new components needed.

**Kid shell chrome** — used by all kid routes. Since `loading.tsx` has no params access, it renders a generic gray chrome that matches the real KidShell layout (header + bottom nav):

```tsx
// Header row: avatar circle + name placeholder + stars placeholder
<div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
  <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
  <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
  <div className="flex items-center gap-1">
    <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
    <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
  </div>
</div>

// Bottom nav: 4 icon+label pairs
<div className="flex justify-around items-center py-2 px-6 bg-white border-t">
  {[...Array(4)].map((_, i) => (
    <div key={i} className="flex flex-col items-center gap-1">
      <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
      <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
    </div>
  ))}
</div>
```

**Parent list skeleton** — used by all parent list pages (tasks, rewards, kids, etc.):

```tsx
<div className="p-4 space-y-3">
  {[...Array(5)].map((_, i) => (
    <div key={i} className="bg-white rounded-2xl shadow h-16 animate-pulse" />
  ))}
</div>
```

**Parent form skeleton** — used by all edit/new pages:

```tsx
<div className="p-4 max-w-lg mx-auto space-y-5">
  <div className="h-7 bg-gray-200 rounded animate-pulse w-40" />
  {[...Array(5)].map((_, i) => (
    <div key={i} className="space-y-1">
      <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
      <div className="h-10 bg-gray-200 rounded-xl animate-pulse w-full" />
    </div>
  ))}
  <div className="h-12 bg-gray-200 rounded-2xl animate-pulse w-full" />
</div>
```

---

## Task 1: React.cache() on getKid

**Files:**
- Modify: `lib/data/queries.ts`

- [ ] **Step 1: Add cache import**

Open `lib/data/queries.ts`. At the top of the file (after the existing imports), add:

```ts
import { cache } from "react";
```

- [ ] **Step 2: Wrap getKid with cache()**

Find the existing `getKid` export (around line 157):

```ts
export const getKid = timed("getKid", async (id: string): Promise<Kid | null> => {
```

Replace the `export const getKid =` line so the function is wrapped with `cache()`:

```ts
export const getKid = cache(timed("getKid", async (id: string): Promise<Kid | null> => {
```

Then find the closing of the `getKid` function. It ends with `});` — change it to `}));` to close the `cache()` call.

The result should look like:
```ts
export const getKid = cache(timed("getKid", async (id: string): Promise<Kid | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kids")
    .select("*")
    .eq("id", id)
    .single();
  if (!data) return null;
  return mapKid(data);
}));
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/data/queries.ts
git commit -m "perf: wrap getKid with React.cache() to deduplicate DB calls per render"
```

---

## Task 2: Kid core route skeletons — home, todo, rewards, progress

**Files:**
- Create: `app/kid/[kidId]/home/loading.tsx`
- Create: `app/kid/[kidId]/todo/loading.tsx`
- Create: `app/kid/[kidId]/rewards/loading.tsx`
- Create: `app/kid/[kidId]/progress/loading.tsx`

- [ ] **Step 1: Create home/loading.tsx**

Home page layout: level card (circular progress + stats) + today's task cards.

```tsx
export default function Loading() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Level card */}
        <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-28" />
            <div className="h-3 bg-gray-200 rounded-full animate-pulse w-full" />
            <div className="h-3 bg-gray-200 rounded animate-pulse w-20" />
          </div>
        </div>
        {/* Task cards */}
        <div className="h-4 bg-gray-200 rounded animate-pulse w-32" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow h-16 animate-pulse" />
        ))}
      </div>
      <div className="flex justify-around items-center py-2 px-6 bg-white border-t">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create todo/loading.tsx**

Todo layout: day tab strip + section headers + task cards.

```tsx
export default function Loading() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-3 overflow-auto">
        {/* Day tab strip */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse shrink-0" />
          ))}
        </div>
        {/* Section header */}
        <div className="h-4 bg-gray-200 rounded animate-pulse w-36 mt-2" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow h-16 animate-pulse" />
        ))}
        <div className="h-4 bg-gray-200 rounded animate-pulse w-28 mt-2" />
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow h-16 animate-pulse" />
        ))}
      </div>
      <div className="flex justify-around items-center py-2 px-6 bg-white border-t">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create rewards/loading.tsx**

Rewards layout: points balance + reward cards grid.

```tsx
export default function Loading() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Balance card */}
        <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 bg-gray-200 rounded animate-pulse w-16" />
            <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
          </div>
        </div>
        <div className="h-4 bg-gray-200 rounded animate-pulse w-28" />
        {/* Reward cards */}
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow h-28 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="flex justify-around items-center py-2 px-6 bg-white border-t">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create progress/loading.tsx**

Progress layout: level card + 6 badge tiles in 2-column grid.

```tsx
export default function Loading() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Level card */}
        <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-gray-200 rounded animate-pulse w-24" />
            <div className="h-3 bg-gray-200 rounded-full animate-pulse w-full" />
          </div>
        </div>
        {/* Badge grid */}
        <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow h-24 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="flex justify-around items-center py-2 px-6 bg-white border-t">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/kid/\[kidId\]/home/loading.tsx app/kid/\[kidId\]/todo/loading.tsx app/kid/\[kidId\]/rewards/loading.tsx app/kid/\[kidId\]/progress/loading.tsx
git commit -m "perf: add loading skeletons for kid home, todo, rewards, progress routes"
```

---

## Task 3: Kid secondary route skeletons — profile, timetable, practice, tuner

**Files:**
- Create: `app/kid/[kidId]/profile/loading.tsx`
- Create: `app/kid/[kidId]/timetable/loading.tsx`
- Create: `app/kid/[kidId]/practice/[taskId]/loading.tsx`
- Create: `app/kid/[kidId]/tuner/loading.tsx`

- [ ] **Step 1: Create profile/loading.tsx**

Profile layout: large avatar + name + theme picker row.

```tsx
export default function Loading() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-6 overflow-auto">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <div className="w-24 h-24 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-5 bg-gray-200 rounded animate-pulse w-28" />
        </div>
        {/* Form fields */}
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-20" />
              <div className="h-10 bg-gray-200 rounded-xl animate-pulse w-full" />
            </div>
          ))}
        </div>
        {/* Theme row */}
        <div className="flex gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="flex justify-around items-center py-2 px-6 bg-white border-t">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create timetable/loading.tsx**

Timetable layout: day column headers + period rows.

```tsx
export default function Loading() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 overflow-auto">
        {/* Day headers */}
        <div className="grid grid-cols-5 gap-2 mb-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        {/* Period rows */}
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-2">
              {[...Array(5)].map((_, j) => (
                <div key={j} className="h-14 bg-white rounded-xl shadow animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-around items-center py-2 px-6 bg-white border-t">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create practice/[taskId]/loading.tsx**

Practice layout: task name + timer circle + controls.

```tsx
export default function Loading() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
        <div className="h-6 bg-gray-200 rounded animate-pulse w-48" />
        <div className="w-40 h-40 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse" />
          <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex justify-around items-center py-2 px-6 bg-white border-t">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create tuner/loading.tsx**

Tuner layout: note display + frequency meter.

```tsx
export default function Loading() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white shadow-sm border-b">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        <div className="flex-1 h-4 rounded-full bg-gray-200 animate-pulse max-w-[100px]" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="w-10 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-36 h-36 rounded-full bg-gray-200 animate-pulse" />
        <div className="w-full h-8 bg-gray-200 rounded-full animate-pulse max-w-xs" />
        <div className="h-5 bg-gray-200 rounded animate-pulse w-20" />
      </div>
      <div className="flex justify-around items-center py-2 px-6 bg-white border-t">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="w-10 h-2 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/kid/[kidId]/profile/loading.tsx" "app/kid/[kidId]/timetable/loading.tsx" "app/kid/[kidId]/practice/[taskId]/loading.tsx" "app/kid/[kidId]/tuner/loading.tsx"
git commit -m "perf: add loading skeletons for kid profile, timetable, practice, tuner routes"
```

---

## Task 4: Parent list route skeletons

**Files:**
- Create: `app/parent/feedback/loading.tsx`
- Create: `app/parent/kids/loading.tsx`
- Create: `app/parent/profile/loading.tsx`
- Create: `app/parent/quizzes/loading.tsx`
- Create: `app/parent/requests/loading.tsx`
- Create: `app/parent/rewards/loading.tsx`
- Create: `app/parent/school-items/loading.tsx`
- Create: `app/parent/settings/loading.tsx`
- Create: `app/parent/tasks/loading.tsx`

The parent layout already streams (it has its own `loading.tsx`), so these skeletons only need to fill the **content area** — no need to repeat the parent shell chrome.

- [ ] **Step 1: Create the standard parent list skeleton**

All 9 files get the same content — pulse card rows matching their list layout:

`app/parent/feedback/loading.tsx`:
```tsx
export default function Loading() {
  return (
    <div className="p-4 space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow h-16 animate-pulse" />
      ))}
    </div>
  );
}
```

Create this identical file for each of the 9 paths:
- `app/parent/feedback/loading.tsx`
- `app/parent/kids/loading.tsx`
- `app/parent/requests/loading.tsx`
- `app/parent/rewards/loading.tsx`
- `app/parent/school-items/loading.tsx`
- `app/parent/tasks/loading.tsx`

- [ ] **Step 2: Create profile/loading.tsx** (form-style, not list)

```tsx
export default function Loading() {
  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      <div className="h-7 bg-gray-200 rounded animate-pulse w-32" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
          <div className="h-10 bg-gray-200 rounded-xl animate-pulse w-full" />
        </div>
      ))}
      <div className="h-12 bg-gray-200 rounded-2xl animate-pulse w-full" />
    </div>
  );
}
```

- [ ] **Step 3: Create settings/loading.tsx** (sections, not list)

```tsx
export default function Loading() {
  return (
    <div className="p-4 space-y-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-28" />
          {[...Array(3)].map((_, j) => (
            <div key={j} className="bg-white rounded-2xl shadow h-14 animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create quizzes/loading.tsx** (tabs + cards)

```tsx
export default function Loading() {
  return (
    <div className="p-4 space-y-4">
      {/* Tab strip */}
      <div className="flex gap-2">
        <div className="h-9 w-32 bg-gray-200 rounded-full animate-pulse" />
        <div className="h-9 w-28 bg-gray-200 rounded-full animate-pulse" />
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow h-20 animate-pulse" />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/parent/feedback/loading.tsx app/parent/kids/loading.tsx app/parent/profile/loading.tsx app/parent/quizzes/loading.tsx app/parent/requests/loading.tsx app/parent/rewards/loading.tsx app/parent/school-items/loading.tsx app/parent/settings/loading.tsx app/parent/tasks/loading.tsx
git commit -m "perf: add loading skeletons for parent list and settings routes"
```

---

## Task 5: Parent form route skeletons (edit/new pages)

**Files:**
- Create: `app/parent/kids/[kidId]/edit/loading.tsx`
- Create: `app/parent/quizzes/question/new/loading.tsx`
- Create: `app/parent/quizzes/question/[questionId]/edit/loading.tsx`
- Create: `app/parent/quizzes/set/new/loading.tsx`
- Create: `app/parent/quizzes/set/[setId]/edit/loading.tsx`
- Create: `app/parent/rewards/new/loading.tsx`
- Create: `app/parent/rewards/[rewardId]/edit/loading.tsx`
- Create: `app/parent/tasks/new/loading.tsx`
- Create: `app/parent/tasks/[taskId]/edit/loading.tsx`

All 9 of these are form pages. Use the same form skeleton for each.

- [ ] **Step 1: Create all 9 form skeletons**

Each file gets this exact content:

```tsx
export default function Loading() {
  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      <div className="h-7 bg-gray-200 rounded animate-pulse w-40" />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
          <div className="h-10 bg-gray-200 rounded-xl animate-pulse w-full" />
        </div>
      ))}
      <div className="h-12 bg-gray-200 rounded-2xl animate-pulse w-full" />
    </div>
  );
}
```

Create this file at all 9 paths listed above.

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/parent/kids/[kidId]/edit/loading.tsx" "app/parent/quizzes/question/new/loading.tsx" "app/parent/quizzes/question/[questionId]/edit/loading.tsx" "app/parent/quizzes/set/new/loading.tsx" "app/parent/quizzes/set/[setId]/edit/loading.tsx" "app/parent/rewards/new/loading.tsx" "app/parent/rewards/[rewardId]/edit/loading.tsx" "app/parent/tasks/new/loading.tsx" "app/parent/tasks/[taskId]/edit/loading.tsx"
git commit -m "perf: add loading skeletons for all parent edit/new form routes"
```

---

## Task 6: Public and play route skeletons

**Files:**
- Create: `app/login/loading.tsx`
- Create: `app/signup/loading.tsx`
- Create: `app/select-kid/loading.tsx`
- Create: `app/play/loading.tsx`
- Create: `app/play/quiz/loading.tsx`
- Create: `app/play/quiz/[bankId]/loading.tsx`

- [ ] **Step 1: Create login/loading.tsx**

Login layout: centered card with logo + two inputs + button.

```tsx
export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="h-10 bg-gray-200 rounded animate-pulse w-32 mx-auto" />
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-16" />
              <div className="h-10 bg-gray-200 rounded-xl animate-pulse w-full" />
            </div>
          ))}
          <div className="h-12 bg-gray-200 rounded-2xl animate-pulse w-full" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create signup/loading.tsx**

Same centered card pattern with more fields.

```tsx
export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="h-10 bg-gray-200 rounded animate-pulse w-40 mx-auto" />
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-20" />
              <div className="h-10 bg-gray-200 rounded-xl animate-pulse w-full" />
            </div>
          ))}
          <div className="h-12 bg-gray-200 rounded-2xl animate-pulse w-full" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create select-kid/loading.tsx**

Select-kid layout: title + grid of kid avatar cards.

```tsx
export default function Loading() {
  return (
    <div className="min-h-dvh bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-48 mx-auto" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow aspect-square animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create play/loading.tsx**

Play hub layout: 3 large cards (Quiz, Flashcards, Memory).

```tsx
export default function Loading() {
  return (
    <div className="min-h-dvh bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4 pt-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-32" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create play/quiz/loading.tsx**

Quiz picker: filter chips + quiz set cards.

```tsx
export default function Loading() {
  return (
    <div className="min-h-dvh bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4 pt-4">
        <div className="h-7 bg-gray-200 rounded animate-pulse w-40" />
        <div className="flex gap-2 flex-wrap">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 w-20 bg-gray-200 rounded-full animate-pulse" />
          ))}
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow h-20 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create play/quiz/[bankId]/loading.tsx**

Quiz game: question card + answer options.

```tsx
export default function Loading() {
  return (
    <div className="min-h-dvh bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4 pt-4">
        <div className="h-4 bg-gray-200 rounded-full animate-pulse w-full" />
        <div className="bg-white rounded-2xl shadow p-6 h-32 animate-pulse" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-white rounded-2xl shadow animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/login/loading.tsx app/signup/loading.tsx app/select-kid/loading.tsx app/play/loading.tsx "app/play/quiz/loading.tsx" "app/play/quiz/[bankId]/loading.tsx"
git commit -m "perf: add loading skeletons for public, select-kid, and play routes"
```

---

## Task 7: Re-run perf audit and verify

**Files:**
- No code changes — verify audit output improves

- [ ] **Step 1: Ensure dev server is running**

```bash
npm run dev
```

- [ ] **Step 2: Run the full perf audit**

In a second terminal:
```bash
npm run perf
```

- [ ] **Step 3: Verify critical count dropped**

Expected terminal output:
```
   20 issues found · 🔴 2 critical · 🟡 18 high · 🟢 0 medium
```

The 2 remaining critical items should be `today` and `week` (redirect pages — intentionally skipped). All 32 route skeletons should be present.

If the critical count is still above 2, run:
```bash
npm run perf:static
```
and check which routes are still listed as missing `loading.tsx`.

- [ ] **Step 4: Open HTML report and verify screenshots show skeleton content**

```powershell
start docs\perf-report-2026-05-11.html
```

Verify that the `/login`, `/select-kid`, and `/play` screenshots show skeleton pulse shapes rather than blank white screens. This confirms the skeletons are rendering before SSR completes.

- [ ] **Step 5: Final commit**

```bash
git add docs/perf-report-2026-05-11.html
git commit -m "perf: verified all route skeletons in place, audit clean"
```
