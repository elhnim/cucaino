# Kid Messaging Design

**Date:** 2026-05-27
**Status:** Approved
**Sub-project:** 2 of the Friends feature (Sub-project 1 = Friend requests, shipped)

---

## Goal

Enable 1:1 real-time text messaging between kids who are already friends (established via the `kid_friendships` table), with unread counts surfaced on the Friends tab and per-conversation read state.

---

## Constraints

- Text only, max 200 characters per message
- Messages are private — parents can see participant pairs and message counts, not content
- Messages expire after 30 days (pg_cron cleanup)
- Real-time delivery using Supabase Realtime (first use of Realtime in this app)

---

## Data Model

### `messages` table

```sql
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.kids(id) on delete cascade,
  recipient_id uuid not null references public.kids(id) on delete cascade,
  body        text not null check (char_length(body) >= 1 and char_length(body) <= 200),
  created_at  timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index on public.messages (recipient_id, created_at desc);
create index on public.messages (sender_id, created_at desc);
```

**RLS policies:**
- SELECT: sender or recipient is any kid in the current family — uses existing `get_current_family_kid_ids()` SECURITY DEFINER function (no recursion risk)
- INSERT: sender_id is in current family AND a confirmed friendship exists between sender and recipient (status = 'accepted')
- No UPDATE or DELETE (messages immutable; cleanup via pg_cron)

**30-day cleanup via pg_cron:**
```sql
select cron.schedule('delete-old-messages', '0 3 * * *',
  'delete from public.messages where created_at < now() - interval ''30 days''');
```

### `conversation_read_state` table

```sql
create table public.conversation_read_state (
  kid_id       uuid not null references public.kids(id) on delete cascade,
  other_kid_id uuid not null references public.kids(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (kid_id, other_kid_id)
);
```

**RLS policies:**
- SELECT + INSERT + UPDATE: kid_id is in current family (using `get_current_family_kid_ids()`)

**Semantics:** Upserted when a kid opens a conversation. `last_read_at` is set to `now()`. Unread count = messages WHERE `recipient_id = me AND sender_id = friend AND created_at > last_read_at`.

---

## TypeScript Types

```typescript
// lib/domain/types.ts additions

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
}

export interface ConversationSummary {
  friendId: string;
  friendName: string;
  friendAvatar: string;
  friendUsername: string | null;
  unreadCount: number;        // messages from friend not yet read
  lastMessageAt: string | null;
}

export interface MessageSummaryForParent {
  friendName: string;
  friendAvatar: string;
  messageCount: number;       // both directions, last 30 days
}
```

---

## Query Functions (`lib/data/queries.ts`)

| Function | Description |
|---|---|
| `listMessages(kidId, friendId, limit?)` | Last 50 messages between two kids, ordered oldest→newest |
| `listConversationSummaries(kidId)` | All friends with unread count + last message timestamp |
| `countTotalUnread(kidId)` | Total unread across all conversations (for Friends tab badge) |
| `markConversationRead(kidId, friendId)` | Upserts `conversation_read_state` with `last_read_at = now()` |
| `listMessageSummariesForParent(kidId)` | Per-friendship message count last 30 days (parent view) |

All wrapped with `timed()`. All exported from `lib/data/stub.ts`.

---

## Server Actions (`lib/actions/messages.ts`)

```typescript
"use server"

sendMessage(senderId: string, recipientId: string, body: string): Promise<ActionResult>
markRead(kidId: string, friendId: string): Promise<ActionResult>
```

`sendMessage` validates:
1. `body` is non-empty and ≤ 200 chars
2. A confirmed friendship exists (server-side check — RLS INSERT policy also enforces this)

`markRead` upserts `conversation_read_state`. Called optimistically when chat opens.

---

## Routing & UI

### New route: `/kid/[kidId]/friends/[friendId]`

**`app/kid/[kidId]/friends/[friendId]/page.tsx`** — server component:
- Fetches kid, friend (verified friendship), initial 50 messages, marks conversation read
- Passes to `<ChatView>` client component

**`components/kid/ChatView.tsx`** — client component:
- Displays message bubbles (own messages right-aligned, friend's left-aligned with avatar)
- Text input pinned to bottom, send button
- Back button → `/kid/${kidId}/friends`
- On mount: subscribes to Supabase Realtime channel `messages:recipient_id=eq.${kidId}` filtered to this friendship; appends new messages to local state
- On unmount: unsubscribes
- On mount also calls `markRead` server action

### Friends page (`/kid/[kidId]/friends`)

`FriendsPage` updated:
- Each friend card shows unread message count badge (if > 0)
- Tapping a friend card navigates to `/kid/${kidId}/friends/${friendId}`
- Remove friend / accept/decline request behaviour unchanged

### KidShell Friends tab badge

`countTotalUnread(kidId)` fetched in `app/kid/[kidId]/layout.tsx` (alongside `countPendingRequests`). Both counts passed to `KidShell` — combined into the Friends tab badge total (friend requests + unread messages).

---

## Parent Dashboard

In `ParentKidEditClient` below the existing Friends section: **Messages** subsection.

Uses `listMessageSummariesForParent(kidId)` — displays friend name, avatar, and message count (both directions, last 30 days). No message content.

Example: `"Mia — 12 messages this month"`

---

## Realtime Design

**Channel name:** `messages:recipient_id=eq.${kidId}`

Supabase Realtime postgres_changes filter on the `messages` table, filtering `recipient_id = kidId`. The client subscribes once when `ChatView` mounts. Incoming events where `sender_id !== friendId` are ignored (routed to the correct chat if ever needed later).

Only INSERT events are listened to (no UPDATE/DELETE since messages are immutable).

---

## File Structure

| File | Action |
|---|---|
| `supabase/migrations/0039_kid_messages.sql` | Create `messages` + `conversation_read_state` tables, RLS, pg_cron |
| `lib/domain/types.ts` | Add `Message`, `ConversationSummary`, `MessageSummaryForParent` |
| `lib/data/queries.ts` | Add 5 query functions |
| `lib/data/stub.ts` | Re-export new functions |
| `lib/actions/messages.ts` | New file: `sendMessage`, `markRead` |
| `app/kid/[kidId]/friends/[friendId]/page.tsx` | New server component |
| `components/kid/ChatView.tsx` | New client component |
| `components/kid/FriendsPage.tsx` | Add unread badges + navigate to chat on friend tap |
| `app/kid/[kidId]/layout.tsx` | Fetch `countTotalUnread`, pass to KidShell |
| `components/kid/KidShell.tsx` | Combined unread+requests badge on Friends tab |
| `app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx` | Add Messages subsection |

---

## Out of Scope

- Group messaging
- Message reactions, emoji-only messages, images, voice
- Push notifications (OS-level)
- Message deletion by kids
- Typing indicators
- Message pagination beyond initial 50 (load-more is a future enhancement)
