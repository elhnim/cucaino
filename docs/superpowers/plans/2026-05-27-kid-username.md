# Kid Username Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each kid to pick a globally-unique username from their own profile screen, with a live availability check as they type.

**Architecture:** New `username` column on `kids` (globally unique, case-insensitive index). A lightweight `GET /api/username-check` route does availability lookups. `ProfileEditor` gets a new Username card with 500ms debounced fetch; `updateKidProfile` server action gains an optional `username` param and validates/saves it.

**Tech Stack:** Next.js App Router · Supabase (postgres) · TypeScript · Tailwind CSS

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0035_kid_username.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/0035_kid_username.sql
alter table public.kids
  add column username text;

create unique index kids_username_lower_idx
  on public.kids (lower(username));
```

- [ ] **Step 2: Apply the migration to your Supabase project**

Open the Supabase dashboard → SQL editor → paste and run the migration. Or via CLI:

```bash
supabase db push
```

Verify in the Table Editor that `kids` now has a `username` column (nullable text).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0035_kid_username.sql
git commit -m "feat(db): add username column to kids with case-insensitive unique index"
```

---

### Task 2: Type layer — Kid interface + DbKidRow + mapKid

**Files:**
- Modify: `lib/domain/types.ts`
- Modify: `lib/data/queries.ts`

- [ ] **Step 1: Add `username` to the `Kid` interface in `lib/domain/types.ts`**

Find the `Kid` interface (around line 64) and add after `sparksBalance`:

```typescript
export interface Kid {
  id: string;
  familyId: string;
  name: string;
  age: number;
  avatar: string;
  themeId: ThemeId;
  dateOfBirth: string | null;
  pin: string | null;
  pointsBalance: number;
  currentStreak: number;
  longestStreak: number;
  totalStarsEarned: number;
  totalCompletions: number;
  selectedAvatarEmoji: string | null;
  selectedFrame: "none" | "blue_glow" | "gold" | "fire" | "rainbow" | null;
  tourSeen: boolean;
  goals: string[];
  goalsOther: string | null;
  interests: string[];
  interestsOther: string | null;
  cashBalance: number;
  sparksBalance: number;
  username: string | null;
}
```

- [ ] **Step 2: Add `username` to `mapKid` in `lib/data/queries.ts`**

In the `mapKid` function (around line 89), add `username` after `sparksBalance`:

```typescript
    sparksBalance: (row as any).sparks_balance ?? 0,
    username: (row as any).username ?? null,
```

No change needed to `DbKidRow` — the pattern in this file uses `(row as any)` for columns added after the initial schema, consistent with `totalStarsEarned`, `selectedFrame`, etc.

- [ ] **Step 3: Run type check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/domain/types.ts lib/data/queries.ts
git commit -m "feat(types): add username field to Kid type and mapKid"
```

---

### Task 3: API route — username availability check

**Files:**
- Create: `app/api/username-check/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// app/api/username-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const username = searchParams.get("username") ?? "";
  const kidId = searchParams.get("kidId") ?? "";

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ available: false, reason: "invalid_format" });
  }

  const supabase = await createClient();
  let query = supabase
    .from("kids")
    .select("id")
    .ilike("username", username)
    .limit(1);

  if (kidId) {
    query = query.neq("id", kidId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ available: false, reason: "error" }, { status: 500 });
  }

  return NextResponse.json({ available: data.length === 0 });
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Manually test the route**

Start the dev server (`npm run dev`), then open in a browser or use curl:

```
GET http://localhost:3000/api/username-check?username=testuser&kidId=any-uuid
```

Expected response: `{"available":true}` (assuming no kid has that username yet).

Try with a short username:
```
GET http://localhost:3000/api/username-check?username=ab
```
Expected: `{"available":false,"reason":"invalid_format"}`

- [ ] **Step 4: Commit**

```bash
git add app/api/username-check/route.ts
git commit -m "feat(api): add username-check availability endpoint"
```

---

### Task 4: Server action — updateKidProfile gains username param

**Files:**
- Modify: `lib/actions/kids.ts`

- [ ] **Step 1: Update `updateKidProfile` to accept and save username**

Replace the existing `updateKidProfile` function (lines 32–59) with:

