// Dream Life — pure derivations over Player/GameState. No I/O, no randomness.
// The win condition, money maths and action legality all live here (spec §3, §7).

import type {
  AssetInstance,
  CareerId,
  GameState,
  Player,
  PlayerActionId,
} from "./types"
import { ASSET_CLASSES } from "./content/assets"
import {
  APPRENTICE_LIFESTYLE_PCT,
  APPRENTICE_PASSIVE,
  APPRENTICE_WAGES,
  CAREERS,
  DOWNSIZE_PCT,
  HOME_LIFESTYLE_SLICE,
  HOME_PRICE,
  INSURANCE_PREMIUM,
  QUALIFICATION_SALARY_BONUS,
  TOOL_UP_INCOME,
  TRADIE_RANKS,
} from "./content/careers"
import { HUSTLE_SALARY_CUT, PHASE1_GIGS, STUDY_SALARY_CUT } from "./content/phase1"
import {
  BB_DIVERSIFIED_GROWTH,
  BB_DIVERSIFIED_MIN_TYPES,
  GR_SIDE_HUSTLE,
  MS_FEE_CUT_PCT,
  MS_GROWTH_BONUS,
  MS_INCOME_BONUS,
  PS_BONUS_AT,
  PS_CHAIRMAN_PASSIVE,
  PS_FLAT_SALARY_TOTAL,
} from "./content/skills"

// ---- asset maths ---------------------------------------------------------------

export interface EffectiveRates {
  growth: number
  income: number
  operating: number
  interest: number
}

export function effectiveRates(p: Player, a: AssetInstance): EffectiveRates {
  const cls = ASSET_CLASSES[a.classId]
  let growth = cls.growthRate
  let income = cls.incomeRate
  let operating = cls.operatingRate
  let interest = cls.mortgageRate

  for (const m of a.modifiers) {
    if (m.field === "growthRate") growth += m.delta
    else if (m.field === "incomeRate") income += m.delta
    else if (m.field === "operatingRate") operating += m.delta
    else if (m.field === "interestRate") interest += m.delta
  }

  // skills & permanents
  if (p.skills.moneySmarts >= 6) growth += MS_GROWTH_BONUS // MS-L06 Sharper Eye
  if (p.skills.bigBrain >= 6 && assetTypeCount(p) >= BB_DIVERSIFIED_MIN_TYPES)
    growth += BB_DIVERSIFIED_GROWTH // BB-L06 Planner
  if (p.permanents.includes("PER-02")) growth += 0.02 // 💎 Golden Touch
  if (p.skills.moneySmarts >= 10 && cls.incomeRate > 0) income += MS_INCOME_BONUS // MS-L10
  if (p.skills.moneySmarts >= 4) operating *= 1 - MS_FEE_CUT_PCT // MS-L04 Fee Cut
  if (a.classId === "business" && p.staffQuitUnpaid) income = Math.min(income, 0.12) // BUS-N02

  return {
    growth,
    income: Math.max(0, income),
    operating: Math.max(0, operating),
    interest: Math.max(0, interest),
  }
}

export function assetTypeCount(p: Player): number {
  return new Set(p.assets.map(a => a.classId)).size
}

/** Annual net cash this asset pays (negative = you pay to hold it). */
export function assetNetCash(p: Player, a: AssetInstance): number {
  const r = effectiveRates(p, a)
  return Math.round(a.value * (r.income - r.operating) - a.loanBalance * r.interest)
}

// ---- income & expenses ------------------------------------------------------------

export function sideHustleIncome(p: Player): number {
  if (p.skills.grit >= 7) return GR_SIDE_HUSTLE[7]
  if (p.skills.grit >= 5) return GR_SIDE_HUSTLE[5]
  return 0
}

/** The number the win condition checks: annual cash from things that aren't your labour. */
export function passiveIncome(p: Player): number {
  let total = p.assets.reduce((s, a) => s + assetNetCash(p, a), 0)
  total += p.apprentices * APPRENTICE_PASSIVE
  total += sideHustleIncome(p)
  if (p.skills.proSkills >= 10) total += Math.round(currentRank(p).salary * PS_CHAIRMAN_PASSIVE) // PS-L10 Legacy
  return Math.round(total)
}

export function currentRank(p: Player) {
  const ps = p.skills.proSkills
  let rank = TRADIE_RANKS[0]
  for (const r of TRADIE_RANKS) if (ps >= r.psLevel) rank = r
  return rank
}

export function phase1Gig(p: Player) {
  return PHASE1_GIGS.find(g => g.id === p.gigId) ?? PHASE1_GIGS[0]
}

