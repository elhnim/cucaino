# Dream Life — "Many Lives, One Freedom" — Complete Design Spec

> **Status:** COMPLETE — approved for implementation planning.
> Supersedes `2026-06-01-money-town-v2-full-gameplay-design.md` (this doc absorbs and completes it).
> **Relationship to Money Town:** Dream Life is a NEW game. Money Town stays in the Play hub
> untouched as the quick/simple game for younger kids. Dream Life is the deep-strategy game.
> **Build philosophy:** complete engine + one career end-to-end (🔧 Tradesperson). Other careers ship later.
> **Core philosophy:** every life path leads to financial freedom — just different challenges and timelines.

---

## 1. Identity & placement

- **Name:** Dream Life. **Tagline:** *"Many lives, one freedom."*
- **Premise:** turn = 1 year of your life, from age 13 to financial freedom (or 65).
- **Route:** `/play/dream-life` (`?kid=<id>` query param so KidShell wraps it, same as other play screens).
- **Play hub cards:**
  - 🏙️ **Money Town** — "Quick game · 5–10 min" (younger kids, code untouched except mini-game import paths)
  - 🌟 **Dream Life** — "Live a whole life · deep strategy · 30–60 min" (older kids)
- **Players:** 1–4, pass-the-tablet, lobby pattern mirrors Money Town's `GameLobby`.
- **Session model:** long game (30–60 min) with auto **save/resume** (§9) — like a board game left set up on the table.

---

## 2. Design goals → mechanics

| Goal | Mechanic |
|---|---|
| No clear winning strategy | Win = passive income ≥ expenses (**two levers**: grow income *or* shrink expenses) + 4 viable win paths + automatic lifestyle inflation punishing pure earners |
| Luck ~25% | Reel events / market rolls / mini-games ≈ 25%; decisions ≈ 75%; insurance + diversification let skilled players buy down variance |
| High risk, high return | Variable Phase 3 returns: crypto/business swing hard, index/savings stay safe |
| Invest in yourself for later gain | Phase 1 skills → Phase 2 education → Phase 3 skill ladders to L10 |
| Good assets → wealth + passive income | The Phase 3 asset engine; the win condition itself |
| Higher salary = higher living cost | Lifestyle inflation baked automatically into each career rank (sub-linear, §6) |
| Life events & setbacks | Universal life deck + career decks + per-asset event decks + market-wide events |
| Fun + educative | Mini-games, social/market drama, building your passive-income engine |
| Competitive & replayable | 12 careers (1 built, 11 backlog), skill-gated reel, variable events, the visible race |
| Cross-player actions | Market-wide events hit everyone, offensive power-ups, visible race (auctions deferred, §10) |
| Decisions over luck | One meaningful action every single turn, applied **before** the year's luck |

---

## 3. The spine

**Turn = 1 year of life, across all three phases.** A player's turn count *is* their age.

