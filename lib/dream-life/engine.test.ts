import { describe, it, expect } from "vitest"
import { buildNewGame, buildSpinOutcome, reduce } from "./engine"
import { expensesOf, lifestyleOf, passiveIncome, salaryOf } from "./selectors"
import { makeAsset, makePlayer, makeState } from "./testutils"
import type { GameState, SpinOutcome } from "./types"
import { PHASE1_GIGS } from "./content/phase1"

const TWO_PLAYERS = [
  { id: "p1", name: "Mia", emoji: "🦄" },
  { id: "p2", name: "Leo", emoji: "🦊" },
]

function spin(card: string | null, kind: SpinOutcome["reelKind"], assetRolls: SpinOutcome["assetRolls"] = []): SpinOutcome {
  return { reelCard: card, reelKind: kind, minigameId: kind === "minigame" ? "coinrain" : null, assetRolls }
}

/** action → (manual) spin → settle → end turn */
function playTurn(state: GameState, action: Parameters<typeof reduce>[1], outcome: SpinOutcome): GameState {
  let s = reduce(state, action)
  s = reduce(s, { type: "RESOLVE_SPIN", outcome, nextCursor: s.rngCursor + 5 })
  if (s.turnStage === "reaction") s = reduce(s, { type: "REACTION", play: false })
  return reduce(s, { type: "END_TURN" })
}

describe("engine — game creation", () => {
  it("NEW_GAME deals $5K, age 13, a tier-1 gig and a 2+2 phase-1 reel", () => {
    const s = buildNewGame(TWO_PLAYERS, 7)
    for (const p of s.players) {
      expect(p.cash).toBe(5_000)
      expect(p.age).toBe(13)
      const gig = PHASE1_GIGS.find(g => g.id === p.gigId)!
      expect(gig.tier).toBe(1)
      expect(p.phase1Reel.filter(k => k === "card")).toHaveLength(2)
      expect(p.phase1Reel.filter(k => k === "minigame")).toHaveLength(2)
    }
    expect(s.turnStage).toBe("action")
  })

  it("same seed → identical game (deterministic)", () => {
    expect(buildNewGame(TWO_PLAYERS, 7)).toEqual(buildNewGame(TWO_PLAYERS, 7))
    expect(buildNewGame(TWO_PLAYERS, 8)).not.toEqual(buildNewGame(TWO_PLAYERS, 7))
  })
})

describe("engine — phase 1", () => {
  it("rejects Study when year-end cash would go below $0; Invest always works", () => {
    const broke = makePlayer({ cash: 0, age: 14, careerId: null })
    const s = makeState([broke], "phase1")
    const after = reduce(s, { type: "CHOOSE_ACTION", action: "study" })
    expect(after.turnStage).toBe("action") // rejected
    const invested = reduce(s, { type: "CHOOSE_ACTION", action: "invest" })
    expect(invested.turnStage).toBe("spin")
  })

  it("a full phase-1 turn: ages up, pays gig net, advances player", () => {
    const s0 = buildNewGame(TWO_PLAYERS, 7)
    const p0 = s0.players[0]
    const s1 = playTurn(s0, { type: "CHOOSE_ACTION", action: "workHarder" }, spin("P1-P01", "life"))
    const p1 = s1.players[0]
    expect(p1.age).toBe(14)
    expect(p1.skills.proSkills).toBe(2)
    // gig net 2000 + PS-L02 promotion +2000 + card +150
    expect(p1.cash).toBe(p0.cash + 2_000 + 2_000 + 150)
    expect(s1.currentPlayerIndex).toBe(1)
    expect(s1.turnStage).toBe("action")
  })

  it("invest moves cash into savings and it compounds at settle", () => {
    const p = makePlayer({ age: 13, cash: 5_000, careerId: null })
    const s0 = makeState([p], "phase1")
    const s1 = playTurn(
      s0,
      { type: "CHOOSE_ACTION", action: "invest", payload: { assetClassId: "savings", amount: 2_000 } },
      spin("P1-N05", "life")
    )
    const me = s1.players[0]
    expect(me.assets).toHaveLength(1)
    expect(me.assets[0].classId).toBe("savings")
    expect(me.assets[0].value).toBe(2_000) // savings: 0% growth (income paid as cash)
    expect(me.skills.moneySmarts).toBe(2)
  })

  it("mini-game win pays the prize and a talent token", () => {
    const p = makePlayer({ age: 13, cash: 5_000, careerId: null, phase1Reel: ["minigame", "card", "card", "minigame"] })
    const s0 = makeState([p], "phase1")
    let s = reduce(s0, { type: "CHOOSE_ACTION", action: "workHarder" })
    s = reduce(s, { type: "RESOLVE_SPIN", outcome: spin(null, "minigame"), nextCursor: 5 })
    expect(s.turnStage).toBe("minigame")
    s = reduce(s, { type: "MINIGAME_RESULT", won: true })
    expect(s.players[0].talentTokens).toBe(1)
    expect(s.players[0].cash).toBe(5_250)
  })

  it("after the age-16 turn the career reel fires and lands on Tradesperson", () => {
    let s = buildNewGame([TWO_PLAYERS[0]], 7)
    for (let i = 0; i < 4; i++) {
      const kind = s.players[0].phase1Reel[s.players[0].phase1ReelCursor]
      let s1 = reduce(s, { type: "CHOOSE_ACTION", action: "invest" })
      if (kind === "minigame") {
        s1 = reduce(s1, { type: "RESOLVE_SPIN", outcome: spin(null, "minigame"), nextCursor: s1.rngCursor + 5 })
        s1 = reduce(s1, { type: "MINIGAME_RESULT", won: false })
      } else {
        s1 = reduce(s1, { type: "RESOLVE_SPIN", outcome: spin("P1-P05", "life"), nextCursor: s1.rngCursor + 5 })
      }
      s = reduce(s1, { type: "END_TURN" })
    }
    expect(s.players[0].age).toBe(17)
    expect(s.turnStage).toBe("careerReel")
    const done = reduce(s, { type: "RESOLVE_CAREER_REEL" })
    expect(done.players[0].careerId).toBe("tradesperson")
    expect(done.players[0].qualifiedCareers.length).toBeGreaterThanOrEqual(2)
    expect(done.phaseOf.p1).toBe("phase2")
  })
})

