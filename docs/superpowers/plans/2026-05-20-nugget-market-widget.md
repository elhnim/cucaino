# Nugget Market Home Widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sortable "Nugget Market" widget to the kid home page showing portfolio value, cash balance, and 4 ticker tiles, with a "Get started" CTA for kids without a portfolio.

**Architecture:** New query `listCurrentAndPreviousAssetPrices()` fetches 2 price rows per symbol in one DB call. The home page adds 3 queries to its existing `Promise.all` and threads the results as optional props into `KidHomeWidgets`. The widget registers as `"market"` in the existing sortable/hideable system.

**Note:** No test runner is configured. Verification uses `npm run typecheck` and `npm run build` in place of a test suite.

**Tech Stack:** Next.js App Router · TypeScript · Tailwind CSS · Supabase · @dnd-kit

---

### Task 1: Add `listCurrentAndPreviousAssetPrices` query

**Files:**
- Modify: `lib/data/queries.ts` (append after `listTradingLeaderboard`, line ~1241)

- [ ] **Step 1: Add the function**

Append this after the closing brace of `listTradingLeaderboard` at the end of `lib/data/queries.ts`:

```ts
export async function listCurrentAndPreviousAssetPrices(): Promise<
  Record<string, { current: TradingAssetPrice; previous: TradingAssetPrice | null }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trading_asset_prices")
    .select("symbol, price_nuggets, price_date, news_headline, news_body, news_impact, event_pct")
    .order("price_date", { ascending: false })
    .limit(20); // 10 symbols × 2 days
  const map: Record<string, { current: TradingAssetPrice; previous: TradingAssetPrice | null }> = {};
  for (const r of data ?? []) {
    const price: TradingAssetPrice = {
      symbol: r.symbol,
      priceNuggets: r.price_nuggets,
      priceDate: r.price_date,
      newsHeadline: r.news_headline,
      newsBody: r.news_body ?? null,
      newsImpact: r.news_impact as TradingAssetPrice["newsImpact"],
      eventPct: r.event_pct !== null ? Number(r.event_pct) : null,
    };
    if (!map[r.symbol]) {
      map[r.symbol] = { current: price, previous: null };
    } else if (!map[r.symbol].previous) {
      map[r.symbol].previous = price;
    }
  }
  return map;
}
```

- [ ] **Step 2: Verify types**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/data/queries.ts
git commit -m "feat: add listCurrentAndPreviousAssetPrices query"
```

---

### Task 2: Wire trading data into the home page

**Files:**
- Modify: `app/kid/[kidId]/home/page.tsx`

- [ ] **Step 1: Add imports**

In `app/kid/[kidId]/home/page.tsx`, extend the existing import from `@/lib/data/stub` to include the three trading functions:

```ts
import {
  getKid,
  getFamily,
  listTasksForKid,
  listCompletionsToday,
  listBadgeProgress,
  listKids,
  listWeeklyStarsByKid,
  listCustomBadgeProgress,
  listActiveStrikes,
  listWeeklyCompletionCounts,
  listTodayMoodCounts,
  getTradingPortfolio,
  listTradingHoldings,
  listCurrentAndPreviousAssetPrices,
} from "@/lib/data/stub";
```

- [ ] **Step 2: Add queries to `Promise.all`**

Replace the existing `Promise.all` (lines 55–65) with:

```ts
const [
  tasks, completions, badges, allKids, weeklyStars,
  customBadgeProgress, activeStrikes, weeklyCompletions, moodCounts,
  tradingPortfolio, tradingHoldings, tradingPrices,
] = await Promise.all([
  listTasksForKid(kid.id),
  listCompletionsToday(kid.id, tz),
  listBadgeProgress(kid.id),
  listKids(),
  listWeeklyStarsByKid(),
  listCustomBadgeProgress(kid.id),
  listActiveStrikes(kid.id),
  listWeeklyCompletionCounts(kid.id),
  listTodayMoodCounts(kid.id, tz),
  getTradingPortfolio(kid.id),
  listTradingHoldings(kid.id),
  listCurrentAndPreviousAssetPrices(),
]);
```

- [ ] **Step 3: Pass new props to `KidHomeWidgets`**

In the return JSX, add three props to `<KidHomeWidgets>` after the existing `moodCounts` prop:

```tsx
<KidHomeWidgets
  kid={kid}
  theme={{ accent: theme.accent, accentSoft: theme.accentSoft, name: theme.name }}
  done={done}
  total={total}
  allDone={allDone}
  ringOffset={ringOffset}
  taskPct={taskPct}
  incompleteTasks={incompleteTasks}
  todaySchoolTasks={todaySchoolTasks}
  tomorrowActivityTasks={tomorrowActivityTasks}
  badgesInProgress={badgesInProgress}
  customBadgeProgress={customBadgeProgress}
  allKids={allKids}
  weeklyStars={weeklyStars}
  level={{
    emoji: levelDef.emoji,
    name: levelDef.name,
    color: levelDef.color,
    pct: levelPct,
    nextMin: nextLevelDef?.min ?? null,
    nextName: nextLevelDef?.name ?? null,
  }}
  encouragement={encouragement}
  activeStrikes={activeStrikes}
  weeklyCompletions={weeklyCompletions}
  moodCounts={moodCounts}
  tradingPortfolio={tradingPortfolio}
  tradingHoldings={tradingHoldings}
  tradingPrices={tradingPrices}
