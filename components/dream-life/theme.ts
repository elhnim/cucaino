// Dream Life — shared style tokens (spec §15 design language: "bright dreamy day").

export const SKY_BG = {
  background: "linear-gradient(180deg, #4cc9ff 0%, #9f8bff 52%, #ffb46b 100%)",
}

export const HEADER_BG = { background: "linear-gradient(90deg, #ff8a3d, #ffb13d)" }

export const TOY_SHADOW = "0 6px 0 rgba(46,16,101,0.18)"
export const GOLD_GLOW = "0 4px 0 rgba(46,16,101,0.15), 0 0 16px rgba(255,217,61,0.8)"

export const PLAYER_GRADIENTS: Record<string, string> = {
  red: "from-red-400 to-red-600",
  blue: "from-blue-400 to-blue-600",
  green: "from-green-400 to-green-600",
  amber: "from-amber-400 to-amber-600",
}

export const SKILL_META = {
  moneySmarts: { emoji: "💰", label: "Money Smarts", grad: "from-amber-300 to-amber-500" },
  proSkills: { emoji: "🏆", label: "Pro Skills", grad: "from-blue-400 to-blue-600" },
  grit: { emoji: "🛡️", label: "Grit", grad: "from-green-400 to-green-600" },
  bigBrain: { emoji: "🧠", label: "Big Brain", grad: "from-violet-400 to-violet-600" },
} as const

export function fmtMoney(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? "−" : ""
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}K`
  if (abs >= 1_000) return `${sign}$${(abs / 1000).toFixed(1)}K`
  return `${sign}$${abs.toLocaleString()}`
}

export function fmtMoneyFull(n: number): string {
  return `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`
}
