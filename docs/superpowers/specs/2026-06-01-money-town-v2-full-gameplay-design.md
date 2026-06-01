# Money Town v2 — "Many Lives, One Freedom" — Full Gameplay Design

> **Status:** Design complete for the core arc + first career (Tradesperson). Supersedes the
> `2026-05-22-money-town-v2-design.md` sketch. Exact tuning numbers are deliberately deferred to a
> single **end-to-end balance pass** once all three phases exist.
> **Build philosophy:** build one career end-to-end at a time — **Tradesperson first**.
> **Core philosophy:** every career path leads to financial freedom — just different challenges and timelines.

---

## 1. Design goals → mechanics

The whole design exists to satisfy these requirements. Each is mapped to the mechanic that delivers it.

| Goal | Mechanic |
|---|---|
| No clear winning strategy | Win = passive income ≥ expenses (**two levers**: grow income *or* shrink expenses) + 4 viable win paths + automatic lifestyle inflation punishing pure earners |
| Luck ~25% | Reel events / market rolls / mini-games ≈ 25%; decisions ≈ 75%; insurance + diversification let skilled players buy down variance |
| High risk, high return | Variable Phase 3 returns: crypto/business swing hard, index/savings stay safe |
| Invest in yourself for later gain | Phase 1 skills → Phase 2 education → Phase 3 career upgrades |
| Good assets → wealth + passive income | The Phase 3 asset engine; the win condition itself |
| Higher salary = higher living cost | **Lifestyle inflation baked automatically into each career rank** |
| Life events & setbacks | Reel life-event cards + market crashes |
| Fun + educative | Mini-games, auctions, social cards, building your passive-income engine |
| Competitive & replayable | 12 careers, skill-gated reel, variable events, career-specific decks, the visible race |
| Cross-player actions | Auctions, market-wide events, social cards, **offensive power-ups** |
| Decisions over luck | One meaningful action every single turn |

---

## 2. The spine

**Turn = 1 year of life, across all three phases.** A player's turn count *is* their age.

### Win condition
**The first player whose passive income ≥ their expenses wins** (financial freedom / FIRE).
Backstop: if nobody frees themselves by **age 65**, the highest **net worth** wins.

Two levers make this un-dominable:
- **Grow the left side** — passive income from assets/businesses (build wealth)
- **Shrink the right side** — expenses (live frugally)

A high-earning Doctor and a modest Tradie can *both* win — one via a huge asset pile, the other by keeping the bar low.

### The luck dial (~25%) — operational definition
"~25% luck" is a **measurable balance target**, not a vibe. It is enforced three ways:

