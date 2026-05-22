# Money Town Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Money Town as a Monopoly-GO-meets-Cashflow board game — all players visible on one board, lever reel for events/chance/mini-games, salary auto-collected each turn, win by building passive income ≥ living expenses.

**Architecture:** `useReducer` state machine in `MoneyTownGame.tsx` drives a persistent `GameBoard` always on screen; overlays (`LeverOverlay`, `ResultCard`, `ActionPanel`) mount on top. All game logic lives in `lib/money-town/gameLogic.ts` (pure reducer + helpers). Existing mini-game components (`MiniGame`, `Trivia`, `games/*`) are kept unchanged.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS. No test runner — verify steps list what to confirm in the browser.

---

## File Map

| Action | File |
|---|---|
| Rewrite | `lib/money-town/types.ts` |
| Rewrite | `lib/money-town/constants.ts` |
| Rewrite | `lib/money-town/gameLogic.ts` |
| Update | `app/play/money-town/page.tsx` |
| Rewrite | `components/money-town/MoneyTownGame.tsx` |
| Rewrite | `components/money-town/GameLobby.tsx` |
| Create | `components/money-town/JobSpinCeremony.tsx` |
| Create | `components/money-town/GameBoard.tsx` |
| Create | `components/money-town/PlayerCard.tsx` |
| Create | `components/money-town/LeverOverlay.tsx` |
| Create | `components/money-town/ResultCard.tsx` |
| Create | `components/money-town/ActionPanel.tsx` |
| Create | `components/money-town/RulesModal.tsx` |
| Minor update | `components/money-town/WinScreen.tsx` |
| Delete | `PlayerDashboard`, `SpinWheel`, `PaydayCard`, `DealCard`, `ExpenseCard`, `BadLuckCard`, `BetweenTurns`, `ProgressChart`, `AssetList` |
| Keep as-is | `MiniGame.tsx`, `Trivia.tsx`, `games/*` |

---

## Task 1: Types — `lib/money-town/types.ts`

**Files:**
- Rewrite: `lib/money-town/types.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
export type GamePhase = 'lobby' | 'job-spin' | 'board' | 'lever' | 'result' | 'action' | 'win'
export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow'
export type ReelSegment = 'event' | 'chance' | 'mini-game' | 'big-event'
export type ReflexGameId = 'coin-rain' | 'lemon-squeeze' | 'cash-grab' | 'pet-rush'

export interface JobDef {
  id: string
  emoji: string
  name: string
  salary: number
  expenses: number
}

export interface AssetDef {
  id: string
  emoji: string
  name: string
  tier: 1 | 2 | 3
  cost: number
  income: number
  isProperty?: boolean
  isStock?: boolean
  isBusiness?: boolean
  volatile?: boolean
  degreeOnly?: boolean
  requiresProperties?: number
}

export interface OwnedAsset {
  uid: string       // unique per purchase ('lemon', 'prop_1', 'prop_2', 'hotel', etc.)
  defId: string     // references AssetDef.id
  income: number    // base income/turn (copied at purchase time)
  isProperty: boolean
  isStock: boolean
  isBusiness: boolean
}

export interface PaydayInfo {
  salary: number
  passive: number
  expenses: number
  net: number
  degreeArrived: boolean
}

export type ResultKind = 'event' | 'big-event' | 'chance' | 'mini-game'

export interface ResultPayload {
  kind: ResultKind
  emoji: string
  title: string
  description: string
  tone: 'good' | 'bad' | 'neutral'
  cashDelta: number
  salaryDelta: number
  expensesDelta: number
  // chance card offers (not yet applied — player must confirm)
  offerAssetDefId?: string
  offerDiscount?: number        // 0–1 multiplier e.g. 0.75 = 25% off
  offerCareerSwitch?: boolean   // show Accountant / Engineer choice
  // mini-game
  miniGameType?: 'reflex' | 'trivia'
  reflexGameId?: ReflexGameId
}

export interface Player {
  id: string
  name: string
  emoji: string
  color: PlayerColor
  cash: number
  salary: number
  expenses: number
  baseJobId: string
  assets: OwnedAsset[]
  degreeStatus: { turnsLeft: number } | 'graduated' | null
  stocksFrozen: number
  laidOff: number
  recession: number
  rentSurge: number
  boom: number
  turnCount: number
  hasWon: boolean
}

export interface GameState {
  phase: GamePhase
  players: Player[]
  currentPlayerIndex: number
  jobSpinPlayerIndex: number
  round: number
  pendingPayday: PaydayInfo | null
  pendingResult: ResultPayload | null
  usedTriviaIds: string[]
  winnerId: string | null
}

export type GameAction =
  | { type: 'ADD_PLAYER'; player: Player }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'START_GAME' }
  | { type: 'JOB_SPIN_RESULT'; jobId: string }
  | { type: 'START_TURN' }
  | { type: 'CLEAR_PAYDAY' }
  | { type: 'PULL_LEVER' }
  | { type: 'LEVER_RESULT'; segment: ReelSegment }
  | { type: 'DISMISS_RESULT' }
  | { type: 'MINIGAME_COMPLETE'; cashEarned: number }
  | { type: 'TRIVIA_COMPLETE'; cashEarned: number; triviaIds: string[] }
  | { type: 'BUY_ASSET'; defId: string; discount?: number }
  | { type: 'SWITCH_CAREER'; jobId: string }
  | { type: 'ENROLL_DEGREE' }
  | { type: 'END_TURN' }
  | { type: 'RESTORE'; state: GameState }
  | { type: 'NEW_GAME' }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: zero errors (other files still reference old types — they'll break; that's fine for now, fix in later tasks).

- [ ] **Step 3: Commit**

```bash
git add lib/money-town/types.ts
git commit -m "feat(money-town): rewrite types for v7 redesign"
```

---

## Task 2: Constants — `lib/money-town/constants.ts`

**Files:**
- Rewrite: `lib/money-town/constants.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
import type { JobDef, AssetDef, ReelSegment, ReflexGameId, PlayerColor } from './types'

export const STARTING_CASH = 800
export const DEGREE_COST = 900
export const DEGREE_TURNS = 2
export const MIN_TURNS_TO_WIN = 6
export const CASH_FLOOR = 200

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow']

export const PLAYER_COLOR_CLASSES: Record<PlayerColor, { bg: string; border: string; text: string; badge: string }> = {
  red:    { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-700',    badge: 'bg-red-500'    },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-400',   text: 'text-blue-700',   badge: 'bg-blue-500'   },
  green:  { bg: 'bg-green-50',  border: 'border-green-400',  text: 'text-green-700',  badge: 'bg-green-500'  },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700', badge: 'bg-yellow-500' },
}

export const JOBS: JobDef[] = [
  { id: 'driver',  emoji: '🚚', name: 'Delivery Driver', salary: 600,  expenses: 450  },
  { id: 'shop',    emoji: '🛒', name: 'Shop Assistant',  salary: 750,  expenses: 560  },
  { id: 'teacher', emoji: '📚', name: 'Teacher',         salary: 900,  expenses: 680  },
  { id: 'trade',   emoji: '🔧', name: 'Tradesperson',    salary: 1050, expenses: 800  },
]

export const DEGREE_JOBS: JobDef[] = [
  { id: 'accountant', emoji: '📊', name: 'Accountant', salary: 1400, expenses: 1000 },
  { id: 'engineer',   emoji: '⚙️', name: 'Engineer',   salary: 1700, expenses: 1200 },
]

export const ASSETS: AssetDef[] = [
  { id: 'lemon',    emoji: '🍋', name: 'Lemonade Stand',     tier: 1, cost: 700,  income: 75  },
  { id: 'park',     emoji: '🅿️', name: 'Parking Spot',        tier: 1, cost: 1100, income: 105 },
  { id: 'truck',    emoji: '🚚', name: 'Food Truck',          tier: 1, cost: 1500, income: 150 },
  { id: 'stocks',   emoji: '📈', name: 'Stocks',              tier: 2, cost: 2000, income: 225, isStock: true, volatile: true },
  { id: 'property', emoji: '🏠', name: 'Investment Property', tier: 2, cost: 2400, income: 300, isProperty: true },
  { id: 'biz',      emoji: '🏪', name: 'Small Business',      tier: 2, cost: 3800, income: 420, isBusiness: true },
  { id: 'startup',  emoji: '💡', name: 'Tech Startup',        tier: 2, cost: 2800, income: 420, isBusiness: true, degreeOnly: true },
  { id: 'hotel',    emoji: '🏨', name: 'Hotel',               tier: 3, cost: 4500, income: 900, requiresProperties: 3 },
]

// 6 segments — probability: event 33%, chance 33%, mini-game 17%, big-event 17%
export const REEL_SEGMENTS: ReelSegment[] = ['event', 'event', 'chance', 'chance', 'mini-game', 'big-event']

export const REFLEX_GAMES: ReflexGameId[] = ['coin-rain', 'lemon-squeeze', 'cash-grab', 'pet-rush']

// ─── Trivia (reused from original game) ─────────────────────────────────────

