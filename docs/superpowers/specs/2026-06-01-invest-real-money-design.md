# Invest (real-money, real-price investing) — Design Spec

**Date:** 2026-06-01
**Status:** Approved for planning (mockups signed off)
**Working name:** "Invest" (rename-friendly)
**Mockups:** `mockups/2026-06-01-invest-real-money/` (18 screens — see §13 Visual Requirements)

## 1. Summary

A new kid-side game, **Invest**, that lets kids move their **real earned cash balance** into an
investment account and buy/sell **real stocks and crypto** that track **real daily market prices**.
Kids experience **real gains and losses**: when they withdraw, realized profit or loss settles back
into their real cash balance.

Two pillars added during the mockup phase make this safe and educational:

- **Learn → unlock (Investor Licence):** kids cannot buy until they finish a short **crash course**
  (4 required lessons) and **pass a 5-question quiz (4/5)**. Browsing and depositing stay open; only
  **buying** is gated. The licence is **always required** and its status is **visible to parents**.
- **Per-asset education ("About"):** every asset detail includes a curated, kid-friendly mini-lesson
  about the real company/coin and why it became significant.

It is a sibling feature to the existing **Nugget Market** (`/play/trading`), which stays as-is
(play-money / stars / fictional companies). Invest reuses Nugget Market's data shapes but has its own
screens, tables, data, price pipeline, and a distinct **financial-but-friendly visual identity**
(indigo brand, slate neutrals, tabular price numbers — see §12).

### Counterparty model (important)
This is a **family-ledger mirror**, not a real brokerage. No real securities are bought, no KYC, no
regulatory/custody burden. The kid's internal `cash_balance` (cents) moves up and down tracking real
market prices; the family ledger underwrites the P&L. Same architecture as Nugget Market, but
denominated in real cash and driven by real prices.

## 2. Locked decisions

| Dimension | Decision |
|---|---|
| Stakes | Real gains & losses |
| Counterparty | Family-ledger mirror (no real brokerage / KYC / custody) |
| Money flow | cash → invest account → buy/sell fractional → withdraw to cash |
| Buying | Amount-based ("invest $2 in Bitcoin"), fractional quantity |
| Fees | Zero in v1 |
| Assets | ~50 stocks (US + ASX) + ~5 crypto (~55 total) |
| Ledger/display currency | The app's existing real-cash currency (current deployment: AUD-style `$`). All stored `*_cents` in Invest are in this cash currency, not provider quote currency |
| Price cadence | Once daily (close), lazy-refreshed + cached |
| Price sources | Finnhub (US stocks), Yahoo Finance unofficial (ASX), CoinGecko (crypto) |
| News | AI-rewritten real news (US stocks + crypto); ASX news deferred |
| **Learn gate** | **Buy-only.** Browse + deposit open; buying locked until licence earned |
| **Licence requirement** | **4 required "basics" lessons + pass 5-question quiz at 4/5**, unlimited retries |
| **Licence policy** | Always required (cannot be skipped/waived); status visible to parent |
| **Licence reward** | "Smart Investor" badge + **50 Sparks** on first pass |
| **About section** | Curated, static editorial per asset (NOT AI/live) — story + facts + why-great + did-you-know |
| **Market browse** | Search bar + category filter chips over one scrollable list of all ~55 assets |
| Parent control | On/off per kid (`kids.investing_enabled`), default **off** |
| Placement | Separate new game in the Play hub |
| Pipeline | Lazy fetch + daily cache (clone of `ensureDailyPrices`); no cron in v1 |
| Visual identity | Indigo brand + slate neutrals + tabular numbers (distinct from Nugget green) |

## 3. Money flow

All money in **integer cents in the app cash currency**. Quantities are `numeric` with enough decimals
for crypto. Provider quote currencies are normalized before storage: US stocks and crypto are quoted
in USD and converted to the app cash currency; ASX stocks are already AUD and use a 1.0 FX rate in the
current deployment.

```
cash_balance (earned from chores)
   │  deposit ↓        ↑ withdraw   (real P&L settles here)
invest_accounts.cash_cents  ──buy──▶  invest_holdings (fractional qty @ day price)
                            ◀─sell──
```

- **Deposit:** `kids.cash_balance` → `invest_accounts.cash_cents`. Debit cash via existing
  `increment_kid_cash` RPC **and** log a `cash_transactions` row (so it appears in cash history).
  **Allowed without a licence.**
- **Buy (amount-based):** kid enters a dollar amount; `quantity = amount_cents / price_cents`.
  Server re-fetches the cached day price (authoritative). Updates weighted `avg_cost_cents`.
  **Rejected unless the kid's Investor Licence is passed** (and `investing_enabled` is true).
