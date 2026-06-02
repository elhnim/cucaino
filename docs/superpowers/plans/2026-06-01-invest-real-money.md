# Invest (real-money, real-price investing) — Implementation Plan

> **For agentic workers:** Execute task-by-task in order. Steps use checkbox (`- [ ]`) syntax.
> Executor = **Codex** (stateless): every task lists exact file paths, the existing file to clone
> from, the interfaces/code for non-obvious logic, and exact verification commands. Do NOT rely on
> conversation memory — everything needed is in the task block or the referenced files.

**Goal:** Ship a new kid-side "Invest" game where kids move real cash into an invest account and
buy/sell real stocks & crypto at real daily prices, gated behind a learn-to-unlock "Investor Licence",
with per-asset educational "About" content.

**Architecture:** Family-ledger mirror (no real brokerage). Clones the existing **Nugget Market**
(`/play/trading`) architecture: lazy daily price cache, server-authoritative pricing, RLS
family-scoped tables, optimistic UI with `revalidatePath`. Distinct indigo/slate "financial-but-
friendly" visual identity. New tables `invest_*` + `real_asset_prices`; new lib `lib/invest/*`; new
components `components/invest/*`; new route `/play/invest`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind, Supabase (Postgres + RLS), Netlify,
`@anthropic-ai/sdk` (Haiku news), external price APIs (Finnhub / Yahoo unofficial / CoinGecko).

**Spec:** `docs/superpowers/specs/2026-06-01-invest-real-money-design.md` (source of truth).
**Mockups:** `mockups/2026-06-01-invest-real-money/` (18 HTML files; match these visually).

**Global rules:**
- All money is **integer cents in app cash currency**; quantities are `numeric`/JS `number` with
  crypto-grade decimals. Never use floats for cents.
- Server actions: `"use server"`, verify the caller owns `kidId` (clone the ownership check from
  `lib/actions/trading.ts`), re-check `investing_enabled`, mutate dependent record first then balance,
  `revalidatePath` the invest route. Never trust client-sent prices/scores.
- After any schema work, regenerate `lib/supabase/database.types.ts`.
- Verify after every task: `npm run typecheck` then (for UI/build-affecting tasks) `npm run build`.
  Both must be clean. Commit after each task with the given message.
- Do NOT ship the mockup CSS verbatim — build Tailwind/React equivalents that match the look.

**Reference files to read before starting (clone/follow these):**
- DB: `supabase/migrations/0029_trading_simulator.sql`, `0030_trading_rls_fix.sql`,
  `0031_trading_price_insert_policy.sql`, `0018_cash_balance.sql`, `0034_arcade_sparks.sql`,
  `0006_gamification.sql`, `0011_badge_redesign.sql`, `0019_custom_badges.sql`
- Lib: `lib/trading/assets.ts`, `lib/trading/prices.ts`, `lib/trading/news-templates.ts`,
  `lib/actions/trading.ts`, `lib/actions/cash.ts`, `lib/actions/arcade.ts`, `lib/actions/badges.ts`,
  `lib/data/queries.ts`, `lib/data/stub.ts`, `lib/domain/types.ts`, `lib/supabase/server.ts`
- UI: `app/play/trading/page.tsx`, `components/trading/*` (Hub, MarketTab, PortfolioTab,
  AssetDetailSheet, DepositWithdrawModal, TradingOnboarding, PriceSparkline, PriceHistoryChart),
  `components/kid/KidShell*`, `app/kid/[kidId]/play/page.tsx`,
  `app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx`

---

## Phase 0 — Branch & environment

### Task 0: Create branch and document env

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Create the feature branch**

Run:
```bash
git checkout -b feat/invest-real-money
```

- [ ] **Step 2: Document the Finnhub key in `.env.example`**

Append to `.env.example`:
```
# Invest feature — Finnhub free tier (US stock quotes + company news). Server-only.
# Get a free key at https://finnhub.io . CoinGecko + Yahoo need no key.
FINNHUB_API_KEY=
```

- [ ] **Step 3: Confirm `.env.local` has the key (do NOT commit it)**

`.env.local` must contain `FINNHUB_API_KEY=<value>` (already git-ignored). If absent, the pipeline
falls back to keeping/no rows for US stocks; crypto + ASX still work. Do not print the key.

- [ ] **Step 4: Commit**
```bash
git add .env.example
git commit -m "chore(invest): document FINNHUB_API_KEY env var"
```

---

## Phase 1 — Database & types

### Task 1: Migration `0041_invest_simulator.sql`

**Files:**
- Create: `supabase/migrations/0041_invest_simulator.sql`

Clone table + RLS shape from `0029_trading_simulator.sql` (+ the `0030`/`0031` RLS fixes folded in).
All `invest_*` tables are **RLS family-scoped** via the family of the row's `kid_id`; the
`real_asset_prices` table is global-readable by authenticated users and writable by the service path
(mirror `0031_trading_price_insert_policy.sql`).

- [ ] **Step 1: Verify `0041` is unused**

Run:
```bash
ls supabase/migrations/ | grep 0041
```
Expected: no output (free). If taken, use the next free number and update all references in this plan.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0041_invest_simulator.sql` with:

```sql
-- Invest (real-money, real-price) simulator. Sibling to trading_* (Nugget Market).

-- 0. Per-kid enable flag
alter table public.kids
  add column if not exists investing_enabled boolean not null default false;

-- 1. Invest accounts (one per kid)
create table if not exists public.invest_accounts (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  cash_cents bigint not null default 0,
  total_deposited_cents bigint not null default 0,
  total_withdrawn_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kid_id)
);

-- 2. Holdings (one per kid+asset)
create table if not exists public.invest_holdings (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  asset_symbol text not null,
  quantity numeric(30,12) not null default 0,
  avg_cost_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kid_id, asset_symbol)
);

-- 3. Transactions (ledger)
create table if not exists public.invest_transactions (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  type text not null check (type in ('deposit','withdraw','buy','sell')),
  asset_symbol text,
  quantity numeric(30,12),
  price_cents bigint,
  total_cents bigint not null,
  created_at timestamptz not null default now()
);

-- 4. Daily real prices (global cache)
create table if not exists public.real_asset_prices (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  asset_type text not null check (asset_type in ('stock','crypto')),
  price_cents bigint not null,
  prev_close_cents bigint not null,
  change_pct numeric(10,4) not null default 0,
  quote_currency text not null default 'USD',
  fx_rate_to_cash numeric(18,8) not null default 1,
  news_headline text,
  news_body text,
  news_url text,
  news_impact text,
  price_date date not null,
  created_at timestamptz not null default now(),
  unique (symbol, price_date)
);
create index if not exists real_asset_prices_symbol_date_idx
  on public.real_asset_prices (symbol, price_date desc);

