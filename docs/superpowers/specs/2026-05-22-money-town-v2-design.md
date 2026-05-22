# Money Town v2 — "Many Lives, One Freedom" — Design Spec

**Date:** 2026-05-22  
**Status:** Phase 1 fully designed. Phase 2 & 3 pending.  
**Philosophy:** Every career path leads to financial freedom — just different challenges and timelines. Turn = 1 year of real life. Real Australian income figures throughout.

---

## Current Implementation (Live as of 2026-05-22)

### What's built

The game is fully playable end-to-end using the v1 ruleset (see `2026-05-21-money-town-redesign-design.md` for v1 rules). The following UI redesigns were completed this session and are now live:

#### Board layout — Monopoly corner grid
- `GameBoard.tsx` uses a CSS `grid 3×3` (`1fr 80px 1fr`) with players in the four corners
- Center cell is a decorative 🎰 / Round N tile — no button
- Middle edge cells are vertical text decoration ("MONEY TOWN" / "RAT RACE")
- Top center shows the current player's emoji + name ("Now Playing")
- Bottom center shows round number + motto

#### Player cards — colored gradient headers
- Each player gets a colored gradient header matching their assigned color:
  - Red → `from-red-500 to-red-700`
  - Blue → `from-blue-500 to-blue-700`
  - Green → `from-green-500 to-green-700`
  - Yellow → `from-amber-400 to-amber-600`
- Header: large emoji, player name, degree status (if enrolled), cash on right
- Body (white): Freedom progress bar, Income/Expense badge panels, asset cards
- Income/Expense badges: two side-by-side panels with "Income" / "Expense" labels and big numbers — no "/turn" notation

#### GO! overlay button — active player card triggers reel
- The center "Pull the Lever" button is gone
- Instead: the active player's corner card shows a pulsing **▶ GO! / [Name]'s Turn** green overlay button
- Tapping it dispatches `PULL_LEVER` → opens `LeverOverlay`
- `GameBoard.tsx` computes `leverFor(cornerIndex)` helper and passes `onPullLever` prop to `PlayerCard`
- Non-active player cards have no overlay

#### Asset cards
- Replaced small chip badges with proper card-style: emoji + name + income pill
- Green card face (`bg-green-50`, `border-green-300`), green income pill

#### LeverOverlay — vertical scrolling reel
- Existing component unchanged — red cabinet, gold "SPIN TO WIN" marquee, dark window, gold highlight bar
- Segments: 📋 Event · 🌟 Chance · 🎮 Mini-Game · 💥 Big Event
- Easing: ease-in quad → linear → ease-out cubic over 5800ms

#### Board mockup
- `docs/superpowers/board-mockup.html` — standalone HTML mockup for fast visual iteration
- Tapping GO! on Alex's card opens a faithful LeverOverlay-style popup
- Popup: red machine, vertical scrolling reel with easing animation, result card, "Got it — Continue"

---

## V2 Vision — "Many Lives, One Freedom"

### Overview

| Phase | Name | Duration | Description |
|---|---|---|---|
| 1 | Teen Gigs | Fixed 5 turns | Random gig assigned by reel; earn, save, build skills |
| 2 | Education / Training | Career-specific turns | Apprenticeship, degree, or internship |
| 3 | Established Career | Until end condition | Career upgrade tree, shared investments, chance cards |

**Win condition:** First player whose passive income ≥ expenses, OR everyone reaches age 65.

### Four skills (all start at Level 1)

| Skill | Emoji | Focus |
|---|---|---|
| Money Smarts | 💰 | Investment unlocks |
| Pro Skills | 🏆 | Income raises |
| Grit | 🛡️ | Better gig tiers |
| Big Brain | 🧠 | Knowledge job tiers |

---

## Phase 1 — Teen Gigs (5 turns) ✅ FULLY DESIGNED

### Rules
- Exactly **5 turns** — no cash threshold needed to advance
- Starting gig randomly assigned by reel at game start (all ~$10K salary, ~$2K net)
- Each action type can be taken **max 2×** across all of Phase 1
- At turn 5 end: all players spin for career → Phase 2 begins

### Turn structure

1. **Spin the reel** → Event card OR Mini-game (70/30 split)
2. **Earn gig income** — net income added to cash after event resolves
3. **Choose one action** — raises one skill +1; unlock fires next turn
4. **Invest (optional)** — Trust Fund ($1K min) or Stock Market ($2K min, if unlocked)

> Turn 1 flow: player starts with $1K → reel fires event (e.g. -$150 phone bill) → cash $850 → earns $2K net → has $2,850 → takes action → can invest $1K in Trust Fund → ends with $1,850 + $1K invested.

