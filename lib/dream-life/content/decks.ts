// Dream Life — all event decks, transcribed from spec §7 with their codes.
// Duration rule (spec §7): effects last THIS YEAR ONLY unless `permanent: true`.
// One-off cash/value changes simply apply once.

import type { AssetClassId } from "../types"

export type CardEffect =
  | { kind: "cash"; amount: number }
  | { kind: "valuePct"; pct: number } // asset value × (1+pct)
  | { kind: "rateDelta"; field: "incomeRate" | "operatingRate" | "interestRate"; delta: number }
  | { kind: "salaryPctThisYear"; pct: number } // e.g. -0.25 injury
  | { kind: "apprentice" } // TRD-P02 permanent +$4K/yr (max 2)
  | { kind: "permanentSalaryMult"; mult: number } // TRD-N04, stacks, age-gated
  | { kind: "staffQuit" } // BUS-N02: business income capped until $10K paid
  | { kind: "valuePctOrCash"; pct: number; classId: AssetClassId; cashFallback: number } // TRD-P03
  | { kind: "drawPowerUp" } // LIF-P04
  | { kind: "marketWide"; what: "marketCrash" | "propertyBoom" | "rateHike" | "rateCut" }

export interface EventCard {
  code: string
  emoji: string
  title: string
  blurb: string
  effect: CardEffect
  permanent?: true
  /** only drawn at/after this age (TRD-N04) */
  minAge?: number
  /** weight multiplier at/after age 40 (TRD-N01 fires 2× as often) */
  lateWeightFrom?: number
  /** insurance halves it; GR-L08 zeroes it (injury/illness tags) */
  tags?: ("injury" | "illness" | "insurable" | "scam")[]
}

export interface AssetDeck {
  negative: EventCard[]
  positive: EventCard[]
}