/** Gross salary for the year, before phase-1 action cuts (those apply in the engine). */
export function salaryOf(p: Player, phase: "phase1" | "phase2" | "phase3"): number {
  if (phase === "phase1") {
    const flat = PS_FLAT_SALARY_TOTAL[Math.min(p.skills.proSkills, 3)] ?? 0
    return phase1Gig(p).salary + flat
  }
  if (phase === "phase2") {
    const wage = APPRENTICE_WAGES[Math.min(p.apprenticeshipYears, APPRENTICE_WAGES.length - 1)]
    return wage + (p.hasTools ? TOOL_UP_INCOME : 0)
  }
  const rank = currentRank(p)
  let salary = rank.salary + p.qualificationRank * QUALIFICATION_SALARY_BONUS
  if (p.hasTools) salary += TOOL_UP_INCOME
  if (p.permanents.includes("PER-01")) salary = Math.round(salary * 1.1) // 🧰 Master Tradie
  const bonusPct =
    p.skills.proSkills >= 9 ? PS_BONUS_AT[9] : p.skills.proSkills >= 7 ? PS_BONUS_AT[7] : p.skills.proSkills >= 5 ? PS_BONUS_AT[5] : 0
  salary = Math.round(salary * (1 + bonusPct))
  salary = Math.round(salary * p.permanentSalaryMult * p.salaryModThisYear)
  return salary
}

export function lifestyleOf(p: Player, phase: "phase1" | "phase2" | "phase3"): number {
  if (phase === "phase1") {
    const gig = phase1Gig(p)
    return gig.salary - gig.net
  }
  if (phase === "phase2") {
    const wage = APPRENTICE_WAGES[Math.min(p.apprenticeshipYears, APPRENTICE_WAGES.length - 1)]
    return Math.round(wage * APPRENTICE_LIFESTYLE_PCT)
  }
  let lifestyle = currentRank(p).lifestyle
  if (p.lifestyleBracketDelta < 0) lifestyle *= 1 - DOWNSIZE_PCT // 🪙 Live Modestly
  if (p.ownsHome) lifestyle *= 1 - HOME_LIFESTYLE_SLICE // 🏡 own your home
  if (p.headhuntExpiresAge !== null && p.age < p.headhuntExpiresAge) lifestyle *= 1.1 // PWR-O03
  return Math.round(lifestyle)
}

/** Interest on unsecured debts only — asset mortgage interest is netted inside passiveIncome. */
export function debtInterest(p: Player): number {
  return Math.round(p.debts.reduce((s, d) => s + d.balance * d.rate, 0))
}

export function expensesOf(p: Player, phase: "phase1" | "phase2" | "phase3"): number {
  return lifestyleOf(p, phase) + debtInterest(p) + (p.insured ? INSURANCE_PREMIUM : 0)
}

/** Home excluded (you can't spend it) — spec §3. */
export function netWorth(p: Player): number {
  const assets = p.assets.reduce((s, a) => s + a.value - a.loanBalance, 0)
  const debts = p.debts.reduce((s, d) => s + d.balance, 0)
  return Math.round(p.cash + assets - debts)
}

export function freedomPct(p: Player): number {
  const exp = expensesOf(p, "phase3")
  if (exp <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((passiveIncome(p) / exp) * 100)))
}

export function hasWonCheck(p: Player): boolean {
  return passiveIncome(p) >= expensesOf(p, "phase3")
}

// ---- careers -----------------------------------------------------------------------

export function qualifiedCareers(p: Player): CareerId[] {
  return Object.values(CAREERS)
    .filter(c =>
      c.gate.kind === "skill"
        ? p.skills[c.gate.skill] >= c.gate.level
        : p.talentTokens >= c.gate.tokens
    )
    .map(c => c.id)
}

// ---- action legality (spec §4 safeguard: never empty) --------------------------------

export function legalActions(state: GameState): PlayerActionId[] {
  const p = state.players[state.currentPlayerIndex]
  const phase = state.phaseOf[p.id]

  if (phase === "phase1") {
    const out: PlayerActionId[] = ["invest", "workHarder"] // always free (spec §4)
    const gross = salaryOf(p, "phase1")
    const lifestyle = lifestyleOf(p, "phase1")
    const okAfterCut = (cut: number) => p.cash + Math.round(gross * (1 - cut)) - lifestyle >= 0
    if (okAfterCut(HUSTLE_SALARY_CUT)) out.push("hustle")
    if (okAfterCut(STUDY_SALARY_CUT)) out.push("study")
    return out.filter(a => !isBlocked(p, a))
  }

  if (phase === "phase2") {
    const out: PlayerActionId[] = ["masterTrade", "overtime", "invest"]
    if (!p.hasTools) out.push("toolUp")
    return out.filter(a => !isBlocked(p, a))
  }

  if (phase === "phase3") {
    const out: PlayerActionId[] = ["invest", "workHarder", "hustle", "study", "buyAsset", "harvest"]
    if (p.debts.length > 0 || p.assets.some(a => a.loanBalance > 0)) out.push("payDebt")
    out.push("insurance")
    if (!p.ownsHome && p.cash >= HOME_PRICE) out.push("buyHome")
    if (p.lifestyleBracketDelta === 0) out.push("downsize")
    return out.filter(a => !isBlocked(p, a))
  }

  return []
}

function isBlocked(p: Player, action: PlayerActionId): boolean {
  if (p.redTapeExpiresAge !== null && p.age >= p.redTapeExpiresAge) return false // expired
  return p.blockedActions.includes(action)
}