### Starting gig table (Tier 1)

All balanced: ~$10K salary, ~$2K net.

| Gig | Emoji | Salary | Expenses | Net |
|---|---|---|---|---|
| Supermarket Cashier | 🛒 | $10,000 | $8,000 | $2,000 |
| Cafe Barista | ☕ | $10,200 | $8,200 | $2,000 |
| Dog Walker | 🐕 | $9,800 | $7,800 | $2,000 |
| Fast Food Crew | 🍔 | $10,100 | $8,100 | $2,000 |
| Delivery Driver | 📦 | $10,400 | $8,200 | $2,200 |
| Swim Coach | 🏊 | $9,900 | $8,100 | $1,800 |
| Retail Assistant | 🛍️ | $10,000 | $8,000 | $2,000 |
| Lawn Mowing | 🌿 | $9,800 | $7,900 | $1,900 |

### Card Deck (26 cards — Events + Chances merged)

Cash swings $100–$300 only. Teen-appropriate content.

| # | Emoji | Card | Effect | Type |
|---|---|---|---|---|
| 1 | 📱 | Went over your phone plan | -$150 | Auto |
| 2 | 📸 | Cracked your phone screen | -$300 | Auto |
| 3 | 👟 | Limited edition sneakers — you caved | -$250 | Auto |
| 4 | 🍕 | Spent way too much eating out | -$150 | Auto |
| 5 | 🎵 | Concert tickets with the crew | -$200 | Auto |
| 6 | 🛒 | Impulse online shopping spree | -$200 | Auto |
| 7 | 🤒 | Sick week — missed shifts | -$250 | Auto |
| 8 | 🎂 | Friend's birthday — dinner + gift | -$150 | Auto |
| 9 | 🎮 | New game release — couldn't resist | -$100 | Auto |
| 10 | 🚔 | Speeding fine (learner driver) | -$300 | Auto |
| 11 | 💰 | Birthday cash from family | +$200 | Auto |
| 12 | 👴 | Grandparent gift | +$300 | Auto |
| 13 | 🔄 | Sold old stuff on Marketplace | +$200 | Auto |
| 14 | 🏆 | Won local raffle or competition | +$300 | Auto |
| 15 | 🎉 | Extra shifts over school holidays | +$250 | Auto |
| 16 | 🎁 | Got a gift card — converted to cash | +$100 | Auto |
| 17 | 🎂 | It's your birthday! | Each other player chips in $100 | Social (gain) |
| 18 | 🏆 | You won the group bet | Each other player pays you $100 | Social (gain) |
| 19 | 🎤 | You organised the group hangout | Everyone reimburses you $150 | Social (gain) |
| 20 | 🎁 | Friend's birthday — you're buying the cake | Pay $100 to player with least cash | Social (pay) |
| 21 | 🍕 | You lost the bet | Pay $100 to each other player | Social (pay) |
| 22 | 💸 | Mate is broke — you help out | Give $150 to player with least cash | Social (pay) |
| 23 | ☀️ | Long weekend — everyone picks up extra shifts | All players +$150 | Social (all) |
| 24 | 🌧️ | Slow week — work dries up everywhere | All players -$100 | Social (all) |
| 25 | 🤧 | Flu season hits the workplace | All players -$150 | Social (all) |
| 26 | 🎪 | Local festival — everyone gets extra work | All players +$200 | Social (all) |

### Mini-games (TBD — 30% reel probability)

Quick interactive challenge. Win = $200–$300 bonus. Lose = nothing lost.
Examples: maths quiz, money trivia, reaction challenge.

### Skill Ladders

#### 💰 Money Smarts — Investment Unlocks
Action: "Invest wisely" → skill +1, unlock fires next turn.

| Level | Unlock | Notes |
|---|---|---|
| 1 (start) | Trust Fund — min $1K, returns 10%/yr | Available immediately — players can invest $1K starting cash on turn 1 |
| 2 | Stock Market — min $2K, returns 20%/yr | Requires taking "Invest wisely" action once |
| 3+ | Carry forward to Phase 2 | |

#### 🏆 Pro Skills — Income Raises
Action: "Work extra hard" → skill +1, unlock fires next turn.

| Level | Unlock | Income bump |
|---|---|---|
| 1 → 2 | Senior role | +$2,000/yr |
| 2 → 3 | Team Leader | +$3,000/yr |

#### 🛡️ Grit — Better Gig Tiers
Action: "Hustle for better gigs" → skill +1, unlock fires next turn.

