# Nav Transitions + Prefetch — Design Spec

**Date:** 2026-05-21  
**Scope:** Bottom-nav tab transitions in `KidShell`  
**Approach:** View Transitions API + `pointerdown` prefetch  

---

## Problem

Tab switches feel like full page loads — 700ms–2.8s of blank/skeleton before content paints. The user taps a tab and sees nothing respond immediately.

## Goal

Tab switches feel instant. The animation acknowledges the tap within one frame; data fills in behind it.

## Solution

Two changes, one component, one CSS file.

### 1. `KidShell.tsx` — bottom nav interaction

Convert the 4 bottom-nav `<Link>` elements to buttons with two handlers each:

**`onPointerDown`** — fires when finger first touches the screen (~100ms before click):
```ts
router.prefetch(href)
```
Starts the RSC fetch during the tap gesture itself, hiding most server latency behind the user's own interaction.

**`onClick`** — fires on tap lift:
```ts
function navigateWithTransition(href: string) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    document.startViewTransition(() => router.push(href));
  } else {
    router.push(href);
  }
}
```
Wraps navigation in a cross-fade transition where supported; falls back to plain `router.push` silently.

The existing quiz-active confirmation dialog (`window.confirm(...)`) moves into the `onClick` handler before the navigation call — behaviour unchanged.

### 2. `app/globals.css` — transition animation

Cross-fade at 180ms. Wrapped in `@supports` so zero impact on unsupported browsers.

```css
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

Cross-fade is correct for a tab bar (iOS/Android both cross-fade tab switches; directional slides are for navigation-stack pushes).

## Out of scope

- Back buttons and in-game navigation links — not changed
- Parent dashboard navigation — not changed
- Android bottom nav (separate shell component if one exists)
- Prefetching on hover (desktop) — can be added as a follow-on

## Browser support

| Browser | View Transitions | Behaviour |
|---|---|---|
| Chrome 111+ | ✓ | Full cross-fade |
| Edge 111+ | ✓ | Full cross-fade |
| Safari 18.1+ (iOS 18.1+) | ✓ | Full cross-fade |
| Older Safari / Firefox | ✗ | Instant navigation (no crash, no visual artifact) |

## Files changed

| File | Change |
|---|---|
| `components/kid/KidShell.tsx` | Convert 4 `<Link>` nav items to buttons; add `onPointerDown` prefetch; add `navigateWithTransition` helper |
| `app/globals.css` | Add `@supports` block with two keyframes and `::view-transition` rules |

No new dependencies. No changes to routes, data layer, or Supabase.

## Success criteria

- Tapping any bottom-nav tab shows a visible cross-fade animation
- No blank screen between tabs
- Quiz-active guard still works
- Graceful no-op on unsupported browsers (Safari < 18.1, Firefox)
- `npm run build` passes with no type errors