-- 5. Investor licences (one per kid)
create table if not exists public.invest_licences (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  lessons_completed jsonb not null default '[]'::jsonb,
  best_score int not null default 0,
  attempts int not null default 0,
  passed_at timestamptz,
  rewarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kid_id)
);

-- RLS
alter table public.invest_accounts enable row level security;
alter table public.invest_holdings enable row level security;
alter table public.invest_transactions enable row level security;
alter table public.invest_licences enable row level security;
alter table public.real_asset_prices enable row level security;

-- Family-scoped policies for the per-kid tables.
-- IMPORTANT: copy the EXACT family-membership predicate used in 0029/0030 for trading_* so the
-- policies match this codebase's helper (e.g. a `family_id in (select ... from family_members ...)`
-- subquery or a SECURITY DEFINER helper). Apply the same predicate to all four invest_* tables for
-- select/insert/update/delete.
-- Example shape (ADAPT to match 0029_trading_simulator.sql precisely):
create policy invest_accounts_family on public.invest_accounts
  for all using (family_id = any (public.current_user_family_ids()))
  with check (family_id = any (public.current_user_family_ids()));
create policy invest_holdings_family on public.invest_holdings
  for all using (family_id = any (public.current_user_family_ids()))
  with check (family_id = any (public.current_user_family_ids()));
create policy invest_transactions_family on public.invest_transactions
  for all using (family_id = any (public.current_user_family_ids()))
  with check (family_id = any (public.current_user_family_ids()));
create policy invest_licences_family on public.invest_licences
  for all using (family_id = any (public.current_user_family_ids()))
  with check (family_id = any (public.current_user_family_ids()));

-- real_asset_prices: readable by all authenticated users; INSERT-only writes (mirror 0031).
-- UPDATE is intentionally excluded: once a (symbol, price_date) row exists, the first writer wins via
-- ignoreDuplicates:true. Do not add an UPDATE policy unless the spec changes.
create policy real_asset_prices_read on public.real_asset_prices
  for select using (auth.role() = 'authenticated');
create policy real_asset_prices_write on public.real_asset_prices
  for insert with check (auth.uid() is not null);
```

> NOTE: `public.current_user_family_ids()` is illustrative. Open `0029_trading_simulator.sql` and use
> the **identical** family-scoping mechanism it uses (helper function name or inline subquery). Do not
> invent a new helper if one already exists.

- [ ] **Step 3: Apply the migration to the linked Supabase project**

Apply via the project's normal mechanism (Supabase MCP `apply_migration`, or `supabase db push` if the
CLI is linked). Confirm all five tables + the `kids.investing_enabled` column exist.

- [ ] **Step 4: Regenerate types**

Regenerate `lib/supabase/database.types.ts` (Supabase MCP `generate_typescript_types`, or
`supabase gen types typescript`). Confirm the new tables appear in the file.

- [ ] **Step 5: Typecheck + commit**
```bash
npm run typecheck
git add supabase/migrations/0041_invest_simulator.sql lib/supabase/database.types.ts
git commit -m "feat(invest): add invest_* tables, real_asset_prices, licences + RLS (0041)"
```

### Task 2: Domain types

**Files:**
- Modify: `lib/domain/types.ts`

- [ ] **Step 1: Add Invest domain types**

Append to `lib/domain/types.ts` (camelCase mirrors of the DB rows, following the file's existing
style):

```ts
export type AssetType = "stock" | "crypto";
export type AssetCategory = "popular" | "games" | "tech" | "food" | "australian" | "crypto";

export interface AssetAbout {
  story: string;
  facts: { label: string; value: string }[]; // exactly 3
  whyGreat: { emoji: string; text: string }[]; // 2-3
  didYouKnow: string;
}

export interface RealAsset {
  symbol: string;
  name: string;
  ticker: string;
  exchange: string; // "NASDAQ" | "NYSE" | "ASX" | "Crypto"
  emoji: string;
  assetType: AssetType;
  categories: AssetCategory[];
  source: "finnhub" | "yahoo" | "coingecko";
  sourceId: string;
  description: string;
  about?: AssetAbout;
}

export interface RealAssetPrice {
  symbol: string;
  assetType: AssetType;
  priceCents: number;
  prevCloseCents: number;
  changePct: number;
  quoteCurrency: string;
  fxRateToCash: number;
  newsHeadline: string | null;
  newsBody: string | null;
  newsUrl: string | null;
  newsImpact: string | null;
  priceDate: string; // ISO date
}

export interface InvestAccount {
  kidId: string;
  familyId: string;
  cashCents: number;
  totalDepositedCents: number;
  totalWithdrawnCents: number;
}

export interface InvestHolding {
  kidId: string;
  familyId: string;
  assetSymbol: string;
  quantity: number;
  avgCostCents: number;
}

export type InvestTxType = "deposit" | "withdraw" | "buy" | "sell";
export interface InvestTransaction {
  id: string;
  kidId: string;
  familyId: string;
  type: InvestTxType;
  assetSymbol: string | null;
  quantity: number | null;
  priceCents: number | null;
  totalCents: number;
  createdAt: string;
}

export interface InvestLicence {
  kidId: string;
  familyId: string;
  lessonsCompleted: string[];
  bestScore: number;
  attempts: number;
  passedAt: string | null;
  rewarded: boolean;
}

export type LessonSection = "basics" | "deeper" | "safe";
export type LessonBlock =
  | { kind: "para"; text: string }
  | { kind: "illustration"; emoji: string; caption: string }
  | { kind: "keyIdea"; text: string }
  | { kind: "example"; emoji: string; text: string }
  | { kind: "didYouKnow"; text: string };

