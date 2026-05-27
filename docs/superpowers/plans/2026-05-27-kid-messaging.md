# Kid Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time 1:1 text messaging between established friends, with unread counts on the Friends tab and a parent-visible message-count summary.

**Architecture:** Supabase `messages` + `conversation_read_state` tables with RLS using the existing `get_current_family_kid_ids()` SECURITY DEFINER function. Each chat view subscribes to a Supabase Realtime `postgres_changes` channel filtered to the recipient. Sent messages are applied optimistically. Unread counts are computed server-side via a `count_unread_messages` SQL function.

**Tech Stack:** Next.js 14 App Router · Supabase Postgres + RLS + Realtime · TypeScript · Tailwind CSS

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/0039_kid_messages.sql` | Create |
| `lib/domain/types.ts` | Modify — add `Message`, `ConversationSummary`, `MessageSummaryForParent` |
| `lib/data/queries.ts` | Modify — add 4 query functions + import new types |
| `lib/actions/messages.ts` | Create — `sendMessage`, `markRead` server actions |
| `app/kid/[kidId]/friends/[friendId]/page.tsx` | Create — chat route (server component) |
| `components/kid/ChatView.tsx` | Create — client component with Realtime subscription |
| `app/kid/[kidId]/friends/page.tsx` | Modify — use `listConversationSummaries`, add unread badges |
| `components/kid/FriendsPage.tsx` | Modify — accept `ConversationSummary[]`, navigate to chat on tap |
| `app/kid/[kidId]/layout.tsx` | Modify — fetch `countTotalUnread`, pass as `unreadMessages` |
| `components/kid/KidShell.tsx` | Modify — add `unreadMessages` prop, combine into Friends tab badge |
| `app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx` | Modify — Messages subsection |

---

### Task 1: Database migration — messages tables and RLS

**Files:**
- Create: `supabase/migrations/0039_kid_messages.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Kid messaging: messages + conversation_read_state

