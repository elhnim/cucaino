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