export interface Lesson {
  id: string;
  section: LessonSection;
  required: boolean;
  order: number;
  title: string;
  emoji: string;
  minutes: number;
  blurb: string;
  body: LessonBlock[];
  check?: { question: string; options: string[]; correctIndex: number; correctNote: string };
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explainer: string;
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
npm run typecheck
git add lib/domain/types.ts
git commit -m "feat(invest): add Invest domain types"
```

---

## Phase 2 — Static content registries

### Task 3: Asset registry `lib/invest/assets.ts`

**Files:**
- Create: `lib/invest/assets.ts`

Follow the shape of `lib/trading/assets.ts`. Encode all ~55 assets from spec §5 with `symbol`, `name`,
`ticker`, `exchange`, `emoji`, `assetType`, `categories`, `source`, `sourceId`, `description`. Author
`about` blocks (AssetAbout) for **every `popular` asset and every crypto asset** from spec §5:
AAPL, TSLA, DIS, RBLX, MCD, NKE, NFLX, AMZN, RACE, BTC, ETH, DOGE, SOL, ADA. Also include NTDOY
because the mockups/spec call it out as a recognizable educational example. Use the Bitcoin + Roblox
copy from mockups `06`/`07` verbatim as the tone/shape template.

- [ ] **Step 1: Write the registry**

```ts
import type { RealAsset } from "@/lib/domain/types";

export const MIN_TRADE_CENTS = 50; // $0.50 minimum trade

export const REAL_ASSETS: RealAsset[] = [
  // US / global stocks (source: finnhub, sourceId = ticker)
  { symbol: "AAPL", name: "Apple", ticker: "AAPL", exchange: "NASDAQ", emoji: "🍎",
    assetType: "stock", categories: ["popular","tech"], source: "finnhub", sourceId: "AAPL",
    description: "Makes iPhones, iPads and Macs.",
    about: {
      story: "Apple started in 1976 in a garage. Steve Jobs and Steve Wozniak wanted to make computers anyone could use.",
      facts: [ { label: "Founded", value: "1976" }, { label: "From", value: "California 🇺🇸" }, { label: "Makes", value: "Phones & computers" } ],
      whyGreat: [
        { emoji: "📱", text: "The iPhone changed how the whole world uses phones." },
        { emoji: "🎨", text: "Famous for simple designs that just work." },
      ],
      didYouKnow: "Apple was once nearly out of money — today it's one of the most valuable companies ever.",
    } },
  // ... encode the remaining US stocks from spec §5 (TSLA, DIS, RBLX, MCD, NKE, MSFT, NFLX, AMZN,
  // GOOGL, NTDOY, SONY, KO, PEP, SPOT, META, NVDA, MAT, HAS, SBUX, CMG, DPZ, HSY, CROX, LULU, RACE,
  // BBW, EA, ABNB, UBER, V, WMT, TGT, GPRO, COST) with category tags from the spec.
  // Australian stocks (source: yahoo, sourceId = "<TICKER>.AX", exchange "ASX", categories ["australian"]):
  { symbol: "CBA", name: "Commonwealth Bank", ticker: "CBA", exchange: "ASX", emoji: "🏦",
    assetType: "stock", categories: ["australian"], source: "yahoo", sourceId: "CBA.AX",
    description: "One of Australia's biggest banks." },
  // ... BHP, CSL, WOW, WES, TLS, QAN, JBH, DMP, A2M, COL, RIO, FMG, XRO, COH
  // Crypto (source: coingecko, sourceId = coingecko id, exchange "Crypto", categories ["crypto"]):
  { symbol: "BTC", name: "Bitcoin", ticker: "BTC", exchange: "Crypto", emoji: "₿",
    assetType: "crypto", categories: ["crypto"], source: "coingecko", sourceId: "bitcoin",
    description: "The first and most famous digital money.",
    about: {
      story: "Bitcoin is the world's first digital money. In 2009 an inventor known only as \"Satoshi Nakamoto\" launched it as money no single bank or country controls.",
      facts: [ { label: "Started", value: "2009" }, { label: "Type", value: "Cryptocurrency" }, { label: "Max ever", value: "21 million" } ],
      whyGreat: [
        { emoji: "🌍", text: "Anyone, anywhere can send it directly to anyone else — no bank in the middle." },
        { emoji: "🔒", text: "Protected by very hard maths, so it's extremely hard to fake." },
        { emoji: "💎", text: "There will only ever be 21 million — so some treat it like digital gold." },
      ],
      didYouKnow: "The very first thing bought with Bitcoin was two pizzas — for 10,000 coins!",
    } },
  // ... ETH, DOGE, SOL, ADA
];

export const ASSET_CATEGORIES: { key: "all" | import("@/lib/domain/types").AssetCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "popular", label: "⭐ Popular" },
  { key: "games", label: "🎮 Games" },
  { key: "tech", label: "💻 Tech" },
  { key: "food", label: "🍔 Food & Shops" },
  { key: "australian", label: "🇦🇺 Australian" },
  { key: "crypto", label: "🪙 Crypto" },
];

export function getAsset(symbol: string): RealAsset | undefined {
  return REAL_ASSETS.find((a) => a.symbol === symbol);
}
```

> Encode **every** asset listed in spec §5 (do not leave `// ...` placeholders in the shipped file).
> Add `about` for every required symbol listed above. Roblox (RBLX) `about` uses the Roblox copy from
> mockup `07` verbatim.

- [ ] **Step 2: Typecheck + commit**
```bash
npm run typecheck
git add lib/invest/assets.ts
git commit -m "feat(invest): add REAL_ASSETS registry with About content"
```

### Task 4: Learn content `lib/invest/learn.ts`

**Files:**
- Create: `lib/invest/learn.ts`

- [ ] **Step 1: Write the lessons, quiz, glossary, thresholds**

Author the 8 lessons (spec §8.2) and 5 quiz questions. Use the mockup `14` lesson ("What is a stock?"
— pizza analogy, key idea, example, quick-check) and mockup `15` quiz question (demand → price up,
with "Why?" explainer) verbatim as the canonical examples; author the rest in the same friendly,
concrete tone. Mark the 4 basics `required: true, section: "basics"`.