- **Sell:** converts holding back to `cash_cents` at the day's price. Realized gain/loss lands in
  the account. Supports "sell by amount" and "sell all". (A licensed kid only ever holds assets they
  bought while licensed, so sell needs no extra gate beyond ownership.)
- **Withdraw:** `invest_accounts.cash_cents` → `kids.cash_balance` (credit via `increment_kid_cash`
  + `cash_transactions` row). **This is where real P&L becomes real cash.** Allowed without a licence
  (so a kid can always retrieve deposited cash).
- **Fees:** none in v1.
- **Minimum trade:** $0.50 (configurable constant).

## 4. Data model

New tables mirror the proven `trading_*` shape, all **RLS family-scoped** (clone
`supabase/migrations/0029_trading_simulator.sql` policies). Server actions additionally verify the
caller owns the `kidId` before any write (matching recent messaging-security commits).

| Table | Key columns |
|---|---|
| `invest_accounts` | `kid_id`, `family_id`, `cash_cents`, `total_deposited_cents`, `total_withdrawn_cents` |
| `invest_holdings` | `kid_id`, `family_id`, `asset_symbol`, `quantity` (numeric), `avg_cost_cents`, `created_at`, `updated_at` |
| `invest_transactions` | `kid_id`, `family_id`, `type` (deposit/withdraw/buy/sell), `asset_symbol`, `quantity`, `price_cents`, `total_cents`, `created_at` |
| `real_asset_prices` | `symbol`, `asset_type` (stock/crypto), `price_cents`, `prev_close_cents`, `change_pct`, `quote_currency`, `fx_rate_to_cash`, `news_headline`, `news_body`, `news_url`, `news_impact`, `price_date` — unique on (`symbol`,`price_date`) |
| `invest_licences` | `kid_id` (unique), `family_id`, `lessons_completed` (jsonb array of lesson ids, default `[]`), `best_score` (int, default 0), `attempts` (int, default 0), `passed_at` (timestamptz, null until passed), `rewarded` (bool, default false), `created_at`, `updated_at` |

Schema change: `kids.investing_enabled boolean not null default false`.

**Licence semantics:**
- One `invest_licences` row per kid, created lazily on first Invest visit.
- `passed_at IS NOT NULL` ⇒ buying unlocked. This is the **single server-side gate** for buying.
- `lessons_completed` drives the Learn progress UI and enables the "Take the test" entry (basics done).
- `rewarded` guards one-time badge + Sparks award (idempotent).

**Price currency semantics:**
- `price_cents` and `prev_close_cents` are always app-cash cents and are the only values used for
  buying, selling, portfolio value, and charts.
- `quote_currency` records the provider's native quote currency (`"USD"` for Finnhub US stocks and
  CoinGecko crypto, `"AUD"` for Yahoo ASX in the current deployment).
- `fx_rate_to_cash` is the decimal multiplier applied to provider prices before rounding to cents
  (for example, USD→AUD). It is stored for audit/debugging and must be the same for `price_cents` and
  `prev_close_cents` on a given row.
- If an FX quote cannot be fetched, treat it like a provider failure for the affected USD assets:
  keep yesterday's row and do not write mixed-currency prices.

Migration file: `supabase/migrations/0041_invest_simulator.sql` (next number in sequence — verify it
is unused before writing; if taken, use the next free number and update all references).
Regenerate `lib/supabase/database.types.ts` afterward. Add matching domain types to
`lib/domain/types.ts` (`InvestAccount`, `InvestHolding`, `InvestTransaction`, `RealAssetPrice`,
`RealAsset`, `InvestLicence`, `Lesson`, `QuizQuestion`).

## 5. Asset registry

`lib/invest/assets.ts` exports `REAL_ASSETS: RealAsset[]`. Each asset:

```ts
type AssetCategory = "popular" | "games" | "tech" | "food" | "australian" | "crypto";

interface RealAsset {
  symbol: string;        // app-internal symbol, e.g. "AAPL", "CBA", "BTC"
  name: string;          // "Apple", "Commonwealth Bank", "Bitcoin"
  ticker: string;        // display ticker, e.g. "AAPL", "CBA", "BTC"
  exchange: string;      // display label: "NASDAQ" | "NYSE" | "ASX" | "Crypto"
  emoji: string;
  assetType: "stock" | "crypto";
  categories: AssetCategory[];  // for filter chips; an asset can be in several (e.g. ["popular","games"])
  source: "finnhub" | "yahoo" | "coingecko";
  sourceId: string;      // finnhub: "AAPL"; yahoo: "CBA.AX"; coingecko: "bitcoin"
  description: string;   // kid-friendly one-liner
  about?: AssetAbout;    // curated education block (§8); section hidden if absent
}

interface AssetAbout {
  story: string;                                   // 1–2 sentence origin/founding story
  facts: { label: string; value: string }[];       // exactly 3 quick facts (Founded / From / Makes)
  whyGreat: { emoji: string; text: string }[];      // 2–3 "why it became great" bullets
  didYouKnow: string;                               // one fun fact
}
```

