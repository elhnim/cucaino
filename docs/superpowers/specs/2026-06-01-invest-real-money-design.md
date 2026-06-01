# Invest (real-money, real-price investing) — Design Spec

**Date:** 2026-06-01
**Status:** Approved for planning
**Working name:** "Invest" (rename-friendly)

## 1. Summary

A new kid-side game, **Invest**, that lets kids move their **real earned cash balance** into an
investment account and buy/sell **real stocks and crypto** that track **real daily market prices**.
Kids experience **real gains and losses**: when they withdraw, realized profit or loss settles back
into their real cash balance.

It is a sibling feature to the existing **Nugget Market** (`/play/trading`), which stays as-is
(play-money / stars / fictional companies). Invest reuses Nugget Market's UI patterns and data shapes
but has its own screens, tables, data, and price pipeline.

### Counterparty model (important)
This is a **family-ledger mirror**, not a real brokerage. No real securities are bought, no KYC, no
regulatory/custody burden. The kid's internal `cash_balance` (cents) moves up and down tracking real
market prices; the family ledger underwrites the P&L. This is the same architecture as Nugget Market,
but denominated in real cash and driven by real prices.

## 2. Locked decisions

| Dimension | Decision |
|---|---|
| Stakes | Real gains & losses |
| Counterparty | Family-ledger mirror (no real brokerage / KYC / custody) |
| Money flow | cash → invest account → buy/sell fractional → withdraw to cash |
| Buying | Amount-based ("invest $2 in Bitcoin"), fractional quantity |
| Fees | Zero in v1 |
| Assets | ~50 stocks (US + ASX) + ~5 crypto |
| Price cadence | Once daily (close), lazy-refreshed + cached |
| Price sources | Finnhub (US stocks), Yahoo Finance unofficial (ASX), CoinGecko (crypto) |
| News | AI-rewritten real news (US stocks + crypto); ASX news deferred |
| Parent control | On/off per kid (`kids.investing_enabled`), default **off** |
| Placement | Separate new game in the Play hub |
| Pipeline | Lazy fetch + daily cache (clone of `ensureDailyPrices`); no cron in v1 |

## 3. Money flow

All money in **integer cents**. Quantities are `numeric` with enough decimals for crypto.

```
cash_balance (earned from chores)
   │  deposit ↓        ↑ withdraw   (real P&L settles here)
invest_accounts.cash_cents  ──buy──▶  invest_holdings (fractional qty @ day price)
                            ◀─sell──
```

- **Deposit:** `kids.cash_balance` → `invest_accounts.cash_cents`. Debit cash via existing
  `increment_kid_cash` RPC **and** log a `cash_transactions` row (so it appears in cash history).
- **Buy (amount-based):** kid enters a dollar amount; `quantity = amount_cents / price_cents`.
  Server re-fetches the cached day price (authoritative). Updates weighted `avg_cost_cents`.
- **Sell:** converts holding back to `cash_cents` at the day's price. Realized gain/loss lands in
  the account. Supports "sell by amount" and "sell all".
- **Withdraw:** `invest_accounts.cash_cents` → `kids.cash_balance` (credit via `increment_kid_cash`
  + `cash_transactions` row). **This is where real P&L becomes real cash** — withdrawing more than
  was deposited means the family ledger has underwritten a gain (and vice-versa for a loss).
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
| `real_asset_prices` | `symbol`, `asset_type` (stock/crypto), `price_cents`, `prev_close_cents`, `change_pct`, `news_headline`, `news_body`, `news_url`, `news_impact`, `price_date` — unique on (`symbol`,`price_date`) |

Schema change: `kids.investing_enabled boolean not null default false`.

Migration file: `supabase/migrations/0041_invest_simulator.sql` (next number in sequence).
Regenerate `lib/supabase/database.types.ts` afterward. Add matching domain types to
`lib/domain/types.ts` (`InvestAccount`, `InvestHolding`, `InvestTransaction`, `RealAssetPrice`,
`RealAsset`).