1. **Bounded random checks per year — at most 2.** Phase 1: one reel draw. Phase 3: one reel draw **+** one market roll. Auctions, power-up draws and mini-games only occur *as a result of* those checks or of a player's own decision (entering an auction, spending to draw), so they don't add independent randomness.
2. **Capped magnitude.** A single random outcome's cash swing is bounded relative to the player's annual *net* income — Phase 1 cards ±$100–300 (vs ~$2K net); Phase 3 event cards and per-asset market bands are capped per the balance pass (target: no single check moves more than ~½ of one year's net).
3. **Buy-down.** Insurance halves the downside of bad events; diversification halves asset-band variance. A careful player can pull their realised variance well below 25%; a reckless one (all crypto, no insurance) pushes it above — that's their choice, not the baseline.

**Acceptance test (balance pass):** across many simulated games of equally-skilled play, ≤ ~25% of the variance in final net worth / time-to-freedom should trace to random sources; ≥ ~75% to decisions.

---

## 3. PHASE 1 — Teen Gigs (LOCKED)

Ages **13 → 17**, exactly **4 turns**. Learn the core loop, build skills, earn the career gate.

- Every player starts with **$5,000 cash** (a cushion that makes costly actions survivable).
- Starting gig **randomly assigned** by the reel (8 balanced Tier-1 gigs, ~$10K salary / ~$2K net).
- Each action can be taken **max 2×** across Phase 1 → you climb each ladder to **Level 3 at most** and cannot max everything.

### Turn structure — a one-year story
- **Action** = *"What are you doing this year?"* (your strategy)
- **Event** = *"What happened during the year?"* (life's curveball)
- **Gig income** = *"What you got as a result this year"* (the payoff)

1. **Pick one action** (the whole menu — no separate invest step):
   - 💰 **Invest** *(no income cost)* → Money Smarts +1; move **cash on hand** into your unlocked tier
   - 🏆 **Work harder** *(no income cost)* → Pro Skills +1; promotion revealed next turn
   - 🛡️ **Hustle** *(−20% off gross salary; net can dip negative)* → Grit +1; spin for a better gig next turn
   - 🧠 **Study** *(−50% off gross salary; net can go negative)* → Big Brain +1; spin for a knowledge job next turn
2. **Spin the reel** → 70% **Card** (life event, ±$100–300) or 30% **Mini-game** (win ~$200–300, lose nothing)
3. **Earn gig income** — net income added to cash
4. **End of turn (automatic)** — investments grow by their return rate and compound

> Income costs come off **gross salary** while expenses keep running, so a Hustle/Study year can push net negative — the $5K cushion absorbs it. **Safeguard:** you can't take an action that would drop year-end cash below $0.
>
> **Progression is never blocked.** Two of the four actions — 💰 **Invest** and 🏆 **Work harder** — have **no income cost**, so at least one meaningful action is *always* affordable; the safeguard only ever greys out the costly Study/Hustle. This also guarantees the "≥ Level 2 in two skills" property: a player who can never afford Study/Hustle can still take Invest + Work (both free) to reach Level 3 in both. *(The balance pass confirms by simulation that no income/event combination can leave a player unable to act.)*

### Skill ladders (consistent Level 1 / 2 / 3)

| Skill | Level 1 (start) | Level 2 | Level 3 |
|---|---|---|---|
| 💰 **Money Smarts** | 🏦 Trust Fund — $1K min, 10%/yr (safest) | 📊 Index Fund — $2K min, 20%/yr (lower risk) | 📈 Stock Market — $3K min, 30%/yr (higher risk) |
| 🏆 **Pro Skills** | Base worker | Senior — +$2K/yr | Team Leader — +$5K/yr total |
| 🛡️ **Grit** | Tier 1 gigs — ~$2K net | Tier 2 gigs — ~$10K net | Tier 3 gigs — ~$13K net |
| 🧠 **Big Brain** | Tier 1 gigs — ~$2K net | Tier 2 jobs — ~$13K net | Tier 3 jobs — ~$18K net |

**Action effects & reveals:**
- 💰 **Invest** — no income cost; relocates cash on hand into the unlocked tier. Min deposit per tier, **no maximum**. Returns pay at end of each turn and **compound**. Money Smarts level **carries into Phase 2** (L3 = Stock Market access). Reveal: a new investment card.
- 🏆 **Work harder** — no income cost. Reveal: promotion (auto salary bump).
- 🛡️ **Hustle** — −20% off gross salary; switching gigs is **free** (cost already paid). Reveal: spin a reel for a random Tier 2 (then Tier 3) gig.
- 🧠 **Study** — −50% off gross salary; switching is **free**. Reveal: spin a reel for a random Tier 2 (then Tier 3) knowledge job.

### Mini-games (built in code)
`CoinRain`, `LemonSqueeze`, `CashGrab`, `PetRush` (`components/money-town/games/`). The reel picks one at random on a Mini-game result. Phase 1 **guarantees every player 2 mini-game opportunities** (reel pity-timer), so wins are skill-based. **Mini-game wins earn talent tokens** that gate the Talent careers (see §4) and **earn power-ups** in Phase 3.

> **Phase 1 is LOCKED for structure.** Exact tuning numbers (cost %s, job nets, returns, starting cash) are finalised in the end-to-end balance pass.

---

## 4. The Career Reel (age 17) — LOCKED

At the end of Phase 1, each player spins a **skill-gated, hard-gate** reel.

**Rule:** your pool = **every career you qualify for**; you spin **randomly among them**. Careers you didn't earn show locked/greyed.

- Gate = a Phase 1 **skill level** (L2 = took the action once, L3 = twice) **or mini-game wins**.
- **No fallback needed:** 4 actions over Phase 1 (cap 2× each) guarantee **≥ Level 2 in two or more skills**, so everyone qualifies for multiple careers.
- **Generalist** (1-1-1-1) → L2 in all four → 4 accessible careers → wide, varied spin.
- **Specialist** (2-2) → L3 in two skills → those lanes' prestige careers too → narrow, high-end spin.

### The 12-career roster

**Skill-gated (8):**

| Lane | Skill | L2 — accessible | L3 — committed |
|---|---|---|---|
| 🧠 Knowledge | Big Brain | 👩‍🏫 Teacher | 🩺 Doctor |
| 🏆 People | Pro Skills | ⚖️ Lawyer | 🏛️ Politician |
| 💰 Capital | Money Smarts | 💼 Tycoon | 📈 Investment Banker |
| 🛡️ Hands-on | Grit | 🔧 **Tradesperson** ⭐ | 🚜 Farmer |

**Talent track (4)** — gate = **talent tokens** earned by winning mini-games (mirrors L2/L3: 1 win ≈ L2, 2 wins ≈ L3):

| Gate | Careers |
|---|---|
| 1+ talent token (win) | 🎨 Artist · 📱 Influencer |
| 2+ talent tokens (wins) | 🏅 Pro Athlete · 🎵 Musician |

> **Skill, not luck of the draw.** Because the 30% reel chance over 4 turns wouldn't reliably hand out two mini-games, Phase 1 **guarantees every player exactly 2 mini-game opportunities** (a pity-timer on the reel ensures 2 of the 4 results are mini-games; the rest stay 70/30 cards/games). So *whether you qualify for talent careers is a test of mini-game skill* — a strong player can earn both tokens; a weak one earns none. This keeps the talent gate on the decisions side of the 75/25 dial. *(Exact guarantee count is a balance-pass knob.)*

⭐ = first career built end-to-end. Each lane has a distinct economic personality for Phase 3 (athletes peak early then burn out, artists are slow-burn/high-variance, doctors are late-but-stable, tradies earn fast) — teaching different money *timelines*.

### What Phase 1 carries forward
Cash saved · Money Smarts level (investment tiers in Phase 2) · Big Brain level (may shorten study / grant a special card) · skills + mini-game wins (which careers were reachable, plus Phase 2 perks).

---

## 5. PHASE 2 — Education / Training

**Purpose:** invest years in yourself for a bigger Phase 3, and learn **good vs bad debt**. Each career has its own timeline — the contrast IS the lesson.

### Career timelines

| Archetype | Careers | Length | Income while training | Debt | Enters Phase 3… |
|---|---|---|---|---|---|
| **Earn-while-learn** | 🔧 Tradesperson, 🚜 Farmer | 3 yr | Low, rising | Little/none | Early, debt-free, already investing |
| **Study-heavy** | 🩺 Doctor, ⚖️ Lawyer, 📈 Banker | 5–6 yr | **$0** | **High education debt** | Late + indebted, but big salary |
| **Mixed** | 👩‍🏫 Teacher, 💼 Tycoon | 3–4 yr | Part-time | Moderate | Middle of pack |
| **Talent** | 🏅 Athlete, 🎵 Musician, 🎨 Artist, 📱 Influencer | 0–2 yr | Boom/bust | Low | Early but volatile |

> The Tradie is *digging up* (earning + investing at 17) while the Doctor is *digging out* (graduating ~23 owing a fortune). Different timelines, same finish line.

### Debt = the mirror of investing (introduced here)
- An investment grows *your money*; a debt grows what you *owe*. **Same compounding, opposite direction.**
- Debt has a balance + interest rate; **unpaid debt grows at end of turn**. Repay from cash anytime.
- **Interest is a recurring expense** → it pushes your win bar up.
- 🟢 **Good debt** — borrow to buy something that earns (tools/ute now; a mortgage on a rental later).
- 🔴 **Bad debt** — borrow for things that lose value (temptation cards: *"V8 on finance?"*).

### 🔧 Tradesperson apprenticeship (FIRST BUILD) — 3 years, ages 17→20
Each year: spin the reel + earn a **rising apprentice wage** + pick one action:

| Action | This year | Payoff |
|---|---|---|
| 🎓 **Master the trade** | — | +1 Qualification rank → higher Phase 3 starting salary |
| 💪 **Overtime** | +cash now | nothing long-term |
| 💰 **Invest** | deploy cash (Money Smarts tier from P1) | compounding continues |
| 🚚 **Tool up** *(good debt)* | loan → income boost | owe balance + interest |

Graduate at 20 → qualified Tradesperson into Phase 3, carrying rank + cash + investments + any debt.

---

## 6. PHASE 3 — Established Career (the main game)

**Turn = 1 year.** Graduation → freedom (or age 65). A strong player frees themselves in their **30s–40s**.

### Lifestyle inflation — automatic *default*, with active expense levers
Every career rank carries a built-in **salary AND a default lifestyle expense**. Climbing the rank ladder raises your living cost automatically — no per-raise prompt. The gap in *gross* is huge; the gap in *net* is small. **That's the balancer for the "grow income" side.**
- e.g. 🩺 Doctor $200K / ~$150K default lifestyle → net ~$50K · 🔧 Tradie $70K / ~$45K → net ~$25K.

**The "shrink expenses" lever is real and active** — the auto-lifestyle is only the *default*; players can deliberately push expenses below it:

| Expense lever | Effect | Teaches |
|---|---|---|
| 🪙 **Downsize / Live Modestly** (action) | Set your lifestyle **one or more brackets below** your career rank | You don't have to spend what you earn — frugality is a choice |
| 🏡 **Buy your home outright** (asset/action) | Permanently removes the **rent/housing slice** of lifestyle expense | Owning beats renting; eliminating a fixed cost is wealth |
| 🏦 **Pay down debt** (action) | Removes the **interest** portion of expenses | Killing bad debt frees cash flow |
| 🧗 **Don't over-climb the ladder** (choice) | Stay at a lower rank → lower auto-lifestyle | More salary isn't always better if lifestyle eats it |

This is exactly what makes the 🐢 **Frugal Tortoise** path viable: a modest-rank earner who downsizes, owns their home, and stays debt-free has a **tiny expense bar** that a steady index/property income can clear early — beating a high earner who let lifestyle inflate.

> Auto-lifestyle is the *default direction* (income up → costs up, no nagging prompts), but the player always has the wheel to steer expenses **down**. Both win levers are now active mechanics.

### The yearly loop
1. **Receive income → cash:** salary **+ passive income** (rent, dividends, business profit paid out this year)
2. **Pay expenses → cash:** lifestyle (auto-scales with rank) + debt interest + insurance premiums
3. **Spin the reel** — universal life event / **career-specific** event / mini-game *(~25% luck)*
4. **Take ONE action** *(~75% decision)* — grow income, or shrink expenses:
   - 🏠 **Buy an asset** → adds passive income
   - 📈 **Upgrade career rank** → higher salary (+ auto lifestyle)
   - 🏦 **Pay down debt** → kills interest expense
   - 🛡️ **Buy insurance** → softens bad events
   - 🏡 **Buy your home outright** → removes the rent/housing slice of lifestyle expense permanently *(expense lever)*
   - 🪙 **Downsize / Live Modestly** → drop your lifestyle one bracket *below* your career rank, cutting expenses *(expense lever)*
5. **End of turn:** **asset values** grow or shrink (variable market roll — net worth, not cash), debt balances grow → **check win**

> **Cash income vs net-worth growth are separate.** *Passive income* is **cash paid into your balance** each year (step 1) — it helps you cover expenses *and* counts toward the win bar. *Appreciation* (step 5) grows an asset's **value/net worth** but pays no cash until sold. **Win check:** annual passive **cash** income ≥ annual expenses.

### Assets & passive income (variable returns teach risk/return)

| Asset | Avg return | Swing (risk) | Passive income | Notes |
|---|---|---|---|---|
| 🏦 Savings | ~5% | none | tiny | safe parking |
| 📊 Index Fund | ~9% | low | dividends | reliable, diversified |
| 🏠 Property | ~7% + rent | low–med | rent | **leverage w/ mortgage (good debt)** |
| 📈 Shares | ~12% | medium (can drop) | dividends | pick winners |
| ₿ Crypto | ~20%+ | **extreme** (boom/crash) | none | the gamble |
| 🏢 Business | high | high (can fail) | profit | biggest passive income; rewards Pro Skills |

Returns are now **variable** (a yearly market roll), unlike Phase 1's guaranteed returns — that is where "high risk, high return" is felt. Diversifying + insurance **reduce variance**.

### Career-specific decks
Phase 3 reel = a small **universal life deck** (illness, market swings, windfalls) **+ the career's own deck**. This is the replayability + per-career risk-profile engine.

#### 🔧 Tradesperson — Phase 3 identity (first build)
**Signature lesson:** turn your hands + skill into a business and assets **before your body wears out**.

| Rank | Salary | Feel |
|---|---|---|
| Qualified Tradesperson | ~$65K | steady hands-on |
| Licensed Specialist | ~$85K | skilled, in demand |
| Contractor (self-employed) | ~$110K | more income, more variable |
| 🏢 **Own Trade Business** | scalable | employ others → business passive income, high risk/return |

🟢 **Opportunities:** 🏗️ big tender win (windfall) · 👷 take on apprentices (passive income) · 🏠 reno flip (property synergy) · 🚀 go out on your own
🔴 **Risks:** 🤕 injury (worse with age) · 💸 client won't pay · 📉 construction downturn · 🦴 body wears down late-game (punishes never scaling)

### Cross-player actions (fun / competitive layer)
- 🔨 **Asset auctions** — bid against rivals for prime properties/businesses
- 🌍 **Market events hit everyone** — crash dings all shareholders, boom lifts all property
- 🃏 **Social chance cards** — help/hinder rivals, partnerships, group windfalls
- 🏆 **Visible race to freedom** → catch-up tension keeps it competitive to the end

### Win paths — all viable

| Path | Wins by | Risk |
|---|---|---|
| 🏦 **Earner-Saver** | high salary, low lifestyle, steady index/property | low |
| 🏠 **Investor** | leverage property + shares | medium |
| 🏢 **Entrepreneur** | business owner, huge passive income | high |
| 🐢 **Frugal Tortoise** | modest income, tiny expenses → low win bar | low |

---

## 7. Power-up cards

Collectible cards giving a unique advantage, **held in hand** (max 3) and played on your terms — *deciding when* is the strategy.

**How you earn them (mostly skill):**
- 🎮 **Win a mini-game** → draw a power-up (main source)
- 🏆 **Hit a milestone** (first asset, reach a career rank) → earn a **permanent** card
- 🃏 **Occasional reel draw** → a one-off (the small luck sprinkle)

### ⭐ Permanent (milestone-earned, always on)

| Card | Type | Effect (forever) |
|---|---|---|
| 🧰 Master Tradie | economic | +10% trade income |
| 💎 Golden Touch | economic | +2% on all investment returns |
| 🛡️ Iron Body | defensive | immune to injury/illness events |
| 📊 Steady Hand | defensive | assets lose **half** as much in any crash |
| 👑 Reputation | defensive | offensive cards hit you at **50% strength** |
| 🧲 Dealmaker | utility | +1 bid power in every auction |

### 🎯 Offensive one-offs

| Card | Effect |
|---|---|
| 😈 Market Move | crash a rival's risky asset now |
| ⚖️ Lawsuit | sue a rival → they pay you a settlement |
| 🧲 Headhunt | lure a rival into a "dream job" that secretly raises their lifestyle/expenses |
| 📉 Short Sell | you profit when a chosen rival's asset drops this turn |
| 💼 Poach | steal a rival's apprentice/employee → cut their business income |
| 🎭 Scandal | target's business/influencer income halved this turn |
| 🚧 Red Tape | block a rival's next career upgrade or asset buy |
| 🪤 Audit | a rival pays a surprise expense |
| 🦅 Outbid | auto-win one auction |
| 🔌 Jammer | cancel a power-up a rival just played |

### 🛡️💰🃏 Support one-offs
- **Defensive:** 🪖 Hard Hat (block a bad event) · 🏥 Safety Net (ignore next injury) · 🔒 Hedge (no drop in next crash)
- **Economic:** ⚡ Double Down (2× one return) · 📈 Hot Tip (best market roll) · 🎟️ Grant (free upgrade) · 🧾 Tax Break (no expenses one year)
- **Wildcard:** ➕ Hustle (2nd action) · 🔄 Pivot (switch, no penalty) · 🎲 Copycat (copy a card just played)

> **Fairness guard:** offensive cards are answered by defensive ones (Hard Hat / Hedge / 👑 Reputation) → rock-paper-scissors, not a helpless pile-on. "Gang up on the leader" becomes healthy catch-up tension.

### Power-up balance rules (so cards enhance, not dominate, the core loop)
- **Rarity by power.** Permanent cards (⭐) are the rarest — only from milestones, **one of each per game**. Swingy one-offs (🧾 Tax Break, 🦅 Outbid, 🔌 Jammer) are **uncommon**; mild ones (🪖 Hard Hat, ⚡ Double Down) are common. Exact draw rates set in the balance pass.
- **One power-up played per turn** (plus any *reactive* card — see below). No combo-dumping.
- **Timing windows are explicit.** Each card is tagged **Proactive** (play on your own turn — e.g. Double Down, Outbid, Grant) or **Reactive** (play in response to a trigger, even off-turn — e.g. Hard Hat answers a bad event, Jammer answers a power-up, Hedge answers a crash). Reactive cards are the counterplay layer.
- **Counterplay is guaranteed.** Every offensive card has a named answer (Hard Hat / Safety Net / Hedge / 👑 Reputation / Jammer). A player holding a defence is never helpless.
- **Magnitude is capped** like any random effect (§2): the biggest one-offs are bounded so a single card can't outweigh a year of good decisions. "🧾 Tax Break: no expenses one year" ≈ one year's net — meaningful, not game-ending.
- **Hold max 3** (already): forces use, prevents hoarding a hand of bombs for the endgame.

---

## 8. Careers backlog (12 total)

Define all 12 now; build each career's Phase 2 + Phase 3 end-to-end one at a time.

**Skill-gated:** 🔧 Tradesperson (Grit L2) ⭐ · 🚜 Farmer (Grit L3) · 👩‍🏫 Teacher (BB L2) · 🩺 Doctor (BB L3) · ⚖️ Lawyer (PS L2) · 🏛️ Politician (PS L3) · 💼 Tycoon (MS L2) · 📈 Investment Banker (MS L3)
**Talent (mini-game wins):** 🎨 Artist (1+) · 📱 Influencer (1+) · 🏅 Pro Athlete (2+) · 🎵 Musician (2+)

---

## 9. Status & open items

- [x] Phase 1 — LOCKED (structure)
- [x] Career reel + 12-career roster — LOCKED
- [x] Phase 2 — **framework** designed; Tradesperson apprenticeship detailed (other careers backlog)
- [x] Phase 3 — **framework** designed; Tradesperson identity detailed (other career decks backlog)
- [x] Power-up cards — designed (rates/timing finalised in balance pass)
- [ ] Flesh out the other 11 careers' Phase 2/3 decks (backlog)
- [ ] **End-to-end balance pass** — simulate the 4 win paths to the win condition; finalise all numbers (cost %s, salaries, lifestyle brackets, returns, gate thresholds, power-up rates)
- [ ] Phase 1 visual HTML mockup
- [ ] Implementation plan (writing-plans)

---

## 10. Key implementation files

- `lib/money-town/gameLogic.ts` — reducer, card drawing, event cards
- `lib/money-town/constants.ts` — all content (jobs, assets, trivia)
- `lib/money-town/types.ts` — GameAction union, Player, GameState
- `components/money-town/PlayerCard.tsx` — status badges
- `components/money-town/ActionPanel.tsx` — action panel UI
- `components/money-town/GameBoard.tsx` — game board, turn banner
- `components/money-town/games/` — the four mini-games
