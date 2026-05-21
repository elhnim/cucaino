# Money Town Redesign — Design Spec

## Goal

Redesign Money Town into a Monopoly-GO-meets-Cashflow-meets-Game-of-Life multiplayer board game. All players visible on one board screen at all times. Each turn: auto-collect salary, spin the reel for an event/chance/mini-game, take one voluntary action. Win by building passive income ≥ living expenses (escaping the Rat Race).

---

## 1. Visual Style

- **Background:** Sky-blue `#e0f2fe`, white `#fff` card surfaces
- **Font:** Lilita One (Google Fonts) for headings, badges, numbers; Nunito 800/900 for body
- **Topbar:** Blue gradient `#3b82f6 → #2563eb`
- **Gold:** `#fbbf24` / `#d97706` — cash values, active buttons, lever
- **Buttons:** Flat with soft shadow (`0 2px 8px`), no thick 3D press-shadow
- **Cards:** White, `border: 1.5px solid #e2e8f0`, `border-radius: 16–24px`
- **Reel machine:** Red cabinet (`#ef4444`), gold `SPIN TO WIN` marquee, dark window (`#1e293b`), gold active-row border

---

## 2. Screen Flow

```
Lobby (kid picker)
  → Job Spin Ceremony (one per player)
    → Main Board ←──────────────────────────┐
        → Lever Overlay (reel spin)          │
            → Result Card (event/chance/game) │
                → [action taken or skipped]  ─┘
```

---

## 3. Lobby — Kid Picker

**File:** `components/money-town/GameLobby.tsx`

- Fetch `listKids()` in `app/play/money-town/page.tsx`, pass as prop
- Show all family kids as avatar cards (emoji + name); tap to select (highlights + checkmark)
- **"+ Add Guest"** button opens text input for guests
- 1–4 players; Start button enabled once ≥ 1 player added
- **"? How to Play"** button always visible — opens `RulesModal`

---

## 4. Job Spin Ceremony

Runs once at game start, before round 1, one player at a time.

- Dedicated screen; reel loaded with **job segments** (not event segments)
- Each player pulls the lever to land on their starting job
- Result card shows: job name, emoji, salary/round, living expenses/round
- "Got it! Next →" advances; after all players have spun → Main Board
- **Implementation:** replace `JOBS[Math.floor(Math.random() * JOBS.length)]` in `GameLobby.tsx` with this ceremony

**Starting jobs (assigned by reel):**

| Job | Emoji | Salary/turn | Expenses/turn | Net/turn |
|---|---|---|---|---|
| Delivery Driver | 🚚 | $600 | $450 | $150 |
| Shop Assistant | 🛒 | $750 | $560 | $190 |
| Teacher | 📚 | $900 | $680 | $220 |
| Tradesperson | 🔧 | $1,050 | $800 | $250 |

Higher salary = higher expenses; net cashflow is intentionally close across jobs, but higher-salary jobs require more passive income to win — keeping all starts balanced. Tier-1 assets combined ($330/turn) is always less than any job's expenses, so tier-2 investment is required for every job.

**Degree-unlocked jobs (accessible via Chance after graduation):**

| Job | Emoji | Salary/turn | Expenses/turn | Net/turn |
|---|---|---|---|---|
| Accountant | 📊 | $1,400 | $1,000 | $400 |
| Engineer | ⚙️ | $1,700 | $1,200 | $500 |

Note: Engineer expenses ($1,200) exceed 3×property income ($900), making the Hotel the only path to freedom for Engineer players.

---

## 5. Main Board Screen

**Always visible between turns.** Primary game view.

### Layout
- **Header:** "💰 Money Town" (Lilita One) + "ROUND N" gold badge + "? How to Play" button
- **Turn banner:** "🎰 [NAME]'S TURN" with "Pull Lever ›" chip
- **2×2 player grid** (1-col for 1–2 players)
- **Bottom CTA:** "🎰 Pull the Lever — [Name]'s Turn"

### Player Card
Each card shows:
- Avatar + name + job emoji + salary/round
- 💵 Cash on hand (Lilita One, gold)
- 📚 Degree status: hidden if not studying; "Degree: N turns left" countdown chip if enrolled; graduation badge if complete
- **Rat Race Escape track:** progress bar, fill = `passive / job.expenses × 100%`. Runner 🏃 at fill position. Milestone markers at 25/50/75/100%.
- **Assets strip:** horizontal-scroll chips showing `emoji + $income/round` per owned asset. Total passive income top-right. Empty: "No assets yet."
- Active player: blue border + `YOUR TURN` badge
- Won player: green border + `🏆 FREE!` badge