/>
```

- [ ] **Step 4: Verify types**

```bash
npm run typecheck
```

Expected: type errors on `tradingPortfolio`, `tradingHoldings`, `tradingPrices` props — these don't exist on `KidHomeWidgetsProps` yet. That's expected and fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add "app/kid/[kidId]/home/page.tsx"
git commit -m "feat: add trading data queries to kid home page"
```

---

### Task 3: Add Nugget Market widget to KidHomeWidgets

**Files:**
- Modify: `components/kid/KidHomeWidgets.tsx`

- [ ] **Step 1: Add imports**

At the top of `components/kid/KidHomeWidgets.tsx`, update the type import from `@/lib/domain/types` to include the trading types:

```ts
import type { Kid, Task, BadgeProgress, CustomBadgeProgress, Strike, TradingPortfolio, TradingHolding, TradingAssetPrice } from "@/lib/domain/types";
```

Also add a new import for `TRADING_ASSETS`:

```ts
import { TRADING_ASSETS } from "@/lib/trading/assets";
```

- [ ] **Step 2: Register the widget**

Update the three registration constants:

```ts
const SORTABLE_IDS = ["tasks", "school", "tomorrow", "badges", "race", "level", "encouragement", "streak", "mood", "market"];

const WIDGET_LABELS: Record<string, string> = {
  tasks: "✅ Today's Tasks",
  school: "📚 School Today",
  tomorrow: "🗓 School Tomorrow",
  badges: "🎖 My Badges",
  race: "🏁 Family Race",
  level: "🌱 Profile Level",
  encouragement: "💬 Encouragement",
  streak: "🔥 Streak Calendar",
  mood: "🫙 Mood Jar",
  market: "📈 Nugget Market",
};

const DEFAULT_WIDTHS: Record<string, "full" | "half"> = {
  tasks: "full",
  school: "half",
  tomorrow: "half",
  badges: "full",
  race: "full",
  level: "half",
  encouragement: "half",
  streak: "full",
  mood: "full",
  market: "full",
};
```

- [ ] **Step 3: Extend `KidHomeWidgetsProps`**

Add three optional props to the `KidHomeWidgetsProps` interface after `activeStrikes`:

```ts
export interface KidHomeWidgetsProps {
  kid: Kid;
  theme: { accent: string; accentSoft: string; name: string };
  done: number;
  total: number;
  allDone: boolean;
  ringOffset: number;
  taskPct: number;
  incompleteTasks: Task[];
  todaySchoolTasks: Task[];
  tomorrowActivityTasks: Task[];
  badgesInProgress: BadgeProgress[];
  customBadgeProgress: CustomBadgeProgress[];
  allKids: Kid[];
  weeklyStars: Record<string, number>;
  weeklyCompletions: Record<string, number>;
  moodCounts: Record<string, number>;
  level: LevelData;
  encouragement: string;
  activeStrikes?: Strike[];
  tradingPortfolio?: TradingPortfolio | null;
  tradingHoldings?: TradingHolding[];
  tradingPrices?: Record<string, { current: TradingAssetPrice; previous: TradingAssetPrice | null }>;
}
```

- [ ] **Step 4: Destructure new props in `KidHomeWidgets`**

Add the three new props to the destructure in the `KidHomeWidgets` function body:

```ts
const {
  kid, theme, done, total, allDone, ringOffset, taskPct,
  incompleteTasks, todaySchoolTasks, tomorrowActivityTasks,
  badgesInProgress, customBadgeProgress, allKids, weeklyStars, weeklyCompletions, moodCounts,
  level, encouragement, activeStrikes,
  tradingPortfolio, tradingHoldings, tradingPrices,
} = props;
```

- [ ] **Step 5: Add `isAvailable` case**

Add a `"market"` case that always returns `true`:

```ts
function isAvailable(id: string): boolean {
  switch (id) {
    case "school": return todaySchoolTasks.length > 0;
    case "tomorrow": return tomorrowActivityTasks.length > 0;
    case "badges": return badgesInProgress.length > 0 || customBadgeProgress.length > 0;
    case "race": return allKids.length > 1;
    case "tasks": return total > 0;
    case "market": return true;
    default: return true;
  }
}
```

- [ ] **Step 6: Pass new props through `WidgetContent`**

Add the three new props to the destructure inside `WidgetContent`:

```ts
function WidgetContent({ id, props }: { id: string; props: KidHomeWidgetsProps }) {
  const {
    kid, theme, done, total, allDone, taskPct,
    incompleteTasks, todaySchoolTasks, tomorrowActivityTasks,
    badgesInProgress, customBadgeProgress, allKids, weeklyStars,
    weeklyCompletions, moodCounts, level, encouragement,
    tradingPortfolio, tradingHoldings, tradingPrices,
  } = props;
  // ... existing switch
```

- [ ] **Step 7: Add `case "market"` to `WidgetContent` switch**

Add this case before `default:` in the switch statement:

```tsx
case "market":
  return (
    <NuggetMarketWidget
      kidId={kid.id}
      portfolio={tradingPortfolio ?? null}
      holdings={tradingHoldings ?? []}
      prices={tradingPrices ?? {}}
    />
  );
```

- [ ] **Step 8: Add the `NuggetMarketWidget` component**

Add this function above `WidgetContent` (e.g. after `StreakCalendarWidget`):