## 5. Asset registry

`lib/invest/assets.ts` exports `REAL_ASSETS: RealAsset[]`. Each asset:

```ts
{
  symbol: string;        // app-internal symbol, e.g. "AAPL", "CBA", "BTC"
  name: string;
  emoji: string;
  assetType: "stock" | "crypto";
  source: "finnhub" | "yahoo" | "coingecko";
  sourceId: string;      // finnhub: "AAPL"; yahoo: "CBA.AX"; coingecko: "bitcoin"
  description: string;   // kid-friendly one-liner
}
```

### Proposed starter list (review/edit freely)

**US / global stocks via Finnhub (~35)** — kid-recognizable, no alcohol/gambling:
AAPL 🍎 Apple · TSLA ⚡ Tesla · DIS 🏰 Disney · RBLX 🎮 Roblox · MCD 🍔 McDonald's ·
NKE 👟 Nike · MSFT 💻 Microsoft · NFLX 🎬 Netflix · AMZN 📦 Amazon · GOOGL 🔍 Alphabet ·
NTDOY 🎮 Nintendo · SONY 🎮 Sony · KO 🥤 Coca-Cola · PEP 🥤 PepsiCo · SPOT 🎵 Spotify ·
META 📱 Meta · NVDA 🖥️ Nvidia · MAT 🚗 Mattel · HAS 🎲 Hasbro · SBUX ☕ Starbucks ·
CMG 🌯 Chipotle · DPZ 🍕 Domino's (US) · HSY 🍫 Hershey · CROX 🐊 Crocs · LULU 🧘 Lululemon ·
RACE 🏎️ Ferrari · BBW 🧸 Build-A-Bear · EA 🎮 Electronic Arts · ABNB 🏠 Airbnb · UBER 🚗 Uber ·
V 💳 Visa · WMT 🛒 Walmart · TGT 🎯 Target · GPRO 📷 GoPro · COST 🏬 Costco

**Australian stocks via Yahoo (~15)** — `.AX` symbols:
CBA 🏦 Commonwealth Bank · BHP ⛏️ BHP · CSL 💉 CSL · WOW 🛒 Woolworths ·
WES 🔨 Wesfarmers (Bunnings/Kmart) · TLS 📡 Telstra · QAN ✈️ Qantas · JBH 🎧 JB Hi-Fi ·
DMP 🍕 Domino's AU · A2M 🥛 a2 Milk · COL 🛒 Coles · RIO ⛏️ Rio Tinto · FMG ⛏️ Fortescue ·
XRO 📊 Xero · COH 👂 Cochlear

**Crypto via CoinGecko (~5):**
BTC ₿ Bitcoin (`bitcoin`) · ETH Ξ Ethereum (`ethereum`) · DOGE 🐶 Dogecoin (`dogecoin`) ·
SOL ◎ Solana (`solana`) · ADA 🔷 Cardano (`cardano`)

Total: ~50 stocks + ~5 crypto = ~55 assets.

## 6. Price + news pipeline

`lib/invest/prices.ts` → `ensureDailyRealPrices(supabase)`, cloned from
`lib/trading/prices.ts:ensureDailyPrices`. Called non-blocking on page load
(`void ensureDailyRealPrices(supabase)`).

1. **Proxy check:** if `BTC` already has a `real_asset_prices` row for today → return.
2. **Crypto:** one CoinGecko `/simple/price?ids=...&vs_currencies=usd&include_24hr_change=true`
   call (no key) → price + 24h change for all crypto at once.
3. **US stocks:** Finnhub `/quote?symbol=...&token=FINNHUB_API_KEY` per symbol → `c` (current),
   `pc` (prev close).
4. **ASX stocks:** Yahoo `https://query1.finance.yahoo.com/v8/finance/chart/<SYM>.AX` → last close +
   prev close. Unofficial; wrap in try/catch.
