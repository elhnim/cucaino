# Kid & Parent History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chronological history feed (task completions + reward claims, grouped by day) accessible to kids via their avatar menu and to parents via per-kid links on the parent home page.

**Architecture:** New `listKidHistory` query merges `task_completions` and `reward_requests` from Supabase, joined to task/reward metadata. Kid history page lives at `/kid/[kidId]/history` (server component, KidShell layout). Parent history page at `/parent/history/[kidId]` (server component, ParentShell layout). Avatar menus and parent home page kid cards get new links — no new nav tabs.

**Tech Stack:** Next.js App Router · TypeScript · Tailwind CSS · Supabase (server client) · React server components

> **No test runner is configured.** Use `npm run typecheck` to verify TypeScript after each task, and `npm run build` at the end.

---

### Task 1: Add `HistoryEntry` type

**Files:**
- Modify: `lib/domain/types.ts`

- [ ] **Step 1: Add the type**

Open `lib/domain/types.ts` and append after the `RewardRequest` interface (around line 185):

```ts
// ----------------------------------------------------------------------------
// History
// ----------------------------------------------------------------------------

export type HistoryEntry =
  | {
      kind: "task";
      date: string;           // YYYY-MM-DD
      taskName: string;
      taskIcon: string;
      pointsAwarded: number;
    }
  | {
      kind: "reward";
      date: string;           // YYYY-MM-DD (extracted from requested_at)
      rewardName: string;
      rewardIcon: string;
      pointsSpent: number;
    };
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/domain/types.ts
git commit -m "feat: add HistoryEntry type"
```

---

### Task 2: Add `listKidHistory` query

**Files:**
- Modify: `lib/data/queries.ts`

- [ ] **Step 1: Add the import**

At the top of `lib/data/queries.ts`, add `HistoryEntry` to the existing type import block:

```ts
import type {
  // ... existing imports ...
  HistoryEntry,
} from "@/lib/domain/types";
```

- [ ] **Step 2: Add the query**

Append to the bottom of `lib/data/queries.ts`:

```ts
export const listKidHistory = timed(
  "listKidHistory",
  async (kidId: string, days: number): Promise<HistoryEntry[]> => {
    const supabase = await createClient();

    // Calculate the start date
    const from = new Date();
    from.setDate(from.getDate() - days);
    const fromDate = from.toISOString().slice(0, 10); // YYYY-MM-DD
    const fromDatetime = from.toISOString();           // full ISO for timestamp column

    const [{ data: completions, error: cErr }, { data: requests, error: rErr }] =
      await Promise.all([
        supabase
          .from("task_completions")
          .select("date, points_awarded, tasks(name, icon)")
          .eq("kid_id", kidId)
          .gte("date", fromDate)
          .order("date", { ascending: false }),
        supabase
          .from("reward_requests")
          .select("requested_at, rewards(name, icon, cost_points)")
          .eq("kid_id", kidId)
          .in("status", ["approved", "delivered"])
          .gte("requested_at", fromDatetime)
          .order("requested_at", { ascending: false }),
      ]);

    if (cErr || rErr) return [];

    const taskEntries: HistoryEntry[] = (completions ?? []).map((row: any) => ({
      kind: "task",
      date: row.date as string,
      taskName: (row.tasks as any)?.name ?? "Task",
      taskIcon: (row.tasks as any)?.icon ?? "✅",
      pointsAwarded: row.points_awarded ?? 0,
    }));

    const rewardEntries: HistoryEntry[] = (requests ?? []).map((row: any) => ({
      kind: "reward",
      date: (row.requested_at as string).slice(0, 10),
      rewardName: (row.rewards as any)?.name ?? "Reward",
      rewardIcon: (row.rewards as any)?.icon ?? "🎁",
      pointsSpent: (row.rewards as any)?.cost_points ?? 0,
    }));

    // Merge and sort newest first
    return [...taskEntries, ...rewardEntries].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  },
);
```

- [ ] **Step 3: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/data/queries.ts
git commit -m "feat: add listKidHistory query"
```

---

### Task 3: Kid history page

**Files:**
- Create: `app/kid/[kidId]/history/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/kid/[kidId]/history/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getKid, listKidHistory } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import type { HistoryEntry } from "@/lib/domain/types";