---

## 6. Turn Structure

### Step 1 — Auto-collect salary
Brief animated "Payday" banner on the player card showing:
- `+ $[salary]` (job salary)
- `+ $[passive]` (total passive income from assets)
- `− $[expenses]` (living expenses)
- `= $[net]` added to cash

No spin required. Always happens at the start of the turn.

### Step 2 — Spin the reel
Opens the **Lever Overlay**. Reel has 6 segments:

| Segment | Slots | Description |
|---|---|---|
| 📋 Event | 2 | Draw from event card pool (20+ cards) |
| 🌟 Chance | 2 | Draw from chance pool (degree unlocks better tier) |
| 🎮 Mini-game | 1 | Interactive challenge for $150–$300 reward or penalty |
| 💥 Big Event | 1 | Major life moment (job loss, twins, windfall, etc.) |

### Step 3 — Take one action (optional)
Before ending turn, player may choose one:
- 🎓 Enrol in degree (see §7)
- 🏠 Buy an asset from any available tier (see §8)
- ⏭️ Skip (do nothing)

---

## 7. Degree System

**Enrol:** pay $900 upfront. Degree counter starts at 2.

**Each subsequent turn start:** counter ticks down by 1. Player card shows "📚 Degree: N turns left."

**On turn when counter hits 0:** degree arrives — small celebration moment, graduation cap badge appears on player card, Chance pool upgrades to degree tier immediately.

**One degree per player, ever.** No second degree.

**Strategic tension:**
- Enrol early → more turns to benefit from better Chance cards, but $900 less to invest early
- Enrol late → more cash to buy assets, but fewer turns with upgraded Chance
- The 2-turn wait means you can still land on a basic Chance promotion while waiting — which feels like "I should've waited!"

---

## 8. Assets

Purchasable as the turn action. No Chance card needed for Tier 1–2; Tier 2 also available via Chance at a discount.

**Starting cash: $800** (enough for first asset purchase after 1-2 paydays; lower start forces deliberate decisions).

