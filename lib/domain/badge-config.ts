import type { BadgeCategory } from "@/lib/domain/types";

export const BADGE_META: Record<BadgeCategory, {
  icon: string;
  label: string;
  family: "task" | "streak" | "milestone";
  tierNames: { bronze: string; silver: string; gold: string };
}> = {
  champion:       { icon: "🧹", label: "Champion",      family: "task",      tierNames: { bronze: "Helping Hand",    silver: "Chore Crusher",     gold: "House Hero" } },
  athlete:        { icon: "🏃", label: "Athlete",        family: "task",      tierNames: { bronze: "Warm Up",         silver: "Power Player",      gold: "MVP" } },
  musician:       { icon: "🎵", label: "Musician",       family: "task",      tierNames: { bronze: "Beat Keeper",     silver: "Rhythm Rider",      gold: "Melody Master" } },
  self_care:      { icon: "✨", label: "Self Care",      family: "task",      tierNames: { bronze: "Fresh Start",     silver: "Glow Getter",       gold: "Level 100" } },
  explorer:       { icon: "🗺️", label: "Explorer",       family: "task",      tierNames: { bronze: "Curious Cat",     silver: "Adventure Seeker",  gold: "World Wanderer" } },
  scholar:        { icon: "📚", label: "Scholar",        family: "task",      tierNames: { bronze: "Bookworm",        silver: "Brain Box",         gold: "Genius" } },
  streak:         { icon: "🔥", label: "Streak",         family: "streak",    tierNames: { bronze: "Spark",           silver: "Flame",             gold: "Inferno" } },
  star_collector: { icon: "⭐", label: "Star Collector", family: "milestone", tierNames: { bronze: "Star Dust",       silver: "Star Burst",        gold: "Supernova" } },
  task_titan:     { icon: "⚡", label: "Task Titan",     family: "milestone", tierNames: { bronze: "Getting Started", silver: "Task Warrior",      gold: "Legend Status" } },
};

export const BADGE_THRESHOLDS: Record<BadgeCategory, { bronze: number; silver: number; gold: number }> = {
  champion:       { bronze: 7,   silver: 30,  gold: 75   },
  athlete:        { bronze: 7,   silver: 30,  gold: 75   },
  self_care:      { bronze: 7,   silver: 30,  gold: 75   },
  musician:       { bronze: 5,   silver: 20,  gold: 60   },
  explorer:       { bronze: 5,   silver: 20,  gold: 60   },
  scholar:        { bronze: 5,   silver: 25,  gold: 60   },
  streak:         { bronze: 3,   silver: 7,   gold: 30   },
  star_collector: { bronze: 50,  silver: 250, gold: 1000 },
  task_titan:     { bronze: 25,  silver: 100, gold: 500  },
};

export function getTierFromCount(category: BadgeCategory, count: number): "none" | "bronze" | "silver" | "gold" {
  const t = BADGE_THRESHOLDS[category];
  if (!t) return "none";
  if (count >= t.gold)   return "gold";
  if (count >= t.silver) return "silver";
  if (count >= t.bronze) return "bronze";
  return "none";
}

// Maps TaskCategory → BadgeCategory (only for incrementable task badges)
export const TASK_CATEGORY_TO_BADGE: Partial<Record<string, BadgeCategory>> = {
  chore:          "champion",
  exercise:       "athlete",
  music:          "musician",
  personal:       "self_care",
  activity:       "explorer",
  school_subject: "scholar",
};