export const ASSET_DECKS: Record<AssetClassId, AssetDeck> = {
  savings: {
    negative: [
      { code: "SAV-N01", emoji: "📉", title: "Inflation Bite", blurb: "Prices crept up on you.", effect: { kind: "valuePct", pct: -0.02 } },
      { code: "SAV-N02", emoji: "🏦", title: "Bank Fee", blurb: "Sneaky account-keeping fees.", effect: { kind: "cash", amount: -200 } },
      { code: "SAV-N03", emoji: "✂️", title: "Rate Cut", blurb: "The bank cut your interest.", effect: { kind: "rateDelta", field: "incomeRate", delta: -0.02 } },
    ],
    positive: [
      { code: "SAV-P01", emoji: "🎁", title: "Bonus Interest", blurb: "Loyalty bonus month!", effect: { kind: "valuePct", pct: 0.03 } },
      { code: "SAV-P02", emoji: "📜", title: "Term Deposit Special", blurb: "You locked in a great rate.", effect: { kind: "rateDelta", field: "incomeRate", delta: 0.02 } },
      { code: "SAV-P03", emoji: "🪙", title: "Sign-up Reward", blurb: "New-customer bonus banked.", effect: { kind: "cash", amount: 300 } },
    ],
  },
  index: {
    negative: [
      { code: "IDX-N01", emoji: "📉", title: "Market Dip", blurb: "A wobble, not a worry.", effect: { kind: "valuePct", pct: -0.04 } },
      { code: "IDX-N02", emoji: "🌍", title: "Global Wobble", blurb: "Overseas news rattled the market.", effect: { kind: "valuePct", pct: -0.12 } },
      { code: "IDX-N03", emoji: "🔻", title: "Correction", blurb: "The market took a breather.", effect: { kind: "valuePct", pct: -0.15 } },
      { code: "IDX-N04", emoji: "✂️", title: "Dividend Cut", blurb: "Payouts paused this year.", effect: { kind: "rateDelta", field: "incomeRate", delta: -0.02 } },
    ],
    positive: [
      { code: "IDX-P01", emoji: "🐂", title: "Bull Run", blurb: "Everything went up!", effect: { kind: "valuePct", pct: 0.14 } },
      { code: "IDX-P02", emoji: "📈", title: "Steady Climb", blurb: "A beautiful, boring year.", effect: { kind: "valuePct", pct: 0.18 } },
      { code: "IDX-P03", emoji: "🎅", title: "Santa Rally", blurb: "A December surge!", effect: { kind: "valuePct", pct: 0.1 } },
      { code: "IDX-P04", emoji: "💰", title: "Dividend Boost", blurb: "Companies shared the love.", effect: { kind: "rateDelta", field: "incomeRate", delta: 0.01 } },
    ],
  },
  shares: {
    negative: [
      { code: "SHR-N01", emoji: "😬", title: "Earnings Miss", blurb: "The numbers disappointed.", effect: { kind: "valuePct", pct: -0.25 } },
      { code: "SHR-N02", emoji: "💥", title: "Sector Crash", blurb: "The whole industry tanked.", effect: { kind: "valuePct", pct: -0.3 } },
      { code: "SHR-N03", emoji: "📰", title: "Scandal", blurb: "Bad headlines, falling price.", effect: { kind: "valuePct", pct: -0.2 } },
      { code: "SHR-N04", emoji: "⚠️", title: "Profit Warning", blurb: "Next year looks rough, they said.", effect: { kind: "valuePct", pct: -0.15 } },
      { code: "SHR-N05", emoji: "✂️", title: "Dividend Slashed", blurb: "No payout this year.", effect: { kind: "rateDelta", field: "incomeRate", delta: -0.02 } },
    ],
    positive: [
      { code: "SHR-P01", emoji: "🚀", title: "Earnings Beat", blurb: "They smashed expectations!", effect: { kind: "valuePct", pct: 0.3 } },
      { code: "SHR-P02", emoji: "🤝", title: "Takeover Bid", blurb: "Someone wants to buy the company!", effect: { kind: "valuePct", pct: 0.4 } },
      { code: "SHR-P03", emoji: "🆕", title: "Product Launch", blurb: "The new thing is a hit.", effect: { kind: "valuePct", pct: 0.2 } },
      { code: "SHR-P04", emoji: "💝", title: "Special Dividend", blurb: "A surprise extra payout.", effect: { kind: "rateDelta", field: "incomeRate", delta: 0.01 } },
      { code: "SHR-P05", emoji: "♻️", title: "Buyback", blurb: "The company bought its own shares.", effect: { kind: "valuePct", pct: 0.12 } },
    ],
  },
  resi: {
    negative: [
      { code: "RES-N01", emoji: "🔨", title: "Major Repair", blurb: "The hot water system died.", effect: { kind: "valuePct", pct: -0.02 } },
      { code: "RES-N02", emoji: "🪧", title: "Vacancy", blurb: "Empty for a few months.", effect: { kind: "rateDelta", field: "incomeRate", delta: -0.02 } },
      { code: "RES-N03", emoji: "📉", title: "Housing Slump", blurb: "Prices cooled right off.", effect: { kind: "valuePct", pct: -0.08 } },
      { code: "RES-N04", emoji: "📈", title: "Rate Hike", blurb: "The bank raised your repayments.", effect: { kind: "rateDelta", field: "interestRate", delta: 0.015 } },
      { code: "RES-N05", emoji: "😤", title: "Bad Tenant", blurb: "Missed rent and a mess.", effect: { kind: "rateDelta", field: "incomeRate", delta: -0.03 } },
      { code: "RES-N06", emoji: "🏛️", title: "Land Tax", blurb: "A new yearly levy. Forever.", effect: { kind: "rateDelta", field: "operatingRate", delta: 0.01 }, permanent: true },
    ],
    positive: [
      { code: "RES-P01", emoji: "🏘️", title: "Area Booms", blurb: "Everyone wants to live here now!", effect: { kind: "valuePct", pct: 0.15 } },
      { code: "RES-P02", emoji: "😇", title: "Dream Tenant", blurb: "Pays early, mows the lawn.", effect: { kind: "rateDelta", field: "incomeRate", delta: 0.01 } },
      { code: "RES-P03", emoji: "🛠️", title: "Reno Adds Value", blurb: "A fresh kitchen paid off.", effect: { kind: "valuePct", pct: 0.1 } },
      { code: "RES-P04", emoji: "📈", title: "Rent Surge", blurb: "Rents jumped across town.", effect: { kind: "rateDelta", field: "incomeRate", delta: 0.02 } },
      { code: "RES-P05", emoji: "✂️", title: "Rate Cut", blurb: "Cheaper repayments this year.", effect: { kind: "rateDelta", field: "interestRate", delta: -0.01 } },
    ],
  },
  commercial: {
    negative: [
      { code: "COM-N01", emoji: "🕸️", title: "Long Vacancy", blurb: "No tenant. No rent. Brutal.", effect: { kind: "rateDelta", field: "incomeRate", delta: -0.08 } },
      { code: "COM-N02", emoji: "📦", title: "Tenant Downsizes", blurb: "They only need half the space.", effect: { kind: "rateDelta", field: "incomeRate", delta: -0.03 } },
      { code: "COM-N03", emoji: "📉", title: "Economic Downturn", blurb: "Business confidence slumped.", effect: { kind: "valuePct", pct: -0.12 } },
      { code: "COM-N04", emoji: "📈", title: "Rate Hike", blurb: "The loan just got pricier.", effect: { kind: "rateDelta", field: "interestRate", delta: 0.015 } },
      { code: "COM-N05", emoji: "🔧", title: "Re-fit Costs", blurb: "New tenant wanted a refit.", effect: { kind: "valuePct", pct: -0.02 } },
      { code: "COM-N06", emoji: "🏗️", title: "Oversupply", blurb: "Three new buildings next door.", effect: { kind: "valuePct", pct: -0.08 } },
    ],
    positive: [
      { code: "COM-P01", emoji: "📜", title: "Long Lease Signed", blurb: "Ten years of steady rent!", effect: { kind: "rateDelta", field: "incomeRate", delta: 0.01 } },
      { code: "COM-P02", emoji: "💎", title: "Blue-chip Tenant", blurb: "A big brand moved in.", effect: { kind: "rateDelta", field: "incomeRate", delta: 0.02 } },
      { code: "COM-P03", emoji: "🧾", title: "Rent Review", blurb: "CPI bump locked in.", effect: { kind: "rateDelta", field: "incomeRate", delta: 0.01 } },
      { code: "COM-P04", emoji: "🏙️", title: "Area Develops", blurb: "The precinct is thriving.", effect: { kind: "valuePct", pct: 0.12 } },
      { code: "COM-P05", emoji: "✂️", title: "Rate Cut", blurb: "Repayments eased off.", effect: { kind: "rateDelta", field: "interestRate", delta: -0.01 } },
    ],
  },
  crypto: {
    negative: [
      { code: "CRY-N01", emoji: "💥", title: "Crypto Crash", blurb: "Half of it. Gone. Overnight.", effect: { kind: "valuePct", pct: -0.5 } },
      { code: "CRY-N02", emoji: "🥶", title: "Bear Winter", blurb: "A long, cold slide.", effect: { kind: "valuePct", pct: -0.4 } },
      { code: "CRY-N03", emoji: "🏴‍☠️", title: "Exchange Hack", blurb: "The exchange got robbed.", effect: { kind: "valuePct", pct: -0.6 } },
      { code: "CRY-N04", emoji: "⚖️", title: "Regulation Crackdown", blurb: "New rules spooked everyone.", effect: { kind: "valuePct", pct: -0.35 } },
      { code: "CRY-N05", emoji: "🪤", title: "Rug Pull", blurb: "The founders vanished…", effect: { kind: "valuePct", pct: -0.8 } },
    ],
    positive: [
      { code: "CRY-P01", emoji: "🌕", title: "To the Moon", blurb: "It DOUBLED.", effect: { kind: "valuePct", pct: 1.0 } },
      { code: "CRY-P02", emoji: "🐂", title: "Bull Mania", blurb: "Everyone's buying in.", effect: { kind: "valuePct", pct: 0.7 } },
      { code: "CRY-P03", emoji: "⛏️", title: "Halving Pump", blurb: "Supply shock, price pop.", effect: { kind: "valuePct", pct: 0.5 } },
      { code: "CRY-P04", emoji: "📰", title: "Big Adoption News", blurb: "A mega-company now accepts it.", effect: { kind: "valuePct", pct: 0.4 } },
      { code: "CRY-P05", emoji: "🐋", title: "Whale Buys In", blurb: "Someone huge just loaded up.", effect: { kind: "valuePct", pct: 0.3 } },
    ],
  },
  business: {
    negative: [
      { code: "BUS-N01", emoji: "📉", title: "Recession Year", blurb: "Customers tightened their belts.", effect: { kind: "rateDelta", field: "incomeRate", delta: -0.12 } },
      { code: "BUS-N02", emoji: "🚪", title: "Key Staff Quits", blurb: "Your best person walked. Pay $10K to rehire.", effect: { kind: "staffQuit" } },
      { code: "BUS-N03", emoji: "⚖️", title: "Lawsuit", blurb: "Lawyers. Expensive ones.", effect: { kind: "cash", amount: -15_000 }, tags: ["insurable"] },
      { code: "BUS-N04", emoji: "🆚", title: "New Competitor", blurb: "They opened across the road.", effect: { kind: "valuePct", pct: -0.15 } },
      { code: "BUS-N05", emoji: "🔧", title: "Equipment Failure", blurb: "The main machine died mid-rush.", effect: { kind: "cash", amount: -8_000 } },
    ],
    positive: [
      { code: "BUS-P01", emoji: "🚀", title: "Breakout Year", blurb: "Everything clicked!", effect: { kind: "valuePct", pct: 0.25 } },
      { code: "BUS-P02", emoji: "📝", title: "Big Contract", blurb: "A huge client signed on.", effect: { kind: "cash", amount: 20_000 } },
      { code: "BUS-P03", emoji: "🏪", title: "Franchise Offer", blurb: "They want to copy your model.", effect: { kind: "valuePct", pct: 0.2 } },
      { code: "BUS-P04", emoji: "🌟", title: "Star Hire", blurb: "Your new manager is brilliant.", effect: { kind: "rateDelta", field: "operatingRate", delta: -0.02 }, permanent: true },
      { code: "BUS-P05", emoji: "📺", title: "Media Feature", blurb: "You're famous (locally)!", effect: { kind: "rateDelta", field: "incomeRate", delta: 0.02 } },
    ],
  },
}