5. Convert all to integer **cents**; compute `change_pct = (price - prev_close)/prev_close`.
6. **News** (see §7) for US stocks + crypto.
7. **Upsert** one row per asset for today (`onConflict: symbol,price_date, ignoreDuplicates`).

**Rate limits:** Finnhub free = 60 calls/min. ~35 quotes + ~35 company-news ≈ 70 Finnhub calls, so
the daily job must **throttle** (chunk with small delays) or fetch news for a rotating subset. Because
the job is once-daily and runs non-blocking in the background, a ~1–2 minute run is acceptable.

**Failure handling:** each asset fetched independently inside try/catch. On failure, **keep
yesterday's row** for that asset and log; never throw / never crash the page. Crypto, US, and ASX
fetch independently so one provider's outage can't block the others.

**Charts:** `real_asset_prices` accumulates one row/asset/day, so the 30-day chart (reuse
`PriceHistoryChart`) builds over time. **Optional v1 nicety:** backfill ~30 days on first run
(CoinGecko `market_chart`, Finnhub `candle`, Yahoo `chart?range=1mo`). Marked optional — ship without
if it adds friction.

**Market hours:** crypto is 24/7; stocks freeze nights/weekends (providers return last close). Fine
for a once-daily model — a kid sees Friday's close all weekend. No special handling.

## 7. News (kid-safe)

`lib/invest/news.ts`, reusing the `lib/trading/news-generator.ts` Claude Haiku pattern.

Problem: raw financial headlines are dry/jargon-heavy and occasionally not kid-appropriate. So:

1. **Fetch real news:** US stocks → Finnhub `/company-news?symbol=...&from=...&to=...`; crypto →
   Finnhub crypto news category. ASX news **deferred** in v1.
2. **Rewrite kid-friendly via Haiku** (`claude-haiku-4-5-20251001`): real headline + summary →
   `{ headline, body }`, punchy and age-appropriate. Prompt instructs it to skip/neutralize anything
   unsuitable for kids and not to spell out whether it's good/bad for the price.
3. **Cache** `news_headline`, `news_body`, `news_url` (link to the real source for curious parents)
   on the `real_asset_prices` row.
4. **Display** in the asset detail sheet.

Cost: ~50 Haiku calls/day at ~120 tokens — trivial, non-blocking, cached once daily. On any error,
fall back to no-news (price still renders).

## 8. Kid screens & UX

Reuse `components/trading/` patterns under new `components/invest/` (Invest*-prefixed). Entry:
new **"Invest" card in the Play hub** → `/play/invest?kid=<id>` (wrapped by `KidShell` via the
`?kid=` query param, exactly like `/play/trading`).

1. **Locked state** — `investing_enabled = false` → "Ask a parent to unlock Investing 🔒"; no
   deposit/trade access.
2. **Onboarding** (first visit) — short explainer: real cash, real companies, daily price changes,
   you can win or lose. Reuses `TradingOnboarding` pattern.
3. **Market tab** — assets grouped **Stocks / Crypto**; each row: emoji, name, price ($), today's
   change % (green ▲ / red ▼), mini sparkline (`PriceSparkline`). Tap → detail sheet.
4. **Asset detail sheet** (`InvestAssetDetailSheet`) — 30-day chart, price + change, kid-friendly
   news card (with read-more link), buy/sell actions.
5. **Buy/Sell** — amount-based: "Invest `$▢` in Apple" → preview fractional quantity. Sell by amount
   or "sell all". Confirmation shows the day's price. Server re-validates price + balances.
6. **Deposit/Withdraw modal** (`InvestDepositWithdrawModal`) — move dollars between cash balance ⇄
   invest account; shows both balances.