ASX assets set `exchange: "ASX"` and render a `🇦🇺 ASX` badge. Category chips shown in the market:
**All · ⭐ Popular · 🎮 Games · 💻 Tech · 🍔 Food & Shops · 🇦🇺 Australian · 🪙 Crypto** — derived from
`categories` (+ `assetType` for Crypto, + `exchange === "ASX"` for Australian). "All" shows everything.

### Starter list (review/edit freely)

**US / global stocks via Finnhub (~35)** — kid-recognizable, no alcohol/gambling. Suggested category tags in brackets:
AAPL 🍎 Apple [popular,tech] · TSLA ⚡ Tesla [popular,tech] · DIS 🏰 Disney [popular] · RBLX 🎮 Roblox [popular,games] ·
MCD 🍔 McDonald's [popular,food] · NKE 👟 Nike [popular] · MSFT 💻 Microsoft [tech] · NFLX 🎬 Netflix [popular] ·
AMZN 📦 Amazon [popular,tech] · GOOGL 🔍 Alphabet [tech] · NTDOY 🎮 Nintendo [games] · SONY 🎮 Sony [games] ·
KO 🥤 Coca-Cola [food] · PEP 🥤 PepsiCo [food] · SPOT 🎵 Spotify [tech] · META 📱 Meta [tech] · NVDA 🖥️ Nvidia [tech] ·
MAT 🚗 Mattel [games] · HAS 🎲 Hasbro [games] · SBUX ☕ Starbucks [food] · CMG 🌯 Chipotle [food] ·
DPZ 🍕 Domino's US [food] · HSY 🍫 Hershey [food] · CROX 🐊 Crocs · LULU 🧘 Lululemon · RACE 🏎️ Ferrari [popular] ·
BBW 🧸 Build-A-Bear [games] · EA 🎮 Electronic Arts [games] · ABNB 🏠 Airbnb · UBER 🚗 Uber [tech] · V 💳 Visa ·
WMT 🛒 Walmart [food] · TGT 🎯 Target [food] · GPRO 📷 GoPro · COST 🏬 Costco [food]

**Australian stocks via Yahoo (~15)** — app `symbol`/display `ticker` omit `.AX`; `sourceId` includes
the Yahoo suffix (for example `symbol: "CBA"`, `ticker: "CBA"`, `sourceId: "CBA.AX"`), all `[australian]`:
CBA 🏦 Commonwealth Bank · BHP ⛏️ BHP · CSL 💉 CSL · WOW 🛒 Woolworths · WES 🔨 Wesfarmers · TLS 📡 Telstra ·
QAN ✈️ Qantas · JBH 🎧 JB Hi-Fi · DMP 🍕 Domino's AU · A2M 🥛 a2 Milk · COL 🛒 Coles · RIO ⛏️ Rio Tinto ·
FMG ⛏️ Fortescue · XRO 📊 Xero · COH 👂 Cochlear

**Crypto via CoinGecko (~5)**, all `[crypto]`:
BTC ₿ Bitcoin (`bitcoin`) · ETH Ξ Ethereum (`ethereum`) · DOGE 🐶 Dogecoin (`dogecoin`) ·
SOL ◎ Solana (`solana`) · ADA 🔷 Cardano (`cardano`)

