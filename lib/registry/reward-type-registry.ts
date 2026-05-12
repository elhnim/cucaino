import type { RewardType } from "@/lib/domain/types";

export interface RewardTypeDisplay {
  id: RewardType;
  label: string;
  emoji: string;
  /** Hex background for inline-style tiles and pills */
  bg: string;
  /** Hex text colour for inline-style tiles and pills */
  color: string;
  /** Tailwind bg class for solid coloured buttons */
  buttonClass: string;
}

export const REWARD_TYPES: RewardTypeDisplay[] = [
  { id: "treat",      label: "Treat",      emoji: "🍬", bg: "#fce7f3", color: "#9d174d", buttonClass: "bg-pink-600"  },
  { id: "privilege",  label: "Privilege",  emoji: "🔓", bg: "#ede9fe", color: "#5b21b6", buttonClass: "bg-violet-600" },
  { id: "experience", label: "Experience", emoji: "✨", bg: "#d1fae5", color: "#065f46", buttonClass: "bg-emerald-600" },
  { id: "prize",      label: "Prize",      emoji: "🎀", bg: "#fef3c7", color: "#92400e", buttonClass: "bg-amber-600" },
];

export function getRewardType(id: RewardType): RewardTypeDisplay {
  return REWARD_TYPES.find((t) => t.id === id) ?? REWARD_TYPES[0];
}