7. **Portfolio tab** — total value (account cash + holdings at today's price); total gain/loss vs
   deposited (colored); per-holding rows with each asset's P&L.
8. **Activity tab** — transaction history.

**Money display:** dollars & cents ($12.50); gains/losses always colored + signed.

Detailed visual mockups produced next via the `visual-mockups` skill before plan-writing.

## 9. Parent control

- `kids.investing_enabled boolean default false` — parent must explicitly enable per kid.
- Toggle control in the parent dashboard (per kid). Placement on `/parent/kids` (or kid edit) —
  finalized during planning.
- When off: locked kid state **and** server actions re-check the flag (never trust the client).

## 10. Correctness & security

- All money in **integer cents**; quantities `numeric` with crypto-grade decimals.
- Pure money math isolated in `lib/invest/math.ts` (amount→quantity, weighted avg cost, holding
  value, realized/unrealized P&L) — no I/O, unit-testable.
- **Server-authoritative pricing:** buy/sell re-fetch the cached day price server-side (like
  `trading.ts:fetchTodayPrice`); client price is display-only.
- **Write order** mirrors `lib/actions/trading.ts`: mutate the dependent record first, debit/credit
  balance only after success; revert optimistic UI on failure.
- **RLS** family-scoped on all `invest_*` tables; server actions verify caller owns `kidId`.
- **Guards:** deposit ≤ cash balance; buy ≤ account cash; sell ≤ owned qty; reject when
  `investing_enabled` is false; enforce $0.50 minimum trade; reject unknown symbols.

## 11. Acceptance criteria (Aim)

The repo has **no test runner** (per CLAUDE.md), so acceptance is build/typecheck + structured
manual verification:

1. `npm run typecheck` and `npm run build` pass clean (no new errors/warnings).
2. `lib/invest/math.ts` pure functions exist, structured for unit testing, with documented
   example-based assertions (input → expected output).
3. **Manual E2E checklist** passes:
   enable a kid → deposit $5 → buy $2 Apple + $1 BTC → portfolio value tracks prices →
   sell some → withdraw → `cash_balance` reflects realized P&L → disable kid → locked state returns.
4. `real_asset_prices` populates for all assets on first load; kid-friendly news renders for US
   stocks + crypto; a simulated provider failure keeps yesterday's price without crashing the page.
5. Per-kid `investing_enabled` gate works on both the client (locked screen) and server (action
   rejects when disabled).

## 12. File plan (high level)

**New**
- `supabase/migrations/0041_invest_simulator.sql` — 4 tables + RLS + `kids.investing_enabled`
- `lib/invest/assets.ts` — `REAL_ASSETS` registry
- `lib/invest/prices.ts` — `ensureDailyRealPrices`
- `lib/invest/news.ts` — real-news fetch + Haiku rewrite
- `lib/invest/math.ts` — pure money math
- `lib/actions/invest.ts` — deposit / withdraw / buy / sell server actions
- `app/play/invest/page.tsx` — entry page (clone of `app/play/trading/page.tsx`)
- `components/invest/*` — `InvestHub`, `InvestMarketTab`, `InvestPortfolioTab`,
  `InvestActivityTab`, `InvestAssetDetailSheet`, `InvestDepositWithdrawModal`, `InvestOnboarding`
- Parent toggle control component

**Modified**
- `lib/domain/types.ts` — new domain types
- `lib/data/queries.ts` (+ `lib/data/stub.ts` re-exports) — invest queries
- `lib/supabase/database.types.ts` — regenerate
- Play hub — add "Invest" card
- Parent kids screen — add per-kid toggle
- `.env.example` — document `FINNHUB_API_KEY`

**Env**
- `FINNHUB_API_KEY` in `.env.local` (git-ignored; server-only). CoinGecko + Yahoo need no key.

## 13. Out of scope (deferred)

- Leaderboard, dividends/interest, home-screen investment widget.
- Deposit cap / per-trade parent approval (only on/off toggle in v1).
- ASX news.
- Real brokerage integration / real securities custody.
- Intraday or live pricing.
- Daily price cron (lazy-on-load only in v1).