**About content:** author curated `about` blocks for at least the `popular` assets + all crypto in v1
(Apple, Roblox, Disney, Tesla, McDonald's, Nintendo, Bitcoin, Ethereum, Dogecoin, etc.). Assets
without an `about` block simply hide the About section. Mockups `06` (Bitcoin) and `07` (Roblox) show
the exact content shape and tone to replicate.

## 6. Price + news pipeline

`lib/invest/prices.ts` → `ensureDailyRealPrices(supabase)`, cloned from
`lib/trading/prices.ts:ensureDailyPrices`. Called non-blocking on page load
(`void ensureDailyRealPrices(supabase)`).

1. **Proxy check:** if `BTC` already has a `real_asset_prices` row for today → return.
2. **FX:** fetch one daily USD→cash-currency rate before writing USD-quoted assets. Use Yahoo
   `AUDUSD=X` in the current AUD deployment (invert to get USD→AUD), cached per run. If the app later
   supports family-specific currencies, make the cash currency explicit before enabling Invest.
3. **Crypto:** one CoinGecko `/simple/price?ids=...&vs_currencies=usd&include_24hr_change=true`
   call (no key) → price + 24h change for all crypto at once.
4. **US stocks:** Finnhub `/quote?symbol=...&token=FINNHUB_API_KEY` per symbol → `c` (current),
   `pc` (prev close).
5. **ASX stocks:** Yahoo `https://query1.finance.yahoo.com/v8/finance/chart/<SYM>.AX` → last close +
   prev close. Unofficial; wrap in try/catch.
6. Convert all prices to integer app-cash **cents** after FX conversion; compute
   `change_pct = (price - prev_close)/prev_close` using normalized app-cash cents.
7. **News** (see §7) for US stocks + crypto.
8. **Upsert** one row per asset for today (`onConflict: symbol,price_date, ignoreDuplicates`).

**Rate limits:** Finnhub free = 60 calls/min. ~35 quotes + ~35 company-news ≈ 70 Finnhub calls, so
the daily job must **throttle** (chunk with small delays) or fetch news for a rotating subset. Because
the job is once-daily and runs non-blocking in the background, a ~1–2 minute run is acceptable.

**Failure handling:** each asset fetched independently inside try/catch. On failure, **keep
yesterday's row** for that asset and log; never throw / never crash the page. Crypto, US, and ASX
fetch independently so one provider's outage can't block the others. If there is no previous row for
an asset, mark it unavailable in the UI until a price exists; never allow buy/sell without an
authoritative server price.

**Charts:** `real_asset_prices` accumulates one row/asset/day, so the 30-day chart (reuse
`PriceHistoryChart`) builds over time. **Optional v1 nicety:** backfill ~30 days on first run
(CoinGecko `market_chart`, Finnhub `candle`, Yahoo `chart?range=1mo`). Marked optional — ship without
if it adds friction. When history is sparse, charts still render with available points.

**Market hours:** crypto is 24/7; stocks freeze nights/weekends (providers return last close). Fine
for a once-daily model. No special handling.

**Initial-load behavior:** page load may kick off the lazy refresh non-blocking, but the Market must
show the `04` skeleton while there are no usable price rows for the current or previous day. Once at
least stale-or-current prices exist, render the list and show per-asset unavailable rows only for
assets with no price at all. If every provider fails on the first ever run, show a friendly market
error card with a retry action; do not show an empty market.

## 7. News (kid-safe)

`lib/invest/news.ts`, reusing the `lib/trading/news-generator.ts` Claude Haiku pattern.

1. **Fetch real news:** US stocks → Finnhub `/company-news?symbol=...&from=...&to=...`; crypto →
   Finnhub crypto news category. ASX news **deferred** in v1.
2. **Rewrite kid-friendly via Haiku** (`claude-haiku-4-5-20251001`): real headline + summary →
   `{ headline, body }`, punchy and age-appropriate. Prompt instructs it to skip/neutralize anything
   unsuitable for kids and not to spell out whether it's good/bad for the price.
3. **Cache** `news_headline`, `news_body`, `news_url` (link to the real source for curious parents)
   on the `real_asset_prices` row.
4. **Display** in the asset detail sheet as a sourced "Kid-friendly summary" card.

Cost: ~50 Haiku calls/day — trivial, non-blocking, cached once daily. On any error, fall back to
no-news (price still renders). **News is live/AI; About (§8) is curated/static — keep them separate.**

## 8. Learn & Investor Licence (gate)

The educational core. Two content surfaces — per-asset **About** (in the detail sheet) and the
standalone **Learn tab** (crash course + licence quiz).

### 8.1 Per-asset About (detail sheet, bottom)
Curated, static editorial rendered **below** the buy/sell panel (mockups `06`, `07`). Pulled from
`RealAsset.about`. Structure: **story** paragraph → 3-up **quick facts** (Founded / From / Makes) →
**"Why it became great"** bullets (emoji + text) → **"Did you know?"** fact. No network/AI at runtime.

### 8.2 Crash course content
`lib/invest/learn.ts` exports `LESSONS: Lesson[]` and `LICENCE_QUIZ: QuizQuestion[]`.

```ts
type LessonSection = "basics" | "deeper" | "safe";
type LessonBlock =
  | { kind: "para"; text: string }
  | { kind: "illustration"; emoji: string; caption: string }
  | { kind: "keyIdea"; text: string }
  | { kind: "example"; emoji: string; text: string }
  | { kind: "didYouKnow"; text: string };

interface Lesson {
  id: string;             // "what-is-investing"
  section: LessonSection; // basics = required for licence
  required: boolean;      // true for the 4 basics
  order: number;
  title: string;
  emoji: string;
  minutes: number;
  blurb: string;          // one-line shown in the Learn list
  body: LessonBlock[];
  check?: { question: string; options: string[]; correctIndex: number; correctNote: string };
}

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];      // 3–4 options
  correctIndex: number;
  explainer: string;      // shown after answering ("Why?")
}

export const LICENCE_PASS_THRESHOLD = 4;   // of 5
export const SMART_INVESTOR_SPARKS = 50;
```

**8 lessons** (4 required basics + 4 bonus), grouped exactly as the Learn mockup (`13`):
- **Required · Basics:** (1) What is investing? (2) What is a stock? (3) What is crypto?
  (4) Why prices go up & down.
- **Bonus · Going deeper:** (5) Don't put all eggs in one basket. (6) Slow and steady wins.
- **Bonus · Stay smart & safe:** (7) You can lose money too. (8) Think before you buy.

Lesson reader (mockup `14`) renders `body` blocks + an optional inline `check` question. Authored copy
should match the friendly, concrete tone in the mockups (pizza-slice analogy for "what is a stock",
etc.). A **glossary** ("Money words") entry is listed in the Learn hub; v1 may render a simple
term→definition list (content authored in `learn.ts`).

**5 quiz questions** for the licence, covering the basics (mockup `15` shows the exact format: question,
options, selected state, "Why?" explainer, "Get 4 of 5 to pass").

### 8.3 Gating logic (server-authoritative)
- **Buy is the only gated action.** `lib/actions/invest.ts:buy` rejects unless the kid's
  `invest_licences.passed_at IS NOT NULL` (and `investing_enabled` is true). Browse, deposit,
  withdraw, sell, Learn, and About are all open pre-licence.
- **`completeLesson(kidId, lessonId)`** server action: appends `lessonId` to `lessons_completed`
  (idempotent). Used for progress + to enable the "Take the test" entry once the 4 basics are done.
- **`submitLicenceQuiz(kidId, answers: number[])`** server action: grades **server-side** against
  `LICENCE_QUIZ` correct indices (never trust a client-sent score). Increments `attempts`, updates
  `best_score`. If `score >= LICENCE_PASS_THRESHOLD`: set `passed_at` (if null) and, when `rewarded`
  is false, award **50 Sparks + "Smart Investor" badge** via the existing gamification mechanism and
  set `rewarded = true`. Returns `{ score, passed, alreadyHadLicence }`.
- **Unlimited retries.** A non-passing attempt only updates `attempts`/`best_score`.
- **Reward mechanism:** reuse the app's existing Sparks/badge system (Kid has `sparksBalance`;
  gamification SQL in `0006_*`). During planning, locate the canonical "award sparks" / "grant badge"
  path; if a clean badge grant isn't readily available, award Sparks (authoritative) and treat the
  badge as best-effort — note the decision. The award must be **idempotent** (guarded by `rewarded`).