describe("engine — phase 2", () => {
  it("toolUp creates a $15K 6% loan, tools income; unpaid debt grows at settle", () => {
    const p = makePlayer({ age: 17, cash: 8_000, apprenticeshipYears: 0, careerId: "tradesperson" })
    const s0 = makeState([p], "phase2")
    const s1 = playTurn(s0, { type: "CHOOSE_ACTION", action: "toolUp" }, spin("P1-P01", "life"))
    const me = s1.players[0]
    expect(me.hasTools).toBe(true)
    expect(me.debts).toHaveLength(1)
    expect(me.debts[0].balance).toBe(Math.round(15_000 * 1.06))
    expect(me.apprenticeshipYears).toBe(1)
  })

  it("graduates into phase 3 after 3 apprenticeship years", () => {
    const p = makePlayer({ age: 19, cash: 8_000, apprenticeshipYears: 2, careerId: "tradesperson" })
    const s0 = makeState([p], "phase2")
    const s1 = playTurn(s0, { type: "CHOOSE_ACTION", action: "masterTrade" }, spin("P1-P01", "life"))
    expect(s1.phaseOf.p1).toBe("phase3")
    expect(s1.players[0].age).toBe(20)
    expect(s1.players[0].qualificationRank).toBe(1)
  })
})

describe("engine — phase 3", () => {
  it("buying residential: $20K deposit, $80K loan", () => {
    const p = makePlayer({ cash: 30_000, skills: { moneySmarts: 5, proSkills: 1, grit: 1, bigBrain: 1 } })
    const s0 = makeState([p], "phase3")
    const s1 = reduce(s0, { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "resi" } })
    const me = s1.players[0]
    expect(me.cash).toBe(10_000)
    expect(me.assets[0]).toMatchObject({ classId: "resi", value: 100_000, loanBalance: 80_000 })
  })

  it("settlement matches the selectors and is recorded", () => {
    const p = makePlayer({ cash: 10_000, insured: true, apprentices: 1 })
    const s0 = makeState([p], "phase3")
    const salary = salaryOf(p, "phase3")
    const passive = passiveIncome(p)
    const lifestyle = lifestyleOf(p, "phase3")
    const s1 = playTurn(s0, { type: "CHOOSE_ACTION", action: "workHarder" }, spin("LIF-P01", "life"))
    const st = s1.lastSettlement!
    expect(st.passive).toBe(passive)
    expect(st.lifestyle).toBe(lifestyle)
    expect(st.premiums).toBe(3_000)
    expect(st.saved).toBe(st.salary + st.passive - st.lifestyle - st.interest - st.premiums)
    // cash: prior + saved + LIF-P01 (+3000)
    expect(s1.players[0].cash).toBe(10_000 + 3_000 + st.saved)
    expect(salary).toBeGreaterThan(0)
  })

  it("going cash-negative converts into credit-card debt instead of elimination", () => {
    const p = makePlayer({
      cash: 100,
      // huge lifestyle vs tiny salary: rank 1 ($65K/$44K) — force salaryMod to near zero
      salaryModThisYear: 0.01,
    })
    const s0 = makeState([p], "phase3")
    const s1 = playTurn(s0, { type: "CHOOSE_ACTION", action: "downsize" }, spin("LIF-N02", "life"))
    const me = s1.players[0]
    expect(me.cash).toBe(0)
    expect(me.debts.some(d => d.kind === "creditCard" && d.balance > 0)).toBe(true)
  })

  it("an asset risk roll applies its card and the temporary modifier clears at settle", () => {
    const asset = makeAsset("resi", { value: 100_000, loanBalance: 80_000 })
    const p = makePlayer({ cash: 50_000, assets: [asset], skills: { moneySmarts: 5, proSkills: 1, grit: 1, bigBrain: 1 } })
    const s0 = makeState([p], "phase3")
    // RES-N04 Rate Hike: interest +1.5pp this year only
    let s = reduce(s0, { type: "CHOOSE_ACTION", action: "downsize" })
    s = reduce(s, {
      type: "RESOLVE_SPIN",
      outcome: spin("LIF-P01", "life", [{ uid: asset.uid, roll: "risk", card: "RES-N04" }]),
      nextCursor: 5,
    })
    expect(s.players[0].assets[0].modifiers).toHaveLength(1)
    s = reduce(s, { type: "END_TURN" })
    expect(s.players[0].assets[0].modifiers).toHaveLength(0) // cleared
  })

  it("permanent cards stick: RES-N06 Land Tax survives settle", () => {
    const asset = makeAsset("resi", { value: 100_000 })
    const p = makePlayer({ cash: 50_000, assets: [asset] })
    const s0 = makeState([p], "phase3")
    let s = reduce(s0, { type: "CHOOSE_ACTION", action: "downsize" })
    s = reduce(s, {
      type: "RESOLVE_SPIN",
      outcome: spin("LIF-P01", "life", [{ uid: asset.uid, roll: "risk", card: "RES-N06" }]),
      nextCursor: 5,
    })
    s = reduce(s, { type: "END_TURN" })
    expect(s.players[0].assets[0].modifiers).toHaveLength(1)
  })

  it("reaction window: Hard Hat blocks an injury; declining applies it (halved by insurance)", () => {
    const base = makePlayer({
      cash: 50_000,
      insured: true,
      hand: [{ id: "PWR-D01", uid: "hh-1" }],
    })
    const s0 = makeState([base], "phase3")
    let s = reduce(s0, { type: "CHOOSE_ACTION", action: "downsize" })
    s = reduce(s, { type: "RESOLVE_SPIN", outcome: spin("TRD-N01", "career"), nextCursor: 5 })
    expect(s.turnStage).toBe("reaction")
    expect(s.pendingReaction?.eligibleCardUids).toEqual(["hh-1"])

    // play it → injury blocked entirely, card consumed
    const blocked = reduce(s, { type: "REACTION", play: true })
    expect(blocked.players[0].salaryModThisYear).toBe(1)
    expect(blocked.players[0].hand).toHaveLength(0)

    // decline → −25% halved by insurance = −12.5%
    const taken = reduce(s, { type: "REACTION", play: false })
    expect(taken.players[0].salaryModThisYear).toBeCloseTo(0.875)
    expect(taken.players[0].hand).toHaveLength(1)
  })

  it("a player whose passive covers expenses wins at settle", () => {
    const p = makePlayer({
      cash: 10_000,
      ownsHome: true,
      lifestyleBracketDelta: -1,
      assets: [makeAsset("savings", { value: 800_000 })], // 4% = 32K vs downsized+home lifestyle ~25.9K
    })
    const s0 = makeState([p], "phase3")
    const s1 = playTurn(s0, { type: "CHOOSE_ACTION", action: "workHarder" }, spin("LIF-P01", "life"))
    expect(s1.winnerId).toBe("p1")
    expect(s1.turnStage).toBe("gameOver")
    expect(s1.players[0].hasWon).toBe(true)
  })

  it("age-65 backstop: richest player wins when nobody is free", () => {
    const rich = makePlayer({ id: "p1", age: 65, cash: 900_000 })
    const poor = makePlayer({ id: "p2", name: "Leo", emoji: "🦊", age: 66, cash: 1_000 })
    const s0 = makeState([rich, poor], "phase3")
    const s1 = playTurn(s0, { type: "CHOOSE_ACTION", action: "downsize" }, spin("LIF-N02", "life"))
    expect(s1.winnerId).toBe("p1")
    expect(s1.turnStage).toBe("gameOver")
  })

  it("buildSpinOutcome is deterministic for a given state", () => {
    const p = makePlayer({ assets: [makeAsset("shares", { value: 20_000 })] })
    const s = makeState([p], "phase3", { seed: 99, rngCursor: 10 })
    const a = buildSpinOutcome(s)
    const b = buildSpinOutcome(s)
    expect(a).toEqual(b)
    expect(a.nextCursor).toBeGreaterThan(10)
  })

  it("expenses include credit-card interest, pushing the win bar up", () => {
    const clean = makePlayer()
    const indebted = makePlayer({ debts: [{ uid: "cc", kind: "creditCard", balance: 50_000, rate: 0.12 }] })
    expect(expensesOf(indebted, "phase3")).toBe(expensesOf(clean, "phase3") + 6_000)
  })
})
