# Star Pets: "Say Goodbye" Restart + Level → Age — Design

**Date:** 2026-06-11
**Status:** Approved by user (kid decides with big warning, full wipe; level displayed as age)

## Goal

1. **Say goodbye & adopt a new pet:** a kid can release their pet (everything is lost: age/XP, tricks, accessories, personalities) after a strong double-confirmation, then goes through the existing adoption flow.
2. **Age, not level:** everywhere kids see "level"/"Lv" for their pet, it now says **age** — caring for the pet makes it grow older (same XP mechanics underneath, display-only change).

## Feature 1 — Say goodbye

### Entry point

A subtle footer link at the very bottom of the main pet screen (`components/pet/PetGame.tsx`, below the existing footer hints): small, gray, low-emphasis:

> `👋 Say goodbye to {name}…`

Tapping opens the confirmation modal. No parent PIN, no star cost (per approved design) — the friction is the double confirmation.

### Confirmation modal

Same styling family as the existing level-up/notice modals (`fixed inset-0 z-50`, white rounded card):

- Pet sprite shown with `mood="lonely"`.
- Heading: `Say goodbye to {name}?`
- Body: `{name}'s age, tricks and accessories will be gone forever. You can adopt a new pet after.`
- Buttons:
  - Primary (big, accent): `Keep {name} 💚` — closes the modal.
  - Danger (secondary style, red): two-step. First tap changes its label to `Tap again — really say goodbye 💔` (and arms it); second tap calls the server action. Re-opening the modal resets the arm state.
- While the action is pending: danger button disabled with `Saying goodbye…`.

### Server action

`sayGoodbyeToPet(kidId: string)` in `lib/actions/pet.ts`, following the file's existing patterns (auth/family scoping identical to other actions there):

- Deletes the kid's `kid_pets` row (`delete().eq("kid_id", kidId)`). One pet per kid (unique constraint), no FK orphans (verified — nothing references `kid_pets`).
- `revalidatePath("/play/pet")`.
- Returns `{ ok: true } | { ok: false; error: string }`.

### After goodbye

Client sets `pet` state to `null` → the existing `if (!pet) return <AdoptScreen …/>` branch (PetGame.tsx ~line 510) renders the full adoption flow (species → personalities → name). `adoptPet`'s "You already have a pet!" guard stays — the row is already gone.

No DB schema changes. No soft-delete/archive (YAGNI — approved as permanent).

## Feature 2 — Level shown as Age

Display-only rename; `levelFromXp`, XP mechanics, trick/accessory `minLevel` gates all unchanged. Kid-visible strings change as follows:

| Location | Now | Becomes |
|---|---|---|
| PetGame header badge (~603) | `{stage} · Lv {level}` | `{stage} · Age {level}` |
| XP bar label (~610) | `{xpIntoLevel}/{xpNeeded} XP` | unchanged (XP stays XP) |
| Speech hint (~838) | `will talk at level {N}!` | `will talk at age {N}!` |
| Tricks modal (~909) | `Unlocks at level {N}` / `Level {N}+` | `Unlocks at age {N}` / `Age {N}+` |
| Tricks locked chip (~919) | `🔒 Lv {N}` | `🔒 Age {N}` |
| Shop description (~942) | `level up to unlock more!` | `grow older to unlock more!` |
| Shop locked chip (~955) | `🔒 Lv {N}` | `🔒 Age {N}` |
| Level-up modal heading (~995) | `Level up!` | `🎂 {name} grew up!` (evolved case keeps `{name} evolved!`) |
| Level-up modal body (~1000) | `reached level {N}. Keep caring!` | `is now age {N}. Keep caring!` |
| PetWidget card (~71) | `Lv {level}` | `Age {level}` |

The goodbye-modal body copy ("age, tricks and accessories") matches this terminology.

## Error handling

- `sayGoodbyeToPet` failure: modal shows the existing error pattern (red notice), pet stays.
- Action is idempotent: deleting an already-deleted pet returns ok (client already moved to adopt screen).

## Acceptance criteria

1. `npm run typecheck` and `npm run build` pass.
2. Footer link → modal → double-tap danger → pet row deleted → adoption flow appears; completing it creates a fresh age-1 pet with no tricks/accessories.
3. "Keep {name} 💚" and dismissing the modal change nothing.
4. Grep of `components/pet` + `PetWidget` shows no kid-visible `Lv `/`level` strings remaining (except the XP bar and code identifiers).
5. No schema changes; `adoptPet` guard untouched.