### 8.4 Licence screens (mockups)
- **Learn hub** (`13`) — indigo progress hero ("🎟️ Investor Licence — 2/4 basics"), required basics
  list, highlighted **"Take the Investor Licence test"** card, bonus sections, glossary entry.
- **Lesson reader** (`14`) — single lesson + quick-check.
- **Licence test** (`15`) — 5-question quiz, "Why?" explainer, 4/5 to pass, retry note.
- **Passed** (`16`) — full-screen indigo celebration: score, 🏅 badge + ⚡50 Sparks, "🔓 Buying
  unlocked", CTAs "Start investing" / "Keep learning".
- **Not passed yet** (`17`) — encouraging, shows score, lessons to review, "Try again" (unlimited).
- **Buy locked** (`18`) — asset detail with the buy panel replaced by a 🔒 "Earn your Investor
  Licence" card (+ progress) → routes to Learn. Chart, news, and About remain visible.

## 9. Kid screens & UX

Entry: new **"Invest" card in the Play hub** (mockup `01`) → `/play/invest?kid=<id>` (wrapped by
`KidShell` via the `?kid=` query param, exactly like `/play/trading`). New components under
`components/invest/` (Invest*-prefixed).

**Tab bar (4 tabs):** **Market · Portfolio · Activity · Learn**.

1. **Locked state** (`02`) — `investing_enabled = false` → "Investing is locked, ask a parent"; no
   access. (Distinct from the *buy*-locked-but-enabled state.)
2. **Onboarding** (`03`, first visit) — explainer; **first step is "earn your licence"**; primary CTA
   **"Start learning →"** routes to the Learn tab (not straight to buying). Track dismissal per kid in
   local storage (`invest_onboarding_seen:<kidId>`) after the CTA is used; do not add a database flag
   in v1.
