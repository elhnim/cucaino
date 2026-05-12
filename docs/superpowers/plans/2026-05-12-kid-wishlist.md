# Kid Wishlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow kids to heart-toggle rewards into a personal wishlist (max 3 slots) visible at the top of the Shop tab.

**Architecture:** The `wishlist_items` table and `WishlistItem` type already exist. We add a query (`listWishlistItems`), two server actions (`addToWishlist`, `removeFromWishlist`), then update the rewards page to load the wishlist, render filled/empty slots, and show a heart button on each `RewardCard`.

**Tech Stack:** Next.js App Router server components · Supabase (server client) · server actions · Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `lib/data/queries.ts` | Add `listWishlistItems(kidId)` |
| `lib/actions/rewards.ts` | Add `addToWishlist`, `removeFromWishlist` |
| `app/kid/[kidId]/rewards/page.tsx` | Load wishlist, pass to UI, update wishlist slots + RewardCard |

---

### Task 1: Add `listWishlistItems` query

**Files:**
- Modify: `lib/data/queries.ts`

- [ ] **Step 1: Add the query at the bottom of `lib/data/queries.ts`**

Add this after the last export:

```ts
export async function listWishlistItems(kidId: string): Promise<WishlistItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("*")
    .eq("kid_id", kidId)
    .order("position", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    kidId: row.kid_id,
    rewardId: row.reward_id,
    addedAt: row.added_at,
    position: row.position,
  }));
}
```

`WishlistItem` is already imported via the existing `import type { ... } from "@/lib/domain/types"` at the top of `queries.ts` — add `WishlistItem` to that import list.

- [ ] **Step 2: Verify the build compiles**

```bash
npm run typecheck
```

Expected: no errors related to `listWishlistItems`.

- [ ] **Step 3: Commit**

```bash
git add lib/data/queries.ts
git commit -m "feat(wishlist): add listWishlistItems query"
```

---

### Task 2: Add server actions for wishlist toggle

**Files:**
- Modify: `lib/actions/rewards.ts`

- [ ] **Step 1: Add `addToWishlist` and `removeFromWishlist` to `lib/actions/rewards.ts`**

Add after the last function in the file:

```ts
export async function addToWishlist(kidId: string, rewardId: string): Promise<ActionResult> {
  const supabase = await createClient();

  // Enforce max 3
  const { count } = await supabase
    .from("wishlist_items")
    .select("*", { count: "exact", head: true })
    .eq("kid_id", kidId);
  if ((count ?? 0) >= 3) return { ok: false, error: "Wishlist is full." };

  // Assign next available position (1-3)
  const { data: existing } = await supabase
    .from("wishlist_items")
    .select("position")
    .eq("kid_id", kidId);
  const usedPositions = new Set((existing ?? []).map((r: any) => r.position));
  const position = [1, 2, 3].find((p) => !usedPositions.has(p)) ?? 1;

  const { error } = await supabase.from("wishlist_items").insert({
    kid_id: kidId,
    reward_id: rewardId,
    position,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/kid/${kidId}/rewards`);
  return { ok: true };
}