```tsx
function NuggetMarketWidget({
  kidId,
  portfolio,
  holdings,
  prices,
}: {
  kidId: string;
  portfolio: TradingPortfolio | null;
  holdings: TradingHolding[];
  prices: Record<string, { current: TradingAssetPrice; previous: TradingAssetPrice | null }>;
}) {
  const cardStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #052e16 0%, #14532d 100%)",
    borderRadius: 16,
    overflow: "hidden",
  };

  if (!portfolio) {
    return (
      <Link href={`/play/trading?kid=${kidId}`} className="block shadow-sm" style={cardStyle}>
        <div className="p-5 flex flex-col items-center text-center gap-3">
          <div className="text-4xl">📈</div>
          <div>
            <div className="text-base font-black text-white mb-1">Nugget Market</div>
            <div className="text-xs leading-snug" style={{ color: "#86efac" }}>
              Buy and sell stocks with your stars.<br />Watch your money grow!
            </div>
          </div>
          <div className="text-xs font-black text-white px-5 py-2 rounded-xl" style={{ background: "#16a34a" }}>
            Start investing →
          </div>
        </div>
      </Link>
    );
  }

  const holdingsValue = holdings.reduce((sum, h) => {
    return sum + h.quantity * (prices[h.assetSymbol]?.current.priceNuggets ?? 0);
  }, 0);
  const totalValue = Math.round(portfolio.nuggetsBalance + holdingsValue);

  const holdingsByValue = [...holdings]
    .map((h) => ({
      symbol: h.assetSymbol,
      value: h.quantity * (prices[h.assetSymbol]?.current.priceNuggets ?? 0),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
    .map((h) => h.symbol);

  const holdingSymbolSet = new Set(holdingsByValue);
  const fillerSymbols = TRADING_ASSETS
    .map((a) => a.symbol)
    .filter((sym) => !holdingSymbolSet.has(sym))
    .sort((a, b) => {
      const pa = prices[a];
      const pb = prices[b];
      const pctA = pa?.previous ? Math.abs((pa.current.priceNuggets - pa.previous.priceNuggets) / pa.previous.priceNuggets) : 0;
      const pctB = pb?.previous ? Math.abs((pb.current.priceNuggets - pb.previous.priceNuggets) / pb.previous.priceNuggets) : 0;
      return pctB - pctA;
    });

  const tickerSymbols = [...holdingsByValue, ...fillerSymbols].slice(0, 4);

  return (
    <Link href={`/play/trading?kid=${kidId}`} className="block shadow-sm" style={cardStyle}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📈</span>
            <span className="text-sm font-black text-white">Nugget Market</span>
          </div>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ color: "#86efac", background: "rgba(255,255,255,0.1)" }}
          >
            Open →
          </span>
        </div>

        <div className="flex items-end gap-4 mb-3">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "#86efac" }}>
              Portfolio value
            </div>
            <div className="text-2xl font-black text-white">🪙 {totalValue.toLocaleString()}</div>
          </div>
          <div className="ml-auto text-right pb-0.5">
            <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "#86efac" }}>
              Cash
            </div>
            <div className="text-sm font-black text-white">
              🪙 {portfolio.nuggetsBalance.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {tickerSymbols.map((sym) => {
            const asset = TRADING_ASSETS.find((a) => a.symbol === sym);
            const p = prices[sym];
            const pct = p?.previous
              ? ((p.current.priceNuggets - p.previous.priceNuggets) / p.previous.priceNuggets) * 100
              : null;
            const pctColor = pct === null ? "#9ca3af" : pct >= 0 ? "#86efac" : "#fca5a5";
            const pctText = pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
            return (
              <div
                key={sym}
                className="rounded-xl px-2 py-1.5 text-center"
                style={{ background: "rgba(255,255,255,0.1)" }}
              >
                <div className="text-base">{asset?.emoji ?? "📊"}</div>
                <div className="text-[9px] font-black text-white">{sym}</div>
                <div className="text-[9px] font-bold" style={{ color: pctColor }}>{pctText}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 9: Verify types and build**

```bash
npm run typecheck
```

Expected: no errors.

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 10: Smoke test in dev**

```bash
npm run dev
```

Navigate to `http://localhost:3000/kid/<any-kidId>/home`. Verify:
- The Nugget Market widget appears in the grid (green gradient card).
- If the kid has no portfolio: "Start investing →" CTA is shown. Tapping navigates to `/play/trading?kid=<id>`.
- If the kid has a portfolio: portfolio value, cash, and 4 ticker tiles are shown with correct symbols.
- Widget can be hidden/shown and reordered in edit mode (click "✏️ Edit layout").

- [ ] **Step 11: Commit**

```bash
git add components/kid/KidHomeWidgets.tsx
git commit -m "feat: add Nugget Market widget to kid home page"
```