**Tier 1 — Early game (combined $330/turn — always less than any job's expenses):**
| Asset | Cost | Income/turn |
|---|---|---|
| 🍋 Lemonade Stand | $700 | +$75 |
| 🅿️ Parking Spot | $1,100 | +$105 |
| 🚚 Food Truck | $1,500 | +$150 |

**Tier 2 — Mid game (required to reach win condition):**
| Asset | Cost | Income/turn | Notes |
|---|---|---|---|
| 📈 Stocks | $2,000 | +$225 | Affected by Market Event cards |
| 🏠 Investment Property | $2,400 | +$300 | Counts toward hotel unlock |
| 🏪 Small Business | $3,800 | +$420 | |
| 💡 Tech Startup | $2,800 | +$420 | Requires degree |

**Tier 3 — Hotel unlock (Engineer path only; 3 properties = $900 < Engineer expenses $1,200):**
| Asset | Cost | Income/turn | Requirement |
|---|---|---|---|
| 🏨 Hotel | $4,500 | +$900 | Own 3 Investment Properties first |

Players keep the 3 properties when they build the hotel — total passive = $900 + 3×$300 = $1,800/round for an Engineer.

**Winning strategies (all confirmed by simulation — 500/500 games won):**
- **Asset hustler:** skip degree → buy tier-1 → snowball into tier-2 → win avg ~12T
- **Career climber:** degree ($900) → better Chance cards → tier-2 assets → win avg ~14T
- **Hotel path:** 3 properties → win on property passive (base jobs); Engineer must add hotel (~15T)

Simulation benchmark (v7, 500 games): avg 13.9T, range 6–32T, 100% win rate, 0% bankruptcy, 15.8% big events/turn.

---

## 9. Event & Chance Cards

### Event pool (drawn randomly — 2-in-6 reel slots)
Negative:
- Car breakdown: pay $300
- Medical bill: pay $450
- Roof leak: pay $500 (pay $750 if you own property)
- Tax audit: pay 10% of cash (min $200)
- Stock market dip: stocks earn $0 next turn
- Unexpected expense: pay $400

Positive:
- Work bonus: receive 35% of your salary
- Tax refund: receive $450
- Side hustle: +$350 this turn
- Lucky day: receive $400
- Rent surge: each Investment Property earns +$60 extra next turn

### Big Event pool (8 cards — 1-in-6 reel slot)
- 🍼 Twins! — living expenses +$120/round permanently
- 🌪️ Laid off — lose salary for 1 turn (passive income still pays out — great teaching moment)
- 💰 Inheritance — receive $1,200
- 🎰 Business boom — all your businesses earn double next turn
- 🏥 Major surgery — pay $900
- 🌟 Viral moment — receive $650 per business you own
- 🏡 Property value surge — sell one property for 150% of its cost (optional)
- 📉 Recession — all passive income halved next turn

### Chance pool — without degree (2-in-6 reel slots)
- Minor raise: +$60 salary permanently
- Cash gift from relative: +$350
- Small Deal: buy cheapest available tier-1 asset free

### Chance pool — with degree (replaces above pool)
- Promotion: +$280 salary, +$200 expenses permanently
- Career switch: choose Accountant ($1,400/$1,000) or Engineer ($1,700/$1,200)
- Discounted investment property: buy at 75% cost ($1,800 instead of $2,400)
- Tech startup deal: buy Tech Startup ($2,800 → +$420/round, degree required)
- Head-hunted: +$400 salary, +$280 expenses permanently
- Cash gift: +$550

---

## 10. Win Condition

`passive income per turn ≥ living expenses per turn`

When a player meets this condition at any point during salary collection: they declare freedom. All other players finish the current round. Standings ranked by how far above the threshold they are (passive − expenses surplus).

---

## 11. Lever Overlay

Modal on top of dimmed board. 300px wide white card:
- Header: player avatar + name + job + current cash
- Red reel machine + gold lever
- "Pull the Lever!" button

**Reel animation (frame-rate independent):**
- Total: 5800ms
- Phase 1 (0–6% time, 0–5% dist): ease-in quad
- Phase 2 (6–41% time, 5–65% dist): linear
- Phase 3 (41–100% time, 65–100% dist): ease-out cubic (velocity-matched at boundary)
- Lever knob: `translateY(22px)` on click, springs back

After reel stops → auto-transitions to Result Card overlay (no dismiss needed).

---

## 12. Result Card Overlay

| Event type | Header colour | CTA |
|---|---|---|
| 📋 Event / 💥 Big Event | Matches event tone (red=bad, green=good, gold=neutral) | "OK" / "Damn!" |
| 🌟 Chance | Blue gradient | "Nice!" or offer with Buy/Skip |
| 🎮 Mini-game | Purple gradient | Launches mini-game; result shown after |

After dismissal → back to board, same player's Step 3 (action phase).

---

## 13. Rules Modal

Accessible via "? How to Play" in lobby and board header. Full-screen modal. Sections:
1. **Goal** — make passive income ≥ expenses to escape the Rat Race
2. **Your Job** — salary collected automatically each turn; expenses deducted
3. **The Reel** — Event, Chance, Mini-game, Big Event explained
4. **Assets** — buying assets adds permanent passive income
5. **Degree** — pay $500, wait 3 turns, unlock better career opportunities
6. **Hotel** — own 3 properties to unlock the hotel upgrade
7. **Winning** — when passive ≥ expenses you're FREE; others finish the round

---

## 14. Files Touched

| File | Change |
|---|---|
| `app/play/money-town/page.tsx` | Fetch `listKids()`, pass to `GameLobby` |
| `components/money-town/GameLobby.tsx` | Avatar-card kid picker, guest input |
| `components/money-town/MoneyTownGame.tsx` | Screen states: `lobby → job-spin → board → lever → result → action` |
| `components/money-town/GameBoard.tsx` | **New** — 2×2 player grid board |
| `components/money-town/PlayerCard.tsx` | **New** — cash, degree countdown, rat race track, assets strip |
| `components/money-town/JobSpinCeremony.tsx` | **New** — per-player job assignment spin |
| `components/money-town/LeverOverlay.tsx` | **New** — modal with reel + lever animation |
| `components/money-town/ResultCard.tsx` | **New** (replaces `PaydayCard.tsx`) — handles all 5 result types |
| `components/money-town/ActionPanel.tsx` | **New** — post-spin action choices (degree, buy asset, skip) |
| `components/money-town/RulesModal.tsx` | **New** — How to Play content |
| `lib/money-town/constants.ts` | Add job segments, event pool, chance pools, asset tiers, big event pool |
| `lib/money-town/types.ts` | Add `DegreeStatus`, `Asset` tiers, event/chance card types |
| `lib/money-town/gameLogic.ts` | Add degree countdown tick, auto-salary collection, win check, card draw |

---

## 15. Out of Scope

- Sound effects
- Online multiplayer / turn persistence across sessions
- Selling assets back
- Debt / mortgage system