export async function removeFromWishlist(kidId: string, rewardId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("wishlist_items")
    .delete()
    .eq("kid_id", kidId)
    .eq("reward_id", rewardId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/rewards`);
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/rewards.ts
git commit -m "feat(wishlist): add addToWishlist and removeFromWishlist actions"
```

---

### Task 3: Wire wishlist data into the rewards page

**Files:**
- Modify: `app/kid/[kidId]/rewards/page.tsx`

- [ ] **Step 1: Import `listWishlistItems` and the two new actions**

At the top of `app/kid/[kidId]/rewards/page.tsx`, update the imports:

```ts
import {
  getKid,
  listRewardsForKid,
  listKids,
  listBadgeProgress,
  listWeeklyStarsByKid,
  listWishlistItems,
} from "@/lib/data/stub";
import { addToWishlist, removeFromWishlist } from "@/lib/actions/rewards";
```

- [ ] **Step 2: Fetch wishlist in the page data load**

Find the `Promise.all` block that fetches `rewards`, `badges`, etc. and add `listWishlistItems`:

```ts
const [rewards, badges, allKids, weeklyStars, wishlistItems] = await Promise.all([
  listRewardsForKid(kid.id),
  listBadgeProgress(kid.id),
  listKids(),
  isBadgesTab ? listWeeklyStarsByKid() : Promise.resolve({}),
  listWishlistItems(kid.id),
]);
```

- [ ] **Step 3: Replace the static wishlist placeholder with dynamic slots**

Replace this block in the shop tab section:

```tsx
{/* Wishlist */}
<div className="flex items-center justify-between mb-2">
  <h3 className="text-sm font-bold text-gray-700">💛 My Wishlist</h3>
  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">0/3</span>
</div>
<div className="grid grid-cols-3 gap-2 mb-6">
  {[0, 1, 2].map((i) => (
    <div
      key={i}
      className="rounded-2xl p-3 min-h-[80px] flex flex-col items-center justify-center gap-1"
      style={{ border: "1.5px dashed #d1d5db" }}
    >
      <span className="text-base">🤍</span>
      <span className="text-xs text-gray-400">Add a reward</span>
    </div>
  ))}
</div>
```

With:

```tsx
{/* Wishlist */}
<div className="flex items-center justify-between mb-2">
  <h3 className="text-sm font-bold text-gray-700">💛 My Wishlist</h3>
  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
    {wishlistItems.length}/3
  </span>
</div>
<div className="grid grid-cols-3 gap-2 mb-6">
  {[1, 2, 3].map((pos) => {
    const item = wishlistItems.find((w) => w.position === pos);
    const reward = item ? activeRewards.find((r) => r.id === item.rewardId) : null;
    if (reward) {
      return (
        <div
          key={pos}
          className="rounded-2xl p-3 min-h-[80px] flex flex-col items-center justify-center gap-1 bg-amber-50 relative"
          style={{ border: "1.5px solid #fbbf24" }}
        >
          <span className="text-2xl">{reward.icon}</span>
          <span className="text-[10px] font-bold text-center text-gray-700 leading-tight">
            {reward.name}
          </span>
          <span className="text-[10px] text-amber-600 font-bold">⭐ {reward.costPoints}</span>
          <form action={removeFromWishlist.bind(null, kid.id, reward.id)}>
            <button
              type="submit"
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center hover:bg-red-100 hover:text-red-500"
              aria-label="Remove from wishlist"
            >
              ×
            </button>
          </form>
        </div>
      );
    }
    return (
      <div
        key={pos}
        className="rounded-2xl p-3 min-h-[80px] flex flex-col items-center justify-center gap-1"
        style={{ border: "1.5px dashed #d1d5db" }}
      >
        <span className="text-base">🤍</span>
        <span className="text-xs text-gray-400">Add a reward</span>
      </div>
    );
  })}
</div>
```

- [ ] **Step 4: Add heart button to `RewardCard`**

Update the `RewardCard` component signature and add a heart button. The heart button is a form that calls `addToWishlist` or `removeFromWishlist` depending on current state.

Change the signature from:

```ts
function RewardCard({
  reward: r,
  pointsBalance,
}: {
  reward: Reward;
  pointsBalance: number;
})
```

To:

```ts
function RewardCard({
  reward: r,
  pointsBalance,
  isWishlisted,
  wishlistFull,
  kidId,
}: {
  reward: Reward;
  pointsBalance: number;
  isWishlisted: boolean;
  wishlistFull: boolean;
  kidId: string;
})
```

Then add a heart button overlay at the top-right of every card variant. Add this just inside the outermost `<div>` of each card variant (team, canAfford, and cannot-afford), before any other content:

```tsx
{/* Wishlist heart */}
{r.who !== "team" && (
  <form
    action={
      isWishlisted
        ? removeFromWishlist.bind(null, kidId, r.id)
        : addToWishlist.bind(null, kidId, r.id)
    }
    className="absolute top-2 right-2"
  >
    <button
      type="submit"
      disabled={!isWishlisted && wishlistFull}
      className="text-base leading-none disabled:opacity-30"
      aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
    >
      {isWishlisted ? "❤️" : "🤍"}
    </button>
  </form>
)}
```

Note: all three card variants already have `relative` on their outer div. For the team card add `relative` if missing.

- [ ] **Step 5: Update all `RewardCard` usages in the page**

Find where `RewardCard` is called:

```tsx
<RewardCard key={r.id} reward={r} pointsBalance={kid.pointsBalance} />
```

Replace with:

```tsx
<RewardCard
  key={r.id}
  reward={r}
  pointsBalance={kid.pointsBalance}
  isWishlisted={wishlistItems.some((w) => w.rewardId === r.id)}
  wishlistFull={wishlistItems.length >= 3}
  kidId={kid.id}
/>
```

- [ ] **Step 6: Typecheck and verify build**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/kid/[kidId]/rewards/page.tsx
git commit -m "feat(wishlist): wire wishlist slots and heart toggle on reward cards"
```
