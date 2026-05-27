# Kid Friends Design

**Date:** 2026-05-27
**Status:** Approved

## Summary

Allow kids to add each other as friends across families using username search. Friends are managed from a new 5th nav tab. Parents have full visibility and removal control from the parent dashboard.

This is Sub-project 1 of 2. Sub-project 2 (messaging between friends) follows once this is shipped.

## Requirements

- Kids find each other by `@username` (requires the username feature already shipped)
- Friend requests: send, accept, decline
- Friends list visible on a dedicated Friends tab in the kid nav
- Incoming requests show a notification dot on the Friends tab AND the Home tab
- Parents can view and remove a kid's friends from the parent dashboard
- No parent approval required for friend requests — kids manage their own friends
- No real-time updates — manual refresh / navigation re-fetch is sufficient for now
- Out of scope: blocking, mutual friends, friend suggestions

## Data Model

New table `public.kid_friendships` (migration `0036_kid_friendships.sql`):

```sql
create table public.kid_friendships (
  id         uuid        primary key default gen_random_uuid(),
  kid_id     uuid        not null references public.kids(id) on delete cascade,
  friend_id  uuid        not null references public.kids(id) on delete cascade,
  status     text        not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (kid_id, friend_id)
);

create index kid_friendships_kid_id_idx    on public.kid_friendships (kid_id);
create index kid_friendships_friend_id_idx on public.kid_friendships (friend_id);
```

### Friendship lifecycle

| Event | Row change |
|---|---|
| A sends request to B | Insert `(kid_id=A, friend_id=B, status='pending')` |
| B accepts | Update that row to `'accepted'`; insert `(kid_id=B, friend_id=A, status='accepted')` |
| B declines | Delete the pending row |
| Either unfriends | Delete both `(A,B)` and `(B,A)` rows |

### RLS policies

- `SELECT`: a kid can read rows where `kid_id = their own kid id` OR `friend_id = their own kid id` (needed to see incoming requests). Parents can read all rows for kids in their family.
- `INSERT`: a kid can insert rows where `kid_id = their own kid id` only.
- `UPDATE`: a kid can update rows where `friend_id = their own kid id` (to accept).
- `DELETE`: a kid can delete rows where `kid_id = their own kid id` OR `friend_id = their own kid id`. Parents can delete any row for kids in their family.

Cross-family reads on `kids` are needed to display a friend's name/avatar/username. A targeted SELECT policy on `kids` allows reading `id, name, avatar, username` for any kid who is an accepted friend of the caller's kid.

## Server Actions (`lib/actions/friends.ts`)

All actions return `ActionResult = { ok: true } | { ok: false; error: string }`.

### `sendFriendRequest(fromKidId: string, toUsername: string)`
1. Look up kid by `lower(username) = lower(toUsername)`
2. Reject if: not found, `toKidId === fromKidId`, already accepted friends, pending request already exists in either direction
3. Insert `(kid_id=fromKidId, friend_id=toKidId, status='pending')`
4. `revalidatePath` on both kids' friends pages

### `acceptFriendRequest(kidId: string, requesterId: string)`
1. Verify a pending row exists `(kid_id=requesterId, friend_id=kidId, status='pending')`
2. Update that row to `status='accepted'`
3. Insert reverse row `(kid_id=kidId, friend_id=requesterId, status='accepted')`
4. `revalidatePath` on both kids' friends pages

### `declineFriendRequest(kidId: string, requesterId: string)`
1. Delete the row `(kid_id=requesterId, friend_id=kidId, status='pending')`
2. `revalidatePath`

### `removeFriend(kidId: string, friendId: string)`
1. Delete both `(kid_id=kidId, friend_id=friendId)` and `(kid_id=friendId, friend_id=kidId)`
2. `revalidatePath` on both pages

### `listFriendsAction(kidId: string)` *(server action wrapper for client use)*
- Returns accepted friends with name, avatar, username joined from `kids`

