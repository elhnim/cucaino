# Kid Friends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow kids to add each other as friends across families using username search, with a dedicated Friends nav tab and notification dots for pending requests.

**Architecture:** New `kid_friendships` table stores directional rows (requester → recipient) with a `pending`/`accepted` status. On accept, a reverse row is inserted so both kids see each other with a simple `WHERE kid_id = me` query. Five server actions handle the lifecycle. A new Friends tab (5th in KidShell) shows the full UI. Parents can remove friends from the parent dashboard.

**Tech Stack:** Next.js App Router · Supabase (postgres + RLS) · TypeScript · Tailwind CSS

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0036_kid_friendships.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Adds kid_friendships table for cross-family friend relationships
alter table public.kids enable row level security;

create table public.kid_friendships (
  id         uuid        primary key default gen_random_uuid(),
  kid_id     uuid        not null references public.kids(id) on delete cascade,
  friend_id  uuid        not null references public.kids(id) on delete cascade,
  status     text        not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (kid_id, friend_id)
);

create index if not exists kid_friendships_kid_id_idx    on public.kid_friendships (kid_id);
create index if not exists kid_friendships_friend_id_idx on public.kid_friendships (friend_id);

alter table public.kid_friendships enable row level security;

-- Family can manage friendship rows for their own kids (both sides)
create policy "kid_friendships: family scope" on public.kid_friendships
  for all using (
    kid_id    in (select id from public.kids where family_id = public.current_family_id())
    or friend_id in (select id from public.kids where family_id = public.current_family_id())
  )
  with check (
    kid_id in (select id from public.kids where family_id = public.current_family_id())
  );

-- Allow reading basic kid info for accepted friends across families
create policy "kids: friend read" on public.kids
  for select using (
    id in (
      select friend_id from public.kid_friendships
      where kid_id in (select id from public.kids where family_id = public.current_family_id())
        and status = 'accepted'
    )
    or family_id = public.current_family_id()
  );
```

> **Note:** The `kids: friend read` policy replaces the existing broad `kids: family scope` SELECT with one that also allows reading accepted friends' profiles. The `or family_id = public.current_family_id()` clause preserves existing behaviour for the family's own kids.

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with the SQL above. Verify success (no error returned).

- [ ] **Step 3: Verify the table exists**

Use `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'kid_friendships'
order by ordinal_position;
```
Expected: `id`, `kid_id`, `friend_id`, `status`, `created_at` all present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0036_kid_friendships.sql
git commit -m "feat(db): add kid_friendships table with cross-family RLS"
```

---

### Task 2: TypeScript types + NavIcon

**Files:**
- Modify: `lib/domain/types.ts`
- Modify: `components/ui/NavIcon.tsx`

- [ ] **Step 1: Add `FriendKid` and `FriendRequest` to `lib/domain/types.ts`**

Append after the `Kid` interface (around line 90):

```typescript
export interface FriendKid {
  id: string;
  name: string;
  avatar: string;
  username: string | null;
}

export interface FriendRequest {
  requesterId: string;
  name: string;
  avatar: string;
  username: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Add `"users"` icon to `components/ui/NavIcon.tsx`**

The `IconName` type and `PATHS` record both need a new `"users"` entry.

Change line 1:
```typescript
type IconName = "home" | "calendar" | "gift" | "chart" | "play" | "checklist" | "question" | "cog" | "users";
```

Add to the `PATHS` object after `"cog"`:
```typescript
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
```

- [ ] **Step 3: Run type check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/domain/types.ts components/ui/NavIcon.tsx
git commit -m "feat(types): add FriendKid, FriendRequest types and users NavIcon"
```

---

### Task 3: Data queries

**Files:**
- Modify: `lib/data/queries.ts`

- [ ] **Step 1: Add imports to `lib/data/queries.ts`**

In the import block at the top (around line 16), add `FriendKid` and `FriendRequest` to the type imports:

```typescript
import type {
  // ... existing imports ...
  FriendKid,
  FriendRequest,
} from "@/lib/domain/types";
```

- [ ] **Step 2: Add the three friend queries at the end of `lib/data/queries.ts`**

