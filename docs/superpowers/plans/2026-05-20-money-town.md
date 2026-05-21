# Money Town — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Money Town — a pass-and-play board game for 2–4 players teaching kids aged 8–12 financial concepts (passive income, assets, mortgages, rent) by spinning a wheel and escaping the Rat Race.

**Architecture:** Pure `useReducer` state machine in `components/money-town/MoneyTownGame.tsx` — all game logic in pure functions in `lib/money-town/gameLogic.ts`. No Supabase, no realtime, no external dependencies. `localStorage` saves/restores game in progress. CSS-only spin wheel animation and progress chart.

**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind CSS · CSS `@keyframes` · pointer/touch events

> **No test runner is configured.** Run `npm run typecheck` after each task.

---

## File Map

| Path | Action | Purpose |
|---|---|---|
| `lib/money-town/types.ts` | Create | All TypeScript interfaces and union types |
| `lib/money-town/constants.ts` | Create | Jobs, assets, expense events, bad luck events, trivia questions |
| `lib/money-town/gameLogic.ts` | Create | Pure reducer + all game helpers (spin, deal, win check, etc.) |
| `app/play/money-town/page.tsx` | Create | Server wrapper page with KidShell conditional |
| `app/play/page.tsx` | Modify | Add Money Town tile |
| `components/money-town/MoneyTownGame.tsx` | Create | `useReducer` hub, phase router (renders correct screen) |
| `components/money-town/GameLobby.tsx` | Create | Player setup (kid profiles + guest add) |
| `components/money-town/PlayerDashboard.tsx` | Create | Stats screen shown at turn start |
| `components/money-town/SpinWheel.tsx` | Create | CSS animated conic-gradient wheel |
| `components/money-town/DealCard.tsx` | Create | Asset offer with buy/mortgage/pass options |
| `components/money-town/ExpenseCard.tsx` | Create | Surprise expense event card |
| `components/money-town/BadLuckCard.tsx` | Create | Bad luck event card |
| `components/money-town/PaydayCard.tsx` | Create | Payday result card (salary + passive income) |
| `components/money-town/BetweenTurns.tsx` | Create | Full-screen cover card before next player |
| `components/money-town/AssetList.tsx` | Create | Owned assets list with sell option |
| `components/money-town/ProgressChart.tsx` | Create | Horizontal bar chart (plain CSS) |
| `components/money-town/WinScreen.tsx` | Create | Win celebration with confetti |
| `components/money-town/MiniGame.tsx` | Create | Dispatcher to correct mini-game component |
| `components/money-town/Trivia.tsx` | Create | 3-question trivia game |
| `components/money-town/games/CoinRain.tsx` | Create | Tap falling coins reflex game |
| `components/money-town/games/LemonSqueeze.tsx` | Create | Tap lemons reflex game |
| `components/money-town/games/CashGrab.tsx` | Create | Swipe money bags reflex game |
| `components/money-town/games/PetRush.tsx` | Create | Tap runaway pets reflex game |

---

## Task 1: Types + Constants + Game Logic

**Files:**
- Create: `lib/money-town/types.ts`
- Create: `lib/money-town/constants.ts`
- Create: `lib/money-town/gameLogic.ts`

### `lib/money-town/types.ts`

- [ ] **Step 1: Create types file**

```ts
export type GamePhase =
  | 'lobby'
  | 'turn-start'
  | 'spinning'
  | 'payday'
  | 'deal'
  | 'expense'
  | 'minigame'
  | 'bad-luck'
  | 'between-turns'
  | 'win'

export type WheelSegment = 'payday' | 'deal' | 'expense' | 'minigame' | 'bad-luck'
export type AssetTier = 1 | 2 | 3
export type ReflexGameId = 'coin-rain' | 'lemon-squeeze' | 'cash-grab' | 'pet-rush'

export interface Job {
  id: string
  emoji: string
  name: string
  salary: number
  expenses: number
}

export interface Asset {
  id: string
  emoji: string
  name: string
  type: 'business' | 'property'
  tier: AssetTier
  cost: number
  incomePerRound: number
}

export interface OwnedAsset {
  assetId: string
  purchasePrice: number
  incomePerRound: number
  mortgageDebt: number
  interestPerRound: number
  skipNextRound: boolean
}

export interface Player {
  id: string
  name: string
  emoji: string
  color: 'red' | 'blue' | 'green' | 'yellow'
  cash: number
  job: Job
  assets: OwnedAsset[]
}

export interface ExpenseEvent {
  id: string
  emoji: string
  description: string
  cost: number
}

export interface BadLuckEvent {
  id: string
  emoji: string
  description: string
  type: 'cash' | 'business-skip' | 'property-repair' | 'friend' | 'flat'
  amount: number
}

export interface TriviaQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
}

export interface PendingMinigame {
  type: 'reflex' | 'trivia'
  reflexGameId?: ReflexGameId
}

export interface GameState {
  phase: GamePhase
  players: Player[]
  currentPlayerIndex: number
  round: number
  pendingDeal: Asset | null
  pendingExpense: ExpenseEvent | null
  pendingBadLuck: BadLuckEvent | null
  pendingMinigame: PendingMinigame | null
  lastSpinResult: WheelSegment | null
  winner: string | null
  usedTriviaIds: string[]
}

export type GameAction =
  | { type: 'ADD_PLAYER'; player: Player }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'START_GAME' }
  | { type: 'SPIN' }
  | { type: 'SPIN_RESULT'; segment: WheelSegment }
  | { type: 'COLLECT_PAYDAY' }
  | { type: 'BUY_ASSET'; assetId: string; useMortgage: boolean }
  | { type: 'SELL_ASSET'; assetId: string }
  | { type: 'PASS_DEAL' }
  | { type: 'DISMISS_EXPENSE' }
  | { type: 'DISMISS_BAD_LUCK' }
  | { type: 'MINIGAME_COMPLETE'; cashEarned: number }
  | { type: 'NEXT_TURN' }
  | { type: 'RESTORE'; state: GameState }
```

### `lib/money-town/constants.ts`

- [ ] **Step 2: Create constants file**

