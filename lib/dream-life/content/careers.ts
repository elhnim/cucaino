// Dream Life — 12-career roster, gates, and the Tradesperson build (spec §5, §6, §7).

import type { CareerId, SkillId } from "../types"

export type CareerGate =
  | { kind: "skill"; skill: SkillId; level: number }
  | { kind: "talent"; tokens: number }

export interface CareerDef {
  id: CareerId
  emoji: string
  label: string
  gate: CareerGate
  /** built end-to-end in this version? */
  built: boolean
}

export const CAREERS: Record<CareerId, CareerDef> = {
  tradesperson: { id: "tradesperson", emoji: "🔧", label: "Tradesperson", gate: { kind: "skill", skill: "grit", level: 2 }, built: true },
  farmer: { id: "farmer", emoji: "🚜", label: "Farmer", gate: { kind: "skill", skill: "grit", level: 3 }, built: false },
  teacher: { id: "teacher", emoji: "👩‍🏫", label: "Teacher", gate: { kind: "skill", skill: "bigBrain", level: 2 }, built: false },
  doctor: { id: "doctor", emoji: "🩺", label: "Doctor", gate: { kind: "skill", skill: "bigBrain", level: 3 }, built: false },
  lawyer: { id: "lawyer", emoji: "⚖️", label: "Lawyer", gate: { kind: "skill", skill: "proSkills", level: 2 }, built: false },
  politician: { id: "politician", emoji: "🏛️", label: "Politician", gate: { kind: "skill", skill: "proSkills", level: 3 }, built: false },
  tycoon: { id: "tycoon", emoji: "💼", label: "Tycoon", gate: { kind: "skill", skill: "moneySmarts", level: 2 }, built: false },
  banker: { id: "banker", emoji: "📈", label: "Investment Banker", gate: { kind: "skill", skill: "moneySmarts", level: 3 }, built: false },
  artist: { id: "artist", emoji: "🎨", label: "Artist", gate: { kind: "talent", tokens: 1 }, built: false },
  influencer: { id: "influencer", emoji: "📱", label: "Influencer", gate: { kind: "talent", tokens: 1 }, built: false },
  athlete: { id: "athlete", emoji: "🏅", label: "Pro Athlete", gate: { kind: "talent", tokens: 2 }, built: false },
  musician: { id: "musician", emoji: "🎵", label: "Musician", gate: { kind: "talent", tokens: 2 }, built: false },
}

// ---- Tradesperson Phase-3 ranks (spec §7) ------------------------------------
// PS rungs 1–3 = rank 0; L4 = rank 1; L7 = rank 2; L9 = rank 3.
// Sub-linear lifestyle: 68% → 65% → 61% → 57% of salary.

export interface CareerRank {
  title: string
  salary: number
  lifestyle: number
  /** Pro Skills level at which this rank is reached */
  psLevel: number
}

export const TRADIE_RANKS: CareerRank[] = [
  { title: "Qualified Tradesperson", salary: 65_000, lifestyle: 44_000, psLevel: 1 },
  { title: "Licensed Specialist", salary: 85_000, lifestyle: 55_000, psLevel: 4 },
  { title: "Contractor", salary: 110_000, lifestyle: 67_000, psLevel: 7 },
  { title: "Master Contractor", salary: 150_000, lifestyle: 85_000, psLevel: 9 },
]

/** Each phase-2 "Master the trade" rank adds this to the phase-3 starting salary. */
export const QUALIFICATION_SALARY_BONUS = 5_000

// ---- Tradesperson apprenticeship (spec §6): 3 turns at ages 17, 18, 19 --------

export const APPRENTICE_WAGES = [28_000, 36_000, 45_000]
/** young & living cheap */
export const APPRENTICE_LIFESTYLE_PCT = 0.75
export const OVERTIME_PAY = 6_000
export const TOOL_UP_LOAN = 15_000
export const TOOL_UP_RATE = 0.06
export const TOOL_UP_INCOME = 8_000

// ---- housing & lifestyle levers (spec §7) --------------------------------------
export const HOME_PRICE = 180_000
/** share of lifestyle removed when you own your home */
export const HOME_LIFESTYLE_SLICE = 0.3
/** downsize cap: one bracket ≈ 18% below rank default */
export const DOWNSIZE_PCT = 0.18
export const INSURANCE_PREMIUM = 3_000
export const CREDIT_CARD_RATE = 0.12
export const APPRENTICE_PASSIVE = 4_000
export const PHASE3_START_AGE = 20
export const BACKSTOP_AGE = 65