```typescript
export async function listFriends(kidId: string): Promise<FriendKid[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kid_friendships")
    .select("friend:kids!kid_friendships_friend_id_fkey(id, name, avatar, username)")
    .eq("kid_id", kidId)
    .eq("status", "accepted")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map((row) => row.friend).filter(Boolean).map((k: any) => ({
    id: k.id,
    name: k.name,
    avatar: k.avatar,
    username: k.username ?? null,
  }));
}

export async function listPendingRequests(kidId: string): Promise<FriendRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kid_friendships")
    .select("kid_id, created_at, requester:kids!kid_friendships_kid_id_fkey(id, name, avatar, username)")
    .eq("friend_id", kidId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map((row) => ({
    requesterId: row.kid_id,
    name: (row.requester as any)?.name ?? "",
    avatar: (row.requester as any)?.avatar ?? "🐱",
    username: (row.requester as any)?.username ?? null,
    createdAt: row.created_at,
  }));
}

export async function countPendingRequests(kidId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("kid_friendships")
    .select("id", { count: "exact", head: true })
    .eq("friend_id", kidId)
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}
```

- [ ] **Step 3: Run type check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/data/queries.ts
git commit -m "feat(queries): add listFriends, listPendingRequests, countPendingRequests"
```

---

### Task 4: Server actions

**Files:**
- Create: `lib/actions/friends.ts`

- [ ] **Step 1: Create `lib/actions/friends.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listFriends } from "@/lib/data/queries";
import type { FriendKid } from "@/lib/domain/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function sendFriendRequest(
  fromKidId: string,
  toUsername: string,
): Promise<ActionResult> {
  if (!toUsername.trim()) return { ok: false, error: "Enter a username." };
  const supabase = await createClient();

  // Look up target kid by username (case-insensitive)
  const { data: toKid } = await supabase
    .from("kids")
    .select("id")
    .ilike("username", toUsername.trim())
    .maybeSingle();

  if (!toKid) return { ok: false, error: "User not found." };
  if (toKid.id === fromKidId) return { ok: false, error: "You can't add yourself." };

  // Check for existing relationship in either direction
  const { data: existing } = await supabase
    .from("kid_friendships")
    .select("id, status")
    .or(`and(kid_id.eq.${fromKidId},friend_id.eq.${toKid.id}),and(kid_id.eq.${toKid.id},friend_id.eq.${fromKidId})`)
    .limit(1)
    .maybeSingle();

  if (existing?.status === "accepted") return { ok: false, error: "Already friends." };
  if (existing?.status === "pending") return { ok: false, error: "Request already pending." };

  const { error } = await supabase
    .from("kid_friendships")
    .insert({ kid_id: fromKidId, friend_id: toKid.id, status: "pending" });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${fromKidId}/friends`);
  return { ok: true };
}

export async function acceptFriendRequest(
  kidId: string,
  requesterId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: updateErr } = await supabase
    .from("kid_friendships")
    .update({ status: "accepted" })
    .eq("kid_id", requesterId)
    .eq("friend_id", kidId)
    .eq("status", "pending");

  if (updateErr) return { ok: false, error: updateErr.message };

  const { error: insertErr } = await supabase
    .from("kid_friendships")
    .insert({ kid_id: kidId, friend_id: requesterId, status: "accepted" });

  if (insertErr) return { ok: false, error: insertErr.message };

  revalidatePath(`/kid/${kidId}/friends`);
  revalidatePath(`/kid/${requesterId}/friends`);
  return { ok: true };
}

export async function declineFriendRequest(
  kidId: string,
  requesterId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("kid_friendships")
    .delete()
    .eq("kid_id", requesterId)
    .eq("friend_id", kidId)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/friends`);
  return { ok: true };
}