```ts
import type { Job, Asset, ExpenseEvent, BadLuckEvent, TriviaQuestion, WheelSegment } from './types'

export const STARTING_CASH = 500

export const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'] as const

export const PLAYER_COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  red:    { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-800',    badge: 'bg-red-500'    },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-800',   badge: 'bg-blue-500'   },
  green:  { bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-800',  badge: 'bg-green-500'  },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', badge: 'bg-yellow-500' },
}

export const JOBS: Job[] = [
  { id: 'artist',   emoji: '🎨', name: 'Artist',   salary: 150, expenses: 120 },
  { id: 'chef',     emoji: '👩‍🍳', name: 'Chef',     salary: 200, expenses: 160 },
  { id: 'mechanic', emoji: '🔧', name: 'Mechanic', salary: 250, expenses: 200 },
  { id: 'coder',    emoji: '👩‍💻', name: 'Coder',    salary: 300, expenses: 240 },
]

export const ASSETS: Asset[] = [
  // Tier 1 — Kid Businesses
  { id: 'lemonade',   emoji: '🍋', name: 'Lemonade Stand',  type: 'business', tier: 1, cost: 200,  incomePerRound: 30  },
  { id: 'bake-sale',  emoji: '🧁', name: 'Bake Sale',       type: 'business', tier: 1, cost: 250,  incomePerRound: 40  },
  { id: 'pet-sit',    emoji: '🐾', name: 'Pet Sitting',     type: 'business', tier: 1, cost: 300,  incomePerRound: 50  },
  { id: 'lawn',       emoji: '🌿', name: 'Lawn Mowing',     type: 'business', tier: 1, cost: 400,  incomePerRound: 60  },
  { id: 'car-wash',   emoji: '🚗', name: 'Car Wash',        type: 'business', tier: 1, cost: 500,  incomePerRound: 80  },
  // Tier 2 — Dream Businesses
  { id: 'pizza',      emoji: '🍕', name: 'Pizza Restaurant', type: 'business', tier: 2, cost: 1500, incomePerRound: 200 },
  { id: 'toy-store',  emoji: '🧸', name: 'Toy Store',       type: 'business', tier: 2, cost: 2000, incomePerRound: 250 },
  { id: 'mini-golf',  emoji: '⛳', name: 'Mini-Golf Course', type: 'business', tier: 2, cost: 2500, incomePerRound: 300 },
  { id: 'cinema',     emoji: '🎬', name: 'Movie Theatre',   type: 'business', tier: 2, cost: 3000, incomePerRound: 400 },
  { id: 'theme-park', emoji: '🎡', name: 'Theme Park',      type: 'business', tier: 2, cost: 5000, incomePerRound: 600 },
  // Tier 3 — Properties
  { id: 'beach-house',   emoji: '🏠', name: 'Beach House',      type: 'property', tier: 3, cost: 1000, incomePerRound: 120 },
  { id: 'apartment',     emoji: '🏢', name: 'City Apartment',   type: 'property', tier: 3, cost: 1800, incomePerRound: 220 },
  { id: 'corner-shop',   emoji: '🏪', name: 'Corner Shop',      type: 'property', tier: 3, cost: 2200, incomePerRound: 280 },
  { id: 'mall-unit',     emoji: '🏬', name: 'Shopping Mall Unit',type: 'property', tier: 3, cost: 3500, incomePerRound: 450 },
  { id: 'hotel',         emoji: '🏨', name: 'Hotel',            type: 'property', tier: 3, cost: 6000, incomePerRound: 750 },
]

// 10 segments: 3x payday, 2x deal, 2x expense, 2x minigame, 1x bad-luck
export const WHEEL_SEGMENTS: WheelSegment[] = [
  'payday', 'payday', 'payday',
  'deal', 'deal',
  'expense', 'expense',
  'minigame', 'minigame',
  'bad-luck',
]

export const EXPENSE_EVENTS: ExpenseEvent[] = [
  { id: 'school',   emoji: '🎒', description: 'School supplies',           cost: 50 },
  { id: 'game',     emoji: '🎮', description: "New video game (couldn't resist!)", cost: 80 },
  { id: 'birthday', emoji: '🎂', description: 'Birthday party',            cost: 60 },
  { id: 'pizza',    emoji: '🍕', description: 'Pizza night',               cost: 40 },
  { id: 'sneakers', emoji: '👟', description: 'New sneakers',              cost: 70 },
]

export const BAD_LUCK_EVENTS: BadLuckEvent[] = [
  { id: 'doctor',   emoji: '🚑', description: 'Doctor visit',             type: 'flat',             amount: 100 },
  { id: 'rain',     emoji: '🌧️', description: 'Rainy week — one business earns nothing next round', type: 'business-skip',    amount: 0   },
  { id: 'repairs',  emoji: '🔧', description: 'Property repairs needed',  type: 'property-repair',  amount: 0   },
  { id: 'friend',   emoji: '💔', description: 'Friend borrowed money',    type: 'friend',            amount: 75  },
  { id: 'bug',      emoji: '🐛', description: 'Bug infestation!',         type: 'cash',              amount: 150 },
]

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { id: 'q1',  question: 'If you earn $200 and spend $140, what is your profit?', options: ['$60', '$40', '$340', '$80'], correctIndex: 0 },
  { id: 'q2',  question: 'What do we call money a property earns for its owner?', options: ['Profit', 'Salary', 'Rent', 'Tax'], correctIndex: 2 },
  { id: 'q3',  question: 'A mortgage is:', options: ['Free money', 'A loan to buy property', 'A type of business', 'Extra salary'], correctIndex: 1 },
  { id: 'q4',  question: 'Passive income means money you earn:', options: ['From working', 'While you sleep', 'Only on weekends', 'From taxes'], correctIndex: 1 },
  { id: 'q5',  question: 'Assets are things that:', options: ['Cost you money', 'Put money in your pocket', 'Are always expensive', 'Banks own'], correctIndex: 1 },
  { id: 'q6',  question: 'If you borrow money, what do you call the extra you pay back?', options: ['Rent', 'Tax', 'Interest', 'Salary'], correctIndex: 2 },
  { id: 'q7',  question: 'Which is a liability (something that costs you money)?', options: ['Business', 'Savings', 'Mortgage debt', 'Salary'], correctIndex: 2 },
  { id: 'q8',  question: 'What does it mean to invest?', options: ['Spend all your money', 'Put money somewhere to grow', 'Give money away', 'Borrow money'], correctIndex: 1 },
  { id: 'q9',  question: 'A lemonade stand is an example of:', options: ['A liability', 'A salary', 'An asset', 'An expense'], correctIndex: 2 },
  { id: 'q10', question: 'If rent is $120 and mortgage interest is $40, what is your net income?', options: ['$160', '$80', '$40', '$120'], correctIndex: 1 },
  { id: 'q11', question: 'What is a "down payment"?', options: ['Monthly salary', 'Part of a purchase price paid upfront', 'Bank fee', 'Monthly rent'], correctIndex: 1 },
  { id: 'q12', question: 'Which comes first: earning or spending to build wealth?', options: ['Spending first', 'They are the same', 'Earning first', 'Borrowing first'], correctIndex: 2 },
  { id: 'q13', question: 'What does "profit" mean?', options: ['Money you borrow', 'Money earned minus money spent', 'Total money earned', 'Money in the bank'], correctIndex: 1 },
  { id: 'q14', question: 'Which is passive income?', options: ['Salary from a job', 'Rent from a property', 'Spending savings', 'Borrowing money'], correctIndex: 1 },
  { id: 'q15', question: 'If you have $300 and spend $80, how much is left?', options: ['$380', '$220', '$240', '$200'], correctIndex: 1 },
  { id: 'q16', question: 'What is the "Rat Race"?', options: ['A game with rats', 'Working just to pay expenses with nothing left over', 'A car race', 'A type of business'], correctIndex: 1 },
  { id: 'q17', question: 'Which costs MORE upfront: buying outright or mortgage?', options: ['Mortgage', 'Buying outright', 'They cost the same', 'Neither costs money'], correctIndex: 1 },
  { id: 'q18', question: 'What is a budget?', options: ['A type of loan', 'A plan for how to spend and save money', 'A business name', 'A tax form'], correctIndex: 1 },
  { id: 'q19', question: 'If your passive income is $160 and expenses are $160, what happens?', options: ['You lose the game', 'You win — you escaped the Rat Race!', 'Nothing changes', 'You must pay tax'], correctIndex: 1 },
  { id: 'q20', question: 'Why is passive income powerful?', options: ['It requires more work', 'You earn it even when not working', 'It is always illegal', 'Banks give it to you free'], correctIndex: 1 },
]

export const REFLEX_GAMES = ['coin-rain', 'lemon-squeeze', 'cash-grab', 'pet-rush'] as const
```

### `lib/money-town/gameLogic.ts`

- [ ] **Step 3: Create game logic file**

