# Invite Parent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the family owner invite a second parent/guardian by email; the invitee receives a magic-link, signs in, and is added to the family with full parent access.

**Architecture:** One new `family_invites` table plus a `co_parent_user_ids` column on `families`. The `current_family_id()` DB function is updated to cover co-parents, which automatically extends all existing RLS policies. A service-role admin client calls `supabase.auth.admin.inviteUserByEmail` so no separate email service is needed. The accept flow is a single server-component page at `/accept-invite` that runs the join logic on load.

**Tech Stack:** Next.js App Router · TypeScript · Tailwind CSS · Supabase (server client + admin client, RLS) · `@supabase/supabase-js`

> **No test runner is configured.** Run `npm run typecheck` after each task. Run `npm run build` after Task 5.

---

### Existing code to reuse

| File | What to reuse |
|---|---|
| `lib/supabase/server.ts` | `createClient()` pattern — mirror for admin client |
| `lib/actions/strikes.ts` | Server action pattern (`ActionResult`, `revalidatePath`) |
| `lib/data/queries.ts` | `timed()` wrapper, `createClient`, existing query patterns |
| `app/parent/settings/page.tsx` | Replace "Coming soon" stub at lines 90–98 |

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/0026_invite_parent.sql`

- [ ] **Step 1: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with migration name `invite_parent` and the following SQL:

```sql
-- 1. Add co_parent_user_ids to families
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS co_parent_user_ids uuid[] NOT NULL DEFAULT '{}';

-- 2. family_invites table
CREATE TABLE IF NOT EXISTS public.family_invites (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid        NOT NULL REFERENCES public.families (id) ON DELETE CASCADE,
  invited_email  text        NOT NULL,
  status         text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS family_invites_family_status_idx ON public.family_invites (family_id, status);
CREATE INDEX IF NOT EXISTS family_invites_email_status_idx ON public.family_invites (invited_email, status);

ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.family_invites
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- 3. Update current_family_id() to include co-parents
CREATE OR REPLACE FUNCTION public.current_family_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id FROM public.families
  WHERE owner_user_id = auth.uid()
     OR auth.uid() = ANY(co_parent_user_ids)
  LIMIT 1;
$$;

-- 4. Allow co-parents to SELECT the family row (needed for getFamily() calls)
CREATE POLICY "families: co-parent read" ON public.families
  FOR SELECT USING (auth.uid() = ANY(co_parent_user_ids));

-- 5. Fix strikes inline policy → use current_family_id()
DROP POLICY IF EXISTS "family_scope" ON public.strikes;
CREATE POLICY "family_scope" ON public.strikes
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- 6. Fix mood_entries inline policy → use current_family_id()
DROP POLICY IF EXISTS "family_scope" ON public.mood_entries;
CREATE POLICY "family_scope" ON public.mood_entries
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());
```

- [ ] **Step 2: Save migration file locally**

Write the same SQL to `supabase/migrations/0026_invite_parent.sql`.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0026_invite_parent.sql
git commit -m "feat: add family_invites table, co_parent_user_ids, and update RLS"
```

---

### Task 2: Types + Admin Client + Queries + Actions

**Files:**
- Modify: `lib/domain/types.ts`
- Create: `lib/supabase/admin.ts`
- Modify: `lib/data/queries.ts`
- Create: `lib/actions/invite.ts`

- [ ] **Step 1: Add env vars to `.env.local`**

Open `.env.local` and add:

```
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
NEXT_PUBLIC_SITE_URL=https://your-app.netlify.app
```

Get the service role key from the Supabase dashboard → Project Settings → API → `service_role` secret. For local dev use `http://localhost:3000` as `NEXT_PUBLIC_SITE_URL`.

- [ ] **Step 2: Add `FamilyInvite` interface to `lib/domain/types.ts`**

After the `MoodEntry` interface (around line 325), insert:

```ts
// ----------------------------------------------------------------------------
// Family invites
// ----------------------------------------------------------------------------

export interface FamilyInvite {
  id: string;
  familyId: string;
  invitedEmail: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  expiresAt: string;
}
```

