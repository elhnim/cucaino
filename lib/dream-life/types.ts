// Dream Life — domain types.
// Spec: docs/superpowers/specs/2026-06-11-dream-life-design.md

export type PhaseId = "phase1" | "careerReel" | "phase2" | "phase3" | "won"
export type SkillId = "moneySmarts" | "proSkills" | "grit" | "bigBrain"
export type AssetClassId =
  | "savings"
  | "index"
  | "shares"
  | "resi"
  | "commercial"
  | "crypto"
  | "business"
export type CareerId =
  | "tradesperson"
  | "farmer"
  | "teacher"
  | "doctor"
  | "lawyer"
  | "politician"
  | "tycoon"
  | "banker"
  | "artist"
  | "influencer"
  | "athlete"
  | "musician"
export type PlayerColor = "red" | "blue" | "green" | "amber"
export type MinigameId = "coinrain" | "lemonsqueeze" | "cashgrab" | "petrush"

export interface AssetModifier {
  /** card code that created it, e.g. "RES-N04" */
  source: string
  field: "incomeRate" | "expenseRate" | "growthRate" | "interestRate"
  /** additive, in rate points (0.01 = 1pp) */
  delta: number
  /** false ⇒ cleared at the settle of the year it fired (spec §7 duration rule) */
  permanent: boolean
}

export interface AssetInstance {
  uid: string
  classId: AssetClassId
  value: number
  /** 0 = owned outright */
  loanBalance: number
  modifiers: AssetModifier[]
}

export interface Debt {
  uid: string
  kind: "education" | "tools" | "creditCard"
  balance: number
  /** annual rate, e.g. 0.12 */
  rate: number
}

export interface PowerUpCard {
  /** content id, e.g. "PWR-O02" */
  id: string
  /** instance uid in hand */
  uid: string
}

export interface Player {
  id: string
  name: string
  emoji: string
  color: PlayerColor
  /** equals 13 + completed turns */
  age: number
  cash: number
  /** level 1..10 per ladder */
  skills: Record<SkillId, number>
  talentTokens: number
  // phase 1
  gigId: string | null
  /** pre-assigned reel kinds for ages 13–16: exactly 2 "card" + 2 "minigame" */
  phase1Reel: ("card" | "minigame")[]
  /** index into phase1Reel consumed so far */
  phase1ReelCursor: number
  /** pending next-turn reveal from a skill action, e.g. "spin Tier 2 gig" */
  pendingReveal: PendingReveal | null
  // career
  careerId: CareerId | null
  qualifiedCareers: CareerId[]
  /** phase-2 Master-the-trade count (0–3) → phase-3 starting salary bump */
  qualificationRank: number
  /** completed phase-2 years */
  apprenticeshipYears: number
  /** +$8K/yr from Tool Up */
  hasTools: boolean
  // phase-3 economy
  /** 0 = rank default, -1 = downsized one bracket (cap −16% of default) */
  lifestyleBracketDelta: number
  ownsHome: boolean
  insured: boolean
  assets: AssetInstance[]
  debts: Debt[]
  /** 0..2 — +$4K/yr each (TRD-P02) */
  apprentices: number
  // power-ups
  hand: PowerUpCard[]
  /** earned permanent card ids (⭐) */
  permanents: string[]
  usedOncePerGame: string[]
  powerUpPlayedThisTurn: boolean
  // per-year / lasting modifiers
  blockedActions: PlayerActionId[]
  redTapeExpiresAge: number | null
  /** multiplicative salary modifier, reset at settle (injury, downturn, word-of-mouth) */
  salaryModThisYear: number
  /** Headhunt: +10% lifestyle until expiry age */
  headhuntExpiresAge: number | null
  /** Body Wears Down stacks: 0.9^n */
  permanentSalaryMult: number
  /** BUS-N02 outstanding: business income capped until $10K paid */
  staffQuitUnpaid: boolean
  hasWon: boolean
}

// ---- player actions ---------------------------------------------------------

export type PlayerActionId =
  // skill actions (all phases; phase-1 menu is exactly these four)
  | "invest"
  | "workHarder"
  | "hustle"
  | "study"
  // phase 2
  | "masterTrade"
  | "overtime"
  | "toolUp"
  // phase 3
  | "buyAsset"
  | "payDebt"
  | "insurance"
  | "buyHome"
  | "downsize"
  | "harvest"

export interface PendingReveal {
  kind: "promotion" | "gigSpin" | "jobSpin" | "investmentCard"
}

export interface ActionPayload {
  /** buyAsset */
  assetClassId?: AssetClassId
  /** invest deposit / payDebt amount / savings-index-shares purchase size */
  amount?: number
  /** payDebt: target debt or mortgaged asset */
  debtUid?: string
  assetUid?: string
  /** harvest: which asset to sell */
  sellUid?: string
}

export interface PowerUpPayload {
  targetPlayerId?: string
  targetAssetUid?: string
  /** Grant */
  skillId?: SkillId
}

// ---- spin -------------------------------------------------------------------

export type ReelKind = "life" | "career" | "market" | "minigame"

export interface AssetRoll {
  uid: string
  roll: "risk" | "opportunity" | "calm"
  /** drawn card code when roll !== "calm" */
  card: string | null
}

export interface SpinOutcome {
  /** card code, or null when reelKind === "minigame" */
  reelCard: string | null
  reelKind: ReelKind
  minigameId: MinigameId | null
  assetRolls: AssetRoll[]
}

// ---- game actions -------------------------------------------------------------

export type GameAction =
  | { type: "NEW_GAME"; players: { id: string; name: string; emoji: string }[]; seed: number }
  | { type: "CHOOSE_ACTION"; action: PlayerActionId; payload?: ActionPayload }
  | { type: "PLAY_POWERUP"; uid: string; payload?: PowerUpPayload }
  | { type: "RESOLVE_SPIN"; outcome: SpinOutcome; nextCursor: number }
  | { type: "MINIGAME_RESULT"; won: boolean }
  | { type: "REACTION"; play: boolean }
  | { type: "RESOLVE_CAREER_REEL" }
  | { type: "END_TURN" }
  | { type: "DISMISS_OVERLAY" }

// ---- pending reaction ---------------------------------------------------------

export interface PendingReaction {
  targetPlayerId: string
  trigger: {
    kind: "lifeCard" | "careerCard" | "assetEvent" | "powerUp"
    code: string
    assetUid?: string
    byPlayerId?: string
  }
  eligibleCardUids: string[]
}

// ---- settlement ----------------------------------------------------------------

export interface SettlementSummary {
  playerId: string
  salary: number
  passive: number
  lifestyle: number
  interest: number
  premiums: number
  saved: number
  assetChanges: { uid: string; classId: AssetClassId; delta: number }[]
  freedomPct: number
}

// ---- game state -----------------------------------------------------------------

export type TurnStage =
  | "action"
  | "spin"
  | "minigame"
  | "reaction"
  | "settle"
  | "careerReel"
  | "gameOver"

export interface GameState {
  schemaVersion: 1
  seed: number
  /** random draws consumed so far (replay support) */
  rngCursor: number
  players: Player[]
  /** per player id — players can be in different phases */
  phaseOf: Record<string, PhaseId>
  currentPlayerIndex: number
  turnStage: TurnStage
  pendingSpin: SpinOutcome | null
  pendingReaction: PendingReaction | null
  lastSettlement: SettlementSummary | null
  winnerId: string | null
  /** human-readable event feed, most recent first, capped at 50 */
  log: string[]
}