3. **Market — loading** (`04`) — skeleton matching the list layout (search + chips + rows).
4. **Market — populated** (`05`) — **search bar** + horizontal **category chips** + a slim
   **"🔒 Buying is locked — earn your licence"** banner (shown until passed) over a **brokerage-style
   list** grouped **Stocks / Crypto**. Each row: ticker tile (emoji), name, `TICKER · EXCHANGE`,
   sparkline, **tabular price**, quiet **change chip** (`+1.2%` / `−3.4%`). ASX rows show a `🇦🇺 ASX`
   badge; owned rows show an "Owned" pill. The list is the **browse-all-55** surface (search +
   filter + scroll).
5. **Asset detail sheet** (`06` buy / `07` owned / `18` buy-locked) — header (tile, name,
   `TICKER · TYPE`, tabular price + change chip), 30-day chart, kid-friendly news card, **position box**
   (if owned), **buy/sell panel** (amount-based with quick chips `$1/$2/$5/Max`, fractional preview,
   account-cash line, insufficient-funds error), and the **About** education block **at the bottom**.
   When unlicensed, the buy panel is replaced by the lock card (`18`).
6. **Deposit/Withdraw modal** (`08`) — segmented Deposit/Withdraw; shows both balances (cash ⇄ invest
   account); amount + quick chips; receipt preview. Writes a `cash_transactions` row.
7. **Portfolio — empty** (`09`) — navy value card + "no investments yet" CTA to Market.
8. **Portfolio — populated** (`10`) — navy total-value card with all-time P&L chip; breakdown
   (account cash / investments value / open P&L / deposited); holdings list (ticker tile, qty + avg
   cost, value, change chip, sparkline).
9. **Activity** (`11`) — transaction history list (icon tile, label, date, signed colored amount);
   note that deposits/withdrawals also appear in cash history.
10. **Learn** (`13`–`18`) — see §8.

**Money display:** dollars & cents with **tabular figures**; gains/losses always colored + signed.
No 🪙 (that's Nugget Market's play-money); Invest uses real `$`.

### 9.1 Required empty, loading, and error states

- **Market loading:** render mockup `04` when prices are being fetched and there are no usable cached
  prices yet.
- **Market no results:** when search/category filters match zero assets, show a small empty card under
  the chips ("No matches — try another search or filter") and keep the tabs/search/chips visible.
- **Market price unavailable:** if an asset has no price row after fetch failure, keep it in the list
  with price shown as `Unavailable`, no change chip, and a disabled detail/buy affordance until a
  server price exists.
- **Market full error:** if no asset has any usable price on first run, show a friendly error card with
  "Prices didn't load" and a retry action that re-runs `ensureDailyRealPrices`; do not render an empty
  brokerage list.
- **Asset detail unavailable:** if the selected asset has no authoritative server price, show chart
  and trade panel placeholders with trading disabled; About remains visible.
- **News absent/error:** hide the news card entirely when no kid-safe cached news is available.
- **Chart sparse/empty:** render available points; if fewer than two points exist, show a flat/empty
  chart placeholder labeled "Price history starts today".
- **Deposit/withdraw validation:** disable submit and show inline errors for blank/invalid amount,
  amount below $0.50, deposit greater than `kids.cash_balance`, or withdraw greater than
  `invest_accounts.cash_cents`. Show a submitting state while the server action runs and a friendly
  inline error if it fails.
- **Buy/sell validation:** disable submit and show inline errors for blank/invalid amount, amount below
  $0.50, insufficient account cash, insufficient holding quantity/value, unknown symbol, unavailable
  price, parent-disabled investing, or unlicensed buy.
- **Activity empty:** when there are no `invest_transactions`, show an empty card saying no Invest
  activity yet and link to Deposit/Market.

## 10. Parent control

- `kids.investing_enabled boolean default false` — parent must explicitly enable per kid.
- Toggle control in the parent kid edit screen (`app/parent/kids/[kidId]/edit`, via
  `ParentKidEditClient`) and, if the existing parent kids list has per-kid settings cards, mirror the
  status there read-only. Default **OFF**, with copy explaining real stakes and that it can be turned
  off anytime.
- **Investor Licence status is shown to the parent** on the same screen: "🎟️ Investor Licence:
  Passed ✓ · score on date" or "Not passed yet — on lesson N of 4". Copy states the licence **can't be
  skipped**.
- When off: locked kid state **and** server actions re-check the flag (never trust the client).
- The authoritative write control lives on the kid edit screen; follow existing parent edit patterns
  for form state, saving, and error display.

## 11. Correctness & security

- All money in **integer app-cash cents**; quantities `numeric` with crypto-grade decimals.
- Pure money math isolated in `lib/invest/math.ts` (amount→quantity, weighted avg cost, holding
  value, realized/unrealized P&L) — no I/O, unit-testable.
- **Server-authoritative pricing:** buy/sell re-fetch the cached day price server-side (like
  `trading.ts:fetchTodayPrice`); client price is display-only.