- [ ] **Step 3: Create `lib/supabase/admin.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

- [ ] **Step 4: Add `listFamilyInvites` to `lib/data/queries.ts`**

Add `FamilyInvite` to the existing `import type { ... }` block at the top of the file:

```ts
  FamilyInvite,
```

Then at the end of the file, add:

```ts
function mapFamilyInvite(row: any): FamilyInvite {
  return {
    id: row.id,
    familyId: row.family_id,
    invitedEmail: row.invited_email,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export const listFamilyInvites = timed(
  "listFamilyInvites",
  async (): Promise<FamilyInvite[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("family_invites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map(mapFamilyInvite);
  },
);
```

`stub.ts` is `export * from "./queries"` — no change needed there.

- [ ] **Step 5: Create `lib/actions/invite.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function inviteParent(email: string): Promise<ActionResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Only the family owner may invite
  const { data: fam } = await supabase
    .from("families")
    .select("id, owner_user_id")
    .maybeSingle();
  if (!fam) return { ok: false, error: "Family not found." };
  if (fam.owner_user_id !== user.id) {
    return { ok: false, error: "Only the family owner can invite members." };
  }

  // Reject duplicate pending invite
  const { data: existing } = await supabase
    .from("family_invites")
    .select("id")
    .eq("invited_email", trimmed)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "A pending invite already exists for that email." };
  }

  // Insert invite row
  const { error: insertErr } = await supabase.from("family_invites").insert({
    family_id: fam.id,
    invited_email: trimmed,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  // Send magic-link email via admin API
  const admin = createAdminClient();
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(trimmed, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/accept-invite`,
  });
  if (inviteErr) return { ok: false, error: inviteErr.message };

  revalidatePath("/parent/settings");
  return { ok: true };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("family_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent/settings");
  return { ok: true };
}

export async function acceptInvite(): Promise<
  { ok: true; familyName: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const email = user.email.toLowerCase();

  // Find a valid pending invite for this email
  const { data: invite } = await admin
    .from("family_invites")
    .select("id, family_id")
    .eq("invited_email", email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invite) {
    return {
      ok: false,
      error: "This invite has expired or is no longer valid. Ask the family owner to send a new one.",
    };
  }

  // Mark accepted
  await admin
    .from("family_invites")
    .update({ status: "accepted" })
    .eq("id", invite.id);

  // Append user to co_parent_user_ids (read-then-write)
  const { data: family } = await admin
    .from("families")
    .select("co_parent_user_ids, name")
    .eq("id", invite.family_id)
    .single();

  const existing: string[] = family?.co_parent_user_ids ?? [];
  if (!existing.includes(user.id)) {
    await admin
      .from("families")
      .update({ co_parent_user_ids: [...existing, user.id] })
      .eq("id", invite.family_id);
  }

  return { ok: true, familyName: family?.name ?? "your family" };
}
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/types.ts lib/supabase/admin.ts lib/data/queries.ts lib/actions/invite.ts
git commit -m "feat: add FamilyInvite type, admin client, invite queries and server actions"
```

---

### Task 3: Parent Settings UI

**Files:**
- Create: `components/parent/InviteParentSection.tsx`
- Modify: `app/parent/settings/page.tsx`

- [ ] **Step 1: Create `components/parent/InviteParentSection.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { inviteParent, revokeInvite } from "@/lib/actions/invite";
import type { FamilyInvite } from "@/lib/domain/types";

export default function InviteParentSection({
  initialInvites,
}: {
  initialInvites: FamilyInvite[];
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [invites, setInvites] = useState(initialInvites);
  const [isPending, startTransition] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleInvite = () => {
    if (!email.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const result = await inviteParent(email);
      if (result.ok) {
        setMessage({ ok: true, text: `Invite sent to ${email.trim().toLowerCase()}` });
        setEmail("");
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  };

  const handleRevoke = (inviteId: string) => {
    setRevokingId(inviteId);
    startTransition(async () => {
      const result = await revokeInvite(inviteId);
      if (result.ok) {
        setInvites((prev) =>
          prev.map((inv) => (inv.id === inviteId ? { ...inv, status: "revoked" as const } : inv)),
        );
      }
      setRevokingId(null);
    });
  };

  const pendingInvites = invites.filter((inv) => inv.status === "pending");

  return (
    <div className="space-y-3">
      {/* Email input row */}
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="parent@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={handleInvite}
          disabled={isPending || !email.trim()}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white disabled:opacity-50 flex-shrink-0"
        >
          {isPending ? "Sending…" : "Send invite"}
        </button>
      </div>

      {/* Feedback message */}
      {message && (
        <div
          className={`text-xs font-semibold rounded-xl px-3 py-2 ${
            message.ok
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.ok ? "✓ " : "⚠ "}{message.text}
        </div>
      )}

      {/* Pending invites list */}
      {pendingInvites.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">
            Pending invites
          </div>
          {pendingInvites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"
            >
              <div>
                <div className="text-sm font-semibold text-gray-800">{inv.invitedEmail}</div>
                <div className="text-[11px] text-gray-400">
                  Expires {new Date(inv.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(inv.id)}
                disabled={isPending && revokingId === inv.id}
                className="text-xs font-bold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Modify `app/parent/settings/page.tsx`**

Add `listFamilyInvites` to the stub import at line 3:

```ts
import { getFamily, listKids, getParentPinFromDb, listFamilyInvites } from "@/lib/data/stub";
```

Add `InviteParentSection` import after the existing component imports (after line 7):

```ts
import InviteParentSection from "@/components/parent/InviteParentSection";
```

Update the data fetch at line 51:

```ts
const [family, kids, invites] = await Promise.all([getFamily(), listKids(), listFamilyInvites()]);
```

Replace the "Coming soon" stub (lines 90–98) with:

```tsx
<div className="border-t border-gray-100 px-3.5 py-3.5">
  <div className="flex items-center gap-2.5 mb-3">
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] flex-shrink-0 bg-indigo-50">
      ✉️
    </div>
    <div>
      <div className="text-[14px] font-semibold text-gray-800">Invite a parent or guardian</div>
      <div className="text-[11px] text-gray-400">They'll get full access to the parent dashboard</div>
    </div>
  </div>
  <InviteParentSection initialInvites={invites} />
</div>
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/parent/InviteParentSection.tsx app/parent/settings/page.tsx
git commit -m "feat: add invite parent form to settings page"
```

---

### Task 4: Accept Invite Page

**Files:**
- Create: `app/accept-invite/page.tsx`

- [ ] **Step 1: Create `app/accept-invite/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { acceptInvite } from "@/lib/actions/invite";
import { createClient } from "@/lib/supabase/server";

export default async function AcceptInvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const result = await acceptInvite();

  if (!result.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">😕</div>
          <h1 className="text-lg font-black text-gray-900">Invite not found</h1>
          <p className="text-sm text-gray-500 leading-relaxed">{result.error}</p>
          <Link
            href="/login"
            className="inline-block mt-2 px-5 py-2.5 rounded-2xl bg-gray-100 text-sm font-bold text-gray-700"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  redirect("/parent");
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/accept-invite/page.tsx
git commit -m "feat: add accept-invite page for co-parent onboarding"
```

---

### Task 5: Typecheck + Build

**Files:** None

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: build succeeds with no errors. If there are type errors in the build that weren't caught by typecheck, fix them before proceeding.

---

## Verification

1. **Send invite:** Sign in as owner → go to `/parent/settings` → enter an email → tap "Send invite". Confirm the success message appears and the email shows in the pending invites list.

2. **Revoke invite:** Tap "Revoke" on a pending invite. Confirm it disappears from the list.

3. **Duplicate invite:** Try sending a second invite to the same email. Confirm the error "A pending invite already exists for that email."

4. **Accept flow (happy path):** Open the invite email → click the link → confirm redirect to `/parent`. The co-parent should see the full parent dashboard.

5. **Accept flow (expired/invalid):** Visit `/accept-invite` without a valid pending invite. Confirm the error card renders with the "not found" message.

6. **Co-parent access:** As the co-parent, confirm you can see kids, tasks, completions, and rewards — same as the owner.