```ts
import type { Lesson, QuizQuestion } from "@/lib/domain/types";

export const LICENCE_PASS_THRESHOLD = 4; // of 5
export const SMART_INVESTOR_SPARKS = 50;

export const LESSONS: Lesson[] = [
  { id: "what-is-investing", section: "basics", required: true, order: 1,
    title: "What is investing?", emoji: "💡", minutes: 2, blurb: "the big idea", body: [ /* blocks */ ] },
  { id: "what-is-a-stock", section: "basics", required: true, order: 2,
    title: "What is a stock?", emoji: "🏢", minutes: 2, blurb: "owning a slice",
    body: [
      { kind: "illustration", emoji: "🍕", caption: "A company is like a pizza" },
      { kind: "para", text: "Imagine a company is a big pizza. A stock (also called a share) is one slice. When you buy a share, you own a tiny piece of the whole company!" },
      { kind: "para", text: "If lots of people want slices of that company — because it's doing well — the slices become worth more. If it struggles, they can be worth less." },
      { kind: "keyIdea", text: "Owning a share means you own a small piece of a real company — and you share in its ups and downs." },
      { kind: "example", emoji: "🎮", text: "If you buy one share of Roblox, you own a tiny slice of the whole Roblox company." },
    ],
    check: { question: "What do you get when you buy a share?",
      options: ["A free toy from the company", "A tiny piece of the company 🍕", "A coupon for the shops"],
      correctIndex: 1, correctNote: "A share = a small piece of the company." } },
  { id: "what-is-crypto", section: "basics", required: true, order: 3, title: "What is crypto?", emoji: "₿", minutes: 3, blurb: "digital money", body: [ /* blocks */ ] },
  { id: "why-prices-move", section: "basics", required: true, order: 4, title: "Why prices go up & down", emoji: "📈", minutes: 3, blurb: "supply & demand", body: [ /* blocks */ ] },
  { id: "diversify", section: "deeper", required: false, order: 5, title: "Don't put all eggs in one basket", emoji: "🧺", minutes: 3, blurb: "spreading risk", body: [ /* blocks */ ] },
  { id: "long-term", section: "deeper", required: false, order: 6, title: "Slow and steady wins", emoji: "⏳", minutes: 2, blurb: "thinking long-term", body: [ /* blocks */ ] },
  { id: "can-lose", section: "safe", required: false, order: 7, title: "You can lose money too", emoji: "⚠️", minutes: 2, blurb: "risk is real", body: [ /* blocks */ ] },
  { id: "think-first", section: "safe", required: false, order: 8, title: "Think before you buy", emoji: "🧠", minutes: 3, blurb: "smart habits", body: [ /* blocks */ ] },
];

export const LICENCE_QUIZ: QuizQuestion[] = [
  { id: "q-demand", question: "If lots of people want to buy a company's shares, what usually happens to the price?",
    options: ["The price goes down", "The price goes up 📈", "Nothing ever changes", "The company gives it away free"],
    correctIndex: 1, explainer: "When more people want something than there is to go around, it becomes more valuable. That's demand." },
  // ... 4 more covering: what a share is, what crypto is, that prices can fall (risk), diversification
];

export const REQUIRED_LESSON_IDS = LESSONS.filter((l) => l.required).map((l) => l.id);

export const GLOSSARY: { term: string; def: string }[] = [
  { term: "Share", def: "A small piece of a company you can own." },
  { term: "Crypto", def: "Digital money that lives on computers around the world." },
  { term: "Profit", def: "Money you make when you sell for more than you paid." },
  { term: "Risk", def: "The chance you could lose money instead of making it." },
  // add a few more
];
```

> Fill every lesson `body` array (no empty `[ /* blocks */ ]` in the shipped file) and all 5 quiz
> questions. Keep language age-appropriate and concrete.

- [ ] **Step 2: Typecheck + commit**
```bash
npm run typecheck
git add lib/invest/learn.ts
git commit -m "feat(invest): add crash-course lessons, licence quiz, glossary"
```

---

## Phase 3 — Pure money math

### Task 5: `lib/invest/math.ts` with documented assertions

**Files:**
- Create: `lib/invest/math.ts`

Pure, no I/O. All cents are integers (use `Math.round` at boundaries). Quantities are JS numbers with
decimals.

- [ ] **Step 1: Write the math module + inline example assertions**

```ts
// Pure money math for Invest. All *_cents are integer app-cash cents. No I/O.

/** Fractional quantity bought for a dollar amount at a price. */
export function quantityForAmount(amountCents: number, priceCents: number): number {
  if (priceCents <= 0) return 0;
  return amountCents / priceCents;
}

/** Weighted average cost after adding `addQty` at `addPriceCents` to an existing position. */
export function newAvgCostCents(
  existingQty: number, existingAvgCents: number, addQty: number, addPriceCents: number,
): number {
  const totalQty = existingQty + addQty;
  if (totalQty <= 0) return 0;
  const totalCost = existingQty * existingAvgCents + addQty * addPriceCents;
  return Math.round(totalCost / totalQty);
}

/** Current value (cents) of a holding at today's price. */
export function holdingValueCents(quantity: number, priceCents: number): number {
  return Math.round(quantity * priceCents);
}

/** Unrealized P&L (cents) vs average cost. */
export function unrealizedPnlCents(quantity: number, priceCents: number, avgCostCents: number): number {
  return Math.round(quantity * (priceCents - avgCostCents));
}

/** Cash proceeds (cents) from selling `sellQty` at `priceCents`. */
export function proceedsCents(sellQty: number, priceCents: number): number {
  return Math.round(sellQty * priceCents);
}

/** Quantity to sell for a target dollar amount (capped at owned). */
export function sellQuantityForAmount(amountCents: number, priceCents: number, ownedQty: number): number {
  if (priceCents <= 0) return 0;
  return Math.min(ownedQty, amountCents / priceCents);
}

/** Percent change as a ratio (e.g. 0.012 = +1.2%). */
export function changePct(priceCents: number, prevCloseCents: number): number {
  if (prevCloseCents <= 0) return 0;
  return (priceCents - prevCloseCents) / prevCloseCents;
}

/** A quantity/value this small is rounding dust → treat the holding as closed. */
export const DUST_VALUE_CENTS = 1;
export function isDust(quantity: number, priceCents: number): boolean {
  return holdingValueCents(quantity, priceCents) < DUST_VALUE_CENTS || quantity <= 0;
}

/* ── Example-based assertions (acceptance §14.2). These are documented expectations:
 * quantityForAmount(200, 67940_00) → 200 / 6794000 ≈ 0.0000294
 * newAvgCostCents(0, 0, 1, 3750) → 3750
 * newAvgCostCents(1, 3750, 1, 4188) → 3969
 * holdingValueCents(0.08, 4188) → 335
 * unrealizedPnlCents(0.08, 4188, 3750) → 35
 * changePct(20134, 19895) → ~0.0120
 * isDust(0.0000000001, 6794000) → true
 */
```

- [ ] **Step 2: Verify the documented assertions**

Because the repo has no test runner, verify the commented examples in the file itself. Check each
expected value below against the implemented formulas, then rely on `npm run typecheck` as the
machine check:
- `quantityForAmount(200, 67940_00)` is `200 / 6794000`, approximately `0.0000294`.
- `newAvgCostCents(0, 0, 1, 3750)` is `3750`.
- `newAvgCostCents(1, 3750, 1, 4188)` is `3969`.
- `holdingValueCents(0.08, 4188)` is `335`.
- `unrealizedPnlCents(0.08, 4188, 3750)` is `35`.
- `changePct(20134, 19895)` is approximately `0.0120`.
- `isDust(0.0000000001, 6794000)` is `true`.

- [ ] **Step 3: Typecheck + commit**
```bash
npm run typecheck
git add lib/invest/math.ts
git commit -m "feat(invest): pure money math with documented assertions"
```

---

## Phase 4 — Price + news pipeline

### Task 6: News rewriter `lib/invest/news.ts`

**Files:**
- Create: `lib/invest/news.ts`

Use `@anthropic-ai/sdk` with model `claude-haiku-4-5-20251001`. Follow how the repo already constructs
an Anthropic client (search for `new Anthropic(` / `ANTHROPIC_API_KEY` usage; reuse that pattern and
env var). Reference `lib/trading/news-templates.ts` for the news caching/shape conventions.

- [ ] **Step 1: Write the news module**

