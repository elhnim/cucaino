# Kid Username Design

**Date:** 2026-05-27  
**Status:** Approved

## Summary

Allow each kid to pick a unique username (handle) from their own profile screen. Usernames are globally unique across all families to support a future messaging feature.

## Requirements

- Kid sets their own username from the profile page (`/kid/[kidId]/profile`)
- Usernames are globally unique (not scoped to family)
- Format: letters, numbers, underscores only · 3–20 characters · case-insensitive (`alex` and `Alex` are the same)
- Username is optional — kids can leave it blank
- Live availability check as the kid types (debounced 500ms), with a server-side guard on save
- Parent edit screen is not involved — username is kid-owned

## Database

New migration `supabase/migrations/0035_kid_username.sql`:

```sql
alter table public.kids
  add column username text unique;

create unique index kids_username_lower_idx
  on public.kids (lower(username));
```

- Column is nullable (existing kids have no username yet)
- Unique index on `lower(username)` enforces case-insensitive global uniqueness at the DB level
- Format validation enforced at the application layer

## API Route

`GET /api/username-check?username=<value>&kidId=<id>`

- No auth required — availability is public information
- Validates format on the server (`/^[a-z0-9_]{3,20}$/i`)
- Queries `lower(username) = lower(input)` excluding the requesting kid's own record (so a kid can re-save their existing username without error)
- Returns `{ available: true }` or `{ available: false }`

## Server Action

`updateKidProfile` in `lib/actions/kids.ts` gains an optional `username` param:

- Accepts `username: string | null`
- Validates format server-side before the DB call
- Returns `{ ok: false, error: "..." }` if the username is taken (race condition guard)

## UI — ProfileEditor

A new `Username` card added to `components/kid/ProfileEditor.tsx` after the Name card, using the existing `<Card>` component pattern.

**States:**

| State | Display |
|---|---|
| Idle (no input / unchanged) | Neutral, no indicator |
| Typing (debounce pending) | No indicator yet |
| Checking (fetch in-flight) | Grey "Checking…" |
| Available | Green "✓ Available" |
| Taken | Red "✗ Already taken" |
| Invalid format (client-side) | Orange "Only letters, numbers and _ · 3–20 chars" |

**Save behaviour:**
- Save button remains disabled while check is in-flight, format is invalid, or username is taken
- `username` is included in the existing `save()` call — no separate save action
- Blank value clears the username (`null` stored in DB)

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/0035_kid_username.sql` | New — add column + unique index |
| `lib/domain/types.ts` | Add `username: string \| null` to `Kid` interface |
| `lib/data/queries.ts` | Map `username` in kid select query |
| `lib/actions/kids.ts` | Add `username` param to `updateKidProfile` |
| `app/api/username-check/route.ts` | New — GET availability check endpoint |
| `components/kid/ProfileEditor.tsx` | Add Username card with debounced live check |

## Out of Scope

- Parent edit screen — username is kid-owned only
- `createKid` — username not set at creation time
- Username display elsewhere in the app (future work for messaging)
- Username change history / cooldowns