### Win condition — passive income ≥ expenses
**The first player whose passive income covers their expenses wins** — financial freedom (FIRE).
**Passive income** = the **net cash yield** of all assets (rent + dividends + interest + business
profit − asset expenses) plus permanent passive streams (apprentices, Chairman pay, Side Hustle).
When that annual cash ≥ living expenses (lifestyle + debt interest + premiums), you're free.
**Backstop:** if nobody frees themselves by **age 65**, the highest **net worth** wins (the home
you live in is excluded from net worth — you can't spend it).

> *The 4% rule as a taught heuristic.* "A diversified portfolio pays ~4%, so aim for ~25× your
> expenses in assets" is printed on the freedom card as a real-world FIRE rule of thumb — but the
> **win math is actual per-asset cash income**. Income is what frees you, so a growth-only pile
> (crypto, appreciating shares) **doesn't win until harvested** into income assets or used to pay
> down debt — the core capital-allocation lesson (§6 "accumulate → harvest").

Two levers make this un-dominable:
- **Grow the income side** — buy income assets (commercial property, business, paid-off residential)
- **Shrink the expense side** — live frugally, own your home outright, kill debt interest

A high-earning specialist and a modest tradie can *both* win — one via a big income engine, the
other by keeping the bar low. **Growth assets are the accelerator; income assets are the finish line.**

### The luck dial (~25%) — operational definition
"~25% luck" is a **measurable balance target**, enforced three ways:

1. **Bounded random checks per year — at most 2.** Phase 1: one reel draw. Phase 3: one reel draw
   **+** per-asset market rolls (one roll per held asset — holding the asset = carrying its dice, a
   player choice). Power-up draws and mini-games only occur *as a result of* those checks or of a
   player's own decision, so they don't add independent randomness.
2. **Capped magnitude.** A single random outcome's cash swing is bounded relative to the player's
   annual *net* income — Phase 1 cards ±$100–300 (vs ~$2K net); Phase 3 event cards and per-asset
   bands are capped so no single check moves more than ~½ of one year's net.
3. **Buy-down.** Insurance halves the downside of bad events; diversification halves realised
   asset variance. A careful player pulls realised variance well below 25%; a reckless one (all
   crypto, no insurance) pushes it above — that's their choice, not the baseline.

**Acceptance test (§12):** across many simulated games of equally-skilled play, ≤ ~25% of the
variance in time-to-freedom traces to random sources; ≥ ~75% to decisions.

---

## 4. PHASE 1 — Teen Gigs (LOCKED)

Ages **13 → 17**, exactly **4 turns**. Learn the core loop, build skills, earn the career gate.

- Every player starts with **$5,000 cash** (a cushion that makes costly actions survivable).
- Starting gig **randomly assigned** by the reel (8 balanced Tier-1 gigs, ~$10K salary / ~$2K net).
- Each action can be taken **max 2×** across Phase 1 → each ladder reaches **Level 3 at most**;
  you cannot max everything.

### Turn structure — a one-year story
- **Action** = *"What are you doing this year?"* (your strategy)
- **Event** = *"What happened during the year?"* (life's curveball)
- **Gig income** = *"What you got as a result this year"* (the payoff)

1. **Pick one action** (the whole menu — no separate invest step):
   - 💰 **Invest** *(no income cost)* → Money Smarts +1; move cash on hand into your unlocked tier
   - 🏆 **Work harder** *(no income cost)* → Pro Skills +1; promotion revealed next turn
   - 🛡️ **Hustle** *(−20% off gross salary; net can dip negative)* → Grit +1; spin for a better gig next turn
   - 🧠 **Study** *(−50% off gross salary; net can go negative)* → Big Brain +1; spin for a knowledge job next turn
2. **Spin the reel** → 70% **Card** (life event, ±$100–300) or 30% **Mini-game** (win ~$200–300, lose nothing)
3. **Earn gig income** — net income added to cash
4. **End of turn (automatic)** — investments grow by their return rate and compound

> Income costs come off **gross salary** while expenses keep running, so a Hustle/Study year can
> push net negative — the $5K cushion absorbs it. **Safeguard:** you can't take an action that
> would drop year-end cash below $0.
>
> **Progression is never blocked.** 💰 Invest and 🏆 Work harder have **no income cost**, so at
> least one meaningful action is *always* affordable; the safeguard only ever greys out costly
> Study/Hustle. This also guarantees "≥ Level 2 in two skills" for every player. *(The balance
> pass confirms by simulation that no income/event combination can leave a player unable to act.)*

### Skill ladders (consistent Level 1 / 2 / 3)

| Skill | Level 1 (start) | Level 2 | Level 3 |
|---|---|---|---|
| 💰 **Money Smarts** | 🏦 Savings — $1K min, ~4%/yr (safest) | 📊 Index Fund — $2K min (lower risk) | 📈 Shares — $3K min (higher risk) |
| 🏆 **Pro Skills** | Base worker | Senior — +$2K/yr | Team Leader — +$5K/yr total |
| 🛡️ **Grit** | Tier 1 gigs — ~$2K net | Tier 2 gigs — ~$10K net | Tier 3 gigs — ~$13K net |
| 🧠 **Big Brain** | Tier 1 gigs — ~$2K net | Tier 2 jobs — ~$13K net | Tier 3 jobs — ~$18K net |

**Action effects & reveals:**
- 💰 **Invest** — relocates cash into the unlocked tier. Min deposit per tier, **no maximum**.
  Returns pay at end of each turn and **compound**. Money Smarts level carries forward forever.
- 🏆 **Work harder** — reveal: promotion (auto salary bump).
- 🛡️ **Hustle** — switching gigs is **free** (cost already paid). Reveal: spin for a random Tier 2 (then Tier 3) gig.
- 🧠 **Study** — switching is **free**. Reveal: spin for a random Tier 2 (then Tier 3) knowledge job.

### Mini-games (shared code, moved to `components/games/`)
`CoinRain`, `LemonSqueeze`, `CashGrab`, `PetRush`. The reel picks one at random on a Mini-game
result. Phase 1 **guarantees every player exactly 2 mini-game opportunities** (pity-timer: 2 of
the 4 reel results are mini-games; the rest stay 70/30 cards/games). **Mini-game wins earn talent
tokens** that gate the Talent careers (§5) and **earn power-ups** in Phase 3.

> Phase 1 structure is LOCKED. Exact tuning numbers (cost %s, job nets, returns, starting cash)
> are finalised in the balance pass (§12).

---

## 5. The Career Reel (age 17)

At the end of Phase 1, each player spins a **skill-gated, hard-gate** reel.

**Rule:** your pool = **every career you qualify for**; you spin randomly among them. Careers you
didn't earn show locked/greyed.

- Gate = a Phase 1 **skill level** (L2 = took the action once, L3 = twice) **or mini-game wins**.
- **No fallback needed:** 4 actions over Phase 1 (cap 2× each) guarantee ≥ Level 2 in two or more
  skills, so everyone qualifies for multiple careers.
- **Generalist** (1-1-1-1) → L2 in all four → wide, varied spin. **Specialist** (2-2) → L3 in two
  skills → those lanes' prestige careers → narrow, high-end spin.

### The 12-career roster

**Skill-gated (8):**

| Lane | Skill | L2 — accessible | L3 — committed |
|---|---|---|---|
| 🧠 Knowledge | Big Brain | 👩‍🏫 Teacher | 🩺 Doctor |
| 🏆 People | Pro Skills | ⚖️ Lawyer | 🏛️ Politician |
| 💰 Capital | Money Smarts | 💼 Tycoon | 📈 Investment Banker |
| 🛡️ Hands-on | Grit | 🔧 **Tradesperson** ⭐ | 🚜 Farmer |

**Talent track (4)** — gate = **talent tokens** from mini-game wins (1 win ≈ L2, 2 wins ≈ L3):

| Gate | Careers |
|---|---|
| 1+ talent token | 🎨 Artist · 📱 Influencer |
| 2+ talent tokens | 🏅 Pro Athlete · 🎵 Musician |

⭐ = the career built in v1. **First-build behaviour:** the reel shows all 12 careers with the
player's qualified pool lit; the spin lands on 🔧 Tradesperson (the only built career) with a
**"More lives coming soon!"** banner. The qualification game still matters — talent tokens and
skill levels carry Phase 2/3 perks regardless.

### What Phase 1 carries forward
Cash · investments · all four skill levels (the ladders continue to L10, §7) · talent tokens ·
mini-game wins.

---

## 6. PHASE 2 — Education / Training

**Purpose:** invest years in yourself for a bigger Phase 3, and learn **good vs bad debt**. Each
career has its own timeline — the contrast IS the lesson.

### Career timelines (framework for all 12)

| Archetype | Careers | Length | Income while training | Debt | Enters Phase 3… |
|---|---|---|---|---|---|
| **Earn-while-learn** | 🔧 Tradesperson, 🚜 Farmer | 3 yr | Low, rising | Little/none | Early, debt-free, already investing |
| **Study-heavy** | 🩺 Doctor, ⚖️ Lawyer, 📈 Banker | 5–6 yr | **$0** | **High education debt** | Late + indebted, but big salary |
| **Mixed** | 👩‍🏫 Teacher, 💼 Tycoon | 3–4 yr | Part-time | Moderate | Middle of pack |
| **Talent** | 🏅 Athlete, 🎵 Musician, 🎨 Artist, 📱 Influencer | 0–2 yr | Boom/bust | Low | Early but volatile |

> The Tradie is *digging up* (earning + investing at 17) while the Doctor is *digging out*
> (graduating ~23 owing a fortune). Different timelines, same finish line.

### Debt = the mirror of investing (introduced here)
- An investment grows *your money*; a debt grows what you *owe*. **Same compounding, opposite direction.**
- Debt has a balance + interest rate; **unpaid debt grows at end of turn**. Repay from cash anytime.
- **Interest is a recurring expense** → it pushes your win bar up.
- 🟢 **Good debt** — borrow to buy something that earns (tools/ute now; a mortgage on a rental later).
- 🔴 **Bad debt** — borrow for things that lose value (temptation cards: *"V8 on finance?"*).

### 🔧 Tradesperson apprenticeship (v1 build) — 3 years, ages 17→20
Each year: spin the reel + earn a **rising apprentice wage** + pick one action:

| Action | This year | Payoff |
|---|---|---|
| 🎓 **Master the trade** | — | +1 Qualification rank → higher Phase 3 starting salary |
| 💪 **Overtime** | +cash now | nothing long-term |
| 💰 **Invest** | deploy cash (Money Smarts tier from P1) | compounding continues |
| 🚚 **Tool up** *(good debt)* | loan → income boost | owe balance + interest |

Apprentice wages (reference, balance-tunable): year 1 ~$28K, year 2 ~$36K, year 3 ~$45K, with a
lifestyle expense of ~75% of wage (young, living cheap). Graduate at 20 → qualified Tradesperson
into Phase 3, carrying rank + cash + investments + any debt.

---

## 7. PHASE 3 — Established Career (the main game)

**Turn = 1 year.** Graduation → freedom (or age 65). A strong player frees themselves in their **30s–40s**.

### Lifestyle inflation — automatic *default* (sub-linear), with active expense levers
Every career rank carries a built-in **salary AND a default lifestyle expense**. Climbing the rank
ladder raises living cost automatically — no per-raise prompt.

**Critical balance rule: auto-lifestyle is *sub-linear*** — a *smaller %* of salary at higher
ranks (Tradesperson: 68% → 65% → 61% → 57%). A flat % would make rank-climbing a trap; sub-linear
lifestyle gives higher ranks a better **savings rate**, keeping rank-climbing competitive with
frugality. Still "higher salary = higher living cost" — just not 1:1.
- 🔧 Tradie ranks (salary/lifestyle): $65K/$44K · $85K/$55K · $110K/$67K · $150K/$85K.

**The "shrink expenses" lever is real and active** — the auto-lifestyle is only the *default*:

| Expense lever | Effect | Teaches |
|---|---|---|
| 🪙 **Downsize / Live Modestly** (action) | Set lifestyle **one bracket below** your rank (cap: ~16% below default) | You don't have to spend what you earn |
| 🏡 **Buy your home outright** (action, ~$180K) | Permanently removes the **housing slice** (~30% of lifestyle) | Owning beats renting; killing a fixed cost is wealth |
| 🏦 **Pay down debt** (action) | Removes the **interest** portion of expenses | Killing bad debt frees cash flow |
| 🧗 **Don't over-climb** (choice) | Stay at a lower rank → lower auto-lifestyle | More salary isn't always better |

This is what makes the 🐢 **Frugal Tortoise** path viable: modest rank + downsized lifestyle +
owned home + no debt = a tiny expense bar that steady index/property income clears early.

### The yearly loop — *plan, then live the year*
**Your action is your plan for the year; the reel is what actually happens; then the year settles
up.** Action resolves **first**, so your decision shapes that same year's outcome.

1. **Take ONE action** *(~75% decision)* — applied *before* luck hits:
   - 🏠 **Buy an asset** → in play (and exposed to its event deck *this* year)
   - 🏆 **Work harder** → climb the Pro Skills ladder (career rank — see skill rule below)
   - 💰 / 🛡️ / 🧠 **Invest / Hustle / Study** → +1 to that skill ladder (and its action effect)
   - 🏦 **Pay down debt** → cuts *this year's* interest
   - 🛡️ **Buy insurance** → softens a bad reel result *this same year* (annual premium = expense)
   - 🏡 **Buy your home outright** · 🪙 **Downsize** → expense levers
   - 💱 **Harvest / Convert** → sell a growth asset into income assets or debt payoff
   - 🃏 **Play a proactive power-up** counts as free (one power-up max per turn, §8)
2. **Spin the reel** *(~25% luck)* — the year unfolds onto the position you just took. Reel mix
   (balance knobs): **45% universal life card · 30% career card · 10% market-wide event · 15%
   mini-game.** Then **each held asset rolls** its Risk/Opportunity dice.
3. **Settle the year:** receive income (salary + passive income) → pay expenses (lifestyle + debt
   interest + premiums) → apply asset growth/shrink + event effects → debt balances grow.
4. **Check win:** `passive income ≥ expenses`?

> **Cash income vs net-worth growth.** *Yield* (rent, dividends, interest, business profit −
> asset expenses) is **cash paid into your balance** each year — your **passive income**, the
> thing the win checks. *Appreciation* grows an asset's **value/net worth** — raw material you
> later *harvest* into income assets. A growth-only pile builds net worth but **doesn't win until
> converted.**

### Skill leveling — the global rule
All four skills are **peers**, leveled by the same mechanic across all three phases:
- **1 skill action = +1 level** (revealed next turn), always. No progress bars.
- **L10 is the max.** Maxing a skill is a 9-action commitment — the real cap is *opportunity
  cost*: every level-up is a turn not spent buying assets or paying debt.
- Difficulty comes from **where unlocks sit on the ladder**: valuable things sit high.
- Phase 1 reaches L3 max; Phases 2–3 carry the climb upward.

The four skills are **four strategic identities** — four ways to win the same game:
- 💰 **Money Smarts** → *Assets* — **buy** your way free
- 🏆 **Pro Skills** → *Corporate Ladder* — **climb** your way free
- 🛡️ **Grit** → *Self-Made Grind* — **endure / out-hustle** your way free
- 🧠 **Big Brain** → *Knowledge & Strategy* — **outsmart** your way free

Every level has a **concrete, coded benefit** (`[SKILL]-L##`). L1–L3 are locked to the Phase 1
ladder; L4–L10 are the Phase 2–3 extension. Numbers balance-tunable; mechanics fixed.

#### 💰 Money Smarts (`MS`) — leveled by **Invest**
| Code | Benefit |
|---|---|
| `MS-L01` 🔒 | Buy **Savings** (4% income) |
| `MS-L02` 🔒 | Buy **Index Fund** |
| `MS-L03` 🔒 | Buy **Shares** |
| `MS-L04` | **Fee Cut** — all asset Expenses **−25%** + unlocks 🏢 Business (with PS+GR L4) |
| `MS-L05` | Buy **Residential Property** |
| `MS-L06` | **Sharper Eye** — **+1pp** value growth on all assets |
| `MS-L07` | Buy **Commercial Property** |
| `MS-L08` | **Steady Hand** — every 🔴 asset event **25% smaller** |
| `MS-L09` | Buy **Crypto** |
| `MS-L10` | **Master Investor** — **+1pp** income on all income assets |

#### 🏆 Pro Skills (`PS`) — leveled by **Work Harder** *(The Corporate Ladder)*
| Code | Benefit |
|---|---|
| `PS-L01` 🔒 | Base salary |
| `PS-L02` 🔒 | +$2K/yr salary |
| `PS-L03` 🔒 | +$5K/yr salary total |
| `PS-L04` | **Career Rank 2** (skinned per career; Tradesperson: Licensed Specialist) + unlocks 🏢 Business (with MS+GR L4) |
| `PS-L05` | **Bonus** — yearly bonus = 10% of salary |
| `PS-L06` | **Stock Options** — shares worth 8% of salary added to net worth/yr |
| `PS-L07` | **Career Rank 3** (Tradesperson: Contractor) + bonus 15% |
| `PS-L08` | **Network** — purchases −10% |
| `PS-L09` | **Career Rank 4** (Tradesperson: Master Contractor) + bonus 25% |
| `PS-L10` | **Legacy** — 30% of top-rank pay becomes **passive for life** + one-off 1yr-salary parachute |

> ✅ **Pro Skills = career rank (LOCKED).** One advancement ladder, not two. The salary-rank rungs
> (`PS-L04/L07/L09`) hold the career's salary ranks, skinned per career; the gap rungs are the
> universal corporate perks. **Work Harder climbs this ladder** — there is no separate "upgrade
> career rank" action. Pro Skills makes you a top earner *who is still working*; the 🏢 Business
> asset is the separate leap to *owning* — **climb vs. own.**

#### 🛡️ Grit (`GR`) — leveled by **Hustle** *(The Self-Made Grind)*
| Code | Benefit |
|---|---|
| `GR-L01` 🔒 | Tier 1 gigs ~$2K net |
| `GR-L02` 🔒 | Tier 2 gigs ~$10K net |
| `GR-L03` 🔒 | Tier 3 gigs ~$13K net |
| `GR-L04` | **Tough** — every 🔴 life-event loss **25% smaller** + unlocks 🏢 Business (with MS+PS L4) |
| `GR-L05` | **Side Hustle** — **+$5K/yr** guaranteed cash |
| `GR-L06` | **Thick Skin** — offensive cards hit you at **50%** |
| `GR-L07` | **Hustle Empire** — Side Hustle rises to **+$12K/yr** |
| `GR-L08` | **Hardened** — injury & illness events have **zero effect** |
| `GR-L09` | **Relentless** — Hustle & Overtime pay **+50%** |
| `GR-L10` | **Unbreakable** — once/game, reduce any single loss to **$0** |

#### 🧠 Big Brain (`BB`) — leveled by **Study** *(Knowledge & Strategy)*
| Code | Benefit |
|---|---|
| `BB-L01` 🔒 | Tier 1 ~$2K net |
| `BB-L02` 🔒 | Tier 2 jobs ~$13K net |
| `BB-L03` 🔒 | Tier 3 jobs ~$18K net |
| `BB-L04` | **Quick Learner** — skill actions reveal **immediately** (not next turn) + immune to Scam cards |
| `BB-L05` | **Foresight** — see the **next reel card** before choosing your action |
| `BB-L06` | **Planner** — while holding **3+ asset types**, all growth **+1pp** |
| `BB-L07` | **Researcher** — once/turn **reroll a negative reel result** |
| `BB-L08` | **Analyst** — see rivals' exact cash, net worth, assets & hand |
| `BB-L09` | **Strategist** — each reel spin, **draw 2 and keep either** |
| `BB-L10` | **Genius** — once/game, **take 2 actions** in one turn |

### Master asset table (LOCKED — now including Business)

| Asset | 🔓 Unlock | 💵 Entry | 📈 Growth | 💵 Income | 🧾 Expenses | = Net yield | 🟢 Opp | 🔴 Risk | ⚪ Calm |
|---|---|---|---|---|---|---|---|---|---|
| 🏦 Savings | MS L1 | $1K min | 0% | 4% | 0% | **+4%** | 2% | 3% | 95% |
| 📊 Index Fund | MS L2 | $2,000 | 7% | 2% | 0.5% | **+1.5%** | 15% | 12% | 73% |
| 📈 Shares | MS L3 | $3,000 | 9% | 2% | 0% | **+2%** | 28% | 25% | 47% |
| 🏠 Residential Property | MS L5 | $20K dep *(of $100K)* | 7% | 5% | 5.6%¹ | **−0.6%**² | 17% | 18% | 65% |
| 🏢 Commercial Property | MS L7 | $90K dep *(of $300K)* | 4% | 8% | 4.85%³ | **+3.15%**² | 16% | 22% | 62% |
| ₿ Crypto | MS L9 | $1,000 | 11% | 0% | 0% | **0%** | 38% | 40% | 22% |
| 🏢 Business | **MS L4 + PS L4 + GR L4** | $120,000 | 6% | 18% | 8% | **+10%** | 22% | 30% | 48% |

¹ Residential: 20% deposit, 4.5% mortgage → 2% operating + (80% × 4.5%) 3.6% interest = **5.6%**.
² **Negatively geared while mortgaged** (resi −0.6%) — you pay to hold it, betting on growth; pay
down the loan and net yield climbs to **+3%** owned outright. Commercial is **positively geared**
(+3.15%) from day one — bought for income, not growth.
³ Commercial: 30% deposit, 5.5% mortgage → ~1% operating (net lease) + (70% × 5.5%) 3.85% = **4.85%**.

**Asset personalities:** Savings = safe floor · Index = smooth wealth-builder · Resi =
leverage/growth (deleverage to flip cash-flow positive) · Shares = concentrated growth bet ·
Commercial = income play (vacancy risk) · Crypto = pure gamble (grow then harvest) · **Business =
the generalist's crown: best net yield in the game, riskiest income asset, gated behind three
skill ladders** — rewards the player who spread their actions instead of rushing one ladder.

### Risk profile — a per-turn event roll
Each asset you hold rolls once each turn: 🔴 **Risk %** → draw from its bad deck · 🟢
**Opportunity %** → draw from its good deck · ⚪ **Calm** → baseline growth + income only.
Risk = frequency × magnitude. Diversification and insurance shrink realised variance (§3 buy-down).

**The strategic arc — accumulate → harvest.** Growth assets build net worth but pay little/no
income. Income assets pay the cash that frees you. Crypto is the extreme: $0 income — a crypto
fortune *cannot win* until sold into income assets or debt payoff. *Grow wealth on the risk side;
harvest it onto the income side.* Paying down a rental's mortgage both lowers expenses *and* flips
it cash-flow positive: a guaranteed return.

### Event decks (coded `[ASSET]-[N|P]##`)

**🏦 Savings**
| 🔴 Negative | | 🟢 Positive | |
|---|---|---|---|
| `SAV-N01` Inflation Bite | value −2% | `SAV-P01` Bonus Interest | value +3% |
| `SAV-N02` Bank Fee | −$200 cash | `SAV-P02` Term Deposit Special | interest 4%→6% |
| `SAV-N03` Rate Cut | interest 4%→2% | `SAV-P03` Sign-up Reward | +$300 cash |

**📊 Index Fund**
| 🔴 Negative | | 🟢 Positive | |
|---|---|---|---|
| `IDX-N01` Market Dip | value −4% | `IDX-P01` Bull Run | value +14% |
| `IDX-N02` Global Wobble | value −12% | `IDX-P02` Steady Climb | value +18% |
| `IDX-N03` Correction | value −15% | `IDX-P03` Santa Rally | value +10% |
| `IDX-N04` Dividend Cut | income 2%→0% | `IDX-P04` Dividend Boost | income 2%→3% |

**🏠 Residential Property**
| 🔴 Negative | | 🟢 Positive | |
|---|---|---|---|
| `RES-N01` Major Repair | value −2% | `RES-P01` Area Booms | value +15% + rent 5%→6% |
| `RES-N02` Vacancy | rent 5%→3% | `RES-P02` Dream Tenant | rent 5%→6% |
| `RES-N03` Housing Slump | value −8% | `RES-P03` Reno Adds Value | −1% cash → value +10% |
| `RES-N04` Rate Hike | mortgage 4.5%→6% | `RES-P04` Rent Surge | rent 5%→7% |
| `RES-N05` Bad Tenant | rent 5%→2% | `RES-P05` Rate Cut | mortgage 4.5%→3.5% |
| `RES-N06` Land Tax / Levy | expenses +1% | | |

**🏢 Commercial Property**
| 🔴 Negative | | 🟢 Positive | |
|---|---|---|---|
| `COM-N01` Long Vacancy | rent 8%→0% | `COM-P01` Long Lease Signed | rent 8%→9% + stability |
| `COM-N02` Tenant Downsizes | rent 8%→5% | `COM-P02` Blue-chip Tenant | rent 8%→10% |
| `COM-N03` Economic Downturn | value −12% | `COM-P03` Rent Review (CPI) | rent 8%→9% |
| `COM-N04` Rate Hike | mortgage 5.5%→7% | `COM-P04` Area Develops | value +12% |
| `COM-N05` Re-fit Costs | value −2% | `COM-P05` Rate Cut | mortgage 5.5%→4.5% |
| `COM-N06` Oversupply | value −8% | | |

**📈 Shares**
| 🔴 Negative | | 🟢 Positive | |
|---|---|---|---|
| `SHR-N01` Earnings Miss | value −25% | `SHR-P01` Earnings Beat | value +30% |
| `SHR-N02` Sector Crash | value −30% | `SHR-P02` Takeover Bid | value +40% |
| `SHR-N03` Scandal | value −20% | `SHR-P03` Product Launch | value +20% |
| `SHR-N04` Profit Warning | value −15% | `SHR-P04` Special Dividend | income 2%→3% |
| `SHR-N05` Dividend Slashed | income 2%→0% | `SHR-P05` Buyback | value +12% |

**₿ Crypto**
| 🔴 Negative | | 🟢 Positive | |
|---|---|---|---|
| `CRY-N01` Crypto Crash | value −50% | `CRY-P01` To the Moon | value +100% |
| `CRY-N02` Bear Winter | value −40% | `CRY-P02` Bull Mania | value +70% |
| `CRY-N03` Exchange Hack | value −60% | `CRY-P03` Halving Pump | value +50% |
| `CRY-N04` Regulation Crackdown | value −35% | `CRY-P04` Big Adoption News | value +40% |
| `CRY-N05` Rug Pull | value −80% | `CRY-P05` Whale Buys In | value +30% |

**🏢 Business** *(new — completes the engine)*
| 🔴 Negative | | 🟢 Positive | |
|---|---|---|---|
| `BUS-N01` Recession Year | income 18%→6% this yr | `BUS-P01` Breakout Year | value +25%, income →22% |
| `BUS-N02` Key Staff Quits | income →12% until you pay $10K to rehire | `BUS-P02` Big Contract | +$20K cash |
| `BUS-N03` Lawsuit | −$15K cash (insurable) | `BUS-P03` Franchise Offer | value +20% |
| `BUS-N04` New Competitor | value −15% | `BUS-P04` Star Hire | expenses 8%→6% permanent |
| `BUS-N05` Equipment Failure | −$8K cash | `BUS-P05` Media Feature | income →20% |

> `COM-N01 Long Vacancy` (rent → 0%) is deliberately brutal — the defining commercial risk.
> Revisit in balance pass if commercial under-performs.

### Universal life deck (Phase 3 reel — coded `LIF-*`)
| 🔴 Negative | | 🟢 Positive | |
|---|---|---|---|
| `LIF-N01` Illness | −$6K (insurance halves; GR-L08 zero) | `LIF-P01` Tax Refund | +$3K |
| `LIF-N02` Car Trouble | −$3K | `LIF-P02` Inheritance | +$10K |
| `LIF-N03` Surprise Tax Bill | −$4K | `LIF-P03` Side Gig Boom | +$5K |
| `LIF-N04` Scam Call | −$5K (**BB-L04+ sees through it: $0**) | `LIF-P04` Community Award | draw a power-up |

### Market-wide events (hit EVERY player — coded `MKT-*`, the cross-player drama layer)
| Card | Effect on all players |
|---|---|
| `MKT-N01` Global Crash | all Index/Shares/Crypto values −20% |
| `MKT-N02` Rate Hike Cycle | all mortgage rates +1pp this year |
| `MKT-P01` Property Boom | all property values +12% |
| `MKT-P02` Rate Cut Cycle | all mortgage rates −1pp this year |

### Career-specific deck — 🔧 Tradesperson (v1 build, coded `TRD-*`)
**Signature lesson:** turn your hands + skill into a business and assets **before your body wears out**.

| 🔴 Negative | | 🟢 Positive | |
|---|---|---|---|
| `TRD-N01` Injury On Site | salary −25% this yr (insurance halves; GR-L08 zero; **fires 2× as often after age 40**) | `TRD-P01` Big Tender Win | +$15K cash |
| `TRD-N02` Client Won't Pay | −$8K cash | `TRD-P02` Take On An Apprentice | **+$4K/yr passive income** (permanent, max 2) |
| `TRD-N03` Construction Downturn | salary −15% this yr | `TRD-P03` Reno Flip | own resi → value +12%; else +$5K cash |
| `TRD-N04` Body Wears Down | **age 45+ only: permanent −10% salary, stacks** — the clock that forces harvest/Business | `TRD-P04` Word Of Mouth | salary +10% this yr |

Career ranks are the Tradesperson skin of the `PS` ladder:

| `PS` rung | Rank | Salary | Lifestyle | Feel |
|---|---|---|---|---|
| `PS-L01–03` | Qualified Tradesperson | $65K | $44K (68%) | steady hands-on |
| `PS-L04` | Licensed Specialist | $85K | $55K (65%) | skilled, in demand |
| `PS-L07` | Contractor (self-employed) | $110K | $67K (61%) | more income, more variable |
| `PS-L09` | Master Contractor | $150K | $85K (57%) | top of the trade |

### Win paths — all viable (balance acceptance targets, §12)

| Path | Wins by | Risk |
|---|---|---|
| 🏦 **Earner-Saver** | high salary (PS ladder), low lifestyle, steady index/property | low |
| 🏠 **Investor** | leverage property + shares, harvest into income | medium |
| 🏢 **Entrepreneur** | multi-skill spread → Business → huge passive income | high |
| 🐢 **Frugal Tortoise** | modest rank, tiny expenses → low win bar | low |

---

## 8. Power-up cards

Collectible cards giving a unique advantage, **held in hand** (max 3), played on your terms —
*deciding when* is the strategy.

**How you earn them (mostly skill):** 🎮 win a mini-game → draw one (main source) · 🏆 hit a
milestone (first asset, career rank) → earn a **permanent** card · 🃏 occasional reel draw
(`LIF-P04`) — the small luck sprinkle.

### ⭐ Permanent (milestone-earned, always on, one of each per game)
| Card | Type | Effect (forever) | Milestone |
|---|---|---|---|
| 🧰 Master Tradie | economic | +10% trade income | reach Contractor rank |
| 💎 Golden Touch | economic | +2% on all investment returns | hold 4+ asset types |
| 🛡️ Iron Body | defensive | immune to injury/illness events | survive 3 injury/illness events |
| 📊 Steady Hand | defensive | assets lose **half** as much in any crash | hold through 2 crashes |
| 👑 Reputation | defensive | offensive cards hit you at **50%** | reach Master rank |
| 🧲 Dealmaker | utility | purchases −5% | buy your home outright |

### 🎯 Offensive one-offs
😈 Market Move (crash a rival's risky asset) · ⚖️ Lawsuit (rival pays you a settlement) ·
🧲 Headhunt (rival's lifestyle secretly inflates) · 📉 Short Sell (profit when a rival's asset
drops this turn) · 💼 Poach (cut a rival's business/apprentice income) · 🎭 Scandal (rival's
business income halved this turn) · 🚧 Red Tape (block a rival's next buy/upgrade) · 🪤 Audit
(rival pays a surprise expense) · 🔌 Jammer (cancel a power-up just played).

### 🛡️💰🃏 Support one-offs
**Defensive:** 🪖 Hard Hat (block a bad event) · 🏥 Safety Net (ignore next injury) · 🔒 Hedge (no
drop in next crash). **Economic:** ⚡ Double Down (2× one return) · 📈 Hot Tip (best market roll) ·
🎟️ Grant (free upgrade) · 🧾 Tax Break (no expenses one year). **Wildcard:** ➕ Hustle (2nd
action) · 🔄 Pivot (switch, no penalty) · 🎲 Copycat (copy a card just played).

### Balance & timing rules
- **Rarity by power:** permanents rarest (milestones only) · swingy one-offs (Tax Break, Jammer)
  uncommon · mild ones (Hard Hat, Double Down) common. Draw rates set in balance pass.
- **One power-up played per turn** (plus any reactive card). No combo-dumping.
- **Proactive vs Reactive:** each card is tagged. **Pass-and-play rule:** reactive cards
  **auto-prompt the holder the moment their trigger fires** (e.g. a bad event lands on you → the
  game asks "Play 🪖 Hard Hat?") — no off-turn interrupts needed on a shared tablet.
- **Counterplay guaranteed:** every offensive card has a named answer (Hard Hat / Safety Net /
  Hedge / 👑 Reputation / Jammer). A defence-holder is never helpless.
- **Magnitude capped** like any random effect (§3): no single card outweighs a year of good decisions.

---

## 9. Save / resume

- **Auto-save after every reducer action** to `localStorage` key `dream-life:save:v1`.
- Saved blob = `{ schemaVersion, savedAt, state: GameState }`. The reducer is pure and the state
  is fully serialisable (no Date objects, no functions) — save/load is `JSON.stringify/parse` +
  a schema-version check. Unknown/older versions show "this saved game is from an older version"
  and offer New Game.
- **Lobby:** if a save exists, show a **"Resume your lives"** card (player names/emojis, ages,
  phase) above "New game". New game over an existing save requires an explicit confirmation.
- **One save slot** — like one board left set up on the table. (Supabase-backed multi-save is a
  possible v1.1+ if device-switching ever matters.)

---

## 10. First-build scope

**IN (v1):** complete engine (all 3 phases, win check, age-65 backstop) · all 4 skill ladders to
L10 with every coded benefit · all 7 asset classes + their decks · universal life deck ·
market-wide events · Tradesperson career (apprenticeship + ranks + deck) · power-up system
(permanents, offensive, support, proactive/reactive timing) · 4 shared mini-games · save/resume ·
1–4 player pass-and-play · rules carousel (RulesModal pattern).

**OUT (backlog, in priority order):**
1. The other 11 careers' Phase 2/3 content (roster + gates already defined; reel lands on
   Tradesperson with "more lives coming soon" until built)
2. 🔨 Asset auctions (the one cross-player mechanic that fights pass-and-play flow)
3. Supabase-backed saves / cross-device resume
4. Sim modelling of power-ups + offensive-card meta (v1 sim is economy + events)

**Money Town is NOT modified** except that the four mini-game components move from
`components/money-town/games/` to `components/games/` and Money Town's imports update — a pure
path change, no behaviour change.

---

## 11. Architecture

```
lib/dream-life/
  types.ts            — GameState, Player, Phase, Asset, Debt, PowerUp, GameAction union
  engine.ts           — pure reducer: (state, action) → state. No I/O, no randomness*
  selectors.ts        — passiveIncome(p), expenses(p), netWorth(p), winCheck(p), qualifiedCareers(p)
  rng.ts              — seeded RNG; all randomness flows through it (testable, replayable)
  save.ts             — localStorage persistence + schema version
  content/
    phase1.ts         — gigs, tier tables, Phase 1 reel cards
    skills.ts         — the 4 × L10 ladders, every coded benefit
    careers.ts        — 12-career roster, gates; Tradesperson ranks + apprenticeship
    assets.ts         — master asset table (7 classes, four fields, risk profiles)
    decks.ts          — all event decks (SAV/IDX/SHR/RES/COM/CRY/BUS/LIF/MKT/TRD)
    powerups.ts       — all cards, tags (proactive/reactive), rarities, milestones
components/dream-life/
  DreamLifeGame.tsx   — top-level client component, holds state via useReducer + save hook
  Lobby.tsx           — new game / resume, player setup
  Board.tsx           — phase-aware board (player cards, race-to-freedom bar)
  PlayerCard.tsx      — cash, age, skills, assets, freedom progress bar
  ActionPanel.tsx     — the one-action-per-year menu (phase-aware)
  ReelOverlay.tsx     — the year's reel spin + card reveal
  CareerReel.tsx      — age-17 career spin ceremony
  AssetSheet.tsx      — portfolio view: per-asset four fields + harvest/pay-down
  PowerUpHand.tsx     — hand of 3, play/reactive prompts
  RulesModal.tsx      — carousel teaching win condition, phases, assets
  WinScreen.tsx       — freedom ceremony + final standings
components/games/     — CoinRain, LemonSqueeze, CashGrab, PetRush (moved; shared with Money Town)
app/play/dream-life/page.tsx
scripts/dream-life-sim.mjs
```

\* The reducer receives pre-drawn random results (`SPIN_RESOLVED { card, assetRolls }`) produced
via `rng.ts`, keeping the engine pure and unit-testable, and making save/replay deterministic.

**Content is data, not code:** every card/asset/level cites its spec code (`MS-L04`, `TRD-N01`…)
so the balance pass edits `content/` only and the engine never changes.

---

## 12. Balance pass — rebuild & acceptance (BLOCKING before UI polish)

The old 2000-game sim (`scripts/money-town-balance-sim.mjs`) tuned a **4%-of-net-worth** rule on
a coarse asset model — superseded. New sim: `scripts/dream-life-sim.mjs`, modelling the **real
engine**: all 3 phases, 7 assets with event decks, skill ladders, lifestyle inflation, 4 strategy
bots (Earner-Saver / Investor / Entrepreneur / Frugal Tortoise). Timeboxed: it validates the
acceptance bars below, not perfection.

**Acceptance criteria:**
1. **No dominant strategy:** each of the 4 paths wins **15–35%** of 2000 four-player games.
2. **Luck dial:** ≤ ~25% of variance in time-to-freedom traces to random sources.
3. **Pacing:** median freedom age lands **mid-30s to mid-40s**; age-65 backstop fires in < 10% of games.
4. **Phase 1 safety:** zero simulated states where a player has no legal action.
5. **Rank-climbing is not a trap:** climbing the PS ladder yields earlier median freedom than
   staying at rank 1 with identical other play.

Four design laws the earlier pass proved (still hold): savings rate is the master variable ·
auto-lifestyle must be sub-linear · growth strategies need a harvest path to stay viable ·
expense levers must be capped (downsize cap ~16% below rank default).

**Reference numbers for first build** (sim output overrides): Phase 3 start age 20 with ~$12K
carried · Tradesperson ranks $65K/$44K · $85K/$55K · $110K/$67K · $150K/$85K · home purchase
~$180K removing ~30% lifestyle slice · life events ~60% of years bounded ±$8–11K · market-wide
events ~7% of years.

---

## 13. Careers backlog (11 remaining)

Roster + gates locked (§5). Build each career's Phase 2 + Phase 3 end-to-end, one at a time:
🚜 Farmer (Grit L3) · 👩‍🏫 Teacher (BB L2) · 🩺 Doctor (BB L3) · ⚖️ Lawyer (PS L2) · 🏛️ Politician
(PS L3) · 💼 Tycoon (MS L2) · 📈 Investment Banker (MS L3) · 🎨 Artist (1 token) · 📱 Influencer
(1 token) · 🏅 Pro Athlete (2 tokens) · 🎵 Musician (2 tokens).
Each lane has a distinct economic personality (athletes peak early then burn out, artists are
slow-burn/high-variance, doctors are late-but-stable) — teaching different money *timelines*.

---

## 14. Status

- [x] Identity, name (Dream Life), placement (alongside Money Town) — DECIDED
- [x] Phase 1 — LOCKED
- [x] Career reel + 12-career roster — LOCKED (v1 lands on Tradesperson)
- [x] Phase 2 framework + Tradesperson apprenticeship — COMPLETE
- [x] Phase 3 engine: yearly loop, lifestyle inflation, skill ladders L10 — LOCKED
- [x] Asset engine incl. 🏢 Business (multi-skill gate, four fields, decks) — COMPLETE
- [x] Universal life deck, market-wide events, Tradesperson deck — COMPLETE (coded)
- [x] Power-ups incl. pass-and-play reactive timing + milestone table — COMPLETE
- [x] Save/resume design — COMPLETE
- [x] Architecture — COMPLETE
- [ ] Balance sim rebuild + acceptance run (§12) — first implementation task
- [ ] Implementation plan (writing-plans)
- [ ] Visual mockups (visual-mockups skill) before UI build
