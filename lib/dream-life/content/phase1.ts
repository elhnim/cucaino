// Dream Life — Phase 1 (Teen Gigs) content: gigs, jobs, life cards, action costs (spec §4).

export interface GigDef {
  id: string
  emoji: string
  label: string
  /** gross yearly salary */
  salary: number
  /** salary − teen living costs; what actually lands in cash on a normal year */
  net: number
  tier: 1 | 2 | 3
  /** grit lane (gigs) or bigBrain lane (knowledge jobs) */
  lane: "gig" | "job"
}

export const PHASE1_GIGS: GigDef[] = [
  // Tier 1 — everyone starts here (random assignment), ~$10K salary / ~$2K net
  { id: "lemonade", emoji: "🍋", label: "Lemonade Stand", salary: 10_000, net: 2_000, tier: 1, lane: "gig" },
  { id: "dogwalker", emoji: "🐕", label: "Dog Walker", salary: 10_000, net: 2_000, tier: 1, lane: "gig" },
  { id: "paperround", emoji: "📰", label: "Paper Round", salary: 10_000, net: 2_000, tier: 1, lane: "gig" },
  { id: "gardenhelper", emoji: "🌱", label: "Garden Helper", salary: 10_000, net: 2_000, tier: 1, lane: "gig" },
  { id: "carwasher", emoji: "🧼", label: "Car Washer", salary: 10_000, net: 2_000, tier: 1, lane: "gig" },
  { id: "babysitter", emoji: "👶", label: "Babysitter", salary: 10_000, net: 2_000, tier: 1, lane: "gig" },
  { id: "groceryrunner", emoji: "🛒", label: "Grocery Runner", salary: 10_000, net: 2_000, tier: 1, lane: "gig" },
  { id: "stallhelper", emoji: "🧁", label: "Market Stall Helper", salary: 10_000, net: 2_000, tier: 1, lane: "gig" },
  // Tier 2 gigs (Grit L2) — ~$10K net
  { id: "pizzarunner", emoji: "🛵", label: "Pizza Runner", salary: 18_000, net: 10_000, tier: 2, lane: "gig" },
  { id: "poolcleaner", emoji: "🏊", label: "Pool Cleaner", salary: 18_000, net: 10_000, tier: 2, lane: "gig" },
  { id: "bikemech", emoji: "🔧", label: "Bike Mechanic", salary: 18_000, net: 10_000, tier: 2, lane: "gig" },
  // Tier 3 gigs (Grit L3) — ~$13K net
  { id: "labourer", emoji: "🏗️", label: "Labourer", salary: 22_000, net: 13_000, tier: 3, lane: "gig" },
  { id: "landscaper", emoji: "⛏️", label: "Landscaper", salary: 22_000, net: 13_000, tier: 3, lane: "gig" },
  // Tier 2 knowledge jobs (Big Brain L2) — ~$13K net
  { id: "tutor", emoji: "📚", label: "Tutor", salary: 20_000, net: 13_000, tier: 2, lane: "job" },
  { id: "labassist", emoji: "🔬", label: "Lab Assistant", salary: 20_000, net: 13_000, tier: 2, lane: "job" },
  // Tier 3 knowledge jobs (Big Brain L3) — ~$18K net
  { id: "juniordev", emoji: "🧑‍💻", label: "Junior Developer", salary: 26_000, net: 18_000, tier: 3, lane: "job" },
  { id: "datacruncher", emoji: "📊", label: "Data Cruncher", salary: 26_000, net: 18_000, tier: 3, lane: "job" },
]

export interface Phase1Card {
  code: string
  emoji: string
  title: string
  blurb: string
  cashDelta: number // bounded ±$300 (spec §4)
}

export const PHASE1_CARDS: Phase1Card[] = [
  { code: "P1-N01", emoji: "📱", title: "Cracked Phone Screen", blurb: "It slipped at the skate park. Ouch!", cashDelta: -220 },
  { code: "P1-N02", emoji: "🚲", title: "Flat Tyre", blurb: "Your bike needs a new tube and brakes.", cashDelta: -120 },
  { code: "P1-N03", emoji: "🎮", title: "Impulse Buy", blurb: "That game was NOT worth it.", cashDelta: -150 },
  { code: "P1-N04", emoji: "🦷", title: "Dentist Visit", blurb: "One filling. Less lollies next year!", cashDelta: -250 },
  { code: "P1-N05", emoji: "🌧️", title: "Rainy Month", blurb: "Work dried up for a few weekends.", cashDelta: -100 },
  { code: "P1-P01", emoji: "🎂", title: "Birthday Money", blurb: "Grandma came through again. 💜", cashDelta: 150 },
  { code: "P1-P02", emoji: "🏆", title: "Best Worker Award", blurb: "Your boss noticed your hustle!", cashDelta: 200 },
  { code: "P1-P03", emoji: "🪙", title: "Garage Sale Win", blurb: "Sold your old toys at a tidy profit.", cashDelta: 180 },
  { code: "P1-P04", emoji: "🍀", title: "Found a Tip Jar Bonus", blurb: "The customers loved you this summer.", cashDelta: 250 },
  { code: "P1-P05", emoji: "📦", title: "Recycling Refund", blurb: "All those bottles added up!", cashDelta: 100 },
]

// ---- action costs (spec §4) -----------------------------------------------------
export const STARTING_CASH = 5_000
export const PHASE1_START_AGE = 13
export const PHASE1_TURNS = 4
export const HUSTLE_SALARY_CUT = 0.2 // −20% off gross salary that year
export const STUDY_SALARY_CUT = 0.5 // −50% off gross salary that year
/** mini-game win pays ~this much in phase 1; losses cost nothing */
export const PHASE1_MINIGAME_PRIZE = 250
/** phase-3 mini-game: win = power-up + this cash */
export const PHASE3_MINIGAME_PRIZE = 2_000