```typescript
export async function updateKidProfile(
  kidId: string,
  data: {
    name: string;
    avatar: string;
    themeId: ThemeId;
    dateOfBirth: string | null;
    username?: string | null;
  },
): Promise<ActionResult> {
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;

  if (data.username != null && data.username !== "" && !USERNAME_RE.test(data.username)) {
    return { ok: false, error: "Invalid username format." };
  }

  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase.from("families").select("id").maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  // Race-condition guard: check uniqueness server-side before writing
  if (data.username) {
    const { data: existing } = await supabase
      .from("kids")
      .select("id")
      .ilike("username", data.username)
      .neq("id", kidId)
      .limit(1)
      .maybeSingle();
    if (existing) return { ok: false, error: "Username already taken." };
  }

  const updatePayload: Record<string, unknown> = {
    name: data.name,
    avatar: data.avatar,
    theme_id: data.themeId,
    date_of_birth: data.dateOfBirth,
  };

  // Only include username in the update when explicitly provided
  if (data.username !== undefined) {
    updatePayload.username = data.username || null;
  }

  const { error } = await supabase
    .from("kids")
    .update(updatePayload)
    .eq("id", kidId)
    .eq("family_id", fam.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/profile`);
  revalidatePath(`/select-kid`);
  revalidatePath(`/parent/settings`);
  return { ok: true };
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/kids.ts
git commit -m "feat(actions): updateKidProfile accepts and validates optional username"
```

---

### Task 5: UI — Username card in ProfileEditor

**Files:**
- Modify: `components/kid/ProfileEditor.tsx`

- [ ] **Step 1: Add username state and debounced check logic**

At the top of `ProfileEditor`, add these imports after the existing ones:

```typescript
import { useCallback, useEffect, useRef } from "react";
```

Inside the `ProfileEditor` component, after the `const [saveMsg, setSaveMsg] = useState<string | null>(null);` line, add:

```typescript
  const [username, setUsername] = useState(serverKid.username ?? "");
  type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;

  const checkUsername = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = value.trim();
      if (trimmed === "") { setUsernameStatus("idle"); return; }
      if (!USERNAME_RE.test(trimmed)) { setUsernameStatus("invalid"); return; }
      if (trimmed.toLowerCase() === (serverKid.username ?? "").toLowerCase()) {
        setUsernameStatus("available");
        return;
      }
      setUsernameStatus("checking");
      debounceRef.current = setTimeout(async () => {
        const res = await fetch(
          `/api/username-check?username=${encodeURIComponent(trimmed)}&kidId=${serverKid.id}`
        );
        const json = await res.json();
        setUsernameStatus(json.available ? "available" : "taken");
      }, 500);
    },
    [serverKid.id, serverKid.username],
  );

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);
```

- [ ] **Step 2: Update the `dirty` flag to include username**

Find the existing `dirty` constant and add username to it:

```typescript
  const dirty =
    name !== serverKid.name ||
    avatar !== serverKid.avatar ||
    themeId !== serverKid.themeId ||
    (dob || null) !== (serverKid.dateOfBirth || null) ||
    selectedFrame !== ((serverKid.selectedFrame as FrameId) ?? "none") ||
    username.trim() !== (serverKid.username ?? "");
```

- [ ] **Step 3: Update the `save` function to pass username**

Find `await updateKidProfile(serverKid.id, {` and add `username` to the payload:

```typescript
      const result = await updateKidProfile(serverKid.id, {
        name: name.trim(),
        avatar,
        themeId,
        dateOfBirth: dob || null,
        username: username.trim() || null,
      });
```

- [ ] **Step 4: Disable Save while username check is in-flight or invalid/taken**

Find the Save button in the sticky bottom bar. Replace its `disabled` prop:

```typescript
        <button
          type="button"
          onClick={save}
          disabled={!dirty || isPending || usernameStatus === "checking" || usernameStatus === "taken" || usernameStatus === "invalid"}
          className="flex-1 text-white font-black py-2.5 rounded-xl disabled:opacity-50"
          style={{ background: accent }}
        >
          {isPending ? "Saving…" : dirty ? "Save changes" : "No changes"}
        </button>
```

- [ ] **Step 5: Add the Username card**

Add this card after the Name card (after the closing `</Card>` of the Name card, around line 176):

```tsx
      {/* Username */}
      <Card title="Username" icon="@">
        <p className="text-xs text-gray-500 mb-2">
          Your unique handle — letters, numbers and _ only, 3–20 characters.
        </p>
        <div className="relative">
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              checkUsername(e.target.value);
            }}
            placeholder="e.g. cool_alex99"
            maxLength={20}
            className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-current text-lg lowercase"
            style={{ caretColor: accent }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        {usernameStatus === "checking" && (
          <p className="text-xs text-gray-400 mt-1">Checking…</p>
        )}
        {usernameStatus === "available" && (
          <p className="text-xs text-green-600 font-bold mt-1">✓ Available</p>
        )}
        {usernameStatus === "taken" && (
          <p className="text-xs text-red-600 font-bold mt-1">✗ Already taken</p>
        )}
        {usernameStatus === "invalid" && (
          <p className="text-xs text-orange-500 font-bold mt-1">
            Only letters, numbers and _ · 3–20 characters
          </p>
        )}
      </Card>
```

- [ ] **Step 6: Run type check and build**

```bash
npm run typecheck
npm run build
```

Expected: no errors or type failures.

- [ ] **Step 7: Manual verification**

Start the dev server (`npm run dev`), navigate to a kid's profile page (`/kid/<kidId>/profile`):

1. The Username card appears below the Name card.
2. Type `ab` — orange "Only letters, numbers and _" message appears immediately (no fetch).
3. Type `cool_alex` — after 500ms, green "✓ Available" appears (assuming unused).
4. Type an existing kid's username — red "✗ Already taken" appears.
5. While status is "checking" or "taken" or "invalid", the Save button is disabled.
6. Type a valid available username and hit Save — profile saves, username persists on reload.
7. Clear the username field and Save — username is cleared (null in DB).
8. Re-open profile — the saved username pre-fills the field.

- [ ] **Step 8: Commit**

```bash
git add components/kid/ProfileEditor.tsx
git commit -m "feat(ui): add username card to ProfileEditor with live availability check"
```
