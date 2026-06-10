// Dream Life — power-up cards (spec §8, coded tables).
// One proactive per turn; reactive cards answer triggers via the pass-the-tablet window.

export type PowerUpTiming = "proactive" | "reactive"
export type PowerUpRarity = "common" | "uncommon"

export type PowerUpEffect =
  | { kind: "forceNegativeDraw" } // PWR-O01 Market Move (target asset risk ≥ 22%)
  | { kind: "stealCash"; amount: number } // PWR-O02 Lawsuit $8K, PWR-O08 Audit $5K (no steal — pay; see flag)
  | { kind: "payCash"; amount: number } // target pays the bank (Audit)
  | { kind: "lifestylePct"; pct: number; years: number } // PWR-O03 Headhunt
  | { kind: "shortSell"; cap: number } // PWR-O04
  | { kind: "poach" } // PWR-O05 remove apprentice/star-hire
  | { kind: "scandal" } // PWR-O06 business income halved this year
  | { kind: "redTape"; years: number } // PWR-O07
  | { kind: "jammer" } // PWR-O09 (reactive)
  | { kind: "blockEvent"; what: "lifeOrCareer" | "injuryIllness" | "assetEvent" } // D01–03
  | { kind: "doubleIncome" } // PWR-E01 one asset income ×2 this year
  | { kind: "forceOpportunity" } // PWR-E02 Hot Tip
  | { kind: "grantSkill" } // PWR-E03 +1 level, free
  | { kind: "taxBreak" } // PWR-E04 no lifestyle expense this year
  | { kind: "secondAction" } // PWR-W01
  | { kind: "copycat" } // PWR-W02

export interface PowerUpDef {
  id: string
  emoji: string
  label: string
  blurb: string
  timing: PowerUpTiming
  rarity: PowerUpRarity
  offensive: boolean
  effect: PowerUpEffect
  /** card ids that can answer it (offensive cards must have ≥1; Jammer answers Jammer-able plays) */
  counteredBy: string[]
  /** Reputation/Thick-Skin halve it? (cash-magnitude offensive cards) */
  shieldable: boolean
}