// ---- universal life deck (phase 3) ------------------------------------------------

export const LIFE_DECK: { negative: EventCard[]; positive: EventCard[] } = {
  negative: [
    { code: "LIF-N01", emoji: "🤒", title: "Illness", blurb: "A rough few months off work.", effect: { kind: "cash", amount: -6_000 }, tags: ["illness", "insurable"] },
    { code: "LIF-N02", emoji: "🚗", title: "Car Trouble", blurb: "The mechanic sucked air through his teeth.", effect: { kind: "cash", amount: -3_000 }, tags: ["insurable"] },
    { code: "LIF-N03", emoji: "🧾", title: "Surprise Tax Bill", blurb: "The tax office found something.", effect: { kind: "cash", amount: -4_000 }, tags: ["insurable"] },
    { code: "LIF-N04", emoji: "📞", title: "Scam Call", blurb: "It sounded SO real…", effect: { kind: "cash", amount: -5_000 }, tags: ["scam", "insurable"] },
  ],
  positive: [
    { code: "LIF-P01", emoji: "💵", title: "Tax Refund", blurb: "A tidy little return.", effect: { kind: "cash", amount: 3_000 } },
    { code: "LIF-P02", emoji: "💌", title: "Inheritance", blurb: "Great-aunt Edna remembered you.", effect: { kind: "cash", amount: 10_000 } },
    { code: "LIF-P03", emoji: "🔥", title: "Side Gig Boom", blurb: "Your weekend hustle took off.", effect: { kind: "cash", amount: 5_000 } },
    { code: "LIF-P04", emoji: "🏅", title: "Community Award", blurb: "The town loves you — draw a power-up!", effect: { kind: "drawPowerUp" } },
  ],
}

