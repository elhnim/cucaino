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
  | { type: 'TRIVIA_COMPLETE'; cashEarned: number; triviaIds: string[] }
  | { type: 'NEXT_TURN' }
  | { type: 'RESTORE'; state: GameState }