export interface TriviaQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
}

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { id: 'q1',  question: 'If you earn $200 and spend $140, what is your profit?',                         options: ['$60', '$40', '$340', '$80'],                                                       correctIndex: 0 },
  { id: 'q2',  question: 'What do we call money a property earns for its owner?',                          options: ['Profit', 'Salary', 'Rent', 'Tax'],                                                 correctIndex: 2 },
  { id: 'q3',  question: 'A mortgage is:',                                                                  options: ['Free money', 'A loan to buy property', 'A type of business', 'Extra salary'],     correctIndex: 1 },
  { id: 'q4',  question: 'Passive income means money you earn:',                                            options: ['From working', 'While you sleep', 'Only on weekends', 'From taxes'],              correctIndex: 1 },
  { id: 'q5',  question: 'Assets are things that:',                                                         options: ['Cost you money', 'Put money in your pocket', 'Are always expensive', 'Banks own'], correctIndex: 1 },
  { id: 'q6',  question: 'If you borrow money, what do you call the extra you pay back?',                  options: ['Rent', 'Tax', 'Interest', 'Salary'],                                               correctIndex: 2 },
  { id: 'q7',  question: 'Which is a liability (something that costs you money)?',                         options: ['Business', 'Savings', 'Mortgage debt', 'Salary'],                                  correctIndex: 2 },
  { id: 'q8',  question: 'What does it mean to invest?',                                                   options: ['Spend all your money', 'Put money somewhere to grow', 'Give money away', 'Borrow money'], correctIndex: 1 },
  { id: 'q9',  question: 'A lemonade stand is an example of:',                                             options: ['A liability', 'A salary', 'An asset', 'An expense'],                              correctIndex: 2 },
  { id: 'q10', question: 'If rent is $120 and mortgage interest is $40, what is your net income?',        options: ['$160', '$80', '$40', '$120'],                                                      correctIndex: 1 },
  { id: 'q11', question: 'What is a "down payment"?',                                                      options: ['Monthly salary', 'Part of a purchase price paid upfront', 'Bank fee', 'Monthly rent'], correctIndex: 1 },
  { id: 'q12', question: 'Which comes first: earning or spending to build wealth?',                        options: ['Spending first', 'They are the same', 'Earning first', 'Borrowing first'],        correctIndex: 2 },
  { id: 'q13', question: 'What does "profit" mean?',                                                       options: ['Money you borrow', 'Money earned minus money spent', 'Total money earned', 'Money in the bank'], correctIndex: 1 },
  { id: 'q14', question: 'Which is passive income?',                                                       options: ['Salary from a job', 'Rent from a property', 'Spending savings', 'Borrowing money'], correctIndex: 1 },
  { id: 'q15', question: 'If you have $300 and spend $80, how much is left?',                             options: ['$380', '$220', '$240', '$200'],                                                    correctIndex: 1 },
  { id: 'q16', question: 'What is the "Rat Race"?',                                                        options: ['A game with rats', 'Working just to pay expenses with nothing left over', 'A car race', 'A type of business'], correctIndex: 1 },
  { id: 'q17', question: 'Which costs MORE upfront: buying outright or mortgage?',                         options: ['Mortgage', 'Buying outright', 'They cost the same', 'Neither costs money'],       correctIndex: 1 },
  { id: 'q18', question: 'What is a budget?',                                                              options: ['A type of loan', 'A plan for how to spend and save money', 'A business name', 'A tax form'], correctIndex: 1 },
  { id: 'q19', question: 'If your passive income is $160 and expenses are $160, what happens?',           options: ['You lose the game', 'You win — you escaped the Rat Race!', 'Nothing changes', 'You must pay tax'], correctIndex: 1 },
  { id: 'q20', question: 'Why is passive income powerful?',                                                options: ['It requires more work', 'You earn it even when not working', 'It is always illegal', 'Banks give it to you free'], correctIndex: 1 },
]
```

- [ ] **Step 2: Commit**

```bash
git add lib/money-town/constants.ts
git commit -m "feat(money-town): rewrite constants with v7 game balance numbers"
```

---

## Task 3: Game Logic — `lib/money-town/gameLogic.ts`

**Files:**
- Rewrite: `lib/money-town/gameLogic.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
import type {
  GameState, GameAction, Player, OwnedAsset, ResultPayload, PaydayInfo, ReelSegment
} from './types'
import {
  ASSETS, JOBS, DEGREE_JOBS, REEL_SEGMENTS, REFLEX_GAMES, TRIVIA_QUESTIONS,
  STARTING_CASH, DEGREE_COST, DEGREE_TURNS, MIN_TURNS_TO_WIN, CASH_FLOOR,
} from './constants'
import type { TriviaQuestion } from './constants'

// ─── Helpers ────────────────────────────────────────────────────────────────

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

let _propSeq = 0

export function computePassiveIncome(player: Player): number {
  let total = 0
  for (const a of player.assets) {
    let inc = a.income
    if (a.isStock && player.stocksFrozen > 0) inc = 0
    if (player.recession > 0) inc = Math.floor(inc / 2)
    if (player.rentSurge > 0 && a.isProperty) inc += 60
    if (player.boom > 0 && a.isBusiness) inc *= 2
    total += inc
  }
  return total
}

export function checkWin(player: Player): boolean {
  return player.turnCount >= MIN_TURNS_TO_WIN && computePassiveIncome(player) >= player.expenses
}

export function ownedPropertyCount(player: Player): number {
  return player.assets.filter(a => a.isProperty).length
}

export function canBuyAsset(player: Player, defId: string): boolean {
  const def = ASSETS.find(a => a.id === defId)
  if (!def) return false
  if (def.isProperty) {
    if (ownedPropertyCount(player) >= 3) return false
  } else if (def.requiresProperties) {
    if (ownedPropertyCount(player) < def.requiresProperties) return false
    if (player.assets.some(a => a.defId === 'hotel')) return false
  } else {
    if (player.assets.some(a => a.defId === def.id)) return false
  }
  if (def.degreeOnly && player.degreeStatus !== 'graduated') return false
  return true
}

function applyBuyAsset(player: Player, defId: string, discount = 1): Player {
  const def = ASSETS.find(a => a.id === defId)
  if (!def) return player
  const cost = Math.floor(def.cost * discount)
  if (player.cash < cost) return player

  const uid = def.isProperty ? `prop_${++_propSeq}` : def.id
  const owned: OwnedAsset = {
    uid,
    defId: def.id,
    income: def.income,
    isProperty: !!def.isProperty,
    isStock: !!def.isStock,
    isBusiness: !!def.isBusiness,
  }
  return { ...player, cash: player.cash - cost, assets: [...player.assets, owned] }
}

function tickStatusEffects(player: Player): Player {
  return {
    ...player,
    stocksFrozen: Math.max(0, player.stocksFrozen - 1),
    laidOff:      Math.max(0, player.laidOff - 1),
    recession:    Math.max(0, player.recession - 1),
    rentSurge:    Math.max(0, player.rentSurge - 1),
    boom:         Math.max(0, player.boom - 1),
  }
}

// ─── Card drawing ────────────────────────────────────────────────────────────

function drawEventCard(player: Player): { player: Player; payload: ResultPayload } {
  type EventCard = { emoji: string; name: string; apply: (p: Player) => { player: Player; cashDelta: number; extra?: Partial<Player> } }

  const events: EventCard[] = [
    { emoji: '🚗', name: 'Car Breakdown',      apply: (p) => ({ player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - 300) }, cashDelta: -300 }) },
    { emoji: '🏥', name: 'Medical Bill',        apply: (p) => ({ player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - 450) }, cashDelta: -450 }) },
    { emoji: '📋', name: 'Tax Audit',           apply: (p) => { const d = Math.max(200, Math.floor(p.cash * 0.10)); return { player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - d) }, cashDelta: -d } } },
    { emoji: '🏠', name: 'Roof Leak',           apply: (p) => { const d = p.assets.some(a=>a.isProperty) ? 750 : 500; return { player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - d) }, cashDelta: -d } } },
    { emoji: '📉', name: 'Stock Market Dip',    apply: (p) => ({ player: { ...p, stocksFrozen: 1 }, cashDelta: 0 }) },
    { emoji: '💸', name: 'Unexpected Expense',  apply: (p) => ({ player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - 400) }, cashDelta: -400 }) },
    { emoji: '💰', name: 'Tax Refund',          apply: (p) => ({ player: { ...p, cash: p.cash + 450 }, cashDelta: 450 }) },
    { emoji: '🎉', name: 'Work Bonus',          apply: (p) => { const d = Math.floor(p.salary * 0.35); return { player: { ...p, cash: p.cash + d }, cashDelta: d } } },
    { emoji: '💼', name: 'Side Hustle',         apply: (p) => ({ player: { ...p, cash: p.cash + 350 }, cashDelta: 350 }) },
    { emoji: '🍀', name: 'Lucky Day',           apply: (p) => ({ player: { ...p, cash: p.cash + 400 }, cashDelta: 400 }) },
    { emoji: '📈', name: 'Rent Surge',          apply: (p) => ({ player: { ...p, rentSurge: 1 }, cashDelta: 0 }) },
  ]

  const card = rand(events)
  const result = card.apply(player)
  const tone = result.cashDelta > 0 ? 'good' : result.cashDelta < 0 ? 'bad' : 'neutral'

  const descriptions: Record<string, string> = {
    'Car Breakdown': 'Your car needs repairs. Pay $300.',
    'Medical Bill': 'Unexpected medical bill. Pay $450.',
    'Tax Audit': 'The tax office wants a visit. Pay 10% of cash (min $200).',
    'Roof Leak': 'Water is dripping! Pay $500 (or $750 if you own property).',
    'Stock Market Dip': 'Markets are down. Your stocks earn nothing next turn.',
    'Unexpected Expense': 'Something came up. Pay $400.',
    'Tax Refund': 'Great news — the tax office owes you $450!',
    'Work Bonus': 'You went above and beyond. Receive 35% of your salary.',
    'Side Hustle': 'Extra gig pays off — +$350.',
    'Lucky Day': 'Everything went your way — +$400.',
    'Rent Surge': 'Rents are hot! Each Investment Property earns +$60 extra next turn.',
  }

  return {
    player: result.player,
    payload: {
      kind: 'event',
      emoji: card.emoji,
      title: card.name,
      description: descriptions[card.name] ?? card.name,
      tone,
      cashDelta: result.cashDelta,
      salaryDelta: 0,
      expensesDelta: 0,
    },
  }
}

function drawBigEventCard(player: Player): { player: Player; payload: ResultPayload } {
  type BigCard = { emoji: string; name: string; desc: string; tone: 'good'|'bad'|'neutral'; apply: (p: Player) => { player: Player; cashDelta: number; salaryDelta?: number; expensesDelta?: number } }

  const cards: BigCard[] = [
    {
      emoji: '👶', name: 'Twins!', tone: 'bad',
      desc: 'Congratulations (kind of) — living expenses +$120/round permanently.',
      apply: (p) => ({ player: { ...p, expenses: p.expenses + 120 }, cashDelta: 0, expensesDelta: 120 }),
    },
    {
      emoji: '🌪️', name: 'Laid Off', tone: 'bad',
      desc: "You've been laid off! No salary next turn (passive income still pays).",
      apply: (p) => ({ player: { ...p, laidOff: 1 }, cashDelta: 0 }),
    },
    {
      emoji: '💰', name: 'Inheritance', tone: 'good',
      desc: 'A distant relative left you money — receive $1,200!',
      apply: (p) => ({ player: { ...p, cash: p.cash + 1200 }, cashDelta: 1200 }),
    },
    {
      emoji: '🏥', name: 'Major Surgery', tone: 'bad',
      desc: 'A big medical bill hits. Pay $900.',
      apply: (p) => ({ player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - 900) }, cashDelta: -900 }),
    },
    {
      emoji: '📉', name: 'Recession', tone: 'bad',
      desc: 'Economic downturn — all your passive income is halved next turn.',
      apply: (p) => ({ player: { ...p, recession: 1 }, cashDelta: 0 }),
    },
    {
      emoji: '🚀', name: 'Business Boom', tone: 'good',
      desc: 'Markets are booming! All your businesses earn double next turn.',
      apply: (p) => ({ player: { ...p, boom: 1 }, cashDelta: 0 }),
    },
    {
      emoji: '🌟', name: 'Viral Moment', tone: 'good',
      desc: 'Your business went viral! Receive $650 per business you own.',
      apply: (p) => {
        const count = p.assets.filter(a => a.isBusiness).length
        const delta = count * 650
        return { player: { ...p, cash: p.cash + delta }, cashDelta: delta }
      },
    },
    {
      emoji: '💎', name: 'Windfall', tone: 'good',
      desc: 'Lucky break — receive $1,000!',
      apply: (p) => ({ player: { ...p, cash: p.cash + 1000 }, cashDelta: 1000 }),
    },
  ]

  const card = rand(cards)
  const result = card.apply(player)
  return {
    player: result.player,
    payload: {
      kind: 'big-event',
      emoji: card.emoji,
      title: card.name,
      description: card.desc,
      tone: card.tone,
      cashDelta: result.cashDelta,
      salaryDelta: result.salaryDelta ?? 0,
      expensesDelta: result.expensesDelta ?? 0,
    },
  }
}

