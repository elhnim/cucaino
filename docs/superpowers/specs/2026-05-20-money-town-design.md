# Money Town — Design Spec
*Cashflow-inspired multiplayer financial education game for kids aged 8–12*

---

## Overview

Money Town is a pass-and-play board game for 2–4 players on one device. Players take turns spinning a wheel, buying businesses and properties, and building passive income until someone's passive income equals or exceeds their monthly expenses — escaping the Rat Race and winning the game.

Core financial concepts taught: income vs expenses, passive income, assets vs liabilities, mortgages, leverage, profit, rent, and investment returns.

---

## Player Setup

### Lobby

- Shows existing kid profiles as one-tap cards
- "➕ Add Guest" button for players without a profile — type a name and pick an emoji
- 2–4 players required to start
- Each player is assigned a unique colour (red, blue, green, yellow) and a random starter job
- "Start Game 🚀" button enabled once ≥ 2 players joined

### Starter Jobs

Each job sets the player's salary (collected on Payday) and monthly expenses (the target to beat).

| Job | Salary/round | Expenses/round | Net cash flow |
|---|---|---|---|
| 🎨 Artist | $150 | $120 | +$30 |
| 👩‍🍳 Chef | $200 | $160 | +$40 |
| 🔧 Mechanic | $250 | $200 | +$50 |
| 👩‍💻 Coder | $300 | $240 | +$60 |

Every job starts with a small positive cash flow so players can save toward their first asset. Salary alone never beats expenses — players must build passive income to win.

Starting cash: **$500** for all players.

---

## Win Condition

**Escape the Rat Race:** First player whose total passive income (from owned assets) ≥ their monthly expenses wins.

Example: A Chef has expenses of $160/round. Once their combined passive income from businesses and properties reaches $160+, they win.

---

## Turn Flow

1. "It's [Name]'s Turn" screen — current player taps to reveal their dashboard
2. Player reviews their stats (cash, passive income, expenses, assets)
3. Player taps **SPIN**
4. Wheel animates and lands on one of five segments
5. The result plays out (see Wheel Segments below)
6. Win condition checked — if met, go to Win Screen
7. "Pass to [Next Player] 👋" cover screen — tap to continue

---

## Wheel Segments

| Segment | Probability | Effect |
|---|---|---|
| 💰 Payday | 3 in 10 | Collect salary + passive income for the round |
| 🤝 Deal | 2 in 10 | Offered a business or property to buy |
| 💸 Expense | 2 in 10 | Surprise lifestyle expense deducted from cash |
| 🎮 Mini-Game | 2 in 10 | Play a mini-game to earn bonus cash |
| ⚡ Bad Luck | 1 in 10 | Lose cash or suffer asset damage |

---

## Assets

### Tier 1 — Kid Businesses

Small, affordable, low passive income. Typical first investments.

| Business | Cost | Passive Income/round |
|---|---|---|
| 🍋 Lemonade Stand | $200 | +$30 |
| 🧁 Bake Sale | $250 | +$40 |
| 🐾 Pet Sitting | $300 | +$50 |
| 🌿 Lawn Mowing | $400 | +$60 |
| 🚗 Car Wash | $500 | +$80 |

### Tier 2 — Dream Businesses

Higher cost, higher income. Mid-to-late game targets.

| Business | Cost | Passive Income/round |
|---|---|---|
| 🍕 Pizza Restaurant | $1,500 | +$200 |
| 🧸 Toy Store | $2,000 | +$250 |
| ⛳ Mini-Golf Course | $2,500 | +$300 |
| 🎬 Movie Theatre | $3,000 | +$400 |
| 🎡 Theme Park | $5,000 | +$600 |

### Tier 3 — Properties (with Mortgage Option)

Properties generate rental income. Players can buy outright or take a mortgage.

| Property | Cost | Rental Income/round |
|---|---|---|
| 🏠 Beach House | $1,000 | +$120 |
| 🏢 City Apartment | $1,800 | +$220 |
| 🏪 Corner Shop | $2,200 | +$280 |
| 🏬 Shopping Mall Unit | $3,500 | +$450 |
| 🏨 Hotel | $6,000 | +$750 |

### Mortgage Mechanics

When buying a property, the player chooses:

- **Buy outright** — pay full price, collect full rental income
- **Take a mortgage** — pay 20% down, borrow 80%, pay interest each Payday

Interest rate: 5% of the loan amount per round (simple, not compound).

Example — 🏠 Beach House ($1,000):
| Option | Down payment | Rental/round | Interest/round | Net/round |
|---|---|---|---|---|
| Outright | $1,000 | +$120 | — | **+$120** |
| Mortgage | $200 | +$120 | −$40 | **+$80** |

Mortgage interest is tracked as a liability and deducted automatically each Payday. The Deal card clearly shows both options side by side so kids see the trade-off.

### Selling Assets

Any owned business or property can be sold for **80% of purchase price** (used market discount). Mortgage liability is cleared on sale. Useful for emergency cash or upgrading to better assets.

---

## Deal Cards

When the wheel lands on Deal, a random asset is drawn from a pool weighted toward:
- Tier 1 in early rounds (round 1–5)
- Tier 1 & 2 in mid game (round 6–15)
- All tiers including Tier 3 from round 6 onward

Deal card shows:
- Asset emoji, name, type (Business / Property)
- Purchase price
- Income per round
- If property: mortgage option with side-by-side comparison
- Buttons: **Buy 💰** / **Mortgage 🏦** (properties only) / **Pass ➡️**

If the player can't afford the down payment, Buy and Mortgage buttons are disabled with a "Not enough cash 💸" message.

---

## Expense Events

Landing on Expense deducts a fixed amount from cash.