function groupByDate(entries: HistoryEntry[]): { date: string; entries: HistoryEntry[] }[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const group = map.get(e.date) ?? [];
    group.push(e);
    map.set(e.date, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({ date, entries }));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function netStars(entries: HistoryEntry[]): number {
  return entries.reduce((sum, e) => {
    if (e.kind === "task") return sum + e.pointsAwarded;
    return sum - e.pointsSpent;
  }, 0);
}

export default async function KidHistoryPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const [kid, entries] = await Promise.all([
    getKid(kidId),
    listKidHistory(kidId, 14),
  ]);
  if (!kid) notFound();

  const theme = getTheme(kid.themeId);
  const groups = groupByDate(entries);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-black">📋 My History</h2>

      {groups.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-16">
          No activity in the last 14 days.
        </div>
      ) : (
        groups.map(({ date, entries: dayEntries }) => {
          const net = netStars(dayEntries);
          return (
            <div key={date}>
              {/* Day header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  {formatDate(date)}
                </span>
                <span
                  className="text-[11px] font-bold"
                  style={{ color: net >= 0 ? "#16a34a" : "#ef4444" }}
                >
                  {net >= 0 ? "+" : ""}{net} ⭐
                </span>
              </div>

              {/* Rows */}
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {dayEntries.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      borderBottom: i < dayEntries.length - 1 ? "1px solid #f3f4f6" : undefined,
                      background: entry.kind === "reward" ? "#fffbeb" : undefined,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{
                        background: entry.kind === "reward" ? "#fef3c7" : theme.accentSoft,
                      }}
                    >
                      {entry.kind === "task" ? entry.taskIcon : entry.rewardIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-gray-900 truncate">
                        {entry.kind === "task" ? entry.taskName : entry.rewardName}
                      </div>
                      {entry.kind === "reward" && (
                        <div className="text-[10px] text-gray-400">Reward claimed</div>
                      )}
                    </div>
                    <div
                      className="text-[13px] font-black flex-shrink-0"
                      style={{ color: entry.kind === "task" ? "#16a34a" : "#ef4444" }}
                    >
                      {entry.kind === "task" ? `+${entry.pointsAwarded}` : `−${entry.pointsSpent}`} ⭐
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/kid/[kidId]/history/page.tsx
git commit -m "feat: add kid history page"
```

---

### Task 4: Wire "My history" into kid avatar menu

**Files:**
- Modify: `components/kid/KidShell.tsx`

- [ ] **Step 1: Add the link**

In `components/kid/KidShell.tsx`, find the `KidAvatarMenu` component. The dropdown currently has "Edit profile" and "Switch profile". Add "My history" as the **first** item:

```tsx
// Add this import at the top if not present:
// import Link from "next/link";  ← already imported

// Inside the open dropdown div, before the "Edit profile" Link:
<Link
  href={`/kid/${kid.id}/history`}
  onClick={() => setOpen(false)}
  className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 border-b border-gray-50 hover:bg-gray-50"
>
  <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm">📋</span>
  My history
</Link>
```

The full dropdown block should read:

```tsx
{open && (
  <div
    className="absolute left-0 top-full mt-2 bg-white rounded-2xl overflow-hidden z-50"
    style={{ minWidth: 180, boxShadow: "0 8px 32px -4px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)" }}
  >
    <Link
      href={`/kid/${kid.id}/history`}
      onClick={() => setOpen(false)}
      className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 border-b border-gray-50 hover:bg-gray-50"
    >
      <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm">📋</span>
      My history
    </Link>
    <Link
      href={`/kid/${kid.id}/profile`}
      onClick={() => setOpen(false)}
      className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 border-b border-gray-50 hover:bg-gray-50"
    >
      <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm">✏️</span>
      Edit profile
    </Link>
    <Link
      href="/select-kid"
      onClick={() => setOpen(false)}
      className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 hover:bg-gray-50"
    >
      <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm">🔄</span>
      Switch profile
    </Link>
  </div>
)}
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/kid/KidShell.tsx
git commit -m "feat: add My history to kid avatar menu"
```

---

### Task 5: Parent history page

**Files:**
- Create: `app/parent/history/[kidId]/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/parent/history/[kidId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getKid, listKidHistory } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import type { HistoryEntry } from "@/lib/domain/types";

function groupByDate(entries: HistoryEntry[]): { date: string; entries: HistoryEntry[] }[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const group = map.get(e.date) ?? [];
    group.push(e);
    map.set(e.date, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({ date, entries }));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function netStars(entries: HistoryEntry[]): number {
  return entries.reduce((sum, e) => {
    if (e.kind === "task") return sum + e.pointsAwarded;
    return sum - e.pointsSpent;
  }, 0);
}

export default async function ParentKidHistoryPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const [kid, entries] = await Promise.all([
    getKid(kidId),
    listKidHistory(kidId, 30),
  ]);
  if (!kid) notFound();

  const theme = getTheme(kid.themeId);
  const groups = groupByDate(entries);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: theme.accentSoft }}
        >
          {kid.avatar}
        </div>
        <div>
          <h2 className="text-lg font-black">{kid.name}'s History</h2>
          <p className="text-xs text-gray-400">Last 30 days</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-16">
          No activity in the last 30 days.
        </div>
      ) : (
        groups.map(({ date, entries: dayEntries }) => {
          const net = netStars(dayEntries);
          return (
            <div key={date}>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  {formatDate(date)}
                </span>
                <span
                  className="text-[11px] font-bold"
                  style={{ color: net >= 0 ? "#16a34a" : "#ef4444" }}
                >
                  {net >= 0 ? "+" : ""}{net} ⭐
                </span>
              </div>

              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {dayEntries.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      borderBottom: i < dayEntries.length - 1 ? "1px solid #f3f4f6" : undefined,
                      background: entry.kind === "reward" ? "#fffbeb" : undefined,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{
                        background: entry.kind === "reward" ? "#fef3c7" : theme.accentSoft,
                      }}
                    >
                      {entry.kind === "task" ? entry.taskIcon : entry.rewardIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-gray-900 truncate">
                        {entry.kind === "task" ? entry.taskName : entry.rewardName}
                      </div>
                      {entry.kind === "reward" && (
                        <div className="text-[10px] text-gray-400">Reward claimed</div>
                      )}
                    </div>
                    <div
                      className="text-[13px] font-black flex-shrink-0"
                      style={{ color: entry.kind === "task" ? "#16a34a" : "#ef4444" }}
                    >
                      {entry.kind === "task" ? `+${entry.pointsAwarded}` : `−${entry.pointsSpent}`} ⭐
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/parent/history/[kidId]/page.tsx
git commit -m "feat: add parent kid history page"
```

---

### Task 6: Add "View history →" to parent home kid cards

**Files:**
- Modify: `app/parent/page.tsx`

- [ ] **Step 1: Add the link**

In `app/parent/page.tsx`, find the bottom of each kid card (around line 215–230, inside the `kidData.map(...)` return). After the task breakdown section and before the closing `</div>` of the card, add:

```tsx
{/* History link */}
<div className="mt-3 pt-3" style={{ borderTop: `1px solid ${theme.accentSoft}` }}>
  <Link
    href={`/parent/history/${kid.id}`}
    className="text-[12px] font-bold"
    style={{ color: theme.accent }}
  >
    View history →
  </Link>
</div>
```

Make sure `Link` is imported at the top of the file:
```tsx
import Link from "next/link";
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Final build check**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/parent/page.tsx
git commit -m "feat: add View history link to parent home kid cards"
```

---

## Self-Review

**Spec coverage:**
- ✅ `HistoryEntry` type — Task 1
- ✅ `listKidHistory(kidId, days)` query — Task 2
- ✅ Kid history page `/kid/[kidId]/history` — Task 3
- ✅ "My history" in kid avatar menu — Task 4
- ✅ Parent history page `/parent/history/[kidId]` — Task 5
- ✅ "View history →" on parent home kid cards — Task 6
- ✅ Task rows: green `+N ⭐`, reward rows: amber tint, red `−N ⭐`
- ✅ Only `approved`/`delivered` reward requests shown
- ✅ Days with no activity skipped (groupByDate only groups dates that exist)
- ✅ Kid: 14 days, Parent: 30 days

**Type consistency:**
- `HistoryEntry` defined in Task 1, imported correctly in Tasks 2, 3, 5
- `listKidHistory` signature `(kidId: string, days: number)` consistent across Tasks 2, 3, 5
- `groupByDate`, `formatDate`, `netStars` helpers duplicated in Tasks 3 and 5 — acceptable (different files, small functions, no shared module needed per YAGNI)

**No placeholders found.**
