# Nugget Market Home Widget — Design Spec

**Date:** 2026-05-20  
**Scope:** Single-project — one new sortable widget on the kid home page

---

## Overview

Add a "Nugget Market" widget to the kid home page that shows the kid's trading portfolio at a glance and links through to `/play/trading?kid=<id>`. The widget slots into the existing `KidHomeWidgets` sortable/hideable system.

---

## User Journey

Kid opens the home page → sees the Nugget Market widget → taps "Open →" to go to the full market. Kids without a portfolio see a "Start investing →" CTA instead.

---

## Data

Three new entries added to the `Promise.all` in `app/kid/[kidId]/home/page.tsx`:

| Query | Returns | Notes |
|---|---|---|
| `getTradingPortfolio(kidId)` | `TradingPortfolio \| null` | Already exists in `queries.ts` |
| `listTradingHoldings(kidId)` | `TradingHolding[]` | Already exists in `queries.ts` |
| `listCurrentAndPreviousAssetPrices()` | `Record<string, { current: TradingAssetPrice; previous: TradingAssetPrice \| null }>` | **New query** — fetches the two most recent price rows per symbol in one DB call (ORDER BY price_date DESC LIMIT 20). Powers portfolio value and % change on ticker tiles. |

All three run in parallel with the existing 9 queries. If `getTradingPortfolio` returns null, the other two results are ignored.

The new query is added to `lib/data/queries.ts` and re-exported from `lib/data/stub.ts`.

---

## Widget Registration (`KidHomeWidgets.tsx`)

- Add `"market"` to `SORTABLE_IDS`
- Add `"📈 Nugget Market": "📈 Nugget Market"` to `WIDGET_LABELS`
- Add `market: "full"` to `DEFAULT_WIDTHS`
- `isAvailable("market")` returns `true` always — even with no portfolio (shows CTA)

---

## Widget States

### No portfolio (`tradingPortfolio === null`)

Green gradient card (`#052e16 → #14532d`):
- 📈 emoji (40px)
- Title: "Nugget Market"
- Tagline: "Buy and sell stocks with your stars. Watch your money grow!"
- Button: "Start investing →" (links to `/play/trading?kid=<id>`)

### Has portfolio

Green gradient card, same colour scheme:

**Header row:**
- Left: 📈 + "Nugget Market" (font-black, white)
- Right: "Open →" chip (links to `/play/trading?kid=<id>`)

**Balance row:**
- Left: "Portfolio value" label + total value in nuggets (cash balance + sum of `holding.quantity × currentPrice.priceNuggets` for each holding)
- Right: "Cash" label + `portfolio.nuggetsBalance`

**4 ticker tiles (grid-cols-4):**
- Source: kid's top 4 holdings sorted by current market value (quantity × current price), descending. If fewer than 4 holdings, fill remaining slots with top market movers by absolute % change (highest absolute % change first, excluding any already shown).
- Each tile: asset emoji, symbol (e.g. "MOON"), % change = `(current - previous) / previous × 100`, green if positive, red if negative, grey "—" if no previous price.

---

## Props Threading

`KidHomeWidgetsProps` gains three new optional props:

```ts
tradingPortfolio?: TradingPortfolio | null;
tradingHoldings?: TradingHolding[];
tradingPrices?: Record<string, { current: TradingAssetPrice; previous: TradingAssetPrice | null }>;
```

Optional so existing callers do not break. The home page passes all three. `WidgetContent` case `"market"` reads them.

---

## Files Changed

| File | Change |
|---|---|
| `lib/data/queries.ts` | Add `listCurrentAndPreviousAssetPrices()` |
| `lib/data/stub.ts` | Re-export `listCurrentAndPreviousAssetPrices` |
| `app/kid/[kidId]/home/page.tsx` | Add 3 queries to `Promise.all`; pass new props to `KidHomeWidgets` |
| `components/kid/KidHomeWidgets.tsx` | Register widget; add props; add `WidgetContent` case `"market"` |

---

## Out of Scope

- Today's portfolio gain/loss at the header level (requires previous-day portfolio snapshot — deferred)
- Animated scrolling ticker (deferred)
- Half-width variant design (user can resize in edit mode; content adapts naturally)