export const POWERUPS: Record<string, PowerUpDef> = {
  // 🎯 offensive
  "PWR-O01": { id: "PWR-O01", emoji: "😈", label: "Market Move", blurb: "Force a rival's risky asset to draw a bad card now.", timing: "proactive", rarity: "uncommon", offensive: true, effect: { kind: "forceNegativeDraw" }, counteredBy: ["PWR-D03", "PWR-O09"], shieldable: false },
  "PWR-O02": { id: "PWR-O02", emoji: "⚖️", label: "Lawsuit", blurb: "A rival pays you an $8K settlement.", timing: "proactive", rarity: "uncommon", offensive: true, effect: { kind: "stealCash", amount: 8_000 }, counteredBy: ["PWR-O09"], shieldable: true },
  "PWR-O03": { id: "PWR-O03", emoji: "🧲", label: "Headhunt", blurb: "A 'dream job' inflates a rival's lifestyle +10% for 2 years.", timing: "proactive", rarity: "uncommon", offensive: true, effect: { kind: "lifestylePct", pct: 0.1, years: 2 }, counteredBy: ["PWR-O09"], shieldable: true },
  "PWR-O04": { id: "PWR-O04", emoji: "📉", label: "Short Sell", blurb: "If a rival's asset falls this year, you pocket the fall (max $10K).", timing: "proactive", rarity: "uncommon", offensive: true, effect: { kind: "shortSell", cap: 10_000 }, counteredBy: ["PWR-O09"], shieldable: false },
  "PWR-O05": { id: "PWR-O05", emoji: "💼", label: "Poach", blurb: "Steal away a rival's apprentice or star hire.", timing: "proactive", rarity: "uncommon", offensive: true, effect: { kind: "poach" }, counteredBy: ["PWR-O09"], shieldable: true },
  "PWR-O06": { id: "PWR-O06", emoji: "🎭", label: "Scandal", blurb: "A rival's business income is halved this year.", timing: "proactive", rarity: "uncommon", offensive: true, effect: { kind: "scandal" }, counteredBy: ["PWR-O09"], shieldable: true },
  "PWR-O07": { id: "PWR-O07", emoji: "🚧", label: "Red Tape", blurb: "Block a rival's next asset buy or rank climb (2 years max).", timing: "proactive", rarity: "uncommon", offensive: true, effect: { kind: "redTape", years: 2 }, counteredBy: ["PWR-O09"], shieldable: false },
  "PWR-O08": { id: "PWR-O08", emoji: "🪤", label: "Audit", blurb: "A rival pays a surprise $5K expense.", timing: "proactive", rarity: "common", offensive: true, effect: { kind: "payCash", amount: 5_000 }, counteredBy: ["PWR-O09"], shieldable: true },
  "PWR-O09": { id: "PWR-O09", emoji: "🔌", label: "Jammer", blurb: "Cancel a power-up the moment it's played.", timing: "reactive", rarity: "uncommon", offensive: false, effect: { kind: "jammer" }, counteredBy: [], shieldable: false },
  // 🛡️ defensive
  "PWR-D01": { id: "PWR-D01", emoji: "🪖", label: "Hard Hat", blurb: "Block one bad life or career event that hits you.", timing: "reactive", rarity: "common", offensive: false, effect: { kind: "blockEvent", what: "lifeOrCareer" }, counteredBy: [], shieldable: false },
  "PWR-D02": { id: "PWR-D02", emoji: "🏥", label: "Safety Net", blurb: "Ignore the next injury or illness completely.", timing: "reactive", rarity: "common", offensive: false, effect: { kind: "blockEvent", what: "injuryIllness" }, counteredBy: [], shieldable: false },
  "PWR-D03": { id: "PWR-D03", emoji: "🔒", label: "Hedge", blurb: "Cancel one bad event on one of your assets.", timing: "reactive", rarity: "common", offensive: false, effect: { kind: "blockEvent", what: "assetEvent" }, counteredBy: [], shieldable: false },
  // 💰 economic
  "PWR-E01": { id: "PWR-E01", emoji: "⚡", label: "Double Down", blurb: "One asset's income is doubled this year.", timing: "proactive", rarity: "common", offensive: false, effect: { kind: "doubleIncome" }, counteredBy: [], shieldable: false },
  "PWR-E02": { id: "PWR-E02", emoji: "📈", label: "Hot Tip", blurb: "One asset's roll this year is guaranteed good.", timing: "proactive", rarity: "common", offensive: false, effect: { kind: "forceOpportunity" }, counteredBy: [], shieldable: false },
  "PWR-E03": { id: "PWR-E03", emoji: "🎟️", label: "Grant", blurb: "+1 level in any skill — without using your action.", timing: "proactive", rarity: "uncommon", offensive: false, effect: { kind: "grantSkill" }, counteredBy: [], shieldable: false },
  "PWR-E04": { id: "PWR-E04", emoji: "🧾", label: "Tax Break", blurb: "Pay no lifestyle costs this year (debt interest still due).", timing: "proactive", rarity: "uncommon", offensive: false, effect: { kind: "taxBreak" }, counteredBy: [], shieldable: false },
  // 🃏 wildcard
  "PWR-W01": { id: "PWR-W01", emoji: "➕", label: "Hustle", blurb: "Take a second action this year.", timing: "proactive", rarity: "uncommon", offensive: false, effect: { kind: "secondAction" }, counteredBy: [], shieldable: false },
  "PWR-W02": { id: "PWR-W02", emoji: "🎲", label: "Copycat", blurb: "Replay the last one-off card anyone played.", timing: "proactive", rarity: "uncommon", offensive: false, effect: { kind: "copycat" }, counteredBy: [], shieldable: false },
}

// ⭐ permanents — milestone-earned, always on, one of each per game (spec §8)
export interface PermanentDef {
  id: string
  emoji: string
  label: string
  blurb: string
  milestone: string
}

export const PERMANENTS: Record<string, PermanentDef> = {
  "PER-01": { id: "PER-01", emoji: "🧰", label: "Master Tradie", blurb: "+10% trade income forever", milestone: "Reach Contractor rank" },
  "PER-02": { id: "PER-02", emoji: "💎", label: "Golden Touch", blurb: "+2% on all investment returns", milestone: "Hold 4+ asset types" },
  "PER-03": { id: "PER-03", emoji: "🛡️", label: "Iron Body", blurb: "Immune to injury & illness events", milestone: "Survive 3 injury/illness events" },
  "PER-04": { id: "PER-04", emoji: "📊", label: "Steady Hand", blurb: "Assets lose half as much in any crash", milestone: "Hold through 2 crashes" },
  "PER-05": { id: "PER-05", emoji: "👑", label: "Reputation", blurb: "Attack cards hit you at 50%", milestone: "Reach Master rank" },
  "PER-06": { id: "PER-06", emoji: "🧲", label: "Dealmaker", blurb: "All purchases −5%", milestone: "Buy your home outright" },
}

/** draw weights by rarity (balance knob) */
export const RARITY_WEIGHT: Record<PowerUpRarity, number> = { common: 3, uncommon: 1 }
export const HAND_MAX = 3