```ts
import type { GameState, GameAction, Player, Asset, OwnedAsset } from './types'
import {
  STARTING_CASH, JOBS, ASSETS, WHEEL_SEGMENTS,
  EXPENSE_EVENTS, BAD_LUCK_EVENTS, TRIVIA_QUESTIONS, REFLEX_GAMES
} from './constants'

// ─── Helpers ────────────────────────────────────────────────────────────────

export function computePassiveIncome(assets: OwnedAsset[]): number {
  return assets.reduce((sum, a) => {
    if (a.skipNextRound) return sum
    return sum + a.incomePerRound - a.interestPerRound
  }, 0)
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickRandomExcluding<T extends { id: string }>(arr: T[], excludeIds: string[]): T {
  const pool = arr.filter(x => !excludeIds.includes(x.id))
  if (pool.length === 0) return arr[Math.floor(Math.random() * arr.length)]
  return pool[Math.floor(Math.random() * pool.length)]
}

export function checkWin(player: Player): boolean {
  return computePassiveIncome(player.assets) >= player.job.expenses
}

function pickDealAsset(round: number): Asset {
  // Early game: tier 1 only; mid-game: tier 1+2; late game: all tiers
  let pool: Asset[]
  if (round <= 5)       pool = ASSETS.filter(a => a.tier === 1)
  else if (round <= 15) pool = ASSETS.filter(a => a.tier <= 2)
  else                  pool = ASSETS
  return pickRandom(pool)
}

function clearSkipFlags(player: Player): Player {
  return {
    ...player,
    assets: player.assets.map(a => ({ ...a, skipNextRound: false })),
  }
}

export function mortgageDownPayment(asset: Asset): number {
  return Math.round(asset.cost * 0.2)
}

export function mortgageDebt(asset: Asset): number {
  return asset.cost - mortgageDownPayment(asset)
}

export function mortgageInterestPerRound(asset: Asset): number {
  return Math.round(mortgageDebt(asset) * 0.05)
}

export function sellValue(asset: OwnedAsset): number {
  return Math.round(asset.purchasePrice * 0.8)
}

// ─── Initial state ───────────────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    phase: 'lobby',
    players: [],
    currentPlayerIndex: 0,
    round: 1,
    pendingDeal: null,
    pendingExpense: null,
    pendingBadLuck: null,
    pendingMinigame: null,
    lastSpinResult: null,
    winner: null,
    usedTriviaIds: [],
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
      if (state.players.length < 2) return state
      return { ...state, phase: 'turn-start' }
    }

    case 'SPIN': {
      return { ...state, phase: 'spinning' }
    }

    case 'SPIN_RESULT': {
      const { segment } = action
      let nextState: GameState = { ...state, lastSpinResult: segment }

      if (segment === 'payday') {
        return { ...nextState, phase: 'payday' }
      }
      if (segment === 'deal') {
        return { ...nextState, phase: 'deal', pendingDeal: pickDealAsset(state.round) }
      }
      if (segment === 'expense') {
        return { ...nextState, phase: 'expense', pendingExpense: pickRandom(EXPENSE_EVENTS) }
      }
      if (segment === 'bad-luck') {
        return { ...nextState, phase: 'bad-luck', pendingBadLuck: pickRandom(BAD_LUCK_EVENTS) }
      }
      if (segment === 'minigame') {
        const useTrivia = Math.random() < 0.5
        if (useTrivia) {
          return { ...nextState, phase: 'minigame', pendingMinigame: { type: 'trivia' } }
        } else {
          return {
            ...nextState,
            phase: 'minigame',
            pendingMinigame: { type: 'reflex', reflexGameId: pickRandom(REFLEX_GAMES) },
          }
        }
      }
      return nextState
    }

    case 'COLLECT_PAYDAY': {
      const player = state.players[state.currentPlayerIndex]
      const passive = computePassiveIncome(player.assets)
      const earned = player.job.salary + passive
      // Deduct mortgage interest (already factored into computePassiveIncome, but salary is always added full)
      const mortgageTotal = player.assets.reduce((s, a) => s + a.interestPerRound, 0)
      const newCash = player.cash + player.job.salary + Math.max(0, passive)

      const updatedPlayer: Player = {
        ...clearSkipFlags(player),
        cash: newCash,
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )

      if (checkWin(updatedPlayer)) {
        return { ...state, players: newPlayers, winner: updatedPlayer.id, phase: 'win' }
      }

      return { ...state, players: newPlayers, phase: 'between-turns' }
    }

    case 'BUY_ASSET': {
      const { assetId, useMortgage } = action
      const asset = ASSETS.find(a => a.id === assetId)
      if (!asset) return state

      const player = state.players[state.currentPlayerIndex]
      const downPayment = useMortgage ? mortgageDownPayment(asset) : asset.cost
      if (player.cash < downPayment) return state

      const debt = useMortgage ? mortgageDebt(asset) : 0
      const interest = useMortgage ? mortgageInterestPerRound(asset) : 0

      const owned: OwnedAsset = {
        assetId: asset.id,
        purchasePrice: asset.cost,
        incomePerRound: asset.incomePerRound,
        mortgageDebt: debt,
        interestPerRound: interest,
        skipNextRound: false,
      }

      const updatedPlayer: Player = {
        ...player,
        cash: player.cash - downPayment,
        assets: [...player.assets, owned],
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )

      if (checkWin(updatedPlayer)) {
        return { ...state, players: newPlayers, winner: updatedPlayer.id, phase: 'win', pendingDeal: null }
      }

      return { ...state, players: newPlayers, pendingDeal: null, phase: 'between-turns' }
    }

    case 'SELL_ASSET': {
      const player = state.players[state.currentPlayerIndex]
      const owned = player.assets.find(a => a.assetId === action.assetId)
      if (!owned) return state

      const proceeds = sellValue(owned)
      const updatedPlayer: Player = {
        ...player,
        cash: player.cash + proceeds,
        assets: player.assets.filter(a => a.assetId !== action.assetId),
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers }
    }

    case 'PASS_DEAL': {
      return { ...state, pendingDeal: null, phase: 'between-turns' }
    }

    case 'DISMISS_EXPENSE': {
      const player = state.players[state.currentPlayerIndex]
      const expense = state.pendingExpense
      if (!expense) return state

      const updatedPlayer: Player = {
        ...player,
        cash: Math.max(0, player.cash - expense.cost),
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers, pendingExpense: null, phase: 'between-turns' }
    }

    case 'DISMISS_BAD_LUCK': {
      const player = state.players[state.currentPlayerIndex]
      const event = state.pendingBadLuck
      if (!event) return state

      let updatedPlayer = { ...player }

      if (event.type === 'flat' || event.type === 'friend' || event.type === 'cash') {
        updatedPlayer.cash = Math.max(0, player.cash - event.amount)
      } else if (event.type === 'business-skip') {
        const businesses = player.assets.filter(a => {
          const def = ASSETS.find(x => x.id === a.assetId)
          return def?.type === 'business'
        })
        if (businesses.length > 0) {
          const target = businesses[Math.floor(Math.random() * businesses.length)]
          updatedPlayer.assets = player.assets.map(a =>
            a.assetId === target.assetId ? { ...a, skipNextRound: true } : a
          )
        } else {
          updatedPlayer.cash = Math.max(0, player.cash - 100)
        }
      } else if (event.type === 'property-repair') {
        const properties = player.assets.filter(a => {
          const def = ASSETS.find(x => x.id === a.assetId)
          return def?.type === 'property'
        })
        if (properties.length > 0) {
          const target = properties[Math.floor(Math.random() * properties.length)]
          const fee = Math.max(50, Math.round(target.purchasePrice * 0.1))
          updatedPlayer.cash = Math.max(0, player.cash - fee)
        } else {
          updatedPlayer.cash = Math.max(0, player.cash - 100)
        }
      }

      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers, pendingBadLuck: null, phase: 'between-turns' }
    }

    case 'MINIGAME_COMPLETE': {
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer: Player = {
        ...player,
        cash: player.cash + action.cashEarned,
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers, pendingMinigame: null, phase: 'between-turns' }
    }

    case 'NEXT_TURN': {
      const nextIndex = (state.currentPlayerIndex + 1) % state.players.length
      const newRound = nextIndex === 0 ? state.round + 1 : state.round
      return {
        ...state,
        phase: 'turn-start',
        currentPlayerIndex: nextIndex,
        round: newRound,
      }
    }

    case 'RESTORE': {
      return action.state
    }

    default:
      return state
  }
}

// ─── Trivia helper ───────────────────────────────────────────────────────────

export function pickTriviaQuestions(usedIds: string[], count = 3): TriviaQuestion[] {
  const pool = TRIVIA_QUESTIONS.filter(q => !usedIds.includes(q.id))
  const source = pool.length >= count ? pool : TRIVIA_QUESTIONS
  const shuffled = [...source].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
```

- [ ] **Step 4: Typecheck**

```powershell
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/money-town/
git commit -m "feat: add Money Town types, constants, and game logic"
```

---

## Task 2: Route Pages + Play Hub Tile

**Files:**
- Create: `app/play/money-town/page.tsx`
- Modify: `app/play/page.tsx`

### `app/play/money-town/page.tsx`

- [ ] **Step 1: Create server page**

```tsx
import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import MoneyTownGame from "@/components/money-town/MoneyTownGame";

export default async function MoneyTownPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const kid = kidId ? await getKid(kidId) : null;

  const content = <MoneyTownGame kidName={kid?.name ?? null} />;

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-green-50">
      {content}
    </div>
  );
}
```

### `app/play/page.tsx`

- [ ] **Step 2: Add Money Town tile** — insert after the AI Arcade `<Link>` block and before the Flashcards `<div>`:

```tsx
{/* Money Town */}
<Link
  href={`/play/money-town${kidId ? `?kid=${kidId}` : ""}`}
  className="bg-yellow-50 border-2 border-yellow-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
>
  <div className="text-4xl">💰</div>
  <div>
    <div className="flex items-center gap-2">
      <span className="text-lg font-black text-yellow-900">Money Town</span>
      <span className="text-[10px] font-bold bg-yellow-500 text-white px-1.5 py-0.5 rounded-full leading-none">NEW</span>
    </div>
    <div className="text-xs text-yellow-700 mt-0.5">2–4 players · Learn · Earn · Invest</div>
  </div>
</Link>
```

- [ ] **Step 3: Typecheck**

```powershell
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add app/play/money-town/page.tsx app/play/page.tsx
git commit -m "feat: add Money Town route and play hub tile"
```

---

## Task 3: GameLobby

**Files:**
- Create: `components/money-town/GameLobby.tsx`

- [ ] **Step 1: Create GameLobby component**

```tsx
"use client"

import { useState, useCallback } from "react"
import type { Player, GameAction } from "@/lib/money-town/types"
import { JOBS, PLAYER_COLORS, PLAYER_COLOR_CLASSES, STARTING_CASH } from "@/lib/money-town/constants"

const GUEST_EMOJIS = ['😎', '🤩', '🥳', '😜', '🦊', '🐼', '🦄', '🐸']

interface Props {
  kidName: string | null
  dispatch: (action: GameAction) => void
}

export default function GameLobby({ kidName, dispatch }: Props) {
  const [players, setPlayers] = useState<Player[]>(() => {
    if (kidName) {
      return [{
        id: 'p1',
        name: kidName,
        emoji: '😎',
        color: 'red',
        cash: STARTING_CASH,
        job: JOBS[Math.floor(Math.random() * JOBS.length)],
        assets: [],
      }]
    }
    return []
  })
  const [guestName, setGuestName] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)

  const usedColors = players.map(p => p.color)
  const nextColor = PLAYER_COLORS.find(c => !usedColors.includes(c)) ?? 'red'

  const addGuest = useCallback(() => {
    const name = guestName.trim()
    if (!name || players.length >= 4) return
    const newPlayer: Player = {
      id: `p${Date.now()}`,
      name,
      emoji: GUEST_EMOJIS[players.length % GUEST_EMOJIS.length],
      color: nextColor,
      cash: STARTING_CASH,
      job: JOBS[Math.floor(Math.random() * JOBS.length)],
      assets: [],
    }
    setPlayers(prev => [...prev, newPlayer])
    setGuestName('')
    setAddingGuest(false)
  }, [guestName, players.length, nextColor])

  const removePlayer = (id: string) => setPlayers(prev => prev.filter(p => p.id !== id))

  const startGame = () => {
    if (players.length < 2) return
    players.forEach(p => dispatch({ type: 'ADD_PLAYER', player: p }))
    dispatch({ type: 'START_GAME' })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-green-50 p-4 pb-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-black text-center text-yellow-900 pt-6 mb-1">💰 Money Town</h1>
        <p className="text-center text-sm text-yellow-700 mb-6">
          Escape the Rat Race! First to build enough passive income wins.
        </p>

        {/* Player slots */}
        <div className="space-y-3 mb-4">
          {players.map(p => {
            const cc = PLAYER_COLOR_CLASSES[p.color]
            return (
              <div key={p.id} className={`${cc.bg} border-2 ${cc.border} rounded-2xl p-4 flex items-center gap-3`}>
                <span className="text-3xl">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className={`font-black ${cc.text} truncate`}>{p.name}</div>
                  <div className="text-xs text-gray-500">{p.job.emoji} {p.job.name} · ${p.job.salary}/round · ${p.job.expenses} expenses</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePlayer(p.id)}
                  className="text-gray-300 hover:text-red-400 text-lg leading-none"
                >
                  ✕
                </button>
              </div>
            )
          })}

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center text-sm text-gray-400">
              Player slot {players.length + i + 1}
            </div>
          ))}
        </div>

        {/* Add guest */}
        {players.length < 4 && (
          <div className="mb-6">
            {addingGuest ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addGuest()}
                  placeholder="Enter name…"
                  autoFocus
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-yellow-400"
                />
                <button
                  type="button"
                  onClick={addGuest}
                  disabled={!guestName.trim()}
                  className="px-4 py-2 bg-yellow-500 text-white font-black rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingGuest(false); setGuestName('') }}
                  className="px-3 py-2 border-2 border-gray-200 text-gray-500 rounded-xl"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingGuest(true)}
                className="w-full border-2 border-dashed border-yellow-300 text-yellow-700 font-bold rounded-2xl py-3 text-sm hover:border-yellow-400 active:scale-95 transition-transform"
              >
                ➕ Add Guest Player
              </button>
            )}
          </div>
        )}

        {/* Start button */}
        <button
          type="button"
          onClick={startGame}
          disabled={players.length < 2}
          className="w-full py-4 bg-green-500 text-white text-xl font-black rounded-2xl shadow-md disabled:opacity-40 active:scale-95 transition-transform"
        >
          {players.length < 2 ? `Add ${2 - players.length} more player${players.length === 1 ? '' : 's'}` : 'Start Game 🚀'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">2–4 players · Pass the device between turns</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```powershell
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add components/money-town/GameLobby.tsx
git commit -m "feat: add Money Town GameLobby"
```

---

## Task 4: MoneyTownGame Hub + PlayerDashboard + PaydayCard + BetweenTurns + AssetList

**Files:**
- Create: `components/money-town/MoneyTownGame.tsx`
- Create: `components/money-town/PlayerDashboard.tsx`
- Create: `components/money-town/PaydayCard.tsx`
- Create: `components/money-town/BetweenTurns.tsx`
- Create: `components/money-town/AssetList.tsx`

### `components/money-town/MoneyTownGame.tsx`

- [ ] **Step 1: Create MoneyTownGame hub**

```tsx
"use client"