| Event | Cost |
|---|---|
| 🎒 School supplies | −$50 |
| 🎮 New video game (couldn't resist!) | −$80 |
| 🎂 Birthday party | −$60 |
| 🍕 Pizza night | −$40 |
| 👟 New sneakers | −$70 |

If cash would go negative, cash is set to $0 (no debt from expenses).

---

## Bad Luck Events

| Event | Effect |
|---|---|
| 🚑 Doctor visit | Pay $100 |
| 🌧️ Rainy week | One random business earns $0 next round |
| 🔧 Property repairs | Pay 10% of one owned property's value (min $50) |
| 💔 Friend borrowed money | Lose $75 |
| 🐛 Bug infestation | Pay $150 |

If the player owns no assets, property/business events fall back to a flat $100 cash loss.

---

## Mini-Games

Landing on Mini-Game randomly triggers one of two types (50/50):

### Reflex Games (15 seconds, earn $50–$150)

| Game | Mechanic | Max earn |
|---|---|---|
| 🪙 Coin Rain | Tap falling coins before they hit the ground | $150 |
| 🍋 Lemon Squeeze | Tap lemons rapidly to fill a juice glass | $100 |
| 💰 Cash Grab | Swipe money bags left to collect, right to dodge expenses | $150 |
| 🐾 Pet Rush | Tap runaway pets before they escape the screen | $100 |

Earn scales with performance (taps/score). Shown on result screen.

### Financial Trivia (3 questions, earn $75 per correct answer)

Sample questions:
- "If you earn $200 and spend $140, what is your profit?" → $60
- "What do we call money a property earns for its owner?" → Rent
- "A mortgage is: A) Free money B) A loan to buy property C) A type of business" → B
- "Passive income means money you earn: A) From working B) While you sleep C) Only on weekends" → B
- "Assets are things that: A) Cost you money B) Put money in your pocket C) Are always expensive" → B
- "If you borrow money, what do you call the extra you pay back?" → Interest

20+ questions in the pool, drawn randomly without repeating within a game.

---

## Progress Screen

Accessible at any time via a chart icon on the dashboard.

Displays a horizontal bar chart — one row per player showing:
- Passive income bar (coloured by player colour)
- Dotted line at their expense target
- Label showing exact values

First bar to cross the dotted line wins. No external charting library — rendered with plain HTML/CSS bars.

---

## Screens

### 1. Lobby
Player slots (2–4). Existing kid profile cards + "➕ Add Guest". Each player shows name, emoji, assigned colour, and job. Start button.

### 2. Between Turns (Cover Screen)
Full-screen coloured card: "Pass to [Name] 👋". Prevents the next player from seeing the current player's stats. Tap to continue.

### 3. Player Dashboard
- Player name + emoji + colour
- Cash on hand (large)
- Passive income / month
- Expenses / month (the target)
- Rat Race status: ⏳ "Keep building!" or ✅ "Almost there!"
- Owned assets list (tap to view / sell)
- SPIN button (large, prominent)

### 4. Spin Wheel
- Animated CSS spinning wheel with 10 segments (weighted)
- Slows to a stop with bounce
- Result segment highlighted, label shown

### 5. Deal Card
Asset details, buy/mortgage/pass options.

### 6. Expense Card
Event description, cost, "OK" button.

### 7. Bad Luck Card
Event description, effect applied, "OK" button.

### 8. Mini-Game Screen
Game loads, timer shown, score tallied, cash earned shown on result.

### 9. Win Screen
Confetti animation, player name large, "🎉 YOU ESCAPED THE RAT RACE!", summary of rounds played + assets owned + final net worth. "Play Again" and "Back to Games" buttons.

---

## Technical Architecture

### Route
`/play/money-town` — server wrapper page, passes `kid` context if `?kid=` param present. New tile on `/play` hub (gold/green, 💰 emoji, "2–4 players · Learn · Earn · Invest", NEW badge).

### State Management
Single `useReducer` in `MoneyTownGame.tsx`. All game logic in pure functions in `lib/money-town/gameLogic.ts`. Optional `localStorage` save/restore for game resume.

### Game Phase State Machine
```
lobby → turn-start → spinning → payday | deal | expense | minigame | bad-luck
                                                   ↓
                                            between-turns → turn-start
                                                   ↓ (if win condition met)
                                               win-screen
```

### TypeScript Types (`lib/money-town/types.ts`)
```ts
type GamePhase = 'lobby' | 'turn-start' | 'spinning' | 'payday' |
                 'deal' | 'expense' | 'minigame' | 'bad-luck' |
                 'between-turns' | 'win'

interface Player {
  id: string
  name: string
  emoji: string
  color: string          // 'red' | 'blue' | 'green' | 'yellow'
  cash: number
  salary: number         // collected on Payday
  expenses: number       // target to beat with passive income
  passiveIncome: number  // sum of owned asset incomes minus mortgage interest
  assets: OwnedAsset[]
}

interface OwnedAsset {
  assetId: string
  purchasePrice: number
  incomePerRound: number
  mortgageDebt: number   // 0 if bought outright
  interestPerRound: number
  skipNextRound: boolean // used by Bad Luck "rainy week"
}

interface GameState {
  phase: GamePhase
  players: Player[]
  currentPlayerIndex: number
  round: number
  pendingDeal: Asset | null
  pendingExpense: ExpenseEvent | null
  pendingBadLuck: BadLuckEvent | null
  winner: string | null
}
```

### File Structure
```
app/play/money-town/page.tsx
components/money-town/
  MoneyTownGame.tsx        ← useReducer hub, phase router
  GameLobby.tsx
  SpinWheel.tsx            ← CSS animated wheel
  PlayerDashboard.tsx
  DealCard.tsx
  ExpenseCard.tsx
  BadLuckCard.tsx
  BetweenTurns.tsx
  MiniGame.tsx             ← dispatches to correct game
  games/
    CoinRain.tsx
    LemonSqueeze.tsx
    CashGrab.tsx
    PetRush.tsx
  Trivia.tsx
  ProgressChart.tsx
  WinScreen.tsx
  AssetList.tsx
lib/money-town/
  types.ts
  constants.ts             ← all assets, jobs, events, trivia questions
  gameLogic.ts             ← pure reducer + helpers
```

### No External Dependencies
- Spin wheel: CSS `@keyframes` rotation
- Progress chart: plain `div` width percentages
- Mini-games: pointer/touch events only
- No charting library, no animation library, no socket library

---

## Design Principles

- **Plain language everywhere** — "Money you earn while not working" not "passive income" (show the term after the explanation)
- **Positive feedback** — celebrate every purchase, every payday, every correct trivia answer
- **Transparent trade-offs** — mortgage card always shows side-by-side net income comparison
- **Fast turns** — a full turn should take under 60 seconds; mini-games cap at 15 seconds
- **Expandable** — constants.ts holds all game content; adding new assets, events, or mini-games requires no logic changes
