import { describe, it, expect } from "vitest"
import type { GameState, Player } from "./types"
import { makeAsset, makePlayer } from "./testutils"
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

function stateWith(p: Player, phase: "phase1" | "phase2" | "phase3" = "phase1"): GameState {
  return {
    schemaVersion: 1,
    seed: 1,
    rngCursor: 0,
    players: [p],
    phaseOf: { [p.id]: phase },
    currentPlayerIndex: 0,
    turnStage: "action",
    pendingAction: null,
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
    const streams = passiveIncome(p) // apprentices + grit-L7 side hustle (balance-tunable)
    expect(streams).toBeGreaterThan(0)
    // top up with savings so passive EXACTLY equals expenses (lifestyle 44000, uninsured, no debt)
    const gap = 44_000 - streams
    p.assets = [makeAsset("savings", { value: gap / 0.04 })]
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
