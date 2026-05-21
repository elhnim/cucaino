# Nav Transitions + Prefetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bottom-nav tab switches feel instant by cross-fading with the View Transitions API and prefetching RSC payloads on `pointerdown`.

**Architecture:** Two isolated changes — a CSS animation block in `globals.css` and a navigation helper in `KidShell.tsx`. No new dependencies. Graceful fallback for unsupported browsers (plain `router.push`).

**Tech Stack:** Next.js App Router · `useRouter` from `next/navigation` · View Transitions API (browser-native) · Tailwind CSS

---

## File Map

| File | Change |
|---|---|
| `app/globals.css` | Add `@supports` block: two keyframes + `::view-transition` rules |
| `components/kid/KidShell.tsx` | Add `useRouter` import; add `navigateWithTransition` helper; convert 4 `<Link>` nav items to `<button>` with `onPointerDown` + `onClick` handlers |

---

### Task 1: Add view transition CSS to globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append the transition block at the end of `app/globals.css`**

Add this after the last existing rule in the file:

```css
/* View transitions for bottom-nav tab switches */
@supports (view-transition-name: none) {
  ::view-transition-old(root) {
    animation: 180ms ease-out both cucaino-fade-out;
  }
  ::view-transition-new(root) {
    animation: 180ms ease-in both cucaino-fade-in;
  }

  @keyframes cucaino-fade-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }

  @keyframes cucaino-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add view transition keyframes for tab navigation"
```

---

### Task 2: Update KidShell bottom nav

**Files:**
- Modify: `components/kid/KidShell.tsx` (lines 4, 309–334)

- [ ] **Step 1: Add `useRouter` to the navigation import**

Current line 4:
```ts
import { usePathname } from "next/navigation";
```

Replace with:
```ts
import { usePathname, useRouter } from "next/navigation";
```

- [ ] **Step 2: Add `router` instance and `navigateWithTransition` helper inside the `KidShell` component**

Find the line that reads `const pathname = usePathname();` inside the component body and add these two lines immediately after it:

```ts
const router = useRouter();

function navigateWithTransition(href: string) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as Document & { startViewTransition: (cb: () => void) => void })
      .startViewTransition(() => router.push(href));
  } else {
    router.push(href);
  }
}
```

- [ ] **Step 3: Replace the bottom nav `<Link>` elements with `<button>` elements**

Current block (lines 310–334):
```tsx
{NAV_ITEMS.map((item) => {
  const isActive = item.key === active;
  return (
    <Link
      key={item.key}
      href={item.href(kid.id)}
      onClick={(e) => {
        if (isQuizActive && !window.confirm("Leave the quiz? Your progress will be lost.")) {
          e.preventDefault();
        }
      }}
      className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5"
    >
      <span style={{ color: isActive ? theme.accent : "#9ca3af" }}>
        <NavIcon name={item.icon} size={22} />
      </span>
      <span
        className="text-[10px] font-bold tracking-wide"
        style={{ color: isActive ? theme.accent : "#9ca3af" }}
      >
        {item.label}
      </span>
    </Link>
  );
})}
```

Replace with:
```tsx
{NAV_ITEMS.map((item) => {
  const isActive = item.key === active;
  const href = item.href(kid.id);
  return (
    <button
      key={item.key}
      type="button"
      onPointerDown={() => router.prefetch(href)}
      onClick={() => {
        if (isQuizActive && !window.confirm("Leave the quiz? Your progress will be lost.")) {
          return;
        }
        navigateWithTransition(href);
      }}
      className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 bg-transparent border-0 cursor-pointer"
    >
      <span style={{ color: isActive ? theme.accent : "#9ca3af" }}>
        <NavIcon name={item.icon} size={22} />
      </span>
      <span
        className="text-[10px] font-bold tracking-wide"
        style={{ color: isActive ? theme.accent : "#9ca3af" }}
      >
        {item.label}
      </span>
    </button>
  );
})}
```

- [ ] **Step 4: Remove the now-unused `Link` import if it is no longer used anywhere else in the file**

Search the file for any remaining `<Link` usage. If none exist outside the nav, remove `Link` from the import on line 3:

```ts
// Before
import Link from "next/link";

// After — delete the line entirely if Link is unused
```

If `Link` is used elsewhere in the file, leave the import.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors. If TypeScript complains about `startViewTransition` not existing on `Document`, the cast in Step 2 handles it — re-check the cast is in place.

- [ ] **Step 6: Run build**

```bash
npm run build
```

Expected: build completes with no errors or warnings about the changed files.

- [ ] **Step 7: Commit**

```bash
git add components/kid/KidShell.tsx
git commit -m "feat: add view transitions and prefetch to bottom nav tabs"
```

---

### Task 3: Manual verification

**Files:** none — verification only

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open the app in a browser**

Navigate to `http://localhost:3000`, select a kid, and land on the Home tab.

- [ ] **Step 3: Verify cross-fade animation**

Tap each of the 4 bottom-nav tabs in sequence: Home → Schedule → Store → Play → Home.

Expected:
- Each tab switch shows a brief (≈180ms) cross-fade — old content fades out as new content fades in
- No blank screen between tabs
- Active tab indicator updates immediately on tap

- [ ] **Step 4: Verify quiz guard still works**

Navigate to Play → start any quiz question (so `isQuizActive` becomes true) → tap a different tab.

Expected: `window.confirm` dialog appears asking "Leave the quiz? Your progress will be lost." Cancelling stays on the quiz; confirming navigates away with the cross-fade.

- [ ] **Step 5: Push**

```bash
git push
```