- **Server-authoritative gating:** buy rejects unless licence passed **and** `investing_enabled`;
  quiz graded server-side; reward award idempotent (`rewarded` flag).
- **Write order** mirrors `lib/actions/trading.ts`: mutate the dependent record first, debit/credit
  balance only after success; revert optimistic UI on failure.
- **RLS** family-scoped on all `invest_*` tables; server actions verify caller owns `kidId`.
- **Guards:** deposit ≤ cash balance; buy ≤ account cash; sell ≤ owned qty; reject buy when
  unlicensed or `investing_enabled` false; enforce $0.50 minimum trade; reject unknown symbols.
- **Holding cleanup:** after a "sell all" or any sell that leaves only a rounding dust quantity/value,
  delete the holding row (or treat it as zero everywhere) so the UI does not show unusable fragments.

## 12. Visual design system

A **financial-but-friendly** identity, distinct from Nugget Market's green play-money look. Canonical
implementation: `mockups/2026-06-01-invest-real-money/styles.css` (replicate tokens in Tailwind).

- **Brand:** indigo (`#4f46e5` primary, `#4338ca` deep) with a **navy→indigo gradient surface**
  (`#1e293b → #312e81 → #4338ca`) for value/celebration cards. NOT bright candy blue.
- **Neutrals:** cool **slate** scale (`#0f172a … #f8fafc`), not warm gray.
- **Gain/loss:** refined `#059669` green / `#dc2626` red, shown as **quiet rounded chips** (tinted bg),
  not big playful arrows. Triangles allowed small.
- **Numbers:** **tabular figures** (`font-variant-numeric: tabular-nums`) on every price/percent/qty;
  slight negative letter-spacing on large numbers.
- **Asset identity:** **ticker tile** (40px tinted rounded square holding the emoji) + **`TICKER ·
  EXCHANGE`** label. Market is a **list**, not a candy grid.
- **Cards:** 14px radii, hairline slate borders, soft shadows. Tighter and more refined than the
  kid-app default.
- **Components introduced:** `.searchbar`, `.chiprow/.fchip` (category filters), `.alist/.arow`
  (asset rows), `.tile` (ticker tiles), `.chg.up/.down` (change chips), `.pbar` (progress),
  `.numtile/.lchip` (lessons), `.qopt` (quiz options), `.callout` (key-idea/warn).
- **Tone:** approachable but not cartoonish — small emoji as accents, friendly copy, restrained
  typography. "Financial app a kid can use," not "toy."

When implementing, build real Tailwind/React equivalents of these tokens (do **not** ship the mockup
CSS verbatim). Match the look; integrate with the existing app's component conventions.

## 13. Visual Requirements (per-screen acceptance)

Each built screen must visually match its mockup (layout, hierarchy, copy intent, states). Reviewer
opens the route and compares against the referenced file in `mockups/2026-06-01-invest-real-money/`.

| # | Mockup file | Screen / state | Must include |
|---|---|---|---|
| 1 | `01-play-hub.html` | Play hub | Indigo **Invest** card (NEW pill) beside green Nugget Market |
| 2 | `02-locked.html` | Investing disabled by parent | 🔒 locked card, "ask a parent", no access |
| 3 | `03-onboarding.html` | First-visit explainer | Steps incl. "earn your licence"; CTA "Start learning →" |
| 4 | `04-market-loading.html` | Market skeleton | Search + chip + row skeletons matching list layout |
| 5 | `05-market.html` | Market populated | Search bar, category chips, licence banner, Stocks/Crypto lists, tabular prices, change chips, ticker tiles, ASX badge |
| 6 | `06-asset-detail-buy.html` | Asset detail (buy, not owned) | Chart, news card, amount buy panel + quick chips + fractional preview, **About at bottom** |
| 7 | `07-asset-detail-owned.html` | Asset detail (owned) | Position box, Buy/Sell segmented panel, insufficient-funds error, **About at bottom** |
| 8 | `08-deposit-withdraw.html` | Deposit/Withdraw | Segmented control, both balances, quick chips, receipt preview |
| 9 | `09-portfolio-empty.html` | Portfolio empty | Navy value card, empty CTA to Market |
| 10 | `10-portfolio.html` | Portfolio populated | Navy value card + P&L chip, breakdown, holdings list (winner+loser) |
| 11 | `11-activity.html` | Activity | Transaction rows with signed colored amounts |
| 12 | `12-parent-toggle.html` | Parent toggle | Per-kid toggle (default OFF), **licence status row**, default-off note |
| 13 | `13-learn.html` | Learn hub | Licence progress hero, required basics, "Take the test" card, bonus sections, glossary |
| 14 | `14-learn-lesson.html` | Lesson reader | Illustration, body blocks, key-idea callout, example, quick-check |
| 15 | `15-licence-quiz.html` | Licence test | Q of 5, options w/ selected state, "Why?" explainer, 4/5 note |
| 16 | `16-licence-passed.html` | Passed/unlock | Celebration, score, badge + Sparks, "buying unlocked", CTAs |
| 17 | `17-licence-failed.html` | Not passed yet | Encouraging score, lessons to review, retry |
| 18 | `18-asset-buy-locked.html` | Buy locked (unlicensed) | Buy panel replaced by 🔒 licence card; chart/news/About still visible |