```ts
import Anthropic from "@anthropic-ai/sdk";

export interface KidNews { headline: string; body: string; url: string | null; }

/** Fetch + kid-rewrite news for one asset. Returns null on any failure (caller renders no news). */
export async function fetchKidNews(args: {
  symbol: string; name: string; assetType: "stock" | "crypto"; sourceId: string;
}): Promise<KidNews | null> {
  try {
    const raw = await fetchRawNews(args); // Finnhub company-news (stocks) / crypto news category
    if (!raw) return null;
    const rewritten = await rewriteForKids(args.name, raw.headline, raw.summary);
    return { headline: rewritten.headline, body: rewritten.body, url: raw.url ?? null };
  } catch {
    return null;
  }
}

async function fetchRawNews(args: { assetType: "stock" | "crypto"; sourceId: string; }):
  Promise<{ headline: string; summary: string; url?: string } | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  // stocks: GET https://finnhub.io/api/v1/company-news?symbol=<sourceId>&from=<7d ago>&to=<today>&token=KEY
  // crypto: GET https://finnhub.io/api/v1/news?category=crypto&token=KEY  (filter by name if possible)
  // pick the most recent item with a headline+summary; return null if none.
  // ...implement with fetch + try/catch...
  return null;
}

async function rewriteForKids(name: string, headline: string, summary: string):
  Promise<{ headline: string; body: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt =
    `Rewrite this financial news for a 9-year-old as JSON {"headline","body"}.\n` +
    `Company/coin: ${name}\nHeadline: ${headline}\nSummary: ${summary}\n` +
    `Rules: friendly + simple; 1 short headline; 1-2 sentence body; skip anything not kid-appropriate; ` +
    `do NOT say whether it's good or bad for the price.`;
  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001", max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return { headline: String(json.headline), body: String(json.body) };
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
npm run typecheck
git add lib/invest/news.ts
git commit -m "feat(invest): kid-safe news fetch + Haiku rewrite"
```

### Task 7: Price pipeline `lib/invest/prices.ts`

**Files:**
- Create: `lib/invest/prices.ts`

Clone the structure of `lib/trading/prices.ts:ensureDailyPrices` (proxy-check, per-asset try/catch,
upsert with `onConflict: "symbol,price_date", ignoreDuplicates: true`). Implement spec §6 exactly,
including FX (USD→cash) and the failure rule (keep yesterday's row; never write mixed-currency).

- [ ] **Step 1: Write the pipeline**

Key signatures (fill bodies per spec §6 steps 1–8):
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { REAL_ASSETS } from "@/lib/invest/assets";
import { fetchKidNews } from "@/lib/invest/news";
import { changePct } from "@/lib/invest/math";

/** Lazy daily refresh. Non-blocking; never throws. Proxy-checks BTC for today. */
export async function ensureDailyRealPrices(supabase: SupabaseClient): Promise<void> { /* ... */ }

/** USD→app-cash multiplier for today (Yahoo AUDUSD=X inverted). Returns null on failure. */
async function fetchUsdToCashRate(): Promise<number | null> { /* ... */ }

async function fetchCryptoPrices(): Promise<Map<string, { priceUsd: number; prevCloseUsd: number }>> { /* CoinGecko /simple/price */ }
async function fetchFinnhubQuote(sourceId: string): Promise<{ c: number; pc: number } | null> { /* /quote */ }
async function fetchYahooClose(sourceId: string): Promise<{ price: number; prevClose: number } | null> { /* /v8/finance/chart */ }
```