## Data Queries (`lib/data/queries.ts`)

### `listFriends(kidId: string): Promise<FriendKid[]>`
```sql
SELECT k.id, k.name, k.avatar, k.username
FROM kid_friendships f
JOIN kids k ON k.id = f.friend_id
WHERE f.kid_id = $kidId AND f.status = 'accepted'
ORDER BY k.name
```

### `listPendingRequests(kidId: string): Promise<FriendRequest[]>`
```sql
SELECT k.id, k.name, k.avatar, k.username, f.created_at
FROM kid_friendships f
JOIN kids k ON k.id = f.kid_id
WHERE f.friend_id = $kidId AND f.status = 'pending'
ORDER BY f.created_at ASC
```

### `countPendingRequests(kidId: string): Promise<number>`
Used by the layout to drive notification dots.

## TypeScript Types (`lib/domain/types.ts`)

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

## Kid-side UI

### Route: `app/kid/[kidId]/friends/page.tsx`
Server component. Fetches `listFriends(kidId)` and `listPendingRequests(kidId)` in parallel, renders `<FriendsPage>`.

### Component: `components/kid/FriendsPage.tsx`
Client component. Three sections rendered top-to-bottom:

**1. Pending requests** (hidden when empty)
- Card per request: avatar + `@username` + name
- Accept button (calls `acceptFriendRequest`) + Decline button (calls `declineFriendRequest`)
- Optimistic removal on accept/decline

**2. Add a friend**
- Username input (same format rules as profile: `^[a-z0-9_]{3,20}$`)
- Submit button: "Add friend"
- Inline status: "Request sent! ✓" / "User not found" / "Already friends" / "Request already pending"

**3. Friends list**
- Grid of friend cards: avatar + `@username`
- Remove button per card (calls `removeFriend`)
- Empty state: "No friends yet — search for a username above"

### Layout: `app/kid/[kidId]/layout.tsx`
Adds `countPendingRequests(kidId)` to the parallel data fetches. Passes `pendingFriendRequests: number` prop to `KidShell`.

### KidShell: `components/kid/KidShell.tsx`
- Adds 5th nav tab: `{ key: "friends", label: "Friends", icon: "users", href: (id) => \`/kid/${id}/friends\` }`
- Shows a notification dot on the Friends tab when `pendingFriendRequests > 0`
- Shows a notification dot on the Home tab header when `pendingFriendRequests > 0` (small badge near the avatar or top bar)
- `NavKey` type extended: `"home" | "todo" | "rewards" | "play" | "friends"`

## Parent Dashboard

### `app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx`
New "Friends" section at the bottom of the edit form:
- Lists accepted friends (name + `@username`)
- Remove button per friend (calls `removeFriend`)
- Fetches via a new exported server action `listFriendsAction(kidId: string): Promise<FriendKid[]>` in `lib/actions/friends.ts` — wraps `listFriends` from queries, called from the client component using `useEffect` on mount

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/0036_kid_friendships.sql` | New table, indexes, RLS policies |
| `lib/domain/types.ts` | Add `FriendKid`, `FriendRequest` types |
| `lib/data/queries.ts` | Add `listFriends`, `listPendingRequests`, `countPendingRequests` |
| `lib/actions/friends.ts` | New file — 5 server actions |
| `app/kid/[kidId]/friends/page.tsx` | New route (server component) |
| `components/kid/FriendsPage.tsx` | New client component |
| `app/kid/[kidId]/layout.tsx` | Add `countPendingRequests`, pass to KidShell |
| `components/kid/KidShell.tsx` | 5th nav tab + notification dots |
| `app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx` | Friends list + remove |

## Out of Scope

- Real-time updates (Supabase Realtime / polling)
- Blocking users
- Mutual friends display
- Friend suggestions
- Parent approval gate on incoming requests
- Messaging (Sub-project 2)
