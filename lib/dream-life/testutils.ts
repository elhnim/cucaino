// Shared test factories (not shipped to the client bundle — only imported by *.test.ts).

import type { AssetInstance, GameState, Player } from "./types"

export function makePlayer(over: Partial<Player> = {}): Player {
  return {
    id: "p1",
    name: "Mia",
    emoji: "🦄",
    color: "red",
    age: 27,
    cash: 20_000,
    skills: { moneySmarts: 1, proSkills: 1, grit: 1, bigBrain: 1 },
    talentTokens: 0,
    gigId: "lemonade",
    phase1Reel: ["card", "minigame", "card", "minigame"],
    phase1ReelCursor: 0,
    pendingReveal: null,
    careerId: "tradesperson",
    qualifiedCareers: [],
    qualificationRank: 0,
    apprenticeshipYears: 3,
    hasTools: false,
    lifestyleBracketDelta: 0,
    ownsHome: false,
    insured: false,
    assets: [],
    debts: [],
    apprentices: 0,
    hand: [],
    permanents: [],
    usedOncePerGame: [],
    powerUpPlayedThisTurn: false,
    blockedActions: [],
    redTapeExpiresAge: null,
    salaryModThisYear: 1,
    headhuntExpiresAge: null,
    permanentSalaryMult: 1,
    staffQuitUnpaid: false,
    hotTipAssetUid: null,
    doubleIncomeAssetUid: null,
    taxBreakThisYear: false,
    secondActionAvailable: false,
    injuriesSurvived: 0,
    crashesSurvived: 0,
    hasWon: false,
    ...over,
  }
}

export function makeAsset(
  classId: AssetInstance["classId"],
  over: Partial<AssetInstance> = {}
): AssetInstance {
  return { uid: `a-${classId}`, classId, value: 10_000, loanBalance: 0, modifiers: [], ...over }
}

export function makeState(
  players: Player[],
  phase: "phase1" | "phase2" | "phase3" | "careerReel" = "phase1",
  over: Partial<GameState> = {}
): GameState {
  return {
    schemaVersion: 1,
    seed: 42,
    rngCursor: 0,
    players,
    phaseOf: Object.fromEntries(players.map(p => [p.id, phase])),
    currentPlayerIndex: 0,
    turnStage: "action",
    pendingAction: null,
    pendingSpin: null,
    pendingReaction: null,
    lastSettlement: null,
    winnerId: null,
    log: [],
    ...over,
  }
}