Rules to honor in `ensureDailyRealPrices`:
- Proxy check: if `real_asset_prices` has a row where `symbol='BTC'` and `price_date=today` → return.
- Fetch `usdToCash` once; if null, **skip USD-quoted assets** (US stocks + crypto) this run (keep
  yesterday's rows) but still process ASX.
- Per asset: compute `price_cents`/`prev_close_cents` in app cash after FX (`Math.round(priceUsd *
  usdToCash * 100)`); ASX uses `fx_rate_to_cash = 1`, `quote_currency = "AUD"`. Compute `change_pct`
  via `changePct`. Throttle Finnhub (chunk with ~250ms gaps) to respect 60/min.
- News only for stocks (US) + crypto via `fetchKidNews`; ASX news omitted.
- Upsert one row/asset for today. On per-asset failure, skip (leave prior row).
- Wrap everything so the function never throws.

- [ ] **Step 2: Typecheck + commit**
```bash
npm run typecheck
git add lib/invest/prices.ts
git commit -m "feat(invest): daily real-price pipeline (Finnhub/Yahoo/CoinGecko + FX + news)"
```

---

## Phase 5 — Queries

### Task 8: Invest queries in `lib/data/queries.ts` + `stub.ts`

**Files:**
- Modify: `lib/data/queries.ts`
- Modify: `lib/data/stub.ts`

Follow the existing query style in `queries.ts` (server Supabase client via `lib/supabase/server.ts`,
map snake_case rows → camelCase domain types). Re-export each new function from `stub.ts`.

- [ ] **Step 1: Add query functions**

Implement and export:
```ts
export async function getInvestAccount(kidId: string): Promise<InvestAccount | null>;
export async function ensureInvestAccount(kidId: string): Promise<InvestAccount>; // create row if missing
export async function listInvestHoldings(kidId: string): Promise<InvestHolding[]>;
export async function listInvestTransactions(kidId: string, limit?: number): Promise<InvestTransaction[]>;
export async function getTodayRealPrices(): Promise<RealAssetPrice[]>; // latest row per symbol (today or most recent)
export async function getRealPriceHistory(symbol: string, days?: number): Promise<RealAssetPrice[]>;
export async function getInvestLicence(kidId: string): Promise<InvestLicence | null>;
export async function ensureInvestLicence(kidId: string): Promise<InvestLicence>; // create row if missing
export async function getKidInvestingEnabled(kidId: string): Promise<boolean>;
```

`getTodayRealPrices`: select rows for the max available `price_date` per symbol (today if present,
else most recent), so the UI always has a usable price set when one exists.

- [ ] **Step 2: Re-export from `stub.ts`**

Add the matching re-exports to `lib/data/stub.ts` (mirror how existing trading queries are re-exported).

- [ ] **Step 3: Typecheck + commit**
```bash
npm run typecheck
git add lib/data/queries.ts lib/data/stub.ts
git commit -m "feat(invest): data-layer queries for accounts, holdings, prices, licences"
```

---

## Phase 6 — Server actions

### Task 9: `lib/actions/invest.ts` — money actions

**Files:**
- Create: `lib/actions/invest.ts`

Clone ownership check, write-order, optimistic-revert, and `fetchTodayPrice`-style server pricing from
`lib/actions/trading.ts`. Use `increment_kid_cash` RPC + `logCashTransaction` from `lib/actions/cash.ts`
for cash movements. Use `lib/invest/math.ts` for all arithmetic. Server-authoritative price = read the
cached `real_asset_prices` row for the symbol (today/most recent) — never trust client price.

- [ ] **Step 1: Implement deposit / withdraw / buy / sell**

```ts
"use server";
// signatures:
export async function depositToInvest(kidId: string, amountCents: number): Promise<ActionResult>;
export async function withdrawFromInvest(kidId: string, amountCents: number): Promise<ActionResult>;
export async function buyAsset(kidId: string, symbol: string, amountCents: number): Promise<ActionResult>;
export async function sellAsset(kidId: string, symbol: string, opts: { amountCents?: number; all?: boolean }): Promise<ActionResult>;
```

Guards (reject with a friendly message; see spec §9.1 / §10 / §11):
- All: verify caller owns `kidId`; `ensureInvestAccount`; read `kids.investing_enabled` fresh and
  reject when false. Parent-disabled Invest is a full server-side lock for deposit, withdraw, buy, and
  sell; the licence gate below applies only to buying.
- Deposit: `amountCents ≥ MIN_TRADE_CENTS`; `amountCents ≤ kids.cash_balance`. Debit cash via
  `increment_kid_cash(-amount)` + `logCashTransaction(... 'invest_deposit')`; credit
  `invest_accounts.cash_cents`; insert `invest_transactions` (type `deposit`). **No licence needed
  when Invest is parent-enabled.**
- Withdraw: `amountCents ≤ invest_accounts.cash_cents`. Credit cash via `increment_kid_cash(+amount)` +
  `logCashTransaction`; debit account; insert tx (`withdraw`). **No licence needed when Invest is
  parent-enabled.**
- Buy: **require `investing_enabled` AND `invest_licences.passed_at != null`** (read fresh, server-
  side). `amountCents ≥ MIN_TRADE_CENTS`; `amountCents ≤ account.cash_cents`; resolve server price;
  reject unknown symbol / unavailable price. `qty = quantityForAmount(amount, price)`; upsert holding
  with `newAvgCostCents`; debit account cash; insert tx (`buy`, qty, price). Mutate holding first,
  then balance.
- Sell: resolve owned holding; parent-enabled required but no licence required. `sellQty = all ? owned : sellQuantityForAmount(amount, price, owned)`;
  `proceeds = proceedsCents(sellQty, price)`; reduce/【delete if `isDust`】holding; credit account cash;
  insert tx (`sell`, qty, price). Min trade applies to non-"sell all".
- All money actions `revalidatePath("/play/invest")` (and the kid cash route if applicable). Return
  `{ ok: false, error }` on guard failure; the client reverts optimistic UI.

- [ ] **Step 2: Typecheck + commit**
```bash
npm run typecheck
git add lib/actions/invest.ts
git commit -m "feat(invest): deposit/withdraw/buy/sell server actions with gating"
```

### Task 10: Licence actions (lessons + quiz + reward)

**Files:**
- Modify: `lib/actions/invest.ts`
- Read first: `lib/actions/arcade.ts`, `lib/actions/badges.ts`, `0034_arcade_sparks.sql` (to find the
  canonical "award Sparks" path and badge-grant helper)

- [ ] **Step 1: Implement lesson + quiz actions**

```ts
export async function completeLesson(kidId: string, lessonId: string): Promise<ActionResult>;
export async function submitLicenceQuiz(kidId: string, answers: number[]):
  Promise<{ ok: true; score: number; passed: boolean; alreadyHadLicence: boolean } | { ok: false; error: string }>;
```

- `completeLesson`: verify ownership; read `kids.investing_enabled` fresh and reject when false;
  `ensureInvestLicence`; append `lessonId` to `lessons_completed` if absent (idempotent);
  `revalidatePath`.
- `submitLicenceQuiz`: verify ownership; read `kids.investing_enabled` fresh and reject when false;
  `ensureInvestLicence`; **grade server-side** against
  `LICENCE_QUIZ[i].correctIndex` (ignore any client score). `score = count correct`. Increment
  `attempts`; `best_score = max(best_score, score)`. If `score >= LICENCE_PASS_THRESHOLD`:
  set `passed_at = now()` if null; if `rewarded === false`, award **SMART_INVESTOR_SPARKS** via the
  located sparks path + grant the "Smart Investor" badge (best-effort if no clean grant helper — note
  in code comment), set `rewarded = true`. Return `{ score, passed, alreadyHadLicence }`.
  `revalidatePath("/play/invest")`.

- [ ] **Step 2: Typecheck + commit**
```bash
npm run typecheck
git add lib/actions/invest.ts
git commit -m "feat(invest): licence lesson + quiz actions with one-time reward"
```

---

## Phase 7 — Route, shell, and hub

### Task 11: Entry page + InvestHub + tab routing

**Files:**
- Create: `app/play/invest/page.tsx` (clone `app/play/trading/page.tsx`)
- Create: `components/invest/InvestHub.tsx` (clone `components/trading/TradingHub.tsx`)

- [ ] **Step 1: Page**

`app/play/invest/page.tsx`: read `kid` from `?kid=`, load kid + `investing_enabled` first. If
`investing_enabled` is false, render the **locked state** (mockup `02`) and do not create/update
`invest_accounts`, `invest_licences`, prices, or holdings. If enabled, then load
`ensureInvestAccount`, `ensureInvestLicence`, `getTodayRealPrices`, holdings, and licence; call
`void ensureDailyRealPrices(supabase)` non-blocking; render `InvestHub`. Wrap via `KidShell` exactly
like the trading page.

- [ ] **Step 2: InvestHub (tab container)**

4 tabs **Market · Portfolio · Activity · Learn** (mockup tab bar). Indigo active state. Holds the
shared sheet/modal state. Renders the active tab component (built in later tasks). Onboarding overlay
(mockup `03`) shows on first visit, gated by `localStorage["invest_onboarding_seen:<kidId>"]`; its CTA
routes to the Learn tab.

- [ ] **Step 3: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add app/play/invest/page.tsx components/invest/InvestHub.tsx
git commit -m "feat(invest): /play/invest route, hub, tabs, locked + onboarding states"
```

### Task 12: Play hub Invest card

**Files:**
- Modify: `app/kid/[kidId]/play/page.tsx`

- [ ] **Step 1: Add the Invest card**

Add an indigo **Invest** card (mockup `01`) beside Nugget Market, linking to
`/play/invest?kid=${kid.id}`, with a **NEW** pill. Match the existing play-hub card markup; use indigo
(not green) tokens. Only show it (or show it always — product choice: always show; locked state
handles disabled access).

- [ ] **Step 2: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add app/kid/[kidId]/play/page.tsx
git commit -m "feat(invest): add Invest card to the Play hub"
```

---

## Phase 8 — Market tab

### Task 13: `components/invest/InvestMarketTab.tsx`

**Files:**
- Create: `components/invest/InvestMarketTab.tsx`
- Create: `components/invest/InvestAssetRow.tsx`
- Reference: mockups `04`, `05`; clone sparkline from `components/trading/PriceSparkline.tsx`

- [ ] **Step 1: Build the market list**

Match mockup `05`: search bar, horizontal category chips (`ASSET_CATEGORIES`), a slim licence banner
(shown while `licence.passedAt == null`) linking to Learn, then a **list** (not grid) grouped
**Stocks / Crypto**. Each `InvestAssetRow`: ticker tile (emoji), name + `TICKER · EXCHANGE`, sparkline,
tabular price, change chip (`chg up/down`). ASX badge for `exchange === "ASX"`; "Owned" pill if held.
Tapping a row opens the asset detail sheet (Task 14).

Implement all states from spec §9.1:
- Loading (no usable prices) → mockup `04` skeleton.
- No results (filter/search empty) → small empty card, keep chips/search.
- Price unavailable for an asset → row shows `Unavailable`, no chip, detail/buy disabled.
- Full error (no prices at all on first run) → friendly error card + retry (re-call the page's refresh
  / `router.refresh()`).

Filtering/search is client-side over `REAL_ASSETS` joined with `getTodayRealPrices` data.

- [ ] **Step 2: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add components/invest/InvestMarketTab.tsx components/invest/InvestAssetRow.tsx
git commit -m "feat(invest): market tab — search, category filters, brokerage list, states"
```

---

## Phase 9 — Asset detail sheet

### Task 14: `components/invest/InvestAssetDetailSheet.tsx` (+ About, news, buy/sell, locked)

**Files:**
- Create: `components/invest/InvestAssetDetailSheet.tsx`
- Create: `components/invest/InvestAboutSection.tsx`
- Create: `components/invest/InvestBuyLockedCard.tsx`
- Reference: mockups `06` (buy), `07` (owned), `18` (buy-locked); clone chart from
  `components/trading/PriceHistoryChart.tsx`; follow `components/trading/AssetDetailSheet.tsx`

- [ ] **Step 1: Build the sheet**

Header: ticker tile, name, `TICKER · TYPE`, tabular price + change chip. Then: 30-day chart
(`PriceHistoryChart` fed by `getRealPriceHistory`), kid-friendly **news card** (hidden if no cached
news), **position box** if owned, then the **trade panel**:
- **Buy** (mockup `06`): amount input + quick chips `$1/$2/$5/Max`, fractional preview
  (`quantityForAmount`), account-cash line, insufficient-funds inline error. Calls `buyAsset`.
- **Owned** (mockup `07`): Buy/Sell segmented control; Sell shows `$1/Half/Sell all` chips + receipt
  preview; calls `sellAsset`.
- **Buy-locked** (mockup `18`): if `licence.passedAt == null`, replace the **buy** panel with
  `InvestBuyLockedCard` (🔒 + basics progress + "Continue my licence →" to Learn). Selling an existing
  holding stays available. Chart/news/About remain visible.
- **About** (`InvestAboutSection`, mockup `06`/`07`): render `asset.about` **at the bottom** (story →
  3 facts → why-great bullets → did-you-know). Hidden if `asset.about` is undefined.

Optimistic update + revert on action failure (follow `AssetDetailSheet.tsx`). If the selected asset
has no authoritative server price, show chart/trade placeholders, disable buy/sell controls, and keep
About visible (spec §9.1).

- [ ] **Step 2: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add components/invest/InvestAssetDetailSheet.tsx components/invest/InvestAboutSection.tsx components/invest/InvestBuyLockedCard.tsx
git commit -m "feat(invest): asset detail sheet — chart, news, buy/sell, About, buy-locked"
```

---

## Phase 10 — Deposit / Withdraw

### Task 15: `components/invest/InvestDepositWithdrawModal.tsx`

**Files:**
- Create: `components/invest/InvestDepositWithdrawModal.tsx`
- Reference: mockup `08`; clone `components/trading/DepositWithdrawModal.tsx`

- [ ] **Step 1: Build the modal**

Segmented Deposit/Withdraw; shows both balances (cash ⇄ invest account); amount input + quick chips;
receipt preview ("cash after / invest account after"). Calls `depositToInvest` / `withdrawFromInvest`.
Validation per spec §9.1 (blank/invalid, < $0.50, deposit > cash, withdraw > account cash; submitting
state; inline error on failure). **No licence required.**

- [ ] **Step 2: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add components/invest/InvestDepositWithdrawModal.tsx
git commit -m "feat(invest): deposit/withdraw modal with validation"
```

---

## Phase 11 — Portfolio tab

### Task 16: `components/invest/InvestPortfolioTab.tsx`

**Files:**
- Create: `components/invest/InvestPortfolioTab.tsx`
- Reference: mockups `09` (empty), `10` (populated); follow `components/trading/TradingPortfolioTab.tsx`

- [ ] **Step 1: Build the tab**

Navy gradient **total value** card (account cash + holdings at today's price) with all-time P&L chip;
Deposit/Withdraw buttons (open Task 15 modal). Breakdown card (account cash / investments value / open
P&L / deposited). Holdings list (ticker tile, qty + avg cost, value, change chip, sparkline) → row taps
open the detail sheet. **Empty state** (mockup `09`): value card + "no investments yet" CTA to Market.
Use `lib/invest/math.ts` for all values.

- [ ] **Step 2: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add components/invest/InvestPortfolioTab.tsx
git commit -m "feat(invest): portfolio tab — value, breakdown, holdings, empty state"
```

---

## Phase 12 — Activity tab

### Task 17: `components/invest/InvestActivityTab.tsx`

**Files:**
- Create: `components/invest/InvestActivityTab.tsx`
- Reference: mockup `11`

- [ ] **Step 1: Build the tab**

Transaction history from `listInvestTransactions`: icon tile per type (deposit 💵 / withdraw 🏦 /
buy 📈 / sell 📉), label ("Bought $3.00 × Bitcoin", "Deposited from cash"), date, signed colored
amount. Footnote: "Deposits & withdrawals also show in your cash history." **Empty state** (spec §9.1):
card + link to Deposit/Market.

- [ ] **Step 2: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add components/invest/InvestActivityTab.tsx
git commit -m "feat(invest): activity tab with empty state"
```

---

## Phase 13 — Learn tab + licence flow

### Task 18: Learn tab + lesson reader

**Files:**
- Create: `components/invest/InvestLearnTab.tsx`
- Create: `components/invest/InvestLessonReader.tsx`
- Reference: mockups `13`, `14`

- [ ] **Step 1: Learn hub (mockup `13`)**

Indigo progress hero ("🎟️ Investor Licence — N/4 basics", progress bar from
`licence.lessonsCompleted ∩ REQUIRED_LESSON_IDS`). Required basics list (done ✓ / start), highlighted
**"Take the Investor Licence test"** card (enabled once 4 basics complete) → opens the quiz (Task 19).
Bonus sections (Going deeper / Stay smart). Glossary entry → simple term/def list from `GLOSSARY`.

- [ ] **Step 2: Lesson reader (mockup `14`)**

Render a `Lesson.body` block list (para / illustration / keyIdea / example / didYouKnow → matching
styled blocks) + optional `check` question (reveal correct note). "Mark complete & continue" calls
`completeLesson` and advances to the next lesson.

- [ ] **Step 3: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add components/invest/InvestLearnTab.tsx components/invest/InvestLessonReader.tsx
git commit -m "feat(invest): learn hub + lesson reader"
```

### Task 19: Licence quiz + result

**Files:**
- Create: `components/invest/InvestLicenceQuiz.tsx`
- Create: `components/invest/InvestLicenceResult.tsx`
- Reference: mockups `15` (quiz), `16` (passed), `17` (not passed)

- [ ] **Step 1: Quiz (mockup `15`)**

Step through `LICENCE_QUIZ` (progress dots, options w/ selected state, "Why?" explainer after
answering, "Get 4 of 5" note). On finish, submit the chosen indices via `submitLicenceQuiz` (server
grades). Route to the result.

- [ ] **Step 2: Result (mockups `16`/`17`)**

Pass (`16`): indigo celebration, score, 🏅 badge + ⚡50 Sparks, "🔓 Buying unlocked", CTAs "Start
investing" (Market) / "Keep learning". Not passed (`17`): encouraging score, lessons to review,
"Try again" (unlimited). Drive from the `submitLicenceQuiz` result.

- [ ] **Step 3: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add components/invest/InvestLicenceQuiz.tsx components/invest/InvestLicenceResult.tsx
git commit -m "feat(invest): investor licence quiz + pass/fail result"
```

---

## Phase 14 — Parent control

### Task 20: Parent toggle + licence status

**Files:**
- Modify: `app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx`
- Modify if applicable: `app/parent/kids/page.tsx` or the existing parent kids-list/settings-card
  component, only if that screen already has per-kid setting/status cards.
- Create (if needed): server action `setInvestingEnabled(kidId, enabled)` in `lib/actions/kids.ts` or
  `lib/actions/parent-settings.ts` (follow the file's existing per-kid setting pattern)

- [ ] **Step 1: Add the toggle + status (mockup `12`)**

A per-kid **Invest** toggle (default OFF) with copy explaining real stakes / can be turned off anytime.
Below it, a read-only **Investor Licence status** row: "🎟️ Investor Licence: Passed ✓ · score on date"
(from `getInvestLicence`) or "Not passed yet — on lesson N of 4". Note that it can't be skipped. Wire
the toggle to `setInvestingEnabled` (verify parent owns the kid; update `kids.investing_enabled`;
`revalidatePath`). Follow existing form-state/save/error patterns in `ParentKidEditClient`.

If the existing parent kids list has per-kid settings/status cards, add a **read-only** Invest status
there too ("Invest: On/Off" + "Licence: Passed/Not passed"). Do not add a second write control; the
authoritative toggle remains only on the kid edit screen.

- [ ] **Step 2: Typecheck + build + commit**
```bash
npm run typecheck && npm run build
git add app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx lib/actions/kids.ts
# If you changed the existing parent kids list/status component, include that file too.
git commit -m "feat(invest): parent per-kid toggle + licence status"
```

---

## Phase 15 — Visual polish & final verification

### Task 21: Visual pass against mockups

**Files:** any Invest route, parent/play entry, or `components/invest/*` file needing refinement.

- [ ] **Step 1: Compare each screen to its mockup**

For every row in spec §13, open the route and the mockup file side by side; fix spacing, colors,
tabular numbers, chips, tiles, copy to match. Confirm indigo brand + slate neutrals + tabular figures
(spec §12). Ensure no 🪙 anywhere (that's Nugget Market).

- [ ] **Step 2: Commit any polish**
```bash
git add components/invest app/play/invest app/kid/[kidId]/play/page.tsx app/parent/kids/[kidId]/edit/ParentKidEditClient.tsx
# Include any parent kids-list/status file too if Task 20 touched it.
git commit -m "polish(invest): align screens with mockups"
```

### Task 22: Final typecheck + build + manual acceptance

- [ ] **Step 1: Clean typecheck + build**
```bash
npm run typecheck
npm run build
```
Both must pass with **no new errors/warnings**. Fix any failures (max 3 attempts per cluster).

- [ ] **Step 2: Manual acceptance (spec §14)**

Start dev server (`npm run dev`) and verify:
1. Parent enables a kid → kid sees Invest (not locked). Disable → locked state (`02`) returns; buy/
   deposit server actions reject when disabled.
2. Unlicensed kid: can browse Market + read Learn + **deposit**, but Buy is blocked in UI (`18`) and
   the `buyAsset` action rejects. Complete 4 basics → quiz ≥ 4/5 → passed, 50 Sparks + badge awarded
   **once** (re-pass does not re-award) → buying works.
3. Deposit $5 → buy $2 Apple + $1 BTC → portfolio value tracks prices → sell some → withdraw →
   `cash_balance` reflects realized P&L → deposits/withdrawals appear in cash history.
4. Market: search filters; each category chip filters; ASX badge + tabular prices + change chips
   render; all ~55 assets reachable.
5. `real_asset_prices` populates on first load; news renders for US stocks + crypto; simulate a
   provider failure (e.g. unset `FINNHUB_API_KEY`) → keeps prior/keeps crypto+ASX, page never crashes.
6. About renders for assets with `about` (Bitcoin, Roblox); hidden otherwise.
7. No console errors on any screen.

Note any failure that survives 3 fix attempts as a blocker in the ship report.

- [ ] **Step 3: Final commit**
```bash
git add -A
git commit -m "test(invest): final verification pass"
```

---

## Self-review checklist (run before handing off)

- **Spec coverage:** every spec §1–§13 requirement maps to a task above (tables→T1, types→T2,
  assets→T3, learn→T4, math→T5, news→T6, prices→T7, queries→T8, money actions→T9, licence actions→T10,
  route/hub→T11, play card→T12, market→T13, detail/About/locked→T14, deposit→T15, portfolio→T16,
  activity→T17, learn UI→T18, quiz/result→T19, parent→T20, visual→T21, acceptance→T22).
- **States:** loading/empty/error/no-results/unavailable/validation all covered in T13–T17 per §9.1.
- **Gating:** buy gated in UI (T14) **and** server (T9/T10); deposit/withdraw ungated.
- **Idempotent reward** guarded by `rewarded` (T10).
- **Currency:** all stored cents are app-cash; FX handled in T7; math in cents (T5).
