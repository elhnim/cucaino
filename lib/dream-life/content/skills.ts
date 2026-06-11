// Dream Life — the four skill ladders (spec §7).
// L1–L3 are the Phase-1 ladder; L4–L10 the Phase 2–3 extension.
// Numeric knobs used by the engine/selectors are exported as named constants so
// the balance sim can tune them in one place.

import type { SkillId } from "../types"

export interface SkillLevelDef {
  /** spec code, e.g. "MS-L04" */
  code: string
  name: string
  blurb: string
}

export interface SkillLadderDef {
  id: SkillId
  emoji: string
  label: string
  identity: string
  /** action that levels it */
  action: "invest" | "workHarder" | "hustle" | "study"
  levels: SkillLevelDef[] // exactly 10, index 0 = L1
}

// ---- tunable knobs (balance sim owns these) ---------------------------------
export const MS_FEE_CUT_PCT = 0.25 // MS-L04: all asset expenses −25%
export const MS_GROWTH_BONUS = 0.01 // MS-L06: +1pp value growth
export const MS_EVENT_SHRINK = 0.25 // MS-L08: 🔴 asset events 25% smaller
export const MS_INCOME_BONUS = 0.01 // MS-L10: +1pp income on income assets

export const PS_BONUS_AT = { 5: 0.05, 7: 0.08, 9: 0.12 } as const // yearly bonus % of salary
export const PS_STOCK_AT = { 6: 0.04, 9: 0.06 } as const // shares % of salary → net worth
export const PS_PURCHASE_DISCOUNT = 0.1 // PS-L08
export const PS_CHAIRMAN_PASSIVE = 0.1 // PS-L10: % of top-rank pay, passive for life

export const GR_LIFE_LOSS_SHRINK = 0.25 // GR-L04
export const GR_SIDE_HUSTLE = { 5: 6000, 7: 15000 } as const
export const GR_OFFENSIVE_SHIELD = 0.5 // GR-L06
export const GR_HUSTLE_PAY_BONUS = 0.5 // GR-L09

export const BB_DIVERSIFIED_GROWTH = 0.01 // BB-L06 (needs 3+ asset types)
export const BB_DIVERSIFIED_MIN_TYPES = 3

export const SKILL_LADDERS: Record<SkillId, SkillLadderDef> = {
  moneySmarts: {
    id: "moneySmarts",
    emoji: "💰",
    label: "Money Smarts",
    identity: "buy your way free",
    action: "invest",
    levels: [
      { code: "MS-L01", name: "Saver", blurb: "Buy Savings (4% income)" },
      { code: "MS-L02", name: "Fund Starter", blurb: "Buy Index Fund" },
      { code: "MS-L03", name: "Share Picker", blurb: "Buy Shares" },
      { code: "MS-L04", name: "Fee Cut", blurb: "All asset expenses −25% · unlocks 🏢 Business (with 🏆+🛡️ L4)" },
      { code: "MS-L05", name: "Landlord", blurb: "Buy Residential Property" },
      { code: "MS-L06", name: "Sharper Eye", blurb: "+1% value growth on all assets" },
      { code: "MS-L07", name: "Big League", blurb: "Buy Commercial Property" },
      { code: "MS-L08", name: "Steady Hand", blurb: "Every 🔴 asset event 25% smaller" },
      { code: "MS-L09", name: "Risk Taker", blurb: "Buy Crypto" },
      { code: "MS-L10", name: "Master Investor", blurb: "+1% income on all income assets" },
    ],
  },
  proSkills: {
    id: "proSkills",
    emoji: "🏆",
    label: "Pro Skills",
    identity: "climb your way free",
    action: "workHarder",
    levels: [
      { code: "PS-L01", name: "Worker", blurb: "Base salary" },
      { code: "PS-L02", name: "Senior", blurb: "+$2K/yr salary" },
      { code: "PS-L03", name: "Team Leader", blurb: "+$5K/yr salary total" },
      { code: "PS-L04", name: "Career Rank 2", blurb: "Licensed Specialist ($85K) · unlocks 🏢 Business (with 💰+🛡️ L4)" },
      { code: "PS-L05", name: "Bonus", blurb: "Yearly bonus = 10% of salary" },
      { code: "PS-L06", name: "Stock Options", blurb: "Free shares worth 8% of salary every year" },
      { code: "PS-L07", name: "Career Rank 3", blurb: "Contractor ($110K) · bonus 15%" },
      { code: "PS-L08", name: "Network", blurb: "All purchases −10%" },
      { code: "PS-L09", name: "Career Rank 4", blurb: "Master Contractor ($150K) · bonus 25%" },
      { code: "PS-L10", name: "Legacy", blurb: "30% of top pay becomes passive for life + 1-yr-salary parachute" },
    ],
  },
  grit: {
    id: "grit",
    emoji: "🛡️",
    label: "Grit",
    identity: "out-hustle your way free",
    action: "hustle",
    levels: [
      { code: "GR-L01", name: "Starter", blurb: "Tier 1 gigs (~$2K net)" },
      { code: "GR-L02", name: "Go-Getter", blurb: "Tier 2 gigs (~$10K net)" },
      { code: "GR-L03", name: "Grinder", blurb: "Tier 3 gigs (~$13K net)" },
      { code: "GR-L04", name: "Tough", blurb: "Bad life events hit 25% softer · unlocks 🏢 Business (with 💰+🏆 L4)" },
      { code: "GR-L05", name: "Side Hustle", blurb: "+$5K/yr guaranteed cash" },
      { code: "GR-L06", name: "Thick Skin", blurb: "Attack cards hit you at 50%" },
      { code: "GR-L07", name: "Hustle Empire", blurb: "Side Hustle rises to +$12K/yr" },
      { code: "GR-L08", name: "Hardened", blurb: "Injury & illness events have zero effect" },
      { code: "GR-L09", name: "Relentless", blurb: "Hustle & Overtime pay +50%" },
      { code: "GR-L10", name: "Unbreakable", blurb: "Once per game, reduce any single loss to $0" },
    ],
  },
  bigBrain: {
    id: "bigBrain",
    emoji: "🧠",
    label: "Big Brain",
    identity: "outsmart your way free",
    action: "study",
    levels: [
      { code: "BB-L01", name: "Learner", blurb: "Tier 1 gigs (~$2K net)" },
      { code: "BB-L02", name: "Bright Spark", blurb: "Tier 2 jobs (~$13K net)" },
      { code: "BB-L03", name: "Whiz Kid", blurb: "Tier 3 jobs (~$18K net)" },
      { code: "BB-L04", name: "Quick Learner", blurb: "Skill rewards arrive instantly · scam-proof" },
      { code: "BB-L05", name: "Foresight", blurb: "See next year's card before you act" },
      { code: "BB-L06", name: "Planner", blurb: "Holding 3+ asset types: all growth +1%" },
      { code: "BB-L07", name: "Researcher", blurb: "Once per turn, reroll a bad spin" },
      { code: "BB-L08", name: "Analyst", blurb: "See rivals' exact cash, worth, assets & hand" },
      { code: "BB-L09", name: "Strategist", blurb: "Each spin, draw 2 cards and keep either" },
      { code: "BB-L10", name: "Genius", blurb: "Once per game, take 2 actions in one year" },
    ],
  },
}

export const SKILL_IDS: SkillId[] = ["moneySmarts", "proSkills", "grit", "bigBrain"]

/** Phase-1 salary bumps from Work Harder (PS-L02/L03): total flat $ added to gig salary. */
export const PS_FLAT_SALARY_TOTAL: Record<number, number> = { 1: 0, 2: 2000, 3: 5000 }