import { useReducer, useEffect } from "react"
import { gameReducer, createInitialState } from "@/lib/money-town/gameLogic"
import type { GameState } from "@/lib/money-town/types"
import GameLobby from "./GameLobby"
import PlayerDashboard from "./PlayerDashboard"
import SpinWheel from "./SpinWheel"
import PaydayCard from "./PaydayCard"
import DealCard from "./DealCard"
import ExpenseCard from "./ExpenseCard"
import BadLuckCard from "./BadLuckCard"
import BetweenTurns from "./BetweenTurns"
import MiniGame from "./MiniGame"
import WinScreen from "./WinScreen"

const SAVE_KEY = 'money-town-save'

interface Props {
  kidName: string | null
}

export default function MoneyTownGame({ kidName }: Props) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SAVE_KEY)
        if (saved) return JSON.parse(saved) as GameState
      } catch {}
    }
    return createInitialState()
  })

  // Persist game state on every change (skip lobby — nothing to save yet)
  useEffect(() => {
    if (state.phase === 'lobby') return
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    } catch {}
  }, [state])

  // Clear save on win
  useEffect(() => {
    if (state.phase === 'win') {
      try { localStorage.removeItem(SAVE_KEY) } catch {}
    }
  }, [state.phase])

  const currentPlayer = state.players[state.currentPlayerIndex]

  if (state.phase === 'lobby') {
    return <GameLobby kidName={kidName} dispatch={dispatch} />
  }

  if (state.phase === 'win' && state.winner) {
    const winner = state.players.find(p => p.id === state.winner)!
    return (
      <WinScreen
        winner={winner}
        round={state.round}
        onPlayAgain={() => dispatch({ type: 'RESTORE', state: createInitialState() })}
      />
    )
  }

  if (!currentPlayer) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-green-50">
      {state.phase === 'turn-start' && (
        <PlayerDashboard
          player={currentPlayer}
          round={state.round}
          totalPlayers={state.players.length}
          dispatch={dispatch}
        />
      )}
      {state.phase === 'spinning' && (
        <SpinWheel onResult={segment => dispatch({ type: 'SPIN_RESULT', segment })} />
      )}
      {state.phase === 'payday' && (
        <PaydayCard player={currentPlayer} dispatch={dispatch} />
      )}
      {state.phase === 'deal' && state.pendingDeal && (
        <DealCard player={currentPlayer} asset={state.pendingDeal} dispatch={dispatch} />
      )}
      {state.phase === 'expense' && state.pendingExpense && (
        <ExpenseCard player={currentPlayer} event={state.pendingExpense} dispatch={dispatch} />
      )}
      {state.phase === 'bad-luck' && state.pendingBadLuck && (
        <BadLuckCard player={currentPlayer} event={state.pendingBadLuck} dispatch={dispatch} />
      )}
      {state.phase === 'minigame' && state.pendingMinigame && (
        <MiniGame
          minigame={state.pendingMinigame}
          usedTriviaIds={state.usedTriviaIds}
          dispatch={dispatch}
        />
      )}
      {state.phase === 'between-turns' && (
        <BetweenTurns
          currentPlayer={currentPlayer}
          nextPlayer={state.players[(state.currentPlayerIndex + 1) % state.players.length]}
          dispatch={dispatch}
        />
      )}
    </div>
  )
}
```

### `components/money-town/PlayerDashboard.tsx`

- [ ] **Step 2: Create PlayerDashboard**

```tsx
"use client"

import { useState } from "react"
import type { Player, GameAction } from "@/lib/money-town/types"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"
import AssetList from "./AssetList"
import ProgressChart from "./ProgressChart"

interface Props {
  player: Player
  round: number
  totalPlayers: number
  dispatch: (action: GameAction) => void
}