export async function removeFriend(
  kidId: string,
  friendId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  // Delete both directions
  const { error } = await supabase
    .from("kid_friendships")
    .delete()
    .or(
      `and(kid_id.eq.${kidId},friend_id.eq.${friendId}),and(kid_id.eq.${friendId},friend_id.eq.${kidId})`
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/friends`);
  revalidatePath(`/kid/${friendId}/friends`);
  return { ok: true };
}

// Server action wrapper for client components (parent dashboard)
export async function listFriendsAction(kidId: string): Promise<FriendKid[]> {
  return listFriends(kidId);
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/friends.ts
git commit -m "feat(actions): add friends server actions (send/accept/decline/remove)"
```

---

### Task 5: Friends page route + component

**Files:**
- Create: `app/kid/[kidId]/friends/page.tsx`
- Create: `components/kid/FriendsPage.tsx`

- [ ] **Step 1: Create `app/kid/[kidId]/friends/page.tsx`**

```typescript
import { notFound } from "next/navigation";
import { getKid } from "@/lib/data/stub";
import { listFriends, listPendingRequests } from "@/lib/data/queries";
import { getTheme } from "@/lib/themes/presets";
import FriendsPage from "@/components/kid/FriendsPage";

export default async function FriendsRoute({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const [friends, pendingRequests] = await Promise.all([
    listFriends(kidId),
    listPendingRequests(kidId),
  ]);

  const theme = getTheme(kid.themeId);

  return (
    <div className="p-4 max-w-lg mx-auto pb-8">
      <FriendsPage
        kidId={kidId}
        friends={friends}
        pendingRequests={pendingRequests}
        accent={theme.accent}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `components/kid/FriendsPage.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from "@/lib/actions/friends";
import type { FriendKid, FriendRequest } from "@/lib/domain/types";

export default function FriendsPage({
  kidId,
  friends: initialFriends,
  pendingRequests: initialPending,
  accent,
}: {
  kidId: string;
  friends: FriendKid[];
  pendingRequests: FriendRequest[];
  accent: string;
}) {
  const [friends, setFriends] = useState<FriendKid[]>(initialFriends);
  const [pending, setPending] = useState<FriendRequest[]>(initialPending);
  const [searchValue, setSearchValue] = useState("");
  const [searchMsg, setSearchMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    if (!searchValue.trim()) return;
    setSearchMsg(null);
    startTransition(async () => {
      const result = await sendFriendRequest(kidId, searchValue.trim());
      if (result.ok) {
        setSearchMsg({ ok: true, text: "Request sent! ✓" });
        setSearchValue("");
      } else {
        setSearchMsg({ ok: false, text: result.error });
      }
    });
  };

  const handleAccept = (requesterId: string) => {
    startTransition(async () => {
      const result = await acceptFriendRequest(kidId, requesterId);
      if (result.ok) {
        const req = pending.find((r) => r.requesterId === requesterId);
        if (req) {
          setPending((p) => p.filter((r) => r.requesterId !== requesterId));
          setFriends((f) => [...f, { id: requesterId, name: req.name, avatar: req.avatar, username: req.username }]);
        }
      }
    });
  };

  const handleDecline = (requesterId: string) => {
    startTransition(async () => {
      const result = await declineFriendRequest(kidId, requesterId);
      if (result.ok) {
        setPending((p) => p.filter((r) => r.requesterId !== requesterId));
      }
    });
  };

  const handleRemove = (friendId: string) => {
    startTransition(async () => {
      const result = await removeFriend(kidId, friendId);
      if (result.ok) {
        setFriends((f) => f.filter((fr) => fr.id !== friendId));
      }
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">👫 Friends</h1>

      {/* Pending requests */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-gray-500 uppercase mb-2">Friend Requests</h2>
          <div className="space-y-2">
            {pending.map((req) => (
              <div key={req.requesterId} className="bg-white rounded-2xl shadow p-3 flex items-center gap-3">
                <span className="text-3xl">{req.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{req.name}</div>
                  {req.username && (
                    <div className="text-xs text-gray-400">@{req.username}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleAccept(req.requesterId)}
                  disabled={isPending}
                  className="text-xs font-bold text-white px-3 py-1.5 rounded-xl disabled:opacity-50"
                  style={{ background: accent }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => handleDecline(req.requesterId)}
                  disabled={isPending}
                  className="text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-xl disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add a friend */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 uppercase mb-2">Add a Friend</h2>
        <div className="bg-white rounded-2xl shadow p-4 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => { setSearchValue(e.target.value); setSearchMsg(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              placeholder="Enter @username"
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-current"
              style={{ caretColor: accent }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isPending || !searchValue.trim()}
              className="text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
              style={{ background: accent }}
            >
              Add
            </button>
          </div>
          {searchMsg && (
            <p className={`text-xs font-bold ${searchMsg.ok ? "text-green-600" : "text-red-600"}`}>
              {searchMsg.text}
            </p>
          )}
        </div>
      </section>

      {/* Friends list */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 uppercase mb-2">
          Friends {friends.length > 0 && `(${friends.length})`}
        </h2>
        {friends.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No friends yet — search for a username above
          </p>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div key={friend.id} className="bg-white rounded-2xl shadow p-3 flex items-center gap-3">
                <span className="text-3xl">{friend.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{friend.name}</div>
                  {friend.username && (
                    <div className="text-xs text-gray-400">@{friend.username}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(friend.id)}
                  disabled={isPending}
                  className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-xl disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Run type check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/kid/[kidId]/friends/page.tsx components/kid/FriendsPage.tsx
git commit -m "feat(ui): add friends page route and FriendsPage component"
```

---

### Task 6: KidShell — 5th nav tab + notification dots

**Files:**
- Modify: `components/kid/KidShell.tsx`

- [ ] **Step 1: Update `NavKey` type and `NAV_ITEMS` in `components/kid/KidShell.tsx`**

Find line 14:
```typescript
type NavKey = "home" | "todo" | "rewards" | "play";
```
Replace with:
```typescript
type NavKey = "home" | "todo" | "rewards" | "play" | "friends";
```

Find the `NAV_ITEMS` array (lines 29–34) and add the Friends tab:
```typescript
const NAV_ITEMS: { key: NavKey; label: string; icon: "home" | "calendar" | "gift" | "play" | "users"; href: (kidId: string) => string }[] = [
  { key: "home",    label: "Home",     icon: "home",     href: (id) => `/kid/${id}/home` },
  { key: "todo",    label: "Schedule", icon: "calendar", href: (id) => `/kid/${id}/todo` },
  { key: "rewards", label: "Store",    icon: "gift",     href: (id) => `/kid/${id}/rewards` },
  { key: "play",    label: "Play",     icon: "play",     href: (id) => `/kid/${id}/play` },
  { key: "friends", label: "Friends",  icon: "users",    href: (id) => `/kid/${id}/friends` },
];
```

- [ ] **Step 2: Update the `active` detection to include friends**

Find the `active` calculation (around line 133):
```typescript
  const active: NavKey = activeProp ?? (
    pathname.includes("/todo") ? "todo"
    : pathname.includes("/rewards") ? "rewards"
    : pathname.includes("/play") ? "play"
    : "home"
  );
```
Replace with:
```typescript
  const active: NavKey = activeProp ?? (
    pathname.includes("/todo") ? "todo"
    : pathname.includes("/rewards") ? "rewards"
    : pathname.includes("/play") ? "play"
    : pathname.includes("/friends") ? "friends"
    : "home"
  );
```

- [ ] **Step 3: Add `pendingFriendRequests` prop to `KidShell`**

Find the `KidShell` props interface (around line 111–119):
```typescript
export default function KidShell({
  kid,
  active: activeProp,
  children,
  familyGoal,
  headerExtra,
  todayProgress,
  badges,
  weatherLocation,
}: {
  kid: Kid;
  active?: NavKey;
  children: ReactNode;
  familyGoal?: { name: string; emoji: string; current: number; target: number };
  headerExtra?: ReactNode;
  todayProgress?: { done: number; total: number };
  badges?: BadgeProgress[];
  weatherLocation?: { lat: number; lon: number };
}) {
```
Replace with:
```typescript
export default function KidShell({
  kid,
  active: activeProp,
  children,
  familyGoal,
  headerExtra,
  todayProgress,
  badges,
  weatherLocation,
  pendingFriendRequests = 0,
}: {
  kid: Kid;
  active?: NavKey;
  children: ReactNode;
  familyGoal?: { name: string; emoji: string; current: number; target: number };
  headerExtra?: ReactNode;
  todayProgress?: { done: number; total: number };
  badges?: BadgeProgress[];
  weatherLocation?: { lat: number; lon: number };
  pendingFriendRequests?: number;
}) {
```

- [ ] **Step 4: Add notification dots to the nav tab rendering**

Find the nav button render (around line 325–346) and replace with a version that shows a dot on the Friends tab when `pendingFriendRequests > 0`:

```typescript
          <button
            key={item.key}
            type="button"
            onPointerDown={() => router.prefetch(href)}
            onClick={() => {
              if (isQuizActive && !window.confirm("Leave the quiz? Your progress will be lost.")) {
                return;
              }
              navigateWithTransition(href);
            }}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 bg-transparent border-0 cursor-pointer"
          >
            <span style={{ color: isActive ? theme.accent : "#9ca3af" }} className="relative">
              <NavIcon name={item.icon} size={22} />
              {item.key === "friends" && pendingFriendRequests > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </span>
            <span
              className="text-[10px] font-bold tracking-wide"
              style={{ color: isActive ? theme.accent : "#9ca3af" }}
            >
              {item.label}
            </span>
          </button>
```

- [ ] **Step 5: Add notification dot on the Home tab header**

Find the header section in `KidShell` — it contains the kid avatar menu and `todayProgress`. Locate where the kid's name or avatar appears in the header, and add a subtle friends notification indicator. Find the header `<h1>` or avatar area (around line 250–280 area) and add after the existing greeting text:

```typescript
          {pendingFriendRequests > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black">
              {pendingFriendRequests}
            </span>
          )}
```

Place this inline after the kid's name in the header. Read the header section first to identify the exact location before editing.

- [ ] **Step 6: Run type check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/kid/KidShell.tsx
git commit -m "feat(nav): add Friends tab to KidShell with notification dots"
```

---

### Task 7: Layout — pass pending count to KidShell

**Files:**
- Modify: `app/kid/[kidId]/layout.tsx`

- [ ] **Step 1: Update `app/kid/[kidId]/layout.tsx`**

Add `countPendingRequests` to the imports and add it to the parallel data fetch:

```typescript
import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import { getKid, listTasksForKid, listCompletionsToday, listBadgeProgress, getFamily } from "@/lib/data/stub";
import { countPendingRequests } from "@/lib/data/queries";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { KidOnboardingWrapper } from "@/components/onboarding/KidOnboardingWrapper";

export default async function KidLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const family = await getFamily();
  const tz = family?.timezone ?? "Australia/Sydney";
  const dow = isoWeekday(new Date(), tz);

  const [tasks, completions, badges, pendingFriendRequests] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id, tz),
    listBadgeProgress(kid.id),
    countPendingRequests(kid.id),
  ]);

  const todayTasks = tasksForDay(tasks, dow);
  const completableTasks = todayTasks.filter((t) => t.requiresCompletion);
  const completedIds = new Set(completions.map((c) => c.taskId));
  const done = completableTasks.filter((t) => completedIds.has(t.id)).length;
  const total = completableTasks.length;

  const familyGoal = family
    ? { name: family.name, emoji: "⭐", current: family.familyPointsBalance, target: 2000 }
    : undefined;

  return (
    <KidShell
      kid={kid}
      todayProgress={total > 0 ? { done, total } : undefined}
      badges={badges}
      familyGoal={familyGoal}
      pendingFriendRequests={pendingFriendRequests}
      weatherLocation={
        family?.weatherLat != null && family?.weatherLon != null
          ? { lat: family.weatherLat, lon: family.weatherLon }
          : undefined
      }
    >
      <KidOnboardingWrapper
        tourSeen={kid.tourSeen}
        kidId={kid.id}
        kidName={kid.name}
        kidAvatar={kid.avatar}
        themeId={kid.themeId}
      >
        {children}
      </KidOnboardingWrapper>
    </KidShell>
  );
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/kid/[kidId]/layout.tsx
git commit -m "feat(layout): pass pendingFriendRequests count to KidShell"
```

---

### Task 8: Parent dashboard — friends list with remove

**Files:**
- Modify: `app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx`

- [ ] **Step 1: Update `ParentKidEditClient.tsx`**

Add imports at the top:
```typescript
import { useEffect, useState } from "react";
import { listFriendsAction, removeFriend } from "@/lib/actions/friends";
import type { FriendKid } from "@/lib/domain/types";
```

> Note: `useState` and `useTransition` are already imported — only add what's missing.

Inside the component, after the existing state declarations, add:
```typescript
  const [friends, setFriends] = useState<FriendKid[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);

  useEffect(() => {
    listFriendsAction(kid.id).then((data) => {
      setFriends(data);
      setFriendsLoaded(true);
    });
  }, [kid.id]);

  const handleRemoveFriend = (friendId: string) => {
    startTransition(async () => {
      const result = await removeFriend(kid.id, friendId);
      if (result.ok) {
        setFriends((f) => f.filter((fr) => fr.id !== friendId));
      }
    });
  };
```

At the end of the JSX, before the closing `</div>`, add a Friends section:
```tsx
      {/* Friends */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">Friends</label>
        {!friendsLoaded ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : friends.length === 0 ? (
          <p className="text-xs text-gray-400">No friends yet.</p>
        ) : (
          <div className="space-y-1">
            {friends.map((friend) => (
              <div key={friend.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-xl">{friend.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{friend.name}</div>
                  {friend.username && (
                    <div className="text-xs text-gray-400">@{friend.username}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFriend(friend.id)}
                  disabled={isPending}
                  className="text-xs font-bold text-red-600 border border-red-200 rounded-xl px-2 py-1 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
```

- [ ] **Step 2: Run type check and build**

```bash
npm run typecheck
npm run build
```

Expected: no errors.

- [ ] **Step 3: Manual verification**

Start dev server (`npm run dev`). Navigate to a kid's profile page (`/kid/<kidId>/friends`):

1. Friends tab appears in the bottom nav (5th tab, users icon)
2. Add a friend by username — "Request sent! ✓" appears
3. Log in as the other kid (different browser/incognito) — a red dot appears on the Friends tab
4. Accept the request — both kids now show each other in their Friends list
5. Decline a request — the pending card disappears
6. Remove a friend — the friend card disappears from both sides
7. Parent dashboard (`/parent/kids/<kidId>/edit`) — Friends section shows the list with Remove buttons

- [ ] **Step 4: Commit**

```bash
git add app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx
git commit -m "feat(parent): add friends list with remove to kid edit screen"
```