| Level | Unlock | Net | Switch penalty |
|---|---|---|---|
| 1 | Tier 1 gigs | ~$2,000/yr | — |
| 1 → 2 | Grit Tier 2 gigs | ~$10,000/yr | 80% salary in switch year |
| 2 → 3 | Grit Tier 3 gigs | ~$13,000/yr | No penalty |

Grit Tier 2 examples: 🔧 Trades Labourer ($22K/$9K), 🚛 Truck Driver ($23K/$10K)  
Grit Tier 3 examples: 🔩 Senior Labourer ($25K/$12K), 🚜 Heavy Equipment Op ($26K/$13K)

#### 🧠 Big Brain — Knowledge Job Tiers
Action: "Study / online course" → skill +1; costs 50% salary + 50% expenses in action turn.

| Level | Unlock | Net | Switch penalty |
|---|---|---|---|
| 1 | Tier 1 gigs | ~$2,000/yr | — |
| 1 → 2 | Big Brain Tier 2 jobs | ~$13,000/yr | 50% salary in switch year |
| 2 → 3 | Big Brain Tier 3 jobs | ~$18,000/yr | 50% salary in switch year |

Big Brain Tier 2: 📊 Junior Data Entry ($28K/$15K), 🖥️ Junior IT Support ($29K/$16K)  
Big Brain Tier 3: 💻 Junior Developer ($42K/$24K), 📐 Junior Designer ($40K/$22K)

> When switching with penalty: halve BOTH salary AND expenses so net never goes negative.

### Action Summary

| Action | Skill | Immediate cost | Next turn unlock |
|---|---|---|---|
| Invest wisely | 💰 +1 | None (invest cash separately) | Investment tier |
| Work extra hard | 🏆 +1 | None | +$2K or +$3K raise |
| Hustle for better gigs | 🛡️ +1 | None | Higher gig tier |
| Study / online course | 🧠 +1 | 50% salary + 50% expenses | Higher knowledge job |
| Switch gig tier | — | Switch penalty | New gig from next turn |

Max 2× per action type. Action declared at START of turn — affects that turn's income, unlock fires NEXT turn.

### Phase 1 → Phase 2 Transition

After Turn 5:
1. Phase 1 results tallied (cash, skills, investments)
2. Career reel spins for each player
3. Phase 2 begins

What carries forward:
- **Cash saved** → can afford better study mode or invest sooner
- **Money Smarts level** → investment options available in Phase 2
- **Big Brain level** → salary boost OR special card ("Top Firm Has Picked You")
- **Skills banked** → may reduce Phase 2 duration or unlock special events

---

## Phase 2 — Education / Training ⏳ PENDING DESIGN

Study modes (apply to all careers):
- **Study Hard** — no income, faster graduation, +salary bonus or special card
- **Work Part-Time** — 50% income, standard timeline
- **Free Internship** — no income, career-specific special card reward

Tradesperson path: Apprenticeship (Work Part-Time equivalent — earns while learning)

---

## Phase 3 — Established Career ⏳ PENDING DESIGN

Career-specific upgrade trees and chance cards. Build Tradesperson first.

Shared investments (all careers):
- First Home
- Investment Properties
- Index Fund
- Stocks / Shares
- Crypto
- Business

---

## Career Paths (7 — build one at a time)

1. **Tradesperson** ← design first
2. Investment Banker
3. Lawyer
4. Doctor
5. Tycoon
6. Politician
7. Teacher
8. Farmer

---

## Key Files

| File | Role |
|---|---|
| `lib/money-town/gameLogic.ts` | Reducer, card drawing, event processing |
| `lib/money-town/constants.ts` | All content: jobs, assets, cards, segments |
| `lib/money-town/types.ts` | GameAction union, Player, GameState |
| `components/money-town/GameBoard.tsx` | 3×3 corner layout, GO! lever trigger |
| `components/money-town/PlayerCard.tsx` | Colored header, income/expense badges, assets, GO! overlay |
| `components/money-town/LeverOverlay.tsx` | Vertical scrolling reel, easing animation |
| `components/money-town/ActionPanel.tsx` | Post-spin action: degree, buy asset, skip |
| `components/money-town/ResultCard.tsx` | Event/chance/game result display |
| `components/money-town/RulesModal.tsx` | 7-slide carousel how-to-play guide |
| `docs/superpowers/board-mockup.html` | Standalone HTML mockup for fast visual iteration |
| `docs/superpowers/phase1-script.html` | 5-turn sample script: Alex (investor) vs Mia (grinder) |
