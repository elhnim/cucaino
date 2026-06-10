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

/** One slot in the rotating asset market — price swings make timing a decision */
export interface MarketOffer {
  defId: string
  priceMult: number
}

/** Effect applied when the player picks one branch of a choice card */
export interface ChoiceEffect {
  cashDelta: number
  salaryDelta: number
  expensesDelta: number
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
  // choice cards — player picks one branch (applied via CHOOSE_OPTION)
  choices?: { emoji: string; label: string; desc: string }[]
  choiceEffects?: ChoiceEffect[]
  // an insurance shield absorbed this hit
  shieldUsed?: boolean
  // applied to every OTHER player's cash (head-to-head cards)
  othersDelta?: number
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
  /** Shields that absorb one bad cash event each */
  insurance: number
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
  /** This turn's rotating asset market (regenerated at each turn start) */
  marketOffers: MarketOffer[]
  /** Game ended at the round cap — winner was closest to freedom */
  winByTimeout: boolean
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
  | { type: 'SELL_ASSET'; uid: string }
  | { type: 'BUY_INSURANCE' }
  | { type: 'CHOOSE_OPTION'; index: number }
  | { type: 'SWITCH_CAREER'; jobId: string }
  | { type: 'ENROLL_DEGREE' }
  | { type: 'END_TURN' }
  | { type: 'RESTORE'; state: GameState }
  | { type: 'NEW_GAME' }