## 14. Acceptance criteria (Aim)

The repo has **no test runner** (per CLAUDE.md), so acceptance is build/typecheck + structured manual
verification:

1. `npm run typecheck` and `npm run build` pass clean (no new errors/warnings).
2. `lib/invest/math.ts` pure functions exist, structured for unit testing, with documented
   example-based assertions (input → expected output).
3. **Gating E2E:** new kid (enabled, unlicensed) → can browse Market + read Learn + deposit, but
   **Buy is blocked** in UI (`18`) **and** server (`buy` action rejects). Complete 4 basics → take
   quiz → score ≥ 4/5 → `passed_at` set, **50 Sparks + badge awarded once** → buying works. Re-pass
   does not re-award.
4. **Money E2E:** deposit $5 → buy $2 Apple + $1 BTC → portfolio value tracks prices → sell some →
   withdraw → `cash_balance` reflects realized P&L → deposits/withdrawals appear in cash history.
5. **Market browse:** search filters the list; each category chip filters correctly; all ~55 assets
   reachable; ASX badge + tabular prices + change chips render.
6. `real_asset_prices` populates for all assets on first load; kid-friendly news renders for US
   stocks + crypto; a simulated provider failure keeps yesterday's price without crashing the page.
7. Per-kid `investing_enabled` gate works on client (locked screen `02`) and server (actions reject).
8. About sections render from `RealAsset.about` for assets that have it (Bitcoin, Roblox, etc.); absent
   → section hidden.
9. Each screen in §13 visually matches its mockup.

## 15. File plan (high level)

**New**
- `supabase/migrations/0041_invest_simulator.sql` — 5 tables (`invest_accounts`, `invest_holdings`,
  `invest_transactions`, `real_asset_prices`, `invest_licences`) + RLS + `kids.investing_enabled`
- `lib/invest/assets.ts` — `REAL_ASSETS` registry (incl. `categories`, `ticker`, `exchange`, `about`)
- `lib/invest/learn.ts` — `LESSONS`, `LICENCE_QUIZ`, thresholds, glossary
- `lib/invest/prices.ts` — `ensureDailyRealPrices`
- `lib/invest/news.ts` — real-news fetch + Haiku rewrite
- `lib/invest/math.ts` — pure money math
- `lib/actions/invest.ts` — deposit / withdraw / buy / sell + `completeLesson` / `submitLicenceQuiz`
- `app/play/invest/page.tsx` — entry page (clone of `app/play/trading/page.tsx`)
- `components/invest/*` — `InvestHub`, `InvestMarketTab` (search + chips + list), `InvestPortfolioTab`,
  `InvestActivityTab`, `InvestLearnTab`, `InvestAssetDetailSheet` (+ About + buy-locked variant),
  `InvestDepositWithdrawModal`, `InvestOnboarding`, `InvestLessonReader`, `InvestLicenceQuiz`,
  `InvestLicenceResult` (pass/fail), `InvestBuyLockedCard`
- Parent toggle + licence-status control component

**Modified**
- `lib/domain/types.ts` — new domain types (incl. `InvestLicence`, `Lesson`, `QuizQuestion`,
  `AssetAbout`, `AssetCategory`)
- `lib/data/queries.ts` (+ `lib/data/stub.ts` re-exports) — invest + licence queries
- `lib/supabase/database.types.ts` — regenerate
- Play hub — add "Invest" card
- Parent kids/edit screen — add per-kid toggle + licence status
- `.env.example` — document `FINNHUB_API_KEY`

**Env**
- `FINNHUB_API_KEY` in `.env.local` (git-ignored; server-only). CoinGecko + Yahoo need no key.

## 16. Out of scope (deferred)

- Leaderboard, dividends/interest, home-screen investment widget.
- Deposit cap / per-trade parent approval (only on/off toggle in v1).
- Parent ability to waive the licence (always required in v1).
- ASX news.
- Real brokerage integration / real securities custody.
- Intraday or live pricing.
- Daily price cron (lazy-on-load only in v1).
- AI-generated About content (curated/static only in v1).