// ---- market-wide events (hit EVERY player) -----------------------------------------

export const MARKET_DECK: EventCard[] = [
  { code: "MKT-N01", emoji: "🌐", title: "Global Crash", blurb: "Index, shares & crypto −20% for everyone!", effect: { kind: "marketWide", what: "marketCrash" } },
  { code: "MKT-N02", emoji: "🏦", title: "Rate Hike Cycle", blurb: "All mortgages +1% this year.", effect: { kind: "marketWide", what: "rateHike" } },
  { code: "MKT-P01", emoji: "🏘️", title: "Property Boom", blurb: "All property values +12% for everyone!", effect: { kind: "marketWide", what: "propertyBoom" } },
  { code: "MKT-P02", emoji: "✂️", title: "Rate Cut Cycle", blurb: "All mortgages −1% this year.", effect: { kind: "marketWide", what: "rateCut" } },
]

// ---- Tradesperson career deck (phase 3) --------------------------------------------

export const TRADIE_DECK: { negative: EventCard[]; positive: EventCard[] } = {
  negative: [
    { code: "TRD-N01", emoji: "🤕", title: "Injury On Site", blurb: "A bad year on the tools — salary −25%.", effect: { kind: "salaryPctThisYear", pct: -0.25 }, tags: ["injury", "insurable"], lateWeightFrom: 40 },
    { code: "TRD-N02", emoji: "💸", title: "Client Won't Pay", blurb: "The invoice ghosted you.", effect: { kind: "cash", amount: -8_000 }, tags: ["insurable"] },
    { code: "TRD-N03", emoji: "📉", title: "Construction Downturn", blurb: "Quiet sites, fewer jobs — salary −15%.", effect: { kind: "salaryPctThisYear", pct: -0.15 } },
    { code: "TRD-N04", emoji: "🦴", title: "Body Wears Down", blurb: "The knees keep the score. Salary −10% — forever.", effect: { kind: "permanentSalaryMult", mult: 0.9 }, permanent: true, minAge: 45, tags: ["injury"] },
  ],
  positive: [
    { code: "TRD-P01", emoji: "🏗️", title: "Big Tender Win", blurb: "You landed the big one!", effect: { kind: "cash", amount: 15_000 } },
    { code: "TRD-P02", emoji: "👷", title: "Take On An Apprentice", blurb: "+$4K/yr passive — they're good!", effect: { kind: "apprentice" }, permanent: true },
    { code: "TRD-P03", emoji: "🏚️", title: "Reno Flip", blurb: "Your skills, your profit.", effect: { kind: "valuePctOrCash", pct: 0.12, classId: "resi", cashFallback: 5_000 } },
    { code: "TRD-P04", emoji: "🗣️", title: "Word Of Mouth", blurb: "The whole suburb wants you — salary +10%.", effect: { kind: "salaryPctThisYear", pct: 0.1 } },
  ],
}

// ---- phase-3 reel mix (balance knobs, spec §7) ---------------------------------------
export const REEL_MIX = { life: 0.45, career: 0.3, market: 0.1, minigame: 0.15 } as const
