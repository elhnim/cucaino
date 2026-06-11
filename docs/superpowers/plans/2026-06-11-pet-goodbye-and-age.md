# Pet "Say Goodbye" + Level→Age Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kids can release their pet (double-confirmed, full wipe) and re-adopt; all kid-facing "level" wording becomes "age".

**Architecture:** One new server action (`sayGoodbyeToPet`) deleting the `kid_pets` row (tricks/accessories/personalities are JSONB columns ON that row — single delete wipes everything; nothing references `kid_pets`, verified in migration 0043). UI lives entirely in `components/pet/PetGame.tsx`: a low-emphasis footer link opens a confirmation modal with a two-step danger button; on success `setPet(null)` re-renders the existing AdoptScreen branch. Age rename is display-string-only.

**Tech Stack:** Next.js server actions + Supabase, existing PetGame modal patterns. No schema changes, no new deps.

**Spec:** `docs/superpowers/specs/2026-06-11-pet-goodbye-and-age-design.md` (Codex verdict READY-FOR-PLAN; clarifications folded in below).

---

### Task 1: `sayGoodbyeToPet` server action

**Files:** Modify: `lib/actions/pet.ts`

- [ ] **Step 1:** Read the top of `lib/actions/pet.ts` to copy the established scoping pattern (how `washPet`/`feedPet` resolve the supabase client and validate the kid belongs to the family — reuse it exactly). Add:

```ts
export async function sayGoodbyeToPet(
  kidId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // (use the file's existing client + kid/family validation pattern here)
  const { error } = await supabase.from("kid_pets").delete().eq("kid_id", kidId);
  if (error) return { ok: false, error: "Could not say goodbye — try again." };
  revalidatePath("/play/pet");
  return { ok: true }; // idempotent: deleting a missing row is still ok
}
```

If the file's other actions guard "kid not in family" → return the same error string they use. Unauthenticated follows the same existing pattern.

- [ ] **Step 2:** `npm run typecheck` → exit 0.
- [ ] **Step 3:** Commit: `feat(pet): sayGoodbyeToPet server action — full pet release`

### Task 2: Footer link + confirmation modal in PetGame

**Files:** Modify: `components/pet/PetGame.tsx`

- [ ] **Step 1:** Add `"goodbye"` to the existing `modal` state's allowed values (it currently handles "food" | "shop" | "tricks" | "fetch" | null — match however it's typed). Import `sayGoodbyeToPet`.
- [ ] **Step 2:** Footer link, placed after the existing footer hints near the bottom of the main return (below the `💬 will talk at age N` hint area, ~line 838):

```tsx
<button
  type="button"
  onClick={() => setModal("goodbye")}
  className="block mx-auto mt-6 mb-2 text-xs font-bold text-gray-400 underline-offset-2 hover:underline"
>
  👋 Say goodbye to {pet.name}…
</button>
```

- [ ] **Step 3:** Modal (same overlay classes as the existing level-up modal: `fixed inset-0 z-50 flex items-center justify-center` + `bg-black/40` backdrop + white rounded-3xl card). Local state `const [goodbyeArmed, setGoodbyeArmed] = useState(false);` — reset to `false` whenever the modal opens. Content:

```tsx
{modal === "goodbye" && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
    <div className="absolute inset-0 bg-black/40" onClick={() => !isPending && setModal(null)} />
    <div className="relative bg-white rounded-3xl p-6 max-w-sm w-full text-center">
      <PetSprite species={pet.species} mood="lonely" stage={stage} size={90} animClass="avatar-idle" />
      <h2 className="text-xl font-black text-gray-900 mt-2 mb-1">Say goodbye to {pet.name}?</h2>
      <p className="text-sm text-gray-500 mb-5">
        {pet.name}&apos;s age, tricks and accessories will be gone forever.
        You can adopt a new pet after.
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setModal(null)}
        className="w-full py-4 rounded-2xl font-black text-base text-white active:scale-95 transition-transform disabled:opacity-50"
        style={{ background: accent }}
      >
        Keep {pet.name} 💚
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!goodbyeArmed) { setGoodbyeArmed(true); return; }
          startTransition(async () => {
            const res = await sayGoodbyeToPet(kid.id);
            if (res.ok) { setModal(null); setPet(null); }
            else setError(res.error);
          });
        }}
        className="w-full mt-2 py-3 rounded-2xl font-bold text-sm text-red-500 bg-red-50 active:scale-95 transition-transform disabled:opacity-50"
      >
        {isPending ? "Saying goodbye…" : goodbyeArmed ? "Tap again — really say goodbye 💔" : "Say goodbye forever"}
      </button>
    </div>
  </div>
)}
```

Adapt to the file's actual local helpers (`isPending`/`startTransition` from the existing `useTransition`, `setError` if that's the error pattern, else the `setNotice` red-notice variant — read how other failures display and use that). On `ok:false`: keep the modal open and show the error the same way other pet actions do. Backdrop click closes (disabled while pending) — that's the "dismiss" in the spec.

- [ ] **Step 4:** `npm run typecheck` → exit 0. Commit: `feat(pet): say-goodbye flow — double-confirm release, then re-adopt`

### Task 3: Level → Age display strings

**Files:** Modify: `components/pet/PetGame.tsx`, `components/pet/PetWidget.tsx`

Apply the spec table EXACTLY (header badge `Age {level}`, speech hint `at age {N}!`, tricks modal `Unlocks at age {N}` / `Age {N}+` / `🔒 Age {N}`, shop `grow older to unlock more!` / `🔒 Age {N}`, level-up modal heading `🎂 {pet.name} grew up!` for non-evolved (evolved keeps `{pet.name} evolved!`), body `is now age {N}. Keep caring!`, PetWidget `Age {level}`). XP bar label and ALL code identifiers (`level`, `minLevel`, `levelFromXp`, `SPEECH_UNLOCK_LEVEL`) stay unchanged. Scope is exactly these two files — no other components show pet level (verified by recon).

- [ ] **Step 1:** Apply the renames; then `Grep -i "lv |level" components/pet components/pet/PetWidget.tsx` and confirm every remaining match is a code identifier or the XP bar, not display copy.
- [ ] **Step 2:** `npm run typecheck` → exit 0. Commit: `feat(pet): show pet level as age everywhere kids see it`

### Task 4: Verify

- [ ] `npm run build` → exit 0. Working tree clean apart from intended commits.
