import { describe, it, expect } from "vitest"
import type { AssetInstance, GameState, Player } from "./types"
import {
  assetNetCash,
  expensesOf,
  freedomPct,
  hasWonCheck,
  legalActions,
  lifestyleOf,
  netWorth,
  passiveIncome,
  qualifiedCareers,
} from "./selectors"

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
    hasWon: false,
    ...over,
  }
}

export function makeAsset(classId: AssetInstance["classId"], over: Partial<AssetInstance> = {}): AssetInstance {
  return { uid: `a-${classId}`, classId, value: 10_000, loanBalance: 0, modifiers: [], ...over }
}

function stateWith(p: Player, phase: "phase1" | "phase2" | "phase3" = "phase1"): GameState {
  return {
    schemaVersion: 1,
    seed: 1,
    rngCursor: 0,
    players: [p],
    phaseOf: { [p.id]: phase },
    currentPlayerIndex: 0,
    turnStage: "action",
    pendingSpin: null,
    pendingReaction: null,
    lastSettlement: null,
    winnerId: null,
    log: [],
  }
}

describe("selectors", () => {
  it("negatively geared rental flips positive when paid off", () => {
    const p = makePlayer()
    const mortgaged = makeAsset("resi", { value: 100_000, loanBalance: 80_000 })
    const paidOff = makeAsset("resi", { value: 100_000, loanBalance: 0 })
    expect(assetNetCash(p, mortgaged)).toBeLessThan(0)
    expect(assetNetCash(p, paidOff)).toBeGreaterThan(0)
  })

  it("crypto contributes zero passive income", () => {
    const p = makePlayer({ assets: [makeAsset("crypto", { value: 50_000 })] })
    expect(passiveIncome(p)).toBe(0)
  })

  it("owning home removes 30% of lifestyle", () => {
    const renter = makePlayer()
    const owner = makePlayer({ ownsHome: true })
    expect(lifestyleOf(owner, "phase3")).toBe(Math.round(lifestyleOf(renter, "phase3") * 0.7))
  })

  it("phase-1 player always has a legal action, even broke", () => {
    const broke = makePlayer({ cash: 0, age: 14 })
    const acts = legalActions(stateWith(broke, "phase1"))
    expect(acts).toEqual(expect.arrayContaining(["invest", "workHarder"]))
    expect(acts).not.toContain("study") // -50% of $10K gig leaves -$3K vs $0 cash
  })

  it("win check is passive >= expenses (boundary wins)", () => {
    const p = makePlayer({ apprentices: 2, skills: { moneySmarts: 1, proSkills: 1, grit: 7, bigBrain: 1 } })
    // passive = 8000 (apprentices) + 12000 (side hustle) = 20000
    expect(passiveIncome(p)).toBe(20_000)
    // give exactly-covering savings: lifestyle 44000 → need 24000 more
    p.assets = [makeAsset("savings", { value: 600_000 })] // 4% = 24000
    expect(passiveIncome(p)).toBe(44_000)
    expect(expensesOf(p, "phase3")).toBe(44_000)
    expect(hasWonCheck(p)).toBe(true)
    expect(freedomPct(p)).toBe(100)
  })

  it("net worth excludes home, nets out loans and debts", () => {
    const p = makePlayer({
      cash: 10_000,
      ownsHome: true,
      assets: [makeAsset("resi", { value: 120_000, loanBalance: 70_000 })],
      debts: [{ uid: "d1", kind: "creditCard", balance: 5_000, rate: 0.12 }],
    })
    expect(netWorth(p)).toBe(10_000 + 50_000 - 5_000)
  })

  it("qualified careers respect skill and talent gates", () => {
    const p = makePlayer({ skills: { moneySmarts: 2, proSkills: 1, grit: 3, bigBrain: 1 }, talentTokens: 1 })
    const q = qualifiedCareers(p)
    expect(q).toEqual(expect.arrayContaining(["tradesperson", "farmer", "tycoon", "artist", "influencer"]))
    expect(q).not.toContain("doctor")
    expect(q).not.toContain("athlete")
  })
})
