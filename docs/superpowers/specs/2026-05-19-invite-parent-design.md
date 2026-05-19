# Invite Parent — Design Spec

## Overview

Let the family owner invite a second parent or guardian by email. The invitee receives a Supabase magic-link email, signs up or signs in, and lands on `/accept-invite` where their account is added to the family's `co_parent_user_ids`. They then have full parent-side access identical to the owner.

## Section 1 — Data Model

### New table: `public.family_invites`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `family_id` | uuid FK | References `families(id)` ON DELETE CASCADE |
| `invited_email` | text NOT NULL | Normalised to lowercase |
| `status` | text NOT NULL | `'pending'` \| `'accepted'` \| `'revoked'` |
| `created_at` | timestamptz | `DEFAULT now()` |
| `expires_at` | timestamptz | `DEFAULT now() + interval '7 days'` |

Index on `(family_id, status)` and `(invited_email, status)`.

RLS: owner-only policy — `family_id = public.current_family_id()`.

### `families` table change

Add column: `co_parent_user_ids uuid[] NOT NULL DEFAULT '{}'`

### Updated `current_family_id()` function

```sql
CREATE OR REPLACE FUNCTION public.current_family_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.families
  WHERE owner_user_id = auth.uid()
     OR auth.uid() = ANY(co_parent_user_ids)
  LIMIT 1
$$;
```

This automatically extends all existing RLS policies (which gate on `family_id = public.current_family_id()`) to co-parents.

### Inline-subquery policies (strikes, mood_entries)

Update both tables' `family_scope` policies to also use `current_family_id()` instead of their current inline subquery, so they stay consistent.

### New environment variable

`SUPABASE_SERVICE_ROLE_KEY` — required for `supabase.auth.admin.inviteUserByEmail`. Added to `.env.local` and Netlify env vars.

---

## Section 2 — Invite Flow (owner side)

1. Owner taps "Invite parent" on `/parent/settings` → enters invitee email → submits
2. `inviteParent(email)` server action:
   - Rejects if a pending invite already exists for this email + family
   - Inserts row into `family_invites` (status = `pending`)
   - Calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: "/accept-invite" })` using service-role client
   - Returns `{ ok: true }` or `{ ok: false; error: string }`
3. UI shows "Invite sent to [email]" inline — no modal
4. Pending invites list refreshes to show the new entry with a revoke button
5. `revokeInvite(inviteId)` server action: sets `status = 'revoked'` + `revalidatePath("/parent/settings")`

---

## Section 3 — Accept Flow (invitee side)

1. Invitee clicks magic-link in email → Supabase exchanges token → session established → redirects to `/accept-invite`
2. `/accept-invite` page (server component + server action):
   - Reads signed-in user session
   - Queries `family_invites` WHERE `invited_email = user.email` AND `status = 'pending'` AND `expires_at > now()`
   - **Found:** updates invite `status = 'accepted'`, appends `user.id` to `families.co_parent_user_ids` via `array_append`, redirects to `/parent`
   - **Not found:** renders error card — "This invite has expired or is no longer valid. Ask the family owner to send a new one."

---

## Section 4 — UI

### `/parent/settings` additions

Replace the existing "Coming soon" stub (lines 90-98) with:

- **"Invite a parent" card** — email input + "Send invite" button; success/error message inline
- **Pending invites list** — each row: email · status badge · "Revoke" button (only for pending)
- No modal needed; settings form pattern matches the rest of the page

### `/accept-invite` page (new, no nav shell)

- Centred card, minimal layout
- Loading state while the `acceptInvite` action runs
- **Success:** "You're in! Welcome to [family name]" + "Go to dashboard →" link to `/parent`
- **Error:** friendly message + suggestion to request a new invite

---

## Files

| Action | File |
|---|---|
| Create | `supabase/migrations/0026_invite_parent.sql` |
| Modify | `lib/domain/types.ts` — add `FamilyInvite` interface |
| Modify | `lib/data/queries.ts` — add `listFamilyInvites` |
| Create | `lib/actions/invite.ts` — `inviteParent`, `revokeInvite`, `acceptInvite` |
| Modify | `app/parent/settings/page.tsx` — add invite card + pending list |
| Create | `app/accept-invite/page.tsx` — accept flow page |
| Create | `lib/supabase/admin.ts` — service-role client helper |