-- Main messages table
create table public.messages (
  id           uuid        primary key default gen_random_uuid(),
  sender_id    uuid        not null references public.kids(id) on delete cascade,
  recipient_id uuid        not null references public.kids(id) on delete cascade,
  body         text        not null check (char_length(body) >= 1 and char_length(body) <= 200),
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index on public.messages (recipient_id, created_at desc);
create index on public.messages (sender_id,    created_at desc);

alter table public.messages enable row level security;

-- Family members can read messages where their kid is sender or recipient
create policy "messages: family read" on public.messages
  for select using (
    sender_id    = any(array(select public.get_current_family_kid_ids()))
    or recipient_id = any(array(select public.get_current_family_kid_ids()))
  );

-- Only insert if sender is in your family AND a confirmed friendship exists
create policy "messages: family insert" on public.messages
  for insert with check (
    sender_id = any(array(select public.get_current_family_kid_ids()))
    and exists (
      select 1 from public.kid_friendships
      where kid_id = sender_id
        and friend_id = recipient_id
        and status = 'accepted'
    )
  );

-- Tracks when each kid last read each conversation
create table public.conversation_read_state (
  kid_id       uuid        not null references public.kids(id) on delete cascade,
  other_kid_id uuid        not null references public.kids(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (kid_id, other_kid_id)
);

alter table public.conversation_read_state enable row level security;

create policy "conversation_read_state: family" on public.conversation_read_state
  for all
  using (kid_id = any(array(select public.get_current_family_kid_ids())))
  with check (kid_id = any(array(select public.get_current_family_kid_ids())));

-- Efficient unread count across all conversations for a kid
create or replace function public.count_unread_messages(p_kid_id uuid)
returns bigint
language sql
security invoker
stable
as $$
  select count(*)::bigint
  from public.messages m
  left join public.conversation_read_state crs
    on (crs.kid_id = p_kid_id and crs.other_kid_id = m.sender_id)
  where m.recipient_id = p_kid_id
    and (crs.last_read_at is null or m.created_at > crs.last_read_at)
$$;

-- 30-day cleanup via pg_cron (requires pg_cron extension; safe no-op if unavailable)
do $$
begin
  perform cron.schedule(
    'delete-old-messages',
    '0 3 * * *',
    'delete from public.messages where created_at < now() - interval ''30 days'''
  );
exception when others then
  null; -- pg_cron not enabled; run cleanup manually if needed
end $$;
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `0039_kid_messages` and the SQL above.

Expected: no errors. Verify with `mcp__supabase__list_tables` — you should see `messages` and `conversation_read_state`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0039_kid_messages.sql
git commit -m "feat(messaging): add messages + conversation_read_state tables with RLS"
```

---

### Task 2: TypeScript types

**Files:**
- Modify: `lib/domain/types.ts` (after the `FriendRequest` interface, around line 107)

- [ ] **Step 1: Add three new interfaces to `lib/domain/types.ts`**

Insert after the `FriendRequest` interface (after line 107):

```typescript
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
  unreadCount: number;
  lastMessageAt: string | null;
}

export interface MessageSummaryForParent {
  friendName: string;
  friendAvatar: string;
  messageCount: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/domain/types.ts
git commit -m "feat(messaging): add Message, ConversationSummary, MessageSummaryForParent types"
```

---

### Task 3: Query functions

**Files:**
- Modify: `lib/data/queries.ts`

- [ ] **Step 1: Add new type imports to `lib/data/queries.ts`**

In the import block at the top of `lib/data/queries.ts` (the `import type { ... } from "@/lib/domain/types"` block), add:
`Message`, `ConversationSummary`, `MessageSummaryForParent`

The import block should now include these among the existing imports:
```typescript
import type {
  // ... existing imports ...
  FriendKid,
  FriendRequest,
  Message,
  ConversationSummary,
  MessageSummaryForParent,
} from "@/lib/domain/types";
```

- [ ] **Step 2: Add `listMessages` at the bottom of `lib/data/queries.ts`**

```typescript
export const listMessages = timed("listMessages", async (kidId: string, friendId: string, limit = 50): Promise<Message[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, recipient_id, body, created_at")
    .or(`and(sender_id.eq.${kidId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${kidId})`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as any[]).reverse().map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    createdAt: row.created_at,
  }));
});
```

Note: `kidId` and `friendId` are route-validated UUIDs (verified via `getKid`/`listFriends` + `notFound`), so interpolation in the filter is safe.

- [ ] **Step 3: Add `listConversationSummaries` at the bottom of `lib/data/queries.ts`**

```typescript
export const listConversationSummaries = timed("listConversationSummaries", async (kidId: string): Promise<ConversationSummary[]> => {
  const supabase = await createClient();

  const { data: friendships, error } = await supabase
    .from("kid_friendships")
    .select("friend:kids!kid_friendships_friend_id_fkey(id, name, avatar, username)")
    .eq("kid_id", kidId)
    .eq("status", "accepted");

  if (error || !friendships || friendships.length === 0) return [];

  const { data: readStates } = await supabase
    .from("conversation_read_state")
    .select("other_kid_id, last_read_at")
    .eq("kid_id", kidId);

  const readMap = new Map(
    (readStates ?? []).map((r: any) => [r.other_kid_id as string, r.last_read_at as string])
  );

  const summaries = await Promise.all(
    (friendships as any[])
      .map((f) => f.friend)
      .filter(Boolean)
      .map(async (friend) => {
        const lastReadAt = readMap.get(friend.id);
        const baseQuery = supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("sender_id", friend.id)
          .eq("recipient_id", kidId);
        const { count } = await (lastReadAt ? baseQuery.gt("created_at", lastReadAt) : baseQuery);
        return {
          friendId: friend.id,
          friendName: friend.name,
          friendAvatar: friend.avatar,
          friendUsername: friend.username ?? null,
          unreadCount: count ?? 0,
          lastMessageAt: null,
        } satisfies ConversationSummary;
      })
  );

  return summaries.sort((a, b) => a.friendName.localeCompare(b.friendName));
});
```

- [ ] **Step 4: Add `countTotalUnread` at the bottom of `lib/data/queries.ts`**

```typescript
export const countTotalUnread = timed("countTotalUnread", async (kidId: string): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_unread_messages", { p_kid_id: kidId });
  if (error) return 0;
  return (data as number) ?? 0;
});
```

- [ ] **Step 5: Add `listMessageSummariesForParent` at the bottom of `lib/data/queries.ts`**

```typescript
export const listMessageSummariesForParent = timed("listMessageSummariesForParent", async (kidId: string): Promise<MessageSummaryForParent[]> => {
  const supabase = await createClient();

  const { data: friends, error } = await supabase
    .from("kid_friendships")
    .select("friend:kids!kid_friendships_friend_id_fkey(id, name, avatar)")
    .eq("kid_id", kidId)
    .eq("status", "accepted");

  if (error || !friends || friends.length === 0) return [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  return Promise.all(
    (friends as any[])
      .map((f) => f.friend)
      .filter(Boolean)
      .map(async (friend) => {
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .or(`and(sender_id.eq.${kidId},recipient_id.eq.${friend.id}),and(sender_id.eq.${friend.id},recipient_id.eq.${kidId})`)
          .gte("created_at", thirtyDaysAgo);
        return {
          friendName: friend.name,
          friendAvatar: friend.avatar,
          messageCount: count ?? 0,
        } satisfies MessageSummaryForParent;
      })
  );
});
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add lib/data/queries.ts
git commit -m "feat(messaging): add listMessages, listConversationSummaries, countTotalUnread, listMessageSummariesForParent"
```

---

### Task 4: Server actions

**Files:**
- Create: `lib/actions/messages.ts`

- [ ] **Step 1: Create `lib/actions/messages.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function sendMessage(
  senderId: string,
  recipientId: string,
  body: string,
): Promise<ActionResult> {
  const sanitized = body.trim().replace(/[<>]/g, "").slice(0, 200);
  if (!sanitized) return { ok: false, error: "Message cannot be empty." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ sender_id: senderId, recipient_id: recipientId, body: sanitized });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markRead(
  kidId: string,
  friendId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversation_read_state")
    .upsert(
      { kid_id: kidId, other_kid_id: friendId, last_read_at: new Date().toISOString() },
      { onConflict: "kid_id,other_kid_id" }
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/friends`);
  return { ok: true };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/actions/messages.ts
git commit -m "feat(messaging): add sendMessage and markRead server actions"
```

---

### Task 5: Chat route (server component)

**Files:**
- Create: `app/kid/[kidId]/friends/[friendId]/page.tsx`

- [ ] **Step 1: Create the directory and file**

Create `app/kid/[kidId]/friends/[friendId]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { getKid, listFriends, listMessages } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import { markRead } from "@/lib/actions/messages";
import ChatView from "@/components/kid/ChatView";

export default async function ChatRoute({
  params,
}: {
  params: Promise<{ kidId: string; friendId: string }>;
}) {
  const { kidId, friendId } = await params;

  const [kid, friends] = await Promise.all([
    getKid(kidId),
    listFriends(kidId),
  ]);
  if (!kid) notFound();

  const friend = friends.find((f) => f.id === friendId);
  if (!friend) notFound();

  const messages = await listMessages(kidId, friendId);

  await markRead(kidId, friendId);

  const theme = getTheme(kid.themeId);

  return (
    <div className="h-full flex flex-col">
      <ChatView
        kidId={kidId}
        friendId={friendId}
        friendName={friend.name}
        friendAvatar={friend.avatar}
        initialMessages={messages}
        accent={theme.accent}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: error about `ChatView` not existing yet — that is expected at this step, will be fixed in Task 6.

- [ ] **Step 3: Commit** (do NOT commit until Task 6 is done — they are compiled together)

Skip this commit — commit after Task 6.

---

### Task 6: ChatView client component

**Files:**
- Create: `components/kid/ChatView.tsx`

- [ ] **Step 1: Create `components/kid/ChatView.tsx`**

```typescript
"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markRead } from "@/lib/actions/messages";
import type { Message } from "@/lib/domain/types";

export default function ChatView({
  kidId,
  friendId,
  friendName,
  friendAvatar,
  initialMessages,
  accent,
}: {
  kidId: string;
  friendId: string;
  friendName: string;
  friendAvatar: string;
  initialMessages: Message[];
  accent: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Mark conversation as read on mount
  useEffect(() => {
    markRead(kidId, friendId);
  }, [kidId, friendId]);

  // Realtime subscription for incoming messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${kidId}:${friendId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${kidId}`,
        },
        (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id !== friendId) return;
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              senderId: msg.sender_id,
              recipientId: msg.recipient_id,
              body: msg.body,
              createdAt: msg.created_at,
            },
          ]);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [kidId, friendId]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: Message = {
      id: optimisticId,
      senderId: kidId,
      recipientId: friendId,
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    startTransition(async () => {
      const result = await sendMessage(kidId, friendId, trimmed);
      setSending(false);
      if (!result.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-gray-500 font-bold text-sm px-2 py-1"
        >
          ←
        </button>
        <span className="text-2xl">{friendAvatar}</span>
        <span className="font-black text-gray-900 text-base">{friendName}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 mt-8">
            Say hi to {friendName}! 👋
          </p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.senderId === kidId;
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"} items-end gap-2`}
            >
              {!isOwn && (
                <span className="text-xl flex-shrink-0">{friendAvatar}</span>
              )}
              <div
                className={`max-w-[72%] px-3 py-2 rounded-2xl text-sm font-semibold leading-snug ${
                  isOwn
                    ? "text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-900 rounded-bl-sm"
                }`}
                style={isOwn ? { background: accent } : undefined}
              >
                {msg.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 200))}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Say something..."
          maxLength={200}
          autoComplete="off"
          autoCorrect="off"
          className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-current"
          style={{ caretColor: accent }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="text-white font-black px-4 py-2 rounded-xl text-sm disabled:opacity-50"
          style={{ background: accent }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Commit tasks 5 and 6 together**

```bash
git add app/kid/[kidId]/friends/[friendId]/page.tsx components/kid/ChatView.tsx
git commit -m "feat(messaging): add chat route and ChatView with Realtime subscription"
```

---

### Task 7: FriendsPage updates — unread badges and chat navigation

**Files:**
- Modify: `app/kid/[kidId]/friends/page.tsx`
- Modify: `components/kid/FriendsPage.tsx`

- [ ] **Step 1: Update `app/kid/[kidId]/friends/page.tsx`**

Replace the entire file with:

```typescript
import { notFound } from "next/navigation";
import { getKid } from "@/lib/data/stub";
import { listConversationSummaries, listPendingFriendRequests } from "@/lib/data/stub";
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

  const [conversations, pendingRequests] = await Promise.all([
    listConversationSummaries(kidId),
    listPendingFriendRequests(kidId),
  ]);

  const theme = getTheme(kid.themeId);

  return (
    <div className="p-4 max-w-lg mx-auto pb-8">
      <FriendsPage
        kidId={kidId}
        conversations={conversations}
        pendingRequests={pendingRequests}
        accent={theme.accent}
      />
    </div>
  );
}
```

- [ ] **Step 2: Replace `components/kid/FriendsPage.tsx` entirely**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from "@/lib/actions/friends";
import type { ConversationSummary, FriendRequest } from "@/lib/domain/types";

export default function FriendsPage({
  kidId,
  conversations: initialConversations,
  pendingRequests: initialPending,
  accent,
}: {
  kidId: string;
  conversations: ConversationSummary[];
  pendingRequests: FriendRequest[];
  accent: string;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [pending, setPending] = useState<FriendRequest[]>(initialPending);
  const [searchValue, setSearchValue] = useState("");
  const [searchMsg, setSearchMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inflightIds, setInflightIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const setInflight = (id: string, active: boolean) => {
    setInflightIds((prev) => {
      const next = new Set(prev);
      active ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleSend = () => {
    if (!searchValue.trim()) return;
    setSearchMsg(null);
    setInflight("send", true);
    startTransition(async () => {
      const result = await sendFriendRequest(kidId, searchValue.trim());
      setInflight("send", false);
      if (result.ok) {
        setSearchMsg({ ok: true, text: "Request sent! ✓" });
        setSearchValue("");
      } else {
        setSearchMsg({ ok: false, text: result.error });
      }
    });
  };

  const handleAccept = (requesterId: string) => {
    setInflight(requesterId, true);
    startTransition(async () => {
      const result = await acceptFriendRequest(kidId, requesterId);
      setInflight(requesterId, false);
      if (result.ok) {
        const req = pending.find((r) => r.requesterId === requesterId);
        if (req) {
          setPending((p) => p.filter((r) => r.requesterId !== requesterId));
          setConversations((c) => [
            ...c,
            {
              friendId: requesterId,
              friendName: req.name,
              friendAvatar: req.avatar,
              friendUsername: req.username,
              unreadCount: 0,
              lastMessageAt: null,
            },
          ]);
        }
      }
    });
  };

  const handleDecline = (requesterId: string) => {
    setInflight(requesterId, true);
    startTransition(async () => {
      const result = await declineFriendRequest(kidId, requesterId);
      setInflight(requesterId, false);
      if (result.ok) {
        setPending((p) => p.filter((r) => r.requesterId !== requesterId));
      }
    });
  };

  const handleRemove = (friendId: string) => {
    setInflight(friendId, true);
    startTransition(async () => {
      const result = await removeFriend(kidId, friendId);
      setInflight(friendId, false);
      if (result.ok) {
        setConversations((c) => c.filter((conv) => conv.friendId !== friendId));
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
                  disabled={inflightIds.has(req.requesterId)}
                  className="text-xs font-bold text-white px-3 py-1.5 rounded-xl disabled:opacity-50"
                  style={{ background: accent }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => handleDecline(req.requesterId)}
                  disabled={inflightIds.has(req.requesterId)}
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
              disabled={inflightIds.has("send") || !searchValue.trim()}
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
          Friends {conversations.length > 0 && `(${conversations.length})`}
        </h2>
        {conversations.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No friends yet — search for a username above
          </p>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <div
                key={conv.friendId}
                className="bg-white rounded-2xl shadow p-3 flex items-center gap-3 cursor-pointer active:opacity-80"
                onClick={() => router.push(`/kid/${kidId}/friends/${conv.friendId}`)}
              >
                <span className="text-3xl">{conv.friendAvatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{conv.friendName}</div>
                  {conv.friendUsername && (
                    <div className="text-xs text-gray-400">@{conv.friendUsername}</div>
                  )}
                </div>
                {conv.unreadCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full text-white text-[10px] font-black px-1"
                    style={{ background: accent }}
                  >
                    {conv.unreadCount}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemove(conv.friendId); }}
                  disabled={inflightIds.has(conv.friendId)}
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

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/kid/[kidId]/friends/page.tsx components/kid/FriendsPage.tsx
git commit -m "feat(messaging): update FriendsPage to show unread badges and navigate to chat"
```

---

### Task 8: Layout and KidShell — unread messages badge

**Files:**
- Modify: `app/kid/[kidId]/layout.tsx`
- Modify: `components/kid/KidShell.tsx`

- [ ] **Step 1: Update `app/kid/[kidId]/layout.tsx`**

Add `countTotalUnread` import alongside `countPendingRequests`:

```typescript
import { getKid, listTasksForKid, listCompletionsToday, listBadgeProgress, getFamily } from "@/lib/data/stub";
import { countPendingRequests, countTotalUnread } from "@/lib/data/stub";
```

Update the `Promise.all` call to fetch `countTotalUnread` as well:

```typescript
const [tasks, completions, badges, pendingFriendRequests, unreadMessages] = await Promise.all([
  listTasksForKid(kid.id),
  listCompletionsToday(kid.id, tz),
  listBadgeProgress(kid.id),
  countPendingRequests(kid.id),
  countTotalUnread(kid.id),
]);
```

Add `unreadMessages` to the `KidShell` call:

```typescript
return (
  <KidShell
    kid={kid}
    todayProgress={total > 0 ? { done, total } : undefined}
    badges={badges}
    familyGoal={familyGoal}
    pendingFriendRequests={pendingFriendRequests}
    unreadMessages={unreadMessages}
    weatherLocation={
      family?.weatherLat != null && family?.weatherLon != null
        ? { lat: family.weatherLat, lon: family.weatherLon }
        : undefined
    }
  >
```

- [ ] **Step 2: Update `components/kid/KidShell.tsx`**

Add `unreadMessages` to the props type (around line 122):

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
  unreadMessages = 0,
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
  unreadMessages?: number;
}) {
```

In the bottom nav, find the Friends tab dot (currently showing only `pendingFriendRequests`). Replace:
```typescript
{item.key === "friends" && pendingFriendRequests > 0 && (
  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
)}
```

With:
```typescript
{item.key === "friends" && (pendingFriendRequests + unreadMessages) > 0 && (
  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
)}
```

Note: the header name badge (showing `pendingFriendRequests` count) stays unchanged — it represents friend requests only.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/kid/[kidId]/layout.tsx components/kid/KidShell.tsx
git commit -m "feat(messaging): show combined unread messages + friend requests dot on Friends tab"
```

---

### Task 9: Parent dashboard — Messages subsection

**Files:**
- Modify: `app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx`

- [ ] **Step 1: Add import and state for message summaries**

At the top of `ParentKidEditClient.tsx`, add the import:

```typescript
import { listFriendsAction, removeFriend } from "@/lib/actions/friends";
import { listMessageSummariesForParentAction } from "@/lib/actions/messages";
import type { Kid, FriendKid, MessageSummaryForParent } from "@/lib/domain/types";
```

Add state for message summaries:

```typescript
const [messageSummaries, setMessageSummaries] = useState<MessageSummaryForParent[]>([]);
```

In the `useEffect`, load message summaries alongside friends:

```typescript
useEffect(() => {
  Promise.all([
    listFriendsAction(kid.id),
    listMessageSummariesForParentAction(kid.id),
  ])
    .then(([friendData, summaryData]) => {
      setFriends(friendData);
      setMessageSummaries(summaryData);
      setFriendsLoaded(true);
    })
    .catch(() => setFriendsLoaded(true));
}, [kid.id]);
```

- [ ] **Step 2: Add `listMessageSummariesForParentAction` to `lib/actions/messages.ts`**

Add these two imports to the TOP of `lib/actions/messages.ts` (after the existing imports):

```typescript
import { listMessageSummariesForParent } from "@/lib/data/queries";
import type { MessageSummaryForParent } from "@/lib/domain/types";
```

Then append the new function at the BOTTOM of the file:

```typescript
export async function listMessageSummariesForParentAction(kidId: string): Promise<MessageSummaryForParent[]> {
  return listMessageSummariesForParent(kidId);
}
```

- [ ] **Step 3: Add Messages subsection to `ParentKidEditClient.tsx` JSX**

After the existing Friends `</div>` block (after line 153), add:

```typescript
{/* Messages */}
{messageSummaries.length > 0 && (
  <div>
    <label className="block text-sm font-bold text-gray-700 mb-1">
      Messages (last 30 days)
    </label>
    <div className="space-y-1">
      {messageSummaries.map((s) => (
        <div
          key={s.friendName}
          className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2"
        >
          <span className="text-xl">{s.friendAvatar}</span>
          <span className="text-sm font-bold flex-1">{s.friendName}</span>
          <span className="text-xs text-gray-500">
            {s.messageCount} {s.messageCount === 1 ? "message" : "messages"}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add lib/actions/messages.ts app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx
git commit -m "feat(messaging): add message count summary to parent dashboard"
```

---

## Post-implementation verification

- [ ] Start dev server: `npm run dev`
- [ ] Navigate to a kid's Friends tab — verify it loads without errors
- [ ] Tap a friend card — verify it opens the chat route
- [ ] Send a message — verify it appears immediately (optimistic)
- [ ] Open a second browser tab as the recipient kid — verify the message arrives in real-time
- [ ] Navigate back to Friends list — verify the unread count badge clears
- [ ] Check parent dashboard for a kid — verify Messages section shows correct counts
- [ ] Run `npm run build` — confirm production build succeeds