export default function PlayerDashboard({ player, round, totalPlayers, dispatch }: Props) {
  const [showAssets, setShowAssets] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const passive = computePassiveIncome(player.assets)
  const cc = PLAYER_COLOR_CLASSES[player.color]
  const winPercent = Math.min(100, Math.round((passive / player.job.expenses) * 100))

  return (
    <div className="min-h-screen flex flex-col p-4 pb-8 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pt-4 mb-4">
        <div className="text-xs text-gray-400 font-medium">Round {round}</div>
        <div className="flex gap-2">
          <button onClick={() => setShowProgress(true)} className="text-lg">📊</button>
          <button onClick={() => setShowAssets(true)} className="text-lg">🏗️</button>
        </div>
      </div>

      {/* Player card */}
      <div className={`${cc.bg} border-2 ${cc.border} rounded-3xl p-5 mb-5 text-center`}>
        <div className="text-5xl mb-2">{player.emoji}</div>
        <div className={`text-2xl font-black ${cc.text} mb-1`}>{player.name}</div>
        <div className="text-xs text-gray-500">{player.job.emoji} {player.job.name}</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
          <div className="text-xs text-gray-400 mb-1">Cash</div>
          <div className="text-lg font-black text-gray-800">${player.cash}</div>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
          <div className="text-xs text-gray-400 mb-1">Passive</div>
          <div className={`text-lg font-black ${passive >= player.job.expenses ? 'text-green-600' : 'text-gray-800'}`}>
            ${passive}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
          <div className="text-xs text-gray-400 mb-1">Target</div>
          <div className="text-lg font-black text-gray-800">${player.job.expenses}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Rat Race progress</span>
          <span>{winPercent}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${passive >= player.job.expenses ? 'bg-green-500' : 'bg-yellow-400'}`}
            style={{ width: `${winPercent}%` }}
          />
        </div>
        <div className="text-xs text-center mt-2 text-gray-500">
          {passive >= player.job.expenses ? '✅ Ready to win!' : `⏳ Need $${player.job.expenses - passive} more/round`}
        </div>
      </div>

      {/* Spin button */}
      <button
        type="button"
        onClick={() => dispatch({ type: 'SPIN' })}
        className="w-full py-5 bg-green-500 text-white text-2xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform"
      >
        🎡 SPIN!
      </button>

      {/* Asset list modal */}
      {showAssets && (
        <AssetList player={player} dispatch={dispatch} onClose={() => setShowAssets(false)} />
      )}

      {/* Progress chart modal */}
      {showProgress && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowProgress(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
            <ProgressChart players={[]} currentPlayer={player} />
            <button onClick={() => setShowProgress(false)} className="w-full mt-4 py-3 bg-gray-100 rounded-2xl font-bold text-gray-600">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

### `components/money-town/AssetList.tsx`

- [ ] **Step 3: Create AssetList**

```tsx
"use client"

import { createPortal } from "react-dom"
import type { Player, GameAction, OwnedAsset } from "@/lib/money-town/types"
import { ASSETS } from "@/lib/money-town/constants"
import { sellValue } from "@/lib/money-town/gameLogic"

interface Props {
  player: Player
  dispatch: (action: GameAction) => void
  onClose: () => void
}

export default function AssetList({ player, dispatch, onClose }: Props) {
  const handleSell = (assetId: string) => {
    dispatch({ type: 'SELL_ASSET', assetId })
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-3xl p-5 max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-black mb-4">🏗️ Your Assets</h2>

        {player.assets.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <div className="text-4xl mb-2">🌱</div>
            <div className="text-sm">No assets yet — land on a Deal to buy your first one!</div>
          </div>
        ) : (
          <div className="space-y-3">
            {player.assets.map(owned => {
              const def = ASSETS.find(a => a.id === owned.assetId)
              if (!def) return null
              const net = owned.incomePerRound - owned.interestPerRound
              return (
                <div key={owned.assetId} className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-black text-gray-800">{def.emoji} {def.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        +${owned.incomePerRound}/round
                        {owned.interestPerRound > 0 && ` − $${owned.interestPerRound} interest`}
                        {' '}→ <strong className={net > 0 ? 'text-green-600' : 'text-red-500'}>${net}/round</strong>
                      </div>
                      {owned.mortgageDebt > 0 && (
                        <div className="text-xs text-orange-500 mt-0.5">🏦 Mortgage: ${owned.mortgageDebt} remaining</div>
                      )}
                      {owned.skipNextRound && (
                        <div className="text-xs text-amber-600 mt-0.5">⚠️ Earns $0 next round</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSell(owned.assetId)}
                      className="text-xs font-bold text-gray-400 border border-gray-200 rounded-xl px-3 py-1.5 whitespace-nowrap"
                    >
                      Sell ${sellValue(owned)}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button onClick={onClose} className="w-full mt-4 py-3 bg-gray-100 rounded-2xl font-bold text-gray-600">
          Close
        </button>
      </div>
    </div>,
    document.body
  )
}
```

### `components/money-town/PaydayCard.tsx`

- [ ] **Step 4: Create PaydayCard**

```tsx
"use client"

import type { Player, GameAction } from "@/lib/money-town/types"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"

interface Props {
  player: Player
  dispatch: (action: GameAction) => void
}

export default function PaydayCard({ player, dispatch }: Props) {
  const passive = computePassiveIncome(player.assets)
  const total = player.job.salary + passive
  const cc = PLAYER_COLOR_CLASSES[player.color]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">💰</div>
      <h2 className="text-3xl font-black text-gray-900 mb-2">Payday!</h2>
      <p className="text-gray-500 text-sm mb-6">Here's what {player.name} collected this round</p>

      <div className="bg-white rounded-3xl shadow-md p-6 w-full max-w-xs space-y-3 mb-8">
        <div className="flex justify-between text-sm font-medium text-gray-600">
          <span>{player.job.emoji} Salary</span>
          <span className="font-black text-gray-800">+${player.job.salary}</span>
        </div>
        <div className="flex justify-between text-sm font-medium text-gray-600">
          <span>💼 Passive income</span>
          <span className="font-black text-green-600">+${passive}</span>
        </div>
        <div className="border-t border-gray-100 pt-2 flex justify-between font-black text-gray-900">
          <span>Total earned</span>
          <span className="text-green-600">+${total}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>New cash balance</span>
          <span>${player.cash + total}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => dispatch({ type: 'COLLECT_PAYDAY' })}
        className={`w-full max-w-xs py-4 ${cc.badge} text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform`}
      >
        Collect! 🎉
      </button>
    </div>
  )
}
```

### `components/money-town/BetweenTurns.tsx`

- [ ] **Step 5: Create BetweenTurns**

```tsx
"use client"

import type { Player, GameAction } from "@/lib/money-town/types"
import { PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"

interface Props {
  currentPlayer: Player
  nextPlayer: Player
  dispatch: (action: GameAction) => void
}

export default function BetweenTurns({ currentPlayer, nextPlayer, dispatch }: Props) {
  const cc = PLAYER_COLOR_CLASSES[nextPlayer.color]

  return (
    <div
      className={`min-h-screen ${cc.bg} flex flex-col items-center justify-center p-6 cursor-pointer select-none`}
      onClick={() => dispatch({ type: 'NEXT_TURN' })}
    >
      <div className="text-6xl mb-4">{nextPlayer.emoji}</div>
      <h2 className={`text-3xl font-black ${cc.text} mb-2 text-center`}>
        Pass to {nextPlayer.name} 👋
      </h2>
      <p className="text-sm text-gray-500">Tap anywhere to continue</p>
    </div>
  )
}
```

- [ ] **Step 6: Typecheck**

```powershell
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add components/money-town/MoneyTownGame.tsx components/money-town/PlayerDashboard.tsx components/money-town/AssetList.tsx components/money-town/PaydayCard.tsx components/money-town/BetweenTurns.tsx
git commit -m "feat: add Money Town game hub, dashboard, payday, between-turns"
```

---

## Task 5: SpinWheel

**Files:**
- Create: `components/money-town/SpinWheel.tsx`

- [ ] **Step 1: Create SpinWheel with CSS animation**

```tsx
"use client"

import { useState, useEffect, useRef } from "react"
import type { WheelSegment } from "@/lib/money-town/types"
import { WHEEL_SEGMENTS } from "@/lib/money-town/constants"

const SEGMENT_CONFIG: Record<WheelSegment, { emoji: string; label: string; color: string }> = {
  payday:   { emoji: '💰', label: 'Payday',    color: '#fbbf24' },
  deal:     { emoji: '🤝', label: 'Deal!',     color: '#34d399' },
  expense:  { emoji: '💸', label: 'Expense',   color: '#f87171' },
  minigame: { emoji: '🎮', label: 'Mini-Game', color: '#818cf8' },
  'bad-luck': { emoji: '⚡', label: 'Bad Luck', color: '#94a3b8' },
}

// 10 segments; each = 36 degrees
const SEGMENT_DEG = 360 / 10

interface Props {
  onResult: (segment: WheelSegment) => void
}

export default function SpinWheel({ onResult }: Props) {
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState<WheelSegment | null>(null)
  const currentRotation = useRef(0)

  const spin = () => {
    if (spinning) return
    setSpinning(true)
    setResult(null)

    const resultIndex = Math.floor(Math.random() * 10)
    const targetSegmentAngle = resultIndex * SEGMENT_DEG + SEGMENT_DEG / 2
    // Spin at least 5 full rotations + land on result
    const fullSpins = (5 + Math.floor(Math.random() * 4)) * 360
    const targetAngle = fullSpins + (360 - targetSegmentAngle)
    const newRotation = currentRotation.current + targetAngle

    currentRotation.current = newRotation
    setRotation(newRotation)

    setTimeout(() => {
      const segment = WHEEL_SEGMENTS[resultIndex]
      setResult(segment)
      setSpinning(false)
    }, 3500)
  }

  const handleContinue = () => {
    if (result) onResult(result)
  }

  // Build conic gradient
  const conicStops = WHEEL_SEGMENTS.map((seg, i) => {
    const start = i * 10
    const end = (i + 1) * 10
    return `${SEGMENT_CONFIG[seg].color} ${start}% ${end}%`
  }).join(', ')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-black text-gray-900 mb-8">🎡 Spin the Wheel!</h2>

      <div className="relative mb-8">
        {/* Pointer */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 text-2xl">▼</div>

        {/* Wheel */}
        <div
          className="w-64 h-64 rounded-full relative"
          style={{
            background: `conic-gradient(${conicStops})`,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 1)' : 'none',
          }}
        >
          {/* Segment labels */}
          {WHEEL_SEGMENTS.map((seg, i) => {
            const angle = i * SEGMENT_DEG + SEGMENT_DEG / 2
            const rad = ((angle - 90) * Math.PI) / 180
            const r = 90
            const x = 128 + r * Math.cos(rad)
            const y = 128 + r * Math.sin(rad)
            return (
              <span
                key={i}
                className="absolute text-lg"
                style={{
                  left: x,
                  top: y,
                  transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                  pointerEvents: 'none',
                }}
              >
                {SEGMENT_CONFIG[seg].emoji}
              </span>
            )
          })}
        </div>
      </div>

      {!spinning && !result && (
        <button
          type="button"
          onClick={spin}
          className="px-10 py-4 bg-green-500 text-white text-2xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform"
        >
          SPIN!
        </button>
      )}

      {spinning && (
        <p className="text-gray-500 text-lg font-medium animate-pulse">Spinning…</p>
      )}

      {result && !spinning && (
        <div className="text-center">
          <div className="text-5xl mb-2">{SEGMENT_CONFIG[result].emoji}</div>
          <div className="text-2xl font-black text-gray-900 mb-6">{SEGMENT_CONFIG[result].label}!</div>
          <button
            type="button"
            onClick={handleContinue}
            className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform"
          >
            Continue ▶
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```powershell
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add components/money-town/SpinWheel.tsx
git commit -m "feat: add Money Town CSS spin wheel"
```

---

## Task 6: DealCard

**Files:**
- Create: `components/money-town/DealCard.tsx`

- [ ] **Step 1: Create DealCard**

```tsx
"use client"

import type { Player, Asset, GameAction } from "@/lib/money-town/types"
import {
  mortgageDownPayment, mortgageDebt, mortgageInterestPerRound
} from "@/lib/money-town/gameLogic"

interface Props {
  player: Player
  asset: Asset
  dispatch: (action: GameAction) => void
}

export default function DealCard({ player, asset, dispatch }: Props) {
  const canBuyOutright = player.cash >= asset.cost
  const downPayment = mortgageDownPayment(asset)
  const debt = mortgageDebt(asset)
  const interest = mortgageInterestPerRound(asset)
  const netMortgage = asset.incomePerRound - interest
  const canMortgage = asset.type === 'property' && player.cash >= downPayment
  const alreadyOwns = player.assets.some(a => a.assetId === asset.id)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{asset.emoji}</div>
          <h2 className="text-2xl font-black text-gray-900">{asset.name}</h2>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
            {asset.type === 'property' ? 'Property' : 'Business'}
          </span>
        </div>

        {alreadyOwns && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center text-sm font-bold text-amber-700 mb-4">
            You already own this!
          </div>
        )}

        {/* Buy outright */}
        <div className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 p-4 mb-3">
          <div className="flex justify-between items-center mb-2">
            <span className="font-black text-gray-800">Buy Outright</span>
            <span className="text-sm font-bold text-gray-500">Cost: ${asset.cost}</span>
          </div>
          <div className="text-sm text-gray-600 mb-3">
            Earn <strong className="text-green-600">+${asset.incomePerRound}/round</strong> — no ongoing costs
          </div>
          <button
            type="button"
            disabled={!canBuyOutright || alreadyOwns}
            onClick={() => dispatch({ type: 'BUY_ASSET', assetId: asset.id, useMortgage: false })}
            className="w-full py-3 bg-green-500 text-white font-black rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
          >
            {canBuyOutright ? `Buy 💰 $${asset.cost}` : `Need $${asset.cost - player.cash} more`}
          </button>
        </div>

        {/* Mortgage option (properties only) */}
        {asset.type === 'property' && (
          <div className="bg-blue-50 rounded-2xl shadow-sm border-2 border-blue-100 p-4 mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="font-black text-blue-800">Mortgage</span>
              <span className="text-sm font-bold text-blue-500">Down: ${downPayment}</span>
            </div>
            <div className="text-xs text-blue-700 space-y-0.5 mb-3">
              <div>Borrow ${debt} · Pay ${interest}/round interest</div>
              <div>Net income: <strong className={netMortgage > 0 ? 'text-green-600' : 'text-red-500'}>+${netMortgage}/round</strong></div>
            </div>
            <button
              type="button"
              disabled={!canMortgage || alreadyOwns}
              onClick={() => dispatch({ type: 'BUY_ASSET', assetId: asset.id, useMortgage: true })}
              className="w-full py-3 bg-blue-500 text-white font-black rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
            >
              {canMortgage ? `Mortgage 🏦 $${downPayment} down` : `Need $${downPayment - player.cash} more`}
            </button>
          </div>
        )}

        {/* Pass */}
        <button
          type="button"
          onClick={() => dispatch({ type: 'PASS_DEAL' })}
          className="w-full py-3 border-2 border-gray-200 text-gray-500 font-bold rounded-xl active:scale-95 transition-transform"
        >
          Pass ➡️
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">Cash on hand: ${player.cash}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```powershell
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add components/money-town/DealCard.tsx
git commit -m "feat: add Money Town DealCard with mortgage comparison"
```

---

## Task 7: ExpenseCard + BadLuckCard + ProgressChart + WinScreen

**Files:**
- Create: `components/money-town/ExpenseCard.tsx`
- Create: `components/money-town/BadLuckCard.tsx`
- Create: `components/money-town/ProgressChart.tsx`
- Create: `components/money-town/WinScreen.tsx`

### `components/money-town/ExpenseCard.tsx`

- [ ] **Step 1: Create ExpenseCard**

```tsx
"use client"

import type { Player, ExpenseEvent, GameAction } from "@/lib/money-town/types"

interface Props {
  player: Player
  event: ExpenseEvent
  dispatch: (action: GameAction) => void
}

export default function ExpenseCard({ player, event, dispatch }: Props) {
  const newCash = Math.max(0, player.cash - event.cost)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">{event.emoji}</div>
      <h2 className="text-2xl font-black text-red-700 mb-2">Surprise Expense!</h2>
      <p className="text-gray-600 mb-2">{event.description}</p>
      <div className="text-4xl font-black text-red-500 mb-2">−${event.cost}</div>
      <p className="text-sm text-gray-400 mb-8">
        Cash: ${player.cash} → <strong>${newCash}</strong>
      </p>
      <button
        type="button"
        onClick={() => dispatch({ type: 'DISMISS_EXPENSE' })}
        className="px-10 py-4 bg-gray-700 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform"
      >
        OK 😬
      </button>
    </div>
  )
}
```

### `components/money-town/BadLuckCard.tsx`

- [ ] **Step 2: Create BadLuckCard**

```tsx
"use client"

import type { Player, BadLuckEvent, GameAction } from "@/lib/money-town/types"

interface Props {
  player: Player
  event: BadLuckEvent
  dispatch: (action: GameAction) => void
}

function describeEffect(player: Player, event: BadLuckEvent): string {
  if (event.type === 'flat' || event.type === 'friend' || event.type === 'cash') {
    return `Lose $${event.amount}`
  }
  if (event.type === 'business-skip') {
    const hasBusiness = player.assets.some(() => true)
    return hasBusiness ? 'One business earns $0 next round' : 'Lose $100 (no businesses)'
  }
  if (event.type === 'property-repair') {
    const hasProperty = player.assets.length > 0
    return hasProperty ? 'Pay 10% of one property\'s value (min $50)' : 'Lose $100 (no properties)'
  }
  return ''
}

export default function BadLuckCard({ player, event, dispatch }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">{event.emoji}</div>
      <h2 className="text-2xl font-black text-gray-700 mb-2">Bad Luck!</h2>
      <p className="text-gray-600 text-lg mb-2">{event.description}</p>
      <p className="text-sm font-bold text-red-500 mb-8">{describeEffect(player, event)}</p>
      <button
        type="button"
        onClick={() => dispatch({ type: 'DISMISS_BAD_LUCK' })}
        className="px-10 py-4 bg-gray-700 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform"
      >
        OK 😤
      </button>
    </div>
  )
}
```

### `components/money-town/ProgressChart.tsx`

- [ ] **Step 3: Create ProgressChart**

```tsx
import type { Player } from "@/lib/money-town/types"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"

interface Props {
  players: Player[]
  currentPlayer?: Player
}

export default function ProgressChart({ players, currentPlayer }: Props) {
  const allPlayers = players.length > 0 ? players : currentPlayer ? [currentPlayer] : []

  return (
    <div className="space-y-4">
      <h3 className="font-black text-gray-800 text-base">📊 Rat Race Progress</h3>
      {allPlayers.map(p => {
        const passive = computePassiveIncome(p.assets)
        const pct = Math.min(100, Math.round((passive / p.job.expenses) * 100))
        const cc = PLAYER_COLOR_CLASSES[p.color]
        return (
          <div key={p.id}>
            <div className="flex justify-between text-xs text-gray-600 mb-1 font-medium">
              <span>{p.emoji} {p.name}</span>
              <span>${passive} / ${p.job.expenses}/round</span>
            </div>
            <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${cc.badge} rounded-full transition-all`}
                style={{ width: `${pct}%` }}
              />
              {/* Target line at 100% */}
              <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-gray-400" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

### `components/money-town/WinScreen.tsx`

- [ ] **Step 4: Create WinScreen**

```tsx
"use client"

import type { Player } from "@/lib/money-town/types"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { ASSETS, PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"

interface Props {
  winner: Player
  round: number
  onPlayAgain: () => void
}

const CONFETTI_EMOJIS = ['🎉', '⭐', '💰', '🏆', '✨', '🌟', '💎', '🎊']

export default function WinScreen({ winner, round, onPlayAgain }: Props) {
  const passive = computePassiveIncome(winner.assets)
  const cc = PLAYER_COLOR_CLASSES[winner.color]
  const netWorth = winner.cash + winner.assets.reduce((s, a) => s + Math.round(a.purchasePrice * 0.8), 0)

  return (
    <div className={`min-h-screen ${cc.bg} flex flex-col items-center justify-center p-6 text-center`}>
      {/* Confetti rain */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {CONFETTI_EMOJIS.map((e, i) => (
          <span
            key={i}
            className="absolute text-3xl animate-bounce"
            style={{
              left: `${(i + 1) * 12}%`,
              top: `${5 + (i % 3) * 10}%`,
              animationDelay: `${i * 0.15}s`,
              animationDuration: `${0.8 + (i % 3) * 0.3}s`,
            }}
          >
            {e}
          </span>
        ))}
      </div>

      <div className="relative z-10">
        <div className="text-7xl mb-4">{winner.emoji}</div>
        <h1 className={`text-4xl font-black ${cc.text} mb-2`}>{winner.name}</h1>
        <h2 className="text-2xl font-black text-gray-800 mb-1">🎉 ESCAPED THE RAT RACE!</h2>
        <p className="text-gray-500 mb-8">First to build enough passive income</p>

        <div className="bg-white rounded-3xl shadow-md p-6 mb-8 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Rounds played</span>
            <span className="font-black">{round}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Passive income</span>
            <span className="font-black text-green-600">${passive}/round</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Assets owned</span>
            <span className="font-black">{winner.assets.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Net worth</span>
            <span className="font-black">${netWorth}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onPlayAgain}
          className="w-full py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform mb-3"
        >
          Play Again 🔄
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

```powershell
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add components/money-town/ExpenseCard.tsx components/money-town/BadLuckCard.tsx components/money-town/ProgressChart.tsx components/money-town/WinScreen.tsx
git commit -m "feat: add Money Town expense, bad luck, progress chart, win screen"
```

---

## Task 8: MiniGame Dispatcher + Trivia

**Files:**
- Create: `components/money-town/MiniGame.tsx`
- Create: `components/money-town/Trivia.tsx`

### `components/money-town/MiniGame.tsx`

- [ ] **Step 1: Create MiniGame dispatcher**

```tsx
"use client"

import type { PendingMinigame, GameAction } from "@/lib/money-town/types"
import Trivia from "./Trivia"
import CoinRain from "./games/CoinRain"
import LemonSqueeze from "./games/LemonSqueeze"
import CashGrab from "./games/CashGrab"
import PetRush from "./games/PetRush"

interface Props {
  minigame: PendingMinigame
  usedTriviaIds: string[]
  dispatch: (action: GameAction) => void
}

export default function MiniGame({ minigame, usedTriviaIds, dispatch }: Props) {
  const onComplete = (cashEarned: number) => {
    dispatch({ type: 'MINIGAME_COMPLETE', cashEarned })
  }

  if (minigame.type === 'trivia') {
    return <Trivia usedTriviaIds={usedTriviaIds} onComplete={onComplete} />
  }

  const id = minigame.reflexGameId
  if (id === 'coin-rain')      return <CoinRain onComplete={onComplete} />
  if (id === 'lemon-squeeze')  return <LemonSqueeze onComplete={onComplete} />
  if (id === 'cash-grab')      return <CashGrab onComplete={onComplete} />
  if (id === 'pet-rush')       return <PetRush onComplete={onComplete} />

  return null
}
```

### `components/money-town/Trivia.tsx`

- [ ] **Step 2: Create Trivia game (3 questions, $75 per correct answer)**

```tsx
"use client"

import { useState, useCallback } from "react"
import { pickTriviaQuestions } from "@/lib/money-town/gameLogic"
import type { TriviaQuestion } from "@/lib/money-town/types"

interface Props {
  usedTriviaIds: string[]
  onComplete: (cashEarned: number) => void
}

type QuestionState = 'unanswered' | 'correct' | 'wrong'

export default function Trivia({ usedTriviaIds, onComplete }: Props) {
  const [questions] = useState<TriviaQuestion[]>(() => pickTriviaQuestions(usedTriviaIds, 3))
  const [currentQ, setCurrentQ] = useState(0)
  const [states, setStates] = useState<QuestionState[]>(['unanswered', 'unanswered', 'unanswered'])
  const [done, setDone] = useState(false)

  const q = questions[currentQ]
  const totalCorrect = states.filter(s => s === 'correct').length

  const answer = useCallback((optionIndex: number) => {
    const correct = optionIndex === q.correctIndex
    const newStates = [...states]
    newStates[currentQ] = correct ? 'correct' : 'wrong'
    setStates(newStates)

    setTimeout(() => {
      if (currentQ < 2) {
        setCurrentQ(prev => prev + 1)
      } else {
        setDone(true)
      }
    }, 800)
  }, [q, currentQ, states])

  if (done) {
    const earned = totalCorrect * 75
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🧠</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Trivia Done!</h2>
        <p className="text-gray-500 mb-4">{totalCorrect} / 3 correct</p>
        <div className="text-4xl font-black text-green-600 mb-8">+${earned}</div>
        <button
          type="button"
          onClick={() => onComplete(earned)}
          className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform"
        >
          Collect! 🎉
        </button>
      </div>
    )
  }

  const state = states[currentQ]

  return (
    <div className="min-h-screen flex flex-col p-6 pt-10">
      <div className="flex gap-1.5 mb-8 justify-center">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`h-2 flex-1 max-w-16 rounded-full ${
              i < currentQ ? (states[i] === 'correct' ? 'bg-green-500' : 'bg-red-400')
              : i === currentQ ? 'bg-yellow-400'
              : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      <div className="text-center mb-2">
        <div className="text-4xl mb-3">🧠</div>
        <div className="text-xs text-gray-400 mb-1">Question {currentQ + 1} of 3 · $75 each</div>
      </div>

      <p className="text-lg font-black text-gray-900 text-center mb-6">{q.question}</p>

      <div className="space-y-3">
        {q.options.map((opt, i) => {
          let style = 'border-2 border-gray-200 bg-white text-gray-800'
          if (state !== 'unanswered') {
            if (i === q.correctIndex) style = 'border-2 border-green-400 bg-green-50 text-green-800'
            else if (state === 'wrong' && i !== q.correctIndex) style = 'border-2 border-gray-200 bg-white text-gray-400'
          }
          return (
            <button
              key={i}
              type="button"
              disabled={state !== 'unanswered'}
              onClick={() => answer(i)}
              className={`w-full py-3 px-4 rounded-2xl font-bold text-sm text-left active:scale-95 transition-all ${style}`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```powershell
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add components/money-town/MiniGame.tsx components/money-town/Trivia.tsx
git commit -m "feat: add Money Town MiniGame dispatcher and Trivia"
```

---

## Task 9: Reflex Mini-Games

**Files:**
- Create: `components/money-town/games/CoinRain.tsx`
- Create: `components/money-town/games/LemonSqueeze.tsx`
- Create: `components/money-town/games/CashGrab.tsx`
- Create: `components/money-town/games/PetRush.tsx`

All four follow the same pattern: 15-second timer, tap/touch targets, earn scaled cash on result.

### `components/money-town/games/CoinRain.tsx`

- [ ] **Step 1: Create CoinRain — tap falling coins**

```tsx
"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface Coin {
  id: number
  x: number
  y: number
  speed: number
  caught: boolean
}

interface Props {
  onComplete: (cashEarned: number) => void
}

const GAME_DURATION = 15
const MAX_EARN = 150

export default function CoinRain({ onComplete }: Props) {
  const [coins, setCoins] = useState<Coin[]>([])
  const [caught, setCaught] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const nextId = useRef(0)
  const areaRef = useRef<HTMLDivElement>(null)

  const spawnCoin = useCallback(() => {
    setCoins(prev => [
      ...prev.filter(c => !c.caught && c.y < 110),
      {
        id: nextId.current++,
        x: 5 + Math.random() * 85,
        y: -10,
        speed: 1.5 + Math.random() * 2,
        caught: false,
      },
    ])
  }, [])

  useEffect(() => {
    if (!started || done) return
    const spawn = setInterval(spawnCoin, 600)
    return () => clearInterval(spawn)
  }, [started, done, spawnCoin])

  useEffect(() => {
    if (!started || done) return
    const move = setInterval(() => {
      setCoins(prev => prev.map(c => ({ ...c, y: c.y + c.speed })).filter(c => c.y < 115))
    }, 50)
    return () => clearInterval(move)
  }, [started, done])

  useEffect(() => {
    if (!started || done) return
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer)
          setDone(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, done])

  const catchCoin = (id: number) => {
    setCoins(prev => prev.map(c => c.id === id ? { ...c, caught: true } : c))
    setCaught(prev => prev + 1)
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🪙</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Coin Rain!</h2>
        <p className="text-gray-500 text-sm mb-8">Tap the coins before they fall! 15 seconds · earn up to $150</p>
        <button onClick={() => setStarted(true)} className="px-10 py-4 bg-yellow-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Start!
        </button>
      </div>
    )
  }

  if (done) {
    const earned = Math.round((caught / 15) * MAX_EARN)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🪙</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Time's up!</h2>
        <p className="text-gray-500 mb-2">You caught {caught} coins</p>
        <div className="text-4xl font-black text-green-600 mb-8">+${earned}</div>
        <button onClick={() => onComplete(earned)} className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Collect! 🎉
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <div className="flex justify-between p-4 text-sm font-bold text-gray-600">
        <span>🪙 Caught: {caught}</span>
        <span>⏱️ {timeLeft}s</span>
      </div>
      <div ref={areaRef} className="flex-1 relative bg-blue-50 overflow-hidden select-none touch-none">
        {coins.filter(c => !c.caught).map(coin => (
          <button
            key={coin.id}
            type="button"
            onPointerDown={() => catchCoin(coin.id)}
            className="absolute text-3xl leading-none"
            style={{ left: `${coin.x}%`, top: `${coin.y}%`, transform: 'translate(-50%,-50%)' }}
          >
            🪙
          </button>
        ))}
      </div>
    </div>
  )
}
```

### `components/money-town/games/LemonSqueeze.tsx`

- [ ] **Step 2: Create LemonSqueeze — tap lemons to fill a glass**

```tsx
"use client"

import { useState, useEffect } from "react"

interface Props {
  onComplete: (cashEarned: number) => void
}

const GAME_DURATION = 15
const MAX_EARN = 100
const GOAL_TAPS = 30

export default function LemonSqueeze({ onComplete }: Props) {
  const [taps, setTaps] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const [squeeze, setSqueeze] = useState(false)

  useEffect(() => {
    if (!started || done) return
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setDone(true); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, done])

  const tap = () => {
    if (!started || done) return
    setTaps(t => t + 1)
    setSqueeze(true)
    setTimeout(() => setSqueeze(false), 100)
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🍋</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Lemon Squeeze!</h2>
        <p className="text-gray-500 text-sm mb-8">Tap the lemon as fast as you can to fill the glass! 15 seconds · earn up to $100</p>
        <button onClick={() => setStarted(true)} className="px-10 py-4 bg-yellow-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Start!
        </button>
      </div>
    )
  }

  if (done) {
    const earned = Math.round(Math.min(1, taps / GOAL_TAPS) * MAX_EARN)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🥤</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Time's up!</h2>
        <p className="text-gray-500 mb-2">{taps} squeezes!</p>
        <div className="text-4xl font-black text-green-600 mb-8">+${earned}</div>
        <button onClick={() => onComplete(earned)} className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Collect! 🎉
        </button>
      </div>
    )
  }

  const fillPct = Math.min(100, Math.round((taps / GOAL_TAPS) * 100))

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 select-none touch-none">
      <div className="flex justify-between w-full max-w-xs mb-6 text-sm font-bold text-gray-600">
        <span>Squeezes: {taps}</span>
        <span>⏱️ {timeLeft}s</span>
      </div>

      {/* Glass */}
      <div className="w-20 h-40 border-4 border-yellow-400 rounded-b-2xl overflow-hidden mb-6 bg-white relative">
        <div
          className="absolute bottom-0 left-0 right-0 bg-yellow-300 transition-all"
          style={{ height: `${fillPct}%` }}
        />
      </div>

      <button
        type="button"
        onPointerDown={tap}
        className={`text-8xl transition-transform duration-75 ${squeeze ? 'scale-90' : 'scale-100'}`}
      >
        🍋
      </button>
      <p className="text-xs text-gray-400 mt-4">Tap the lemon!</p>
    </div>
  )
}
```

### `components/money-town/games/CashGrab.tsx`

- [ ] **Step 3: Create CashGrab — swipe money bags left to collect**

```tsx
"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface Bag {
  id: number
  x: number
  y: number
  type: 'cash' | 'expense'
  speed: number
  dismissed: boolean
}

interface Props {
  onComplete: (cashEarned: number) => void
}

const GAME_DURATION = 15
const MAX_EARN = 150

export default function CashGrab({ onComplete }: Props) {
  const [bags, setBags] = useState<Bag[]>([])
  const [grabbed, setGrabbed] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const nextId = useRef(0)

  const spawnBag = useCallback(() => {
    setBags(prev => [
      ...prev.filter(b => !b.dismissed && b.x > -20),
      {
        id: nextId.current++,
        x: 110,
        y: 15 + Math.random() * 65,
        type: Math.random() < 0.6 ? 'cash' : 'expense',
        speed: 1.5 + Math.random() * 1.5,
        dismissed: false,
      },
    ])
  }, [])

  useEffect(() => {
    if (!started || done) return
    const spawn = setInterval(spawnBag, 1000)
    return () => clearInterval(spawn)
  }, [started, done, spawnBag])

  useEffect(() => {
    if (!started || done) return
    const move = setInterval(() => {
      setBags(prev => prev.map(b => ({ ...b, x: b.x - b.speed })).filter(b => b.x > -20))
    }, 50)
    return () => clearInterval(move)
  }, [started, done])

  useEffect(() => {
    if (!started || done) return
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setDone(true); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, done])

  const tap = (id: number, type: 'cash' | 'expense') => {
    setBags(prev => prev.map(b => b.id === id ? { ...b, dismissed: true } : b))
    if (type === 'cash') setGrabbed(g => g + 1)
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">💰</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Cash Grab!</h2>
        <p className="text-gray-500 text-sm mb-8">Tap 💰 money bags, avoid 💸 expenses! 15 seconds · earn up to $150</p>
        <button onClick={() => setStarted(true)} className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Start!
        </button>
      </div>
    )
  }

  if (done) {
    const earned = Math.round((grabbed / 10) * MAX_EARN)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">💰</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Time's up!</h2>
        <p className="text-gray-500 mb-2">Grabbed {grabbed} money bags!</p>
        <div className="text-4xl font-black text-green-600 mb-8">+${earned}</div>
        <button onClick={() => onComplete(earned)} className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Collect! 🎉
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <div className="flex justify-between p-4 text-sm font-bold text-gray-600">
        <span>💰 Grabbed: {grabbed}</span>
        <span>⏱️ {timeLeft}s</span>
      </div>
      <div className="flex-1 relative bg-green-50 overflow-hidden select-none touch-none">
        {bags.filter(b => !b.dismissed).map(bag => (
          <button
            key={bag.id}
            type="button"
            onPointerDown={() => tap(bag.id, bag.type)}
            className="absolute text-4xl leading-none"
            style={{ left: `${bag.x}%`, top: `${bag.y}%`, transform: 'translate(-50%,-50%)' }}
          >
            {bag.type === 'cash' ? '💰' : '💸'}
          </button>
        ))}
        <div className="absolute inset-y-0 right-0 w-1 bg-red-200" />
      </div>
    </div>
  )
}
```

### `components/money-town/games/PetRush.tsx`

- [ ] **Step 4: Create PetRush — tap runaway pets**

```tsx
"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface Pet {
  id: number
  emoji: string
  x: number
  y: number
  dx: number
  dy: number
  caught: boolean
}

interface Props {
  onComplete: (cashEarned: number) => void
}

const PETS = ['🐶', '🐱', '🐰', '🐹', '🐸', '🦊']
const GAME_DURATION = 15
const MAX_EARN = 100

export default function PetRush({ onComplete }: Props) {
  const [pets, setPets] = useState<Pet[]>([])
  const [caught, setCaught] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const nextId = useRef(0)

  const spawnPet = useCallback(() => {
    setPets(prev => {
      if (prev.filter(p => !p.caught).length >= 5) return prev
      return [...prev, {
        id: nextId.current++,
        emoji: PETS[Math.floor(Math.random() * PETS.length)],
        x: 10 + Math.random() * 80,
        y: 10 + Math.random() * 80,
        dx: (Math.random() - 0.5) * 2,
        dy: (Math.random() - 0.5) * 2,
        caught: false,
      }]
    })
  }, [])

  useEffect(() => {
    if (!started || done) return
    const spawn = setInterval(spawnPet, 1500)
    return () => clearInterval(spawn)
  }, [started, done, spawnPet])

  useEffect(() => {
    if (!started || done) return
    const move = setInterval(() => {
      setPets(prev => prev.map(p => {
        if (p.caught) return p
        let nx = p.x + p.dx
        let ny = p.y + p.dy
        let ndx = p.dx
        let ndy = p.dy
        if (nx < 2 || nx > 93) { ndx = -ndx; nx = Math.max(2, Math.min(93, nx)) }
        if (ny < 2 || ny > 88) { ndy = -ndy; ny = Math.max(2, Math.min(88, ny)) }
        return { ...p, x: nx, y: ny, dx: ndx, dy: ndy }
      }))
    }, 60)
    return () => clearInterval(move)
  }, [started, done])

  useEffect(() => {
    if (!started || done) return
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setDone(true); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, done])

  const catchPet = (id: number) => {
    setPets(prev => prev.map(p => p.id === id ? { ...p, caught: true } : p))
    setCaught(c => c + 1)
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🐾</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Pet Rush!</h2>
        <p className="text-gray-500 text-sm mb-8">Tap the runaway pets before they escape! 15 seconds · earn up to $100</p>
        <button onClick={() => setStarted(true)} className="px-10 py-4 bg-orange-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Start!
        </button>
      </div>
    )
  }

  if (done) {
    const earned = Math.round((caught / 8) * MAX_EARN)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🐾</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Time's up!</h2>
        <p className="text-gray-500 mb-2">Caught {caught} pets!</p>
        <div className="text-4xl font-black text-green-600 mb-8">+${earned}</div>
        <button onClick={() => onComplete(earned)} className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Collect! 🎉
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <div className="flex justify-between p-4 text-sm font-bold text-gray-600">
        <span>🐾 Caught: {caught}</span>
        <span>⏱️ {timeLeft}s</span>
      </div>
      <div className="flex-1 relative bg-orange-50 overflow-hidden select-none touch-none">
        {pets.filter(p => !p.caught).map(pet => (
          <button
            key={pet.id}
            type="button"
            onPointerDown={() => catchPet(pet.id)}
            className="absolute text-4xl leading-none"
            style={{ left: `${pet.x}%`, top: `${pet.y}%`, transform: 'translate(-50%,-50%)' }}
          >
            {pet.emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

```powershell
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add components/money-town/games/
git commit -m "feat: add Money Town reflex mini-games (CoinRain, LemonSqueeze, CashGrab, PetRush)"
```

---

## Task 10: Wire ProgressChart into game + Final Build

**Files:**
- Modify: `components/money-town/PlayerDashboard.tsx` (pass all players to ProgressChart)
- Modify: `components/money-town/MoneyTownGame.tsx` (pass players prop to PlayerDashboard and ProgressChart)
- Run final build

The `PlayerDashboard` currently receives only the current player. The `ProgressChart` needs all players. Pass `players` and `round` from `MoneyTownGame.tsx` through to `PlayerDashboard`.

### Update `MoneyTownGame.tsx`

- [ ] **Step 1: Pass all players to PlayerDashboard**

In `components/money-town/MoneyTownGame.tsx`, update the `turn-start` phase render:

```tsx
{state.phase === 'turn-start' && (
  <PlayerDashboard
    player={currentPlayer}
    players={state.players}
    round={state.round}
    totalPlayers={state.players.length}
    dispatch={dispatch}
  />
)}
```

### Update `PlayerDashboard.tsx`

- [ ] **Step 2: Accept and pass players to ProgressChart**

In `components/money-town/PlayerDashboard.tsx`, update the `Props` interface and ProgressChart usage:

```tsx
interface Props {
  player: Player
  players: Player[]          // add this
  round: number
  totalPlayers: number
  dispatch: (action: GameAction) => void
}

export default function PlayerDashboard({ player, players, round, totalPlayers, dispatch }: Props) {
  // ... existing code ...

  // In the progress modal, replace:
  // <ProgressChart players={[]} currentPlayer={player} />
  // with:
  // <ProgressChart players={players} />
}
```

- [ ] **Step 3: Typecheck + build**

```powershell
npm run typecheck
npm run build
```

Expected: both pass with no errors.

- [ ] **Step 4: Commit all**

```bash
git add components/money-town/ app/play/money-town/ app/play/page.tsx lib/money-town/
git commit -m "feat: add Money Town multiplayer financial education game"
```

---

## Verification Checklist

1. `/play` shows 💰 Money Town tile in yellow with NEW badge
2. `/play/money-town` shows lobby — kid name auto-added if `?kid=` param present
3. Add a guest → assigned next available color + random job
4. 2 players join → Start Game enabled → launches to Player Dashboard
5. Dashboard shows cash, passive income, expenses, progress bar, and SPIN button
6. Spin → wheel animates ~3.5 seconds → lands and highlights result
7. **Payday:** salary + passive income collected → cash updates → Collect → BetweenTurns
8. **Deal:** asset card shows with buy/mortgage comparison → buy → asset appears in AssetList
9. **Mortgage:** 20% down deducted → net income shows after interest
10. **Sell asset:** 80% of purchase price returned, liability cleared
11. **Expense:** cash deducted (floor 0) → OK → BetweenTurns
12. **Bad Luck:** correct effect applied (flat cash / business skip / property repair) → OK → BetweenTurns
13. **Mini-Game Trivia:** 3 questions → correct answers earn $75 each → Collect → BetweenTurns
14. **Mini-Game Reflex:** one of 4 games loads → 15s timer → score → Collect → BetweenTurns
15. **Win:** when passive income ≥ expenses → WinScreen with confetti and stats
16. Play Again → returns to fresh lobby
17. Reload page mid-game → game resumes from localStorage
18. `npm run typecheck` and `npm run build` both pass