function drawChanceCard(player: Player): { player: Player; payload: ResultPayload } {
  const graduated = player.degreeStatus === 'graduated'

  if (graduated) {
    type GradCard = { emoji: string; name: string; desc: string; tone: 'good'|'neutral'; apply: (p: Player) => { player: Player; cashDelta: number; salaryDelta?: number; expensesDelta?: number; offerAssetDefId?: string; offerDiscount?: number; offerCareerSwitch?: boolean } }

    const gradCards: GradCard[] = [
      {
        emoji: '🎯', name: 'Promotion', tone: 'good',
        desc: 'Your boss noticed your degree. +$280 salary, +$200 expenses permanently.',
        apply: (p) => ({ player: { ...p, salary: p.salary + 280, expenses: p.expenses + 200 }, cashDelta: 0, salaryDelta: 280, expensesDelta: 200 }),
      },
      {
        emoji: '💼', name: 'Career Switch', tone: 'good',
        desc: 'A headhunter offers you a dream job. Choose your new career!',
        apply: (p) => ({ player: p, cashDelta: 0, offerCareerSwitch: true }),
      },
      {
        emoji: '🏠', name: 'Discounted Property', tone: 'good',
        desc: 'A colleague tips you off on a deal — Investment Property at 25% off ($1,800).',
        apply: (p) => ({ player: p, cashDelta: 0, offerAssetDefId: 'property', offerDiscount: 0.75 }),
      },
      {
        emoji: '💡', name: 'Tech Startup Deal', tone: 'good',
        desc: 'A startup opportunity lands in your inbox — Tech Startup at full price ($2,800).',
        apply: (p) => ({ player: p, cashDelta: 0, offerAssetDefId: 'startup', offerDiscount: 1 }),
      },
      {
        emoji: '🏆', name: 'Head-hunted', tone: 'good',
        desc: 'Top company wants you. +$400 salary, +$280 expenses permanently.',
        apply: (p) => ({ player: { ...p, salary: p.salary + 400, expenses: p.expenses + 280 }, cashDelta: 0, salaryDelta: 400, expensesDelta: 280 }),
      },
      {
        emoji: '🎁', name: 'Cash Gift', tone: 'good',
        desc: 'A generous relative hears about your degree — +$550.',
        apply: (p) => ({ player: { ...p, cash: p.cash + 550 }, cashDelta: 550 }),
      },
    ]

    const card = rand(gradCards)
    const result = card.apply(player)
    return {
      player: result.player,
      payload: {
        kind: 'chance',
        emoji: card.emoji,
        title: card.name,
        description: card.desc,
        tone: card.tone,
        cashDelta: result.cashDelta,
        salaryDelta: result.salaryDelta ?? 0,
        expensesDelta: result.expensesDelta ?? 0,
        offerAssetDefId: result.offerAssetDefId,
        offerDiscount: result.offerDiscount,
        offerCareerSwitch: result.offerCareerSwitch,
      },
    }
  }

  // No degree
  type BasicCard = { emoji: string; name: string; desc: string; apply: (p: Player) => { player: Player; cashDelta: number; salaryDelta?: number; offerAssetDefId?: string } }

  const cheapestTier1 = ASSETS.filter(a => a.tier === 1 && canBuyAsset(player, a.id))[0]
  const basicCards: BasicCard[] = [
    {
      emoji: '💪', name: 'Minor Raise', desc: 'Your hard work paid off — +$60 salary permanently.',
      apply: (p) => ({ player: { ...p, salary: p.salary + 60 }, cashDelta: 0, salaryDelta: 60 }),
    },
    {
      emoji: '🎁', name: 'Cash Gift', desc: 'A relative sends you some cash — +$350.',
      apply: (p) => ({ player: { ...p, cash: p.cash + 350 }, cashDelta: 350 }),
    },
    ...(cheapestTier1 ? [{
      emoji: cheapestTier1.emoji,
      name: 'Small Deal',
      desc: `An opportunity knocks — buy a ${cheapestTier1.name} at full price ($${cheapestTier1.cost.toLocaleString()}).`,
      apply: (p: Player) => ({ player: p, cashDelta: 0, offerAssetDefId: cheapestTier1.id }),
    }] : []),
  ]

  const pool = basicCards.length > 0 ? basicCards : basicCards.slice(0, 2)
  const card = rand(pool)
  const result = card.apply(player)
  return {
    player: result.player,
    payload: {
      kind: 'chance',
      emoji: card.emoji,
      title: card.name,
      description: card.desc,
      tone: 'good',
      cashDelta: result.cashDelta,
      salaryDelta: result.salaryDelta ?? 0,
      expensesDelta: 0,
      offerAssetDefId: result.offerAssetDefId,
    },
  }
}

function drawMiniGameCard(): ResultPayload {
  const useTrivia = Math.random() < 0.5
  if (useTrivia) {
    return {
      kind: 'mini-game', emoji: '🧠', title: 'Trivia Time!',
      description: 'Answer 3 questions to earn cash.',
      tone: 'neutral', cashDelta: 0, salaryDelta: 0, expensesDelta: 0,
      miniGameType: 'trivia',
    }
  }
  const reflexGameId = rand(REFLEX_GAMES)
  const names: Record<string, string> = {
    'coin-rain': 'Coin Rain', 'lemon-squeeze': 'Lemon Squeeze',
    'cash-grab': 'Cash Grab', 'pet-rush': 'Pet Rush',
  }
  return {
    kind: 'mini-game', emoji: '🎮', title: names[reflexGameId] ?? 'Mini-Game',
    description: 'Play a quick game to earn cash!',
    tone: 'neutral', cashDelta: 0, salaryDelta: 0, expensesDelta: 0,
    miniGameType: 'reflex', reflexGameId,
  }
}

export function pickTriviaQuestions(usedIds: string[], count = 3): TriviaQuestion[] {
  const pool = TRIVIA_QUESTIONS.filter(q => !usedIds.includes(q.id))
  const source = pool.length >= count ? pool : TRIVIA_QUESTIONS
  return [...source].sort(() => Math.random() - 0.5).slice(0, count)
}

// ─── Turn helpers ────────────────────────────────────────────────────────────

function applyStartTurn(state: GameState): GameState {
  const player = state.players[state.currentPlayerIndex]

  // Tick degree before computing payday (so graduation shows this turn)
  let newDegreeStatus = player.degreeStatus
  let degreeArrived = false
  if (newDegreeStatus && newDegreeStatus !== 'graduated') {
    const remaining = newDegreeStatus.turnsLeft - 1
    if (remaining <= 0) {
      newDegreeStatus = 'graduated'
      degreeArrived = true
    } else {
      newDegreeStatus = { turnsLeft: remaining }
    }
  }

  const updatedForDegree = { ...player, degreeStatus: newDegreeStatus }

  // Compute passive income using current status flags (before ticking down)
  const passive = computePassiveIncome(updatedForDegree)
  const salary = updatedForDegree.laidOff > 0 ? 0 : updatedForDegree.salary
  const net = salary + passive - updatedForDegree.expenses
  const newCash = Math.max(CASH_FLOOR, updatedForDegree.cash + net)

  const turnedPlayer = tickStatusEffects({
    ...updatedForDegree,
    cash: newCash,
    turnCount: updatedForDegree.turnCount + 1,
  })

  const hasWon = checkWin(turnedPlayer)

  const payday: PaydayInfo = { salary, passive, expenses: turnedPlayer.expenses, net, degreeArrived }

  const newPlayers = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...turnedPlayer, hasWon } : p
  )

  return {
    ...state,
    players: newPlayers,
    pendingPayday: payday,
    phase: hasWon ? 'win' : 'board',
    winnerId: hasWon ? turnedPlayer.id : state.winnerId,
  }
}

function nextTurn(state: GameState): GameState {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length
  const newRound = nextIndex === 0 ? state.round + 1 : state.round
  const intermediate: GameState = {
    ...state,
    currentPlayerIndex: nextIndex,
    round: newRound,
    pendingResult: null,
  }
  return applyStartTurn(intermediate)
}

