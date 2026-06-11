// Dream Life — master asset table (spec §7, LOCKED).
// All rates are annual, as a fraction of asset value.

import type { AssetClassId, SkillId } from "../types"

export interface AssetClassDef {
  id: AssetClassId
  emoji: string
  label: string
  personality: string
  /** unlock gate: single Money Smarts level, or the multi-skill Business gate */
  unlock:
    | { kind: "moneySmarts"; level: number }
    | { kind: "multiSkill"; levels: Partial<Record<SkillId, number>> }
  /** minimum cash in (deposit for leveraged classes, min buy otherwise) */
  entry: number
  /** full price for leveraged classes; equals entry for the rest (cash purchase = value) */
  price: number | null
  /** loan created at purchase = price − entry (0 when price === null) */
  mortgageRate: number
  growthRate: number
  incomeRate: number
  /** operating expenses excluding mortgage interest */
  operatingRate: number
  opp: number
  risk: number
  calm: number
}

export const ASSET_CLASSES: Record<AssetClassId, AssetClassDef> = {
  savings: {
    id: "savings", emoji: "🏦", label: "Savings", personality: "safe floor — never grows",
    unlock: { kind: "moneySmarts", level: 1 }, entry: 1_000, price: null, mortgageRate: 0,
    growthRate: 0, incomeRate: 0.04, operatingRate: 0,
    opp: 0.02, risk: 0.03, calm: 0.95,
  },
  index: {
    id: "index", emoji: "📊", label: "Index Fund", personality: "smooth wealth-builder",
    unlock: { kind: "moneySmarts", level: 2 }, entry: 2_000, price: null, mortgageRate: 0,
    growthRate: 0.07, incomeRate: 0.02, operatingRate: 0.005,
    opp: 0.15, risk: 0.12, calm: 0.73,
  },
  shares: {
    id: "shares", emoji: "📈", label: "Shares", personality: "concentrated growth bet",
    unlock: { kind: "moneySmarts", level: 3 }, entry: 3_000, price: null, mortgageRate: 0,
    growthRate: 0.09, incomeRate: 0.02, operatingRate: 0,
    opp: 0.28, risk: 0.25, calm: 0.47,
  },
  resi: {
    id: "resi", emoji: "🏠", label: "Residential Property", personality: "leverage & growth — pay it off to flip cash-positive",
    unlock: { kind: "moneySmarts", level: 5 }, entry: 20_000, price: 100_000, mortgageRate: 0.045,
    growthRate: 0.07, incomeRate: 0.05, operatingRate: 0.02,
    opp: 0.17, risk: 0.18, calm: 0.65,
  },
  commercial: {
    id: "commercial", emoji: "🏢", label: "Commercial Property", personality: "income play — positively geared from day one",
    unlock: { kind: "moneySmarts", level: 7 }, entry: 90_000, price: 300_000, mortgageRate: 0.055,
    growthRate: 0.04, incomeRate: 0.08, operatingRate: 0.01,
    opp: 0.16, risk: 0.22, calm: 0.62,
  },
  crypto: {
    id: "crypto", emoji: "₿", label: "Crypto", personality: "pure gamble — $0 income, grow then harvest",
    unlock: { kind: "moneySmarts", level: 9 }, entry: 1_000, price: null, mortgageRate: 0,
    growthRate: 0.11, incomeRate: 0, operatingRate: 0,
    opp: 0.38, risk: 0.4, calm: 0.22,
  },
  business: {
    id: "business", emoji: "🏭", label: "Business", personality: "the generalist's crown — best yield, riskiest income asset",
    unlock: { kind: "multiSkill", levels: { moneySmarts: 4, proSkills: 4, grit: 4 } },
    entry: 120_000, price: null, mortgageRate: 0,
    growthRate: 0.06, incomeRate: 0.14, operatingRate: 0.08,
    opp: 0.22, risk: 0.3, calm: 0.48,
  },
}

export const ASSET_CLASS_IDS = Object.keys(ASSET_CLASSES) as AssetClassId[]
