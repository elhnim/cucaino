import { describe, it, expect } from "vitest"
import { SKILL_LADDERS, SKILL_IDS } from "./skills"
import { CAREERS, TRADIE_RANKS } from "./careers"
import { PHASE1_GIGS, PHASE1_CARDS } from "./phase1"
import { ASSET_CLASSES } from "./assets"
import { ASSET_DECKS, LIFE_DECK, TRADIE_DECK, MARKET_DECK, REEL_MIX } from "./decks"
import { POWERUPS, PERMANENTS } from "./powerups"

describe("content integrity", () => {
  it("every ladder has exactly 10 levels", () => {
    for (const id of SKILL_IDS) expect(SKILL_LADDERS[id].levels).toHaveLength(10)
  })

  it("12 careers with gates; tradesperson is the only built one", () => {
    const all = Object.values(CAREERS)
    expect(all).toHaveLength(12)
    expect(all.filter(c => c.built).map(c => c.id)).toEqual(["tradesperson"])
  })

  it("tradie lifestyle is sub-linear (smaller % of salary at higher ranks)", () => {
    const pcts = TRADIE_RANKS.map(r => r.lifestyle / r.salary)
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThan(pcts[i - 1])
  })

  it("phase-1 cards bounded ±$300", () => {
    for (const c of PHASE1_CARDS) expect(Math.abs(c.cashDelta)).toBeLessThanOrEqual(300)
  })

  it("8 tier-1 starting gigs", () => {
    expect(PHASE1_GIGS.filter(g => g.tier === 1)).toHaveLength(8)
  })

  it("asset opp+risk+calm = 100% for every class", () => {
    for (const a of Object.values(ASSET_CLASSES)) expect(a.opp + a.risk + a.calm).toBeCloseTo(1, 6)
  })

  it("every asset class has a negative and positive deck", () => {
    for (const id of Object.keys(ASSET_CLASSES) as (keyof typeof ASSET_DECKS)[]) {
      expect(ASSET_DECKS[id].negative.length).toBeGreaterThan(0)
      expect(ASSET_DECKS[id].positive.length).toBeGreaterThan(0)
    }
  })

  it("commercial is positively geared at purchase; resi negatively geared", () => {
    const resi = ASSET_CLASSES.resi
    const com = ASSET_CLASSES.commercial
    // net yield while mortgaged = income − operating − loanShare × mortgageRate
    const resiNet = resi.incomeRate - resi.operatingRate - (1 - resi.entry / resi.price!) * resi.mortgageRate
    const comNet = com.incomeRate - com.operatingRate - (1 - com.entry / com.price!) * com.mortgageRate
    expect(resiNet).toBeLessThan(0)
    expect(comNet).toBeGreaterThan(0)
  })

  it("crypto pays zero income", () => {
    expect(ASSET_CLASSES.crypto.incomeRate).toBe(0)
  })

  it("every offensive power-up has a counter", () => {
    for (const p of Object.values(POWERUPS).filter(p => p.offensive)) {
      expect(p.counteredBy.length).toBeGreaterThan(0)
    }
  })

  it("six permanents with milestones", () => {
    expect(Object.keys(PERMANENTS)).toHaveLength(6)
    for (const p of Object.values(PERMANENTS)) expect(p.milestone.length).toBeGreaterThan(0)
  })

  it("phase-3 reel mix sums to 1", () => {
    expect(REEL_MIX.life + REEL_MIX.career + REEL_MIX.market + REEL_MIX.minigame).toBeCloseTo(1, 6)
  })

  it("life/tradie decks have both sides; market deck hits everyone", () => {
    expect(LIFE_DECK.negative.length).toBeGreaterThan(0)
    expect(LIFE_DECK.positive.length).toBeGreaterThan(0)
    expect(TRADIE_DECK.negative.length).toBe(4)
    expect(TRADIE_DECK.positive.length).toBe(4)
    expect(MARKET_DECK.length).toBe(4)
  })

  it("all card codes are unique", () => {
    const codes = [
      ...Object.values(ASSET_DECKS).flatMap(d => [...d.negative, ...d.positive]),
      ...LIFE_DECK.negative, ...LIFE_DECK.positive,
      ...TRADIE_DECK.negative, ...TRADIE_DECK.positive,
      ...MARKET_DECK,
    ].map(c => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