// ─── Initial state ────────────────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    phase: 'lobby',
    players: [],
    currentPlayerIndex: 0,
    jobSpinPlayerIndex: 0,
    round: 1,
    pendingPayday: null,
    pendingResult: null,
    usedTriviaIds: [],
    winnerId: null,
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {

    case 'ADD_PLAYER': {
      if (state.players.length >= 4) return state
      return { ...state, players: [...state.players, action.player] }
    }

    case 'REMOVE_PLAYER': {
      return { ...state, players: state.players.filter(p => p.id !== action.playerId) }
    }

    case 'START_GAME': {
      if (state.players.length < 1) return state
      return { ...state, phase: 'job-spin', jobSpinPlayerIndex: 0 }
    }

    case 'JOB_SPIN_RESULT': {
      const job = [...JOBS, ...DEGREE_JOBS].find(j => j.id === action.jobId)
      if (!job) return state
      const updatedPlayers = state.players.map((p, i) =>
        i === state.jobSpinPlayerIndex
          ? { ...p, salary: job.salary, expenses: job.expenses, baseJobId: job.id }
          : p
      )
      const allDone = state.jobSpinPlayerIndex >= state.players.length - 1
      if (!allDone) {
        return { ...state, players: updatedPlayers, jobSpinPlayerIndex: state.jobSpinPlayerIndex + 1 }
      }
      // All players have jobs — begin round 1 for player 0
      const readyState: GameState = {
        ...state,
        players: updatedPlayers,
        currentPlayerIndex: 0,
        round: 1,
      }
      return applyStartTurn(readyState)
    }

    case 'START_TURN': {
      return applyStartTurn(state)
    }

    case 'CLEAR_PAYDAY': {
      return { ...state, pendingPayday: null }
    }

    case 'PULL_LEVER': {
      return { ...state, phase: 'lever' }
    }

    case 'LEVER_RESULT': {
      const player = state.players[state.currentPlayerIndex]
      let updatedPlayer = player
      let payload: ResultPayload

      if (action.segment === 'event') {
        const r = drawEventCard(player)
        updatedPlayer = r.player
        payload = r.payload
      } else if (action.segment === 'big-event') {
        const r = drawBigEventCard(player)
        updatedPlayer = r.player
        payload = r.payload
      } else if (action.segment === 'chance') {
        const r = drawChanceCard(player)
        updatedPlayer = r.player
        payload = r.payload
      } else {
        payload = drawMiniGameCard()
      }

      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )

      return {
        ...state,
        players: newPlayers,
        pendingResult: payload,
        phase: 'result',
      }
    }

    case 'DISMISS_RESULT': {
      const result = state.pendingResult
      if (!result) return { ...state, phase: 'action' }
      // Mini-games stay in 'result' phase — MiniGame component dispatches MINIGAME_COMPLETE
      if (result.miniGameType) return state
      return { ...state, pendingResult: null, phase: 'action' }
    }

    case 'MINIGAME_COMPLETE': {
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer = { ...player, cash: player.cash + action.cashEarned }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers, pendingResult: null, phase: 'action' }
    }

    case 'TRIVIA_COMPLETE': {
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer = { ...player, cash: player.cash + action.cashEarned }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      const newUsedIds = Array.from(new Set([...state.usedTriviaIds, ...action.triviaIds]))
      return { ...state, players: newPlayers, pendingResult: null, usedTriviaIds: newUsedIds, phase: 'action' }
    }

    case 'BUY_ASSET': {
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer = applyBuyAsset(player, action.defId, action.discount ?? 1)
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return nextTurn({ ...state, players: newPlayers })
    }

    case 'SWITCH_CAREER': {
      const job = DEGREE_JOBS.find(j => j.id === action.jobId)
      if (!job) return state
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer = { ...player, salary: job.salary, expenses: job.expenses, baseJobId: job.id }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return nextTurn({ ...state, players: newPlayers })
    }

    case 'ENROLL_DEGREE': {
      const player = state.players[state.currentPlayerIndex]
      if (player.cash < DEGREE_COST) return state
      const updatedPlayer = {
        ...player,
        cash: player.cash - DEGREE_COST,
        degreeStatus: { turnsLeft: DEGREE_TURNS },
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return nextTurn({ ...state, players: newPlayers })
    }

    case 'END_TURN': {
      return nextTurn(state)
    }

    case 'RESTORE': {
      return action.state
    }

    case 'NEW_GAME': {
      return createInitialState()
    }

    default:
      return state
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: errors only in component files that haven't been updated yet — no errors in `lib/money-town/`.

- [ ] **Step 3: Commit**

```bash
git add lib/money-town/gameLogic.ts
git commit -m "feat(money-town): rewrite game logic — new reducer, card drawing, status effects"
```

---

## Task 4: Page — `app/play/money-town/page.tsx`

**Files:**
- Modify: `app/play/money-town/page.tsx`

- [ ] **Step 1: Add `listKids()` fetch and pass kids to component**

```typescript
import { getKid, listKids } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import MoneyTownGame from "@/components/money-town/MoneyTownGame";
import type { Kid } from "@/lib/domain/types";

export default async function MoneyTownPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const [kid, kids] = await Promise.all([
    kidId ? getKid(kidId) : Promise.resolve(null),
    listKids(),
  ]);

  const content = (
    <MoneyTownGame
      kids={kids}
      activeKidId={kidId ?? null}
    />
  );

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }

  return (
    <div className="min-h-screen bg-sky-50">
      {content}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/play/money-town/page.tsx
git commit -m "feat(money-town): pass kids list from page to MoneyTownGame"
```

---

## Task 5: Orchestrator — `components/money-town/MoneyTownGame.tsx`

**Files:**
- Rewrite: `components/money-town/MoneyTownGame.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
"use client"

import { useReducer, useEffect, useState } from "react"
import { gameReducer, createInitialState } from "@/lib/money-town/gameLogic"
import type { GameState } from "@/lib/money-town/types"
import type { Kid } from "@/lib/domain/types"
import GameLobby from "./GameLobby"
import JobSpinCeremony from "./JobSpinCeremony"
import GameBoard from "./GameBoard"
import LeverOverlay from "./LeverOverlay"
import ResultCard from "./ResultCard"
import ActionPanel from "./ActionPanel"
import RulesModal from "./RulesModal"
import WinScreen from "./WinScreen"
import MiniGame from "./MiniGame"

const SAVE_KEY = 'money-town-v7-save'

interface Props {
  kids: Kid[]
  activeKidId: string | null
}

export default function MoneyTownGame({ kids, activeKidId }: Props) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SAVE_KEY)
        if (saved) return JSON.parse(saved) as GameState
      } catch {}
    }
    return createInitialState()
  })

  const [rulesOpen, setRulesOpen] = useState(false)

  // Persist state
  useEffect(() => {
    if (state.phase === 'lobby') return
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)) } catch {}
  }, [state])

  // Clear save on win or new game
  useEffect(() => {
    if (state.phase === 'win' || state.phase === 'lobby') {
      try { localStorage.removeItem(SAVE_KEY) } catch {}
    }
  }, [state.phase])

  const currentPlayer = state.players[state.currentPlayerIndex]
  const activeKid = kids.find(k => k.id === activeKidId) ?? null

  if (state.phase === 'lobby') {
    return (
      <GameLobby
        kids={kids}
        activeKid={activeKid}
        dispatch={dispatch}
      />
    )
  }

  if (state.phase === 'job-spin') {
    return (
      <JobSpinCeremony
        players={state.players}
        spinPlayerIndex={state.jobSpinPlayerIndex}
        dispatch={dispatch}
      />
    )
  }

  if (state.phase === 'win' && state.winnerId) {
    const winner = state.players.find(p => p.id === state.winnerId)!
    return (
      <WinScreen
        winner={winner}
        players={state.players}
        round={state.round}
        activeKidId={activeKidId}
        onPlayAgain={() => dispatch({ type: 'NEW_GAME' })}
      />
    )
  }

  if (!currentPlayer) return null

  // Board is always mounted for board/lever/result/action phases
  return (
    <div className="relative min-h-screen bg-sky-50">
      <GameBoard
        state={state}
        dispatch={dispatch}
        onHowToPlay={() => setRulesOpen(true)}
      />

      {state.phase === 'lever' && (
        <LeverOverlay
          player={currentPlayer}
          onResult={(segment) => dispatch({ type: 'LEVER_RESULT', segment })}
        />
      )}

      {state.phase === 'result' && state.pendingResult && (
        <>
          {state.pendingResult.miniGameType ? (
            <MiniGame
              minigame={{
                type: state.pendingResult.miniGameType,
                reflexGameId: state.pendingResult.reflexGameId,
              }}
              usedTriviaIds={state.usedTriviaIds}
              dispatch={dispatch}
            />
          ) : (
            <ResultCard
              result={state.pendingResult}
              player={currentPlayer}
              state={state}
              dispatch={dispatch}
            />
          )}
        </>
      )}

      {state.phase === 'action' && (
        <ActionPanel
          player={currentPlayer}
          state={state}
          dispatch={dispatch}
        />
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/money-town/MoneyTownGame.tsx
git commit -m "feat(money-town): rewrite orchestrator for new screen flow"
```

---

## Task 6: Lobby — `components/money-town/GameLobby.tsx`

**Files:**
- Rewrite: `components/money-town/GameLobby.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
"use client"

import { useState } from "react"
import Link from "next/link"
import type { Kid } from "@/lib/domain/types"
import type { Player, GameAction } from "@/lib/money-town/types"
import { PLAYER_COLORS, PLAYER_COLOR_CLASSES, STARTING_CASH } from "@/lib/money-town/constants"

const GUEST_EMOJIS = ['😎', '🤩', '🥳', '😜', '🦊', '🐼', '🦄', '🐸']

interface Props {
  kids: Kid[]
  activeKid: Kid | null
  dispatch: (action: GameAction) => void
}

function makePlayer(id: string, name: string, emoji: string, colorIndex: number): Player {
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]
  return {
    id, name, emoji, color,
    cash: STARTING_CASH,
    salary: 0, expenses: 0, baseJobId: '',
    assets: [], degreeStatus: null,
    stocksFrozen: 0, laidOff: 0, recession: 0, rentSurge: 0, boom: 0,
    turnCount: 0, hasWon: false,
  }
}

export default function GameLobby({ kids, activeKid, dispatch }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (activeKid) return new Set([activeKid.id])
    return new Set()
  })
  const [guests, setGuests] = useState<{ id: string; name: string }[]>([])
  const [guestName, setGuestName] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)

  const totalPlayers = selected.size + guests.length
  const canAdd = totalPlayers < 4

  function toggleKid(kid: Kid) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(kid.id)) next.delete(kid.id)
      else if (totalPlayers < 4) next.add(kid.id)
      return next
    })
  }

  function addGuest() {
    const name = guestName.trim()
    if (!name || !canAdd) return
    setGuests(prev => [...prev, { id: `guest-${Date.now()}`, name }])
    setGuestName('')
    setAddingGuest(false)
  }

  function startGame() {
    if (totalPlayers < 1) return
    const players: Player[] = []
    let colorIdx = 0
    kids.filter(k => selected.has(k.id)).forEach(k => {
      players.push(makePlayer(k.id, k.name, k.emoji ?? '😊', colorIdx++))
    })
    guests.forEach(g => {
      players.push(makePlayer(g.id, g.name, GUEST_EMOJIS[colorIdx % GUEST_EMOJIS.length], colorIdx++))
    })
    players.forEach(p => dispatch({ type: 'ADD_PLAYER', player: p }))
    dispatch({ type: 'START_GAME' })
  }

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 flex items-center justify-between">
        <Link href={activeKid ? `/kid/${activeKid.id}/play` : "/select-kid"}
          className="text-sm font-bold text-white/80 hover:text-white flex items-center gap-1">
          ← Games
        </Link>
        <span className="font-black text-white text-lg">💰 Money Town</span>
        <button type="button" onClick={() => setRulesOpen(true)}
          className="text-sm font-bold text-white/80 hover:text-white">
          ? Help
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-8 max-w-md mx-auto w-full">
        <h1 className="text-2xl font-black text-center text-blue-900 mb-1 pt-2">Who's playing?</h1>
        <p className="text-center text-sm text-blue-600 mb-4">Tap to select · 1–4 players</p>

        {/* Family kids */}
        {kids.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {kids.map(k => {
              const isSelected = selected.has(k.id)
              return (
                <button key={k.id} type="button" onClick={() => toggleKid(k)}
                  className={`relative rounded-2xl p-4 border-2 text-center transition-all active:scale-95 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}>
                  {isSelected && (
                    <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-black">✓</span>
                  )}
                  <div className="text-3xl mb-1">{k.emoji ?? '😊'}</div>
                  <div className="font-black text-sm text-gray-800 truncate">{k.name}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* Guests */}
        {guests.map((g, i) => (
          <div key={g.id} className="flex items-center gap-3 bg-white border-2 border-purple-200 rounded-2xl px-4 py-3 mb-2">
            <span className="text-2xl">{GUEST_EMOJIS[i % GUEST_EMOJIS.length]}</span>
            <span className="flex-1 font-bold text-gray-800">{g.name} <span className="text-xs text-purple-400 font-normal">Guest</span></span>
            <button type="button" onClick={() => setGuests(prev => prev.filter(x => x.id !== g.id))}
              className="text-gray-300 hover:text-red-400 text-lg">✕</button>
          </div>
        ))}

        {/* Add guest */}
        {canAdd && (
          <div className="mb-6">
            {addingGuest ? (
              <div className="flex gap-2">
                <input type="text" value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addGuest()}
                  placeholder="Guest name…" autoFocus
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-blue-400"
                />
                <button type="button" onClick={addGuest} disabled={!guestName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white font-black rounded-xl disabled:opacity-40 active:scale-95">
                  Add
                </button>
                <button type="button" onClick={() => { setAddingGuest(false); setGuestName('') }}
                  className="px-3 py-2 border-2 border-gray-200 text-gray-500 rounded-xl">✕</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingGuest(true)}
                className="w-full border-2 border-dashed border-blue-200 text-blue-600 font-bold rounded-2xl py-3 text-sm hover:border-blue-400 active:scale-95 transition-transform">
                ➕ Add Guest Player
              </button>
            )}
          </div>
        )}

        <button type="button" onClick={startGame} disabled={totalPlayers < 1}
          className="w-full py-4 bg-blue-500 text-white text-xl font-black rounded-2xl shadow-md disabled:opacity-40 active:scale-95 transition-transform">
          {totalPlayers < 1 ? 'Select a player to start' : `Start Game 🚀 (${totalPlayers} player${totalPlayers > 1 ? 's' : ''})`}
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">Pass the device between turns</p>
      </div>

      {rulesOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={() => setRulesOpen(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black text-center mb-4">💰 How to Play</h2>
            <p className="text-sm text-gray-700 mb-2"><strong>Goal:</strong> Build passive income ≥ your living expenses to escape the Rat Race.</p>
            <p className="text-sm text-gray-700 mb-2"><strong>Jobs:</strong> Each player spins to get a starting job. Higher salary = higher expenses.</p>
            <p className="text-sm text-gray-700 mb-2"><strong>Each turn:</strong> Collect salary + passive income, pull the lever, then take one action.</p>
            <p className="text-sm text-gray-700 mb-4"><strong>Assets:</strong> Buy assets to earn passive income every turn.</p>
            <button type="button" onClick={() => setRulesOpen(false)}
              className="w-full py-3 bg-blue-500 text-white font-black rounded-2xl">Got it!</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/money-town/GameLobby.tsx
git commit -m "feat(money-town): rewrite lobby — avatar card picker, guests, 1-player start"
```

---

## Task 7: Job Spin Ceremony — `components/money-town/JobSpinCeremony.tsx`

**Files:**
- Create: `components/money-town/JobSpinCeremony.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client"

import { useRef, useEffect, useState } from "react"
import type { Player, GameAction } from "@/lib/money-town/types"
import { JOBS } from "@/lib/money-town/constants"

const SEGMENT_HEIGHT = 80
const SPIN_DURATION = 3500
const NUM_ROTATIONS = 8

function easeInQuad(t: number) { return t * t }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }

function getScrolled(elapsed: number, totalDist: number): number {
  const t = Math.min(elapsed / SPIN_DURATION, 1)
  const P1 = 0.06, P2 = 0.41
  const D1 = 0.05, D2 = 0.65
  if (t <= P1) return D1 * easeInQuad(t / P1) * totalDist
  if (t <= P2) return (D1 + (D2 - D1) * ((t - P1) / (P2 - P1))) * totalDist
  return (D2 + (1 - D2) * easeOutCubic((t - P2) / (1 - P2))) * totalDist
}

interface Props {
  players: Player[]
  spinPlayerIndex: number
  dispatch: (action: GameAction) => void
}

export default function JobSpinCeremony({ players, spinPlayerIndex, dispatch }: Props) {
  const player = players[spinPlayerIndex]
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<typeof JOBS[0] | null>(null)
  const [leverPressed, setLeverPressed] = useState(false)
  const reelRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  const segments = JOBS

  function pullLever() {
    if (spinning || result) return
    const targetIdx = Math.floor(Math.random() * segments.length)
    const targetJob = segments[targetIdx]
    const totalDist = (NUM_ROTATIONS * segments.length + targetIdx + 1) * SEGMENT_HEIGHT

    const numItems = Math.ceil((totalDist + 240) / SEGMENT_HEIGHT) + 6

    setSpinning(true)
    setLeverPressed(true)
    setTimeout(() => setLeverPressed(false), 400)

    const start = performance.now()
    function frame(now: number) {
      const elapsed = now - start
      const scrolled = getScrolled(elapsed, totalDist)
      if (reelRef.current) reelRef.current.style.transform = `translateY(-${scrolled}px)`
      if (elapsed < SPIN_DURATION) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        if (reelRef.current) reelRef.current.style.transform = `translateY(-${totalDist}px)`
        setSpinning(false)
        setTimeout(() => setResult(targetJob), 400)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const numItems = Math.ceil(((NUM_ROTATIONS * segments.length + segments.length + 1) * SEGMENT_HEIGHT + 240) / SEGMENT_HEIGHT) + 6
  const reelItems = Array.from({ length: numItems }, (_, i) => segments[i % segments.length])

  if (result) {
    return (
      <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-3">{result.emoji}</div>
          <h2 className="text-2xl font-black text-gray-900 mb-1">{player.name} is a</h2>
          <h3 className="text-3xl font-black text-blue-600 mb-4">{result.name}</h3>
          <div className="bg-blue-50 rounded-2xl p-4 mb-6 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Salary/turn</span>
              <span className="font-black text-green-600">${result.salary.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Expenses/turn</span>
              <span className="font-black text-red-500">${result.expenses.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-blue-100 pt-1 mt-1">
              <span className="text-gray-500">Net/turn</span>
              <span className="font-black text-blue-700">${(result.salary - result.expenses).toLocaleString()}</span>
            </div>
          </div>
          <button type="button"
            onClick={() => dispatch({ type: 'JOB_SPIN_RESULT', jobId: result.id })}
            className="w-full py-4 bg-blue-500 text-white text-xl font-black rounded-2xl active:scale-95 transition-transform">
            {spinPlayerIndex < players.length - 1 ? `Next: ${players[spinPlayerIndex + 1]?.name} →` : "Let's Play! 🚀"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-6">
      <h2 className="text-2xl font-black text-blue-900 mb-1 text-center">
        {player.emoji} {player.name}
      </h2>
      <p className="text-sm text-blue-500 mb-6 text-center">Pull the lever to get your job!</p>

      {/* Reel machine */}
      <div className="bg-red-500 rounded-3xl p-4 shadow-xl mb-6 w-64">
        <div className="bg-yellow-400 text-red-800 font-black text-xs text-center py-1 rounded-xl mb-3 tracking-widest">
          SPIN TO WIN
        </div>
        {/* Window */}
        <div className="bg-slate-900 rounded-2xl overflow-hidden relative" style={{ height: 240 }}>
          {/* Active row highlight */}
          <div className="absolute left-0 right-0 border-2 border-yellow-400 rounded-xl pointer-events-none z-10"
            style={{ top: SEGMENT_HEIGHT, height: SEGMENT_HEIGHT }} />
          {/* Reel */}
          <div ref={reelRef} className="absolute top-0 left-0 right-0">
            {reelItems.map((job, i) => (
              <div key={i} className="flex flex-col items-center justify-center text-white"
                style={{ height: SEGMENT_HEIGHT }}>
                <span className="text-2xl">{job.emoji}</span>
                <span className="text-xs font-bold mt-0.5">{job.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lever */}
      <button type="button" onClick={pullLever} disabled={spinning}
        className={`px-8 py-4 bg-yellow-500 text-white text-xl font-black rounded-2xl shadow-lg active:scale-95 disabled:opacity-60 transition-transform ${leverPressed ? 'translate-y-2' : ''}`}>
        {spinning ? 'Spinning…' : '🎰 Pull the Lever!'}
      </button>

      {spinPlayerIndex > 0 && (
        <p className="mt-4 text-xs text-gray-400">
          Player {spinPlayerIndex + 1} of {players.length}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Start game with 2 players. Each player sees the spin ceremony. The reel spins smoothly and lands on a job. The result card shows salary/expenses. "Next" advances to player 2, then "Let's Play!" enters the board.

- [ ] **Step 3: Commit**

```bash
git add components/money-town/JobSpinCeremony.tsx
git commit -m "feat(money-town): add JobSpinCeremony with reel animation"
```

---

## Task 8: Lever Overlay — `components/money-town/LeverOverlay.tsx`

**Files:**
- Create: `components/money-town/LeverOverlay.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client"

import { useRef, useEffect, useState } from "react"
import type { Player, ReelSegment } from "@/lib/money-town/types"
import { REEL_SEGMENTS } from "@/lib/money-town/constants"

const SEGMENT_HEIGHT = 80
const SPIN_DURATION = 5800
const NUM_ROTATIONS = 12

const SEGMENT_DISPLAY: Record<ReelSegment, { emoji: string; label: string }> = {
  'event':     { emoji: '📋', label: 'Event' },
  'chance':    { emoji: '🌟', label: 'Chance' },
  'mini-game': { emoji: '🎮', label: 'Mini-Game' },
  'big-event': { emoji: '💥', label: 'Big Event' },
}

function easeInQuad(t: number) { return t * t }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }

function getScrolled(elapsed: number, totalDist: number): number {
  const t = Math.min(elapsed / SPIN_DURATION, 1)
  const P1 = 0.06, P2 = 0.41
  const D1 = 0.05, D2 = 0.65
  if (t <= P1) return D1 * easeInQuad(t / P1) * totalDist
  if (t <= P2) return (D1 + (D2 - D1) * ((t - P1) / (P2 - P1))) * totalDist
  return (D2 + (1 - D2) * easeOutCubic((t - P2) / (1 - P2))) * totalDist
}

interface Props {
  player: Player
  onResult: (segment: ReelSegment) => void
}

export default function LeverOverlay({ player, onResult }: Props) {
  const [spinning, setSpinning] = useState(false)
  const [leverPressed, setLeverPressed] = useState(false)
  const [done, setDone] = useState(false)
  const reelRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  function pullLever() {
    if (spinning || done) return
    const targetIdx = Math.floor(Math.random() * REEL_SEGMENTS.length)
    const targetSegment = REEL_SEGMENTS[targetIdx]
    const totalDist = (NUM_ROTATIONS * REEL_SEGMENTS.length + targetIdx + 1) * SEGMENT_HEIGHT
    const numItems = Math.ceil((totalDist + 240) / SEGMENT_HEIGHT) + 6

    setSpinning(true)
    setLeverPressed(true)
    setTimeout(() => setLeverPressed(false), 400)

    const start = performance.now()
    function frame(now: number) {
      const elapsed = now - start
      const scrolled = getScrolled(elapsed, totalDist)
      if (reelRef.current) reelRef.current.style.transform = `translateY(-${scrolled}px)`
      if (elapsed < SPIN_DURATION) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        if (reelRef.current) reelRef.current.style.transform = `translateY(-${totalDist}px)`
        setSpinning(false)
        setDone(true)
        setTimeout(() => onResult(targetSegment), 400)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const maxItems = Math.ceil(((NUM_ROTATIONS * REEL_SEGMENTS.length + REEL_SEGMENTS.length + 1) * SEGMENT_HEIGHT + 240) / SEGMENT_HEIGHT) + 6
  const reelItems = Array.from({ length: maxItems }, (_, i) => REEL_SEGMENTS[i % REEL_SEGMENTS.length])

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden">
        {/* Player header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-4 flex items-center gap-3">
          <span className="text-3xl">{player.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-black text-white truncate">{player.name}</div>
            <div className="text-xs text-blue-100">${player.cash.toLocaleString()} cash</div>
          </div>
        </div>

        <div className="p-5">
          {/* Reel machine */}
          <div className="bg-red-500 rounded-3xl p-4 shadow-lg mb-5">
            <div className="bg-yellow-400 text-red-800 font-black text-xs text-center py-1 rounded-xl mb-3 tracking-widest">
              SPIN TO WIN
            </div>
            {/* Window */}
            <div className="bg-slate-900 rounded-2xl overflow-hidden relative" style={{ height: 240 }}>
              <div className="absolute left-0 right-0 border-2 border-yellow-400 rounded-xl pointer-events-none z-10"
                style={{ top: SEGMENT_HEIGHT, height: SEGMENT_HEIGHT }} />
              <div ref={reelRef} className="absolute top-0 left-0 right-0">
                {reelItems.map((seg, i) => {
                  const d = SEGMENT_DISPLAY[seg]
                  return (
                    <div key={i} className="flex flex-col items-center justify-center text-white"
                      style={{ height: SEGMENT_HEIGHT }}>
                      <span className="text-2xl">{d.emoji}</span>
                      <span className="text-xs font-bold mt-0.5">{d.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Lever */}
          <button
            type="button"
            onClick={pullLever}
            disabled={spinning || done}
            className={`w-full py-4 bg-yellow-500 text-white text-xl font-black rounded-2xl shadow-md disabled:opacity-60 active:scale-95 transition-transform ${leverPressed ? 'translate-y-1' : ''}`}
          >
            {spinning ? 'Spinning…' : done ? 'Loading…' : '🎰 Pull the Lever!'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/money-town/LeverOverlay.tsx
git commit -m "feat(money-town): add LeverOverlay with 5800ms 3-phase reel animation"
```

---

## Task 9: Game Board — `components/money-town/GameBoard.tsx`

**Files:**
- Create: `components/money-town/GameBoard.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client"

import { useEffect } from "react"
import type { GameState, GameAction } from "@/lib/money-town/types"
import PlayerCard from "./PlayerCard"

interface Props {
  state: GameState
  dispatch: (action: GameAction) => void
  onHowToPlay: () => void
}

export default function GameBoard({ state, dispatch, onHowToPlay }: Props) {
  const { players, currentPlayerIndex, round, phase, pendingPayday } = state
  const currentPlayer = players[currentPlayerIndex]

  // Auto-clear payday banner after 2s
  useEffect(() => {
    if (!pendingPayday) return
    const t = setTimeout(() => dispatch({ type: 'CLEAR_PAYDAY' }), 2000)
    return () => clearTimeout(t)
  }, [pendingPayday, dispatch])

  const gridClass = players.length <= 2
    ? 'flex flex-col gap-3'
    : 'grid grid-cols-2 gap-3'

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 flex items-center justify-between">
        <span className="font-black text-white text-lg">💰 Money Town</span>
        <span className="bg-yellow-400 text-yellow-900 font-black text-xs px-3 py-1 rounded-full">
          ROUND {round}
        </span>
        <button type="button" onClick={onHowToPlay}
          className="text-sm font-bold text-white/80 hover:text-white">
          ? Help
        </button>
      </header>

      {/* Turn banner */}
      <div className="bg-blue-600 text-white text-center py-2 px-4 flex items-center justify-center gap-2">
        <span className="text-lg">{currentPlayer?.emoji}</span>
        <span className="font-black text-sm">
          {currentPlayer?.name?.toUpperCase()}'S TURN
        </span>
        {phase === 'board' && !pendingPayday && (
          <span className="ml-2 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded-full">
            Pull Lever ›
          </span>
        )}
      </div>

      {/* Player grid */}
      <div className={`flex-1 p-3 ${gridClass}`}>
        {players.map((player, i) => (
          <PlayerCard
            key={player.id}
            player={player}
            isActive={i === currentPlayerIndex}
            paydayInfo={i === currentPlayerIndex ? pendingPayday : null}
          />
        ))}
      </div>

      {/* Bottom CTA */}
      {phase === 'board' && (
        <div className="p-4 pb-6">
          <button
            type="button"
            onClick={() => dispatch({ type: 'PULL_LEVER' })}
            disabled={!!pendingPayday}
            className="w-full py-4 bg-yellow-500 text-white text-xl font-black rounded-2xl shadow-lg disabled:opacity-50 active:scale-95 transition-transform"
          >
            🎰 Pull the Lever — {currentPlayer?.name}'s Turn
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/money-town/GameBoard.tsx
git commit -m "feat(money-town): add GameBoard with player grid and payday auto-clear"
```

---

## Task 10: Player Card — `components/money-town/PlayerCard.tsx`

**Files:**
- Create: `components/money-town/PlayerCard.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client"

import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES, ASSETS } from "@/lib/money-town/constants"
import type { Player, PaydayInfo } from "@/lib/money-town/types"

interface Props {
  player: Player
  isActive: boolean
  paydayInfo: PaydayInfo | null
}

export default function PlayerCard({ player, isActive, paydayInfo }: Props) {
  const cc = PLAYER_COLOR_CLASSES[player.color]
  const passive = computePassiveIncome(player)
  const progressPct = player.expenses > 0 ? Math.min(100, Math.round(passive / player.expenses * 100)) : 0
  const jobDef = ASSETS  // just for display; salary/expenses are on player directly

  return (
    <div className={`bg-white rounded-2xl border-2 ${isActive ? 'border-blue-500 shadow-lg' : cc.border} p-3 relative overflow-hidden`}>
      {/* Active / Won badges */}
      {isActive && !player.hasWon && (
        <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-black px-2 py-0.5 rounded-full">YOUR TURN</span>
      )}
      {player.hasWon && (
        <span className="absolute top-2 right-2 bg-green-500 text-white text-xs font-black px-2 py-0.5 rounded-full">🏆 FREE!</span>
      )}

      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{player.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-black text-gray-900 text-sm truncate">{player.name}</div>
          <div className="text-xs text-gray-500 truncate">
            {/* Show job emoji + name if we can find it */}
            ${player.salary.toLocaleString()}/turn · exp ${player.expenses.toLocaleString()}
          </div>
        </div>
        {/* Cash */}
        <div className="text-right">
          <div className="font-black text-yellow-600 text-lg leading-none">${player.cash.toLocaleString()}</div>
          <div className="text-xs text-gray-400">cash</div>
        </div>
      </div>

      {/* Degree status */}
      {player.degreeStatus && (
        <div className="mb-2">
          {player.degreeStatus === 'graduated' ? (
            <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">
              🎓 Graduated
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
              📚 Degree: {player.degreeStatus.turnsLeft} turn{player.degreeStatus.turnsLeft !== 1 ? 's' : ''} left
            </span>
          )}
        </div>
      )}

      {/* Payday banner */}
      {paydayInfo && (
        <div className="mb-2 bg-green-50 border border-green-200 rounded-xl p-2 text-xs space-y-0.5">
          {paydayInfo.degreeArrived && (
            <div className="text-purple-700 font-black text-center">🎓 Degree arrived!</div>
          )}
          <div className="flex justify-between text-green-700">
            <span>Salary</span><span className="font-bold">+${paydayInfo.salary.toLocaleString()}</span>
          </div>
          {paydayInfo.passive > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Passive</span><span className="font-bold">+${paydayInfo.passive.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-red-600">
            <span>Expenses</span><span className="font-bold">-${paydayInfo.expenses.toLocaleString()}</span>
          </div>
          <div className={`flex justify-between font-black border-t border-green-200 pt-0.5 ${paydayInfo.net >= 0 ? 'text-green-800' : 'text-red-700'}`}>
            <span>Net</span><span>{paydayInfo.net >= 0 ? '+' : ''}{paydayInfo.net.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Rat Race progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Rat Race Escape</span>
          <span className="font-bold text-blue-600">${passive.toLocaleString()}/${player.expenses.toLocaleString()}</span>
        </div>
        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
          {/* Milestone marks */}
          {[25, 50, 75].map(m => (
            <div key={m} className="absolute top-0 bottom-0 w-px bg-white/60" style={{ left: `${m}%` }} />
          ))}
          {/* Runner emoji */}
          {progressPct > 0 && progressPct < 100 && (
            <span className="absolute top-1/2 -translate-y-1/2 text-xs leading-none transition-all duration-500"
              style={{ left: `calc(${progressPct}% - 6px)` }}>
              🏃
            </span>
          )}
          {progressPct >= 100 && (
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs">🏆</span>
          )}
        </div>
      </div>

      {/* Assets strip */}
      <div className="overflow-x-auto">
        {player.assets.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No assets yet.</p>
        ) : (
          <div className="flex gap-1.5 pb-1">
            {player.assets.map(a => {
              const def = ASSETS.find(d => d.id === a.defId)
              return (
                <span key={a.uid} className="flex-shrink-0 inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5 text-xs font-bold text-gray-700 whitespace-nowrap">
                  {def?.emoji ?? '📦'} ${a.income.toLocaleString()}/t
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/money-town/PlayerCard.tsx
git commit -m "feat(money-town): add PlayerCard with progress bar, payday banner, asset chips"
```

---

## Task 11: Result Card — `components/money-town/ResultCard.tsx`

**Files:**
- Create: `components/money-town/ResultCard.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client"

import type { ResultPayload, Player, GameState, GameAction } from "@/lib/money-town/types"
import { ASSETS, DEGREE_JOBS } from "@/lib/money-town/constants"

interface Props {
  result: ResultPayload
  player: Player
  state: GameState
  dispatch: (action: GameAction) => void
}

const TONE_STYLES = {
  good:    'from-green-500 to-green-600',
  bad:     'from-red-500 to-red-600',
  neutral: 'from-blue-500 to-blue-600',
}

export default function ResultCard({ result, player, state, dispatch }: Props) {
  const headerGrad = TONE_STYLES[result.tone]

  const offerDef = result.offerAssetDefId ? ASSETS.find(a => a.id === result.offerAssetDefId) : null
  const offerCost = offerDef ? Math.floor(offerDef.cost * (result.offerDiscount ?? 1)) : 0
  const canAffordOffer = offerDef ? player.cash >= offerCost : false

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden">
        {/* Header */}
        <div className={`bg-gradient-to-br ${headerGrad} px-6 py-5 text-center`}>
          <div className="text-5xl mb-2">{result.emoji}</div>
          <h2 className="text-xl font-black text-white">{result.title}</h2>
          {result.kind === 'big-event' && (
            <span className="inline-block mt-1 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              💥 Big Event
            </span>
          )}
          {result.kind === 'chance' && (
            <span className="inline-block mt-1 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              🌟 Chance
            </span>
          )}
        </div>

        <div className="p-5">
          <p className="text-sm text-gray-600 text-center mb-4">{result.description}</p>

          {/* Delta badges */}
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {result.cashDelta !== 0 && (
              <span className={`text-sm font-black px-3 py-1 rounded-full ${result.cashDelta > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {result.cashDelta > 0 ? '+' : ''}${result.cashDelta.toLocaleString()} cash
              </span>
            )}
            {result.salaryDelta !== 0 && (
              <span className="text-sm font-black px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                +${result.salaryDelta.toLocaleString()} salary
              </span>
            )}
            {result.expensesDelta !== 0 && (
              <span className={`text-sm font-black px-3 py-1 rounded-full ${result.expensesDelta > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                {result.expensesDelta > 0 ? '+' : ''}${result.expensesDelta.toLocaleString()} expenses
              </span>
            )}
          </div>

          {/* Career Switch offer */}
          {result.offerCareerSwitch && (
            <div className="space-y-2 mb-4">
              <p className="text-xs text-gray-500 text-center font-bold">Choose your new career:</p>
              {DEGREE_JOBS.map(job => (
                <button key={job.id} type="button"
                  onClick={() => dispatch({ type: 'SWITCH_CAREER', jobId: job.id })}
                  className="w-full flex items-center gap-3 bg-blue-50 border-2 border-blue-200 rounded-2xl px-4 py-3 active:scale-95 transition-transform hover:border-blue-400">
                  <span className="text-2xl">{job.emoji}</span>
                  <div className="flex-1 text-left">
                    <div className="font-black text-blue-900 text-sm">{job.name}</div>
                    <div className="text-xs text-blue-600">${job.salary.toLocaleString()}/turn · exp ${job.expenses.toLocaleString()}</div>
                  </div>
                </button>
              ))}
              <button type="button"
                onClick={() => dispatch({ type: 'DISMISS_RESULT' })}
                className="w-full py-2 text-gray-400 text-sm font-bold hover:text-gray-600">
                Skip →
              </button>
            </div>
          )}

          {/* Asset offer */}
          {offerDef && !result.offerCareerSwitch && (
            <div className="mb-4">
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{offerDef.emoji}</span>
                  <div>
                    <div className="font-black text-gray-900">{offerDef.name}</div>
                    <div className="text-sm text-gray-600">
                      ${offerCost.toLocaleString()}
                      {result.offerDiscount && result.offerDiscount < 1 && (
                        <span className="ml-1 text-xs text-green-600 font-bold">({Math.round((1 - result.offerDiscount) * 100)}% off)</span>
                      )}
                      {' · '}+${offerDef.income.toLocaleString()}/turn
                    </div>
                  </div>
                </div>
              </div>
              <button type="button"
                onClick={() => dispatch({ type: 'BUY_ASSET', defId: offerDef.id, discount: result.offerDiscount })}
                disabled={!canAffordOffer}
                className="w-full py-3 bg-green-500 text-white font-black rounded-2xl disabled:opacity-40 active:scale-95 transition-transform mb-2">
                {canAffordOffer ? `Buy for $${offerCost.toLocaleString()}` : `Need $${(offerCost - player.cash).toLocaleString()} more`}
              </button>
              <button type="button"
                onClick={() => dispatch({ type: 'DISMISS_RESULT' })}
                className="w-full py-2 text-gray-400 text-sm font-bold hover:text-gray-600">
                Skip →
              </button>
            </div>
          )}

          {/* Standard dismiss */}
          {!result.offerCareerSwitch && !offerDef && (
            <button type="button"
              onClick={() => dispatch({ type: 'DISMISS_RESULT' })}
              className={`w-full py-4 text-white text-lg font-black rounded-2xl active:scale-95 transition-transform bg-gradient-to-r ${headerGrad}`}>
              {result.tone === 'bad' ? 'Ouch! OK 😬' : result.tone === 'good' ? 'Nice! 🙌' : 'OK!'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/money-town/ResultCard.tsx
git commit -m "feat(money-town): add ResultCard for events, chance offers, career switch"
```

---

## Task 12: Action Panel — `components/money-town/ActionPanel.tsx`

**Files:**
- Create: `components/money-town/ActionPanel.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client"

import type { Player, GameState, GameAction } from "@/lib/money-town/types"
import { ASSETS, DEGREE_COST } from "@/lib/money-town/constants"
import { canBuyAsset } from "@/lib/money-town/gameLogic"

interface Props {
  player: Player
  state: GameState
  dispatch: (action: GameAction) => void
}

export default function ActionPanel({ player, dispatch }: Props) {
  const canEnroll = !player.degreeStatus && player.cash >= DEGREE_COST
  const hasEnrolled = !!player.degreeStatus

  const availableAssets = ASSETS.filter(def =>
    canBuyAsset(player, def.id) && player.cash >= def.cost
  )

  const allBuyable = ASSETS.filter(def => canBuyAsset(player, def.id))

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center">
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-gray-900">{player.emoji} Your Move</h2>
              <p className="text-sm text-gray-500">Cash: <span className="font-black text-yellow-600">${player.cash.toLocaleString()}</span></p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4 pb-8">
          {/* Degree section */}
          {!hasEnrolled && (
            <div>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">Education</h3>
              <button type="button"
                onClick={() => dispatch({ type: 'ENROLL_DEGREE' })}
                disabled={!canEnroll}
                className="w-full flex items-center gap-3 bg-purple-50 border-2 border-purple-200 rounded-2xl px-4 py-3 disabled:opacity-40 active:scale-95 transition-transform hover:border-purple-400">
                <span className="text-2xl">🎓</span>
                <div className="flex-1 text-left">
                  <div className="font-black text-purple-900">Enrol in Degree</div>
                  <div className="text-xs text-purple-600">
                    Pay ${DEGREE_COST.toLocaleString()} · unlock better Chance cards in 2 turns
                  </div>
                </div>
                {!canEnroll && player.cash < DEGREE_COST && (
                  <span className="text-xs text-gray-400">Need ${(DEGREE_COST - player.cash).toLocaleString()} more</span>
                )}
              </button>
            </div>
          )}

          {/* Assets section */}
          {allBuyable.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">Buy an Asset</h3>
              <div className="space-y-2">
                {allBuyable.map(def => {
                  const canAfford = player.cash >= def.cost
                  return (
                    <button key={def.id} type="button"
                      onClick={() => canAfford && dispatch({ type: 'BUY_ASSET', defId: def.id })}
                      disabled={!canAfford}
                      className="w-full flex items-center gap-3 bg-white border-2 border-gray-200 rounded-2xl px-4 py-3 disabled:opacity-40 active:scale-95 transition-transform hover:border-blue-300">
                      <span className="text-2xl">{def.emoji}</span>
                      <div className="flex-1 text-left">
                        <div className="font-black text-gray-900 text-sm">{def.name}</div>
                        <div className="text-xs text-gray-500">
                          ${def.cost.toLocaleString()} · +${def.income.toLocaleString()}/turn
                          {def.degreeOnly && ' · degree required'}
                          {def.requiresProperties && ` · needs ${def.requiresProperties} properties`}
                        </div>
                      </div>
                      {!canAfford && (
                        <span className="text-xs text-gray-400 shrink-0">
                          Need ${(def.cost - player.cash).toLocaleString()} more
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Skip */}
          <button type="button"
            onClick={() => dispatch({ type: 'END_TURN' })}
            className="w-full py-4 border-2 border-gray-200 text-gray-600 font-black text-lg rounded-2xl active:scale-95 transition-transform hover:border-gray-300">
            ⏭️ Skip — End My Turn
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/money-town/ActionPanel.tsx
git commit -m "feat(money-town): add ActionPanel — degree, buy asset, skip"
```

---

## Task 13: Rules Modal — `components/money-town/RulesModal.tsx`

**Files:**
- Create: `components/money-town/RulesModal.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client"

interface Props {
  onClose: () => void
}

const RULES = [
  {
    emoji: '🏆',
    title: 'Goal',
    body: 'Escape the Rat Race! Build passive income from assets until it equals or exceeds your living expenses. First to do it wins.',
  },
  {
    emoji: '💼',
    title: 'Your Job',
    body: 'Each turn your salary is collected automatically and your living expenses are deducted. Higher salary = higher expenses. The difference is your starting cushion.',
  },
  {
    emoji: '🎰',
    title: 'The Reel',
    body: 'Pull the lever each turn. You might get an Event (good or bad things happening in life), a Chance (opportunities), a Mini-game, or a Big Event (major life moments).',
  },
  {
    emoji: '🏠',
    title: 'Assets',
    body: 'After the reel, take one action: buy an asset. Assets earn passive income every turn. Tier 1 is cheap to start. Tier 2 is where real money flows. Tier 3 is the Hotel — massive income but needs 3 Investment Properties first.',
  },
  {
    emoji: '🎓',
    title: 'Degree',
    body: 'Pay $900 to enrol. After 2 turns, you graduate. Graduates get much better Chance cards — Promotions, Career Switches, and discounted deals. Risk vs reward!',
  },
  {
    emoji: '🏨',
    title: 'Hotel',
    body: 'Own 3 Investment Properties first, then unlock the Hotel ($4,500 → +$900/turn). The ultimate passive income machine — Engineer players NEED it to escape.',
  },
  {
    emoji: '🏁',
    title: 'Winning',
    body: 'When passive income ≥ living expenses: you\'re FREE! The game ends immediately. Standings show how far each player got.',
  },
]

export default function RulesModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-black text-gray-900">💰 How to Play</h2>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none font-bold">✕</button>
        </div>

        <div className="p-5 space-y-4 pb-8">
          {RULES.map(r => (
            <div key={r.title} className="flex gap-3">
              <span className="text-2xl shrink-0">{r.emoji}</span>
              <div>
                <h3 className="font-black text-gray-900 mb-0.5">{r.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{r.body}</p>
              </div>
            </div>
          ))}

          <button type="button" onClick={onClose}
            className="w-full py-4 bg-blue-500 text-white font-black text-lg rounded-2xl active:scale-95 transition-transform mt-2">
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/money-town/RulesModal.tsx
git commit -m "feat(money-town): add RulesModal with 7-section How to Play"
```

---

## Task 14: Update WinScreen — `components/money-town/WinScreen.tsx`

**Files:**
- Modify: `components/money-town/WinScreen.tsx`

The `Player` type changed — `assets` is now `OwnedAsset[]` with `uid/defId/income` instead of `assetId/purchasePrice/mortgageDebt`. Also `winner` prop had `round`/`kidId`; now receives `players` and `activeKidId`.

- [ ] **Step 1: Replace the entire file**

```typescript
"use client"

import Link from "next/link"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { ASSETS, PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"
import type { Player } from "@/lib/money-town/types"

interface Props {
  winner: Player
  players: Player[]
  round: number
  activeKidId: string | null
  onPlayAgain: () => void
}

const CONFETTI = ['🎉', '⭐', '💰', '🏆', '✨', '🌟', '💎', '🎊']

export default function WinScreen({ winner, players, round, activeKidId, onPlayAgain }: Props) {
  const passive = computePassiveIncome(winner)
  const cc = PLAYER_COLOR_CLASSES[winner.color]
  const netWorth = winner.cash + winner.assets.reduce((s, a) => {
    const def = ASSETS.find(d => d.id === a.defId)
    return s + (def?.cost ?? 0)
  }, 0)
  const backHref = activeKidId ? `/kid/${activeKidId}/play` : "/select-kid"

  // Sort all players by passive income desc (winner is first by definition)
  const sorted = [...players].sort((a, b) => computePassiveIncome(b) - computePassiveIncome(a))

  return (
    <div className={`min-h-screen ${cc.bg} flex flex-col items-center justify-center p-6 text-center relative`}>
      <Link href={backHref} className="absolute top-3 left-4 text-sm font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1 bg-white/80 px-3 py-1.5 rounded-full">
        ← Games
      </Link>

      {/* Confetti */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {CONFETTI.map((e, i) => (
          <span key={i} className="absolute text-3xl animate-bounce"
            style={{ left: `${(i + 1) * 12}%`, top: `${5 + (i % 3) * 10}%`, animationDelay: `${i * 0.15}s`, animationDuration: `${0.8 + (i % 3) * 0.3}s` }}>
            {e}
          </span>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-7xl mb-4">{winner.emoji}</div>
        <h1 className={`text-4xl font-black ${cc.text} mb-2`}>{winner.name}</h1>
        <h2 className="text-2xl font-black text-gray-800 mb-1">🎉 ESCAPED THE RAT RACE!</h2>
        <p className="text-gray-500 mb-6">Passive income ≥ living expenses in Round {round}</p>

        {/* Winner stats */}
        <div className="bg-white rounded-3xl shadow-md p-6 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Passive income</span>
            <span className="font-black text-green-600">${passive.toLocaleString()}/turn</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Living expenses</span>
            <span className="font-black text-red-500">${winner.expenses.toLocaleString()}/turn</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Assets owned</span>
            <span className="font-black">{winner.assets.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Net worth</span>
            <span className="font-black">${netWorth.toLocaleString()}</span>
          </div>
        </div>

        {/* All players standings */}
        {players.length > 1 && (
          <div className="bg-white rounded-3xl shadow-md p-4 mb-6">
            <h3 className="font-black text-gray-700 mb-3 text-sm">Final Standings</h3>
            {sorted.map((p, i) => {
              const pPassive = computePassiveIncome(p)
              const pct = Math.round(pPassive / p.expenses * 100)
              return (
                <div key={p.id} className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{p.hasWon ? '🏆' : `${i + 1}.`}</span>
                  <span className="text-xl">{p.emoji}</span>
                  <span className="flex-1 font-bold text-sm text-gray-800 text-left">{p.name}</span>
                  <span className="text-xs font-black text-blue-600">{pct}% free</span>
                </div>
              )
            })}
          </div>
        )}

        <button type="button" onClick={onPlayAgain}
          className="w-full py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform mb-3">
          Play Again 🔄
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/money-town/WinScreen.tsx
git commit -m "feat(money-town): update WinScreen for new Player type + standings table"
```

---

## Task 15: Cleanup, Build Check & Smoke Test

**Files:**
- Delete: 9 old component files
- Verify: build succeeds, game plays end-to-end

- [ ] **Step 1: Delete old files**

```bash
cd "components/money-town"
Remove-Item PlayerDashboard.tsx, SpinWheel.tsx, PaydayCard.tsx, DealCard.tsx, ExpenseCard.tsx, BadLuckCard.tsx, BetweenTurns.tsx, ProgressChart.tsx, AssetList.tsx
```

Or in PowerShell:
```powershell
Remove-Item `
  "components/money-town/PlayerDashboard.tsx", `
  "components/money-town/SpinWheel.tsx", `
  "components/money-town/PaydayCard.tsx", `
  "components/money-town/DealCard.tsx", `
  "components/money-town/ExpenseCard.tsx", `
  "components/money-town/BadLuckCard.tsx", `
  "components/money-town/BetweenTurns.tsx", `
  "components/money-town/ProgressChart.tsx", `
  "components/money-town/AssetList.tsx"
```

- [ ] **Step 2: Check MiniGame.tsx still compiles**

`MiniGame.tsx` uses `PendingMinigame` from old types. Update its import — the new `PendingMinigame`-equivalent is `{ type: 'reflex' | 'trivia'; reflexGameId?: ReflexGameId }` which is already inlined in `MoneyTownGame.tsx`. Add a local interface to `MiniGame.tsx`:

Open `components/money-town/MiniGame.tsx` and replace the type import at the top:

```typescript
// Old:
import type { PendingMinigame, GameAction } from "@/lib/money-town/types"

// New:
import type { ReflexGameId, GameAction } from "@/lib/money-town/types"

interface PendingMinigame {
  type: 'reflex' | 'trivia'
  reflexGameId?: ReflexGameId
}
```

Do the same for `Trivia.tsx` if it references old types — check with:

```bash
npm run typecheck 2>&1 | head -40
```

Fix any remaining type errors (they will be in MiniGame, Trivia, and games/* files which reference the old types). The pattern is: replace `TriviaQuestion` import to come from `@/lib/money-town/constants` instead of `@/lib/money-town/types`.

- [ ] **Step 3: Run full build**

```bash
npm run build
```

Expected: zero errors. Fix any TypeScript errors before proceeding.

- [ ] **Step 4: Smoke test in browser**

Start dev server: `npm run dev`

Navigate to `http://localhost:3000/play/money-town`

Verify:
1. Lobby shows family kids as avatar cards + guest input + How to Play button
2. Select 2 players, click Start → Job Spin Ceremony appears
3. Each player pulls lever, reel spins smoothly ~3.5s, job result card shows salary/expenses
4. After all spins → Game Board with all players visible, payday banner shows for 2s
5. "Pull the Lever" button → Lever Overlay, full 5.8s animation, transitions to Result Card
6. Result Card shows emoji, title, description, and a dismiss button (or offer/career switch)
7. After dismiss → Action Panel slides up with buyable assets and skip
8. Buying an asset → back to board, asset chip appears on player card, progress bar advances
9. Enrolling degree → 📚 N turns chip appears on player card
10. After 2 turns → 🎓 Graduated badge, subsequent Chance cards are from grad pool
11. Rules modal opens from board header "? Help" button
12. When a player's passive income ≥ expenses → Win Screen with standings

- [ ] **Step 5: Commit cleanup**

```bash
git add -A
git commit -m "feat(money-town): rebuild complete — delete old components, fix types, verify build"
```

---

## Implementation Notes

**Property uniqueness:** `applyBuyAsset` gives each Investment Property a unique uid (`prop_1`, `prop_2`, `prop_3`). All other assets get `uid = defId`, so `player.assets.some(a => a.defId === def.id)` correctly prevents duplicates.

**Status flag timing:** `applyStartTurn` computes passive income with current flags, then calls `tickStatusEffects` to decrement them. This means a Stock Dip drawn this turn freezes stocks starting next turn.

**Degree ticking:** Happens in `applyStartTurn` before computing passive income. If the degree arrives this turn (`degreeArrived: true`), the graduated status takes effect for Chance cards drawn in the same turn.

**Win check:** Called after `applyStartTurn`. If win, `phase` is set to `'win'` and the board renders `WinScreen` via `MoneyTownGame`.

**Mini-games:** When `pendingResult.miniGameType` is set, `MoneyTownGame` renders `<MiniGame>` directly (not `<ResultCard>`). `MiniGame` dispatches `MINIGAME_COMPLETE` / `TRIVIA_COMPLETE` which the reducer handles by clearing `pendingResult` and transitioning to `'action'`.

**Save key:** `'money-town-v7-save'` — different from the old key so returning players aren't stuck in a corrupt old game state.
