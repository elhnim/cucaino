// Dream Life — Monte-Carlo balance sim (spec §12). Drives the REAL engine via vitest-free tsx import.
// Run: npx tsx scripts/dream-life-sim.mjs [games]
//
// Acceptance (spec §12):
//  1. every bot wins 15–35% of 2000 4-player games
//  2. luck share (seed-variance ÷ total variance of freedom age) ≤ 30%
//  3. median freedom age 33–47; backstop < 10% of games
//  4. zero illegal-action deadlocks

import { buildNewGame, buildSpinOutcome, reduce } from "../lib/dream-life/engine.ts"
import {
  expensesOf,
  freedomPct,
  hasWonCheck,
  legalActions,
  netWorth,
  passiveIncome,
} from "../lib/dream-life/selectors.ts"

const GAMES = Number(process.argv[2] ?? 2000)
const BOTS = ["earnerSaver", "investor", "entrepreneur", "tortoise"]

// ---------------------------------------------------------------- bot policies

function pickAction(state, botId) {
  const p = state.players[state.currentPlayerIndex]
  const phase = state.phaseOf[p.id]
  const legal = legalActions(state)
  const has = a => legal.includes(a)
  const liquid = p.cash

  if (phase === "phase1") {
    // all bots: shape phase 1 toward their identity
    if (botId === "entrepreneur") {
      // spread: work, hustle, invest, study (needs MS/PS/GR L4 eventually)
      const order = ["workHarder", "hustle", "invest", "study"]
      for (const a of order) if (has(a) && actionCount(p, a) < 1) return act(a, p)
      return act("invest", p)
    }
    if (botId === "earnerSaver") return has("workHarder") ? act("workHarder", p) : act("invest", p)
    if (botId === "investor") return act("invest", p)
    // tortoise: grit for cheap-living cred + invest
    return actionCount(p, "hustle") < 2 && has("hustle") ? act("hustle", p) : act("invest", p)
  }

  if (phase === "phase2") {
    if (botId === "entrepreneur" && has("toolUp")) return { type: "CHOOSE_ACTION", action: "toolUp" }
    if (botId === "tortoise") return { type: "CHOOSE_ACTION", action: "invest", payload: invSpec(p) }
    if (has("masterTrade") && p.qualificationRank < 2) return { type: "CHOOSE_ACTION", action: "masterTrade" }
    return { type: "CHOOSE_ACTION", action: "invest", payload: invSpec(p) }
  }

  // ---- phase 3 ----
  // common hygiene: insurance on, dig out of credit cards
  if (!p.insured && has("insurance")) return { type: "CHOOSE_ACTION", action: "insurance" }
  const cc = p.debts.find(d => d.kind === "creditCard")
  if (cc && liquid > 5_000 && has("payDebt"))
    return { type: "CHOOSE_ACTION", action: "payDebt", payload: { debtUid: cc.uid, amount: Math.min(liquid - 2_000, cc.balance) } }

  if (botId === "earnerSaver") {
    // climb to PS-L10 (Legacy passive) + home + savings income stack
    if (p.skills.proSkills < 10 && has("workHarder")) return { type: "CHOOSE_ACTION", action: "workHarder" }
    if (!p.ownsHome && has("buyHome")) return { type: "CHOOSE_ACTION", action: "buyHome" }
    if (liquid > 10_000 && has("buyAsset")) return { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "savings", amount: liquid - 5_000 } }
    return fallback(legal, p)
  }

  if (botId === "investor") {
    // accumulate (resi + shares) → commercial income → deleverage + harvest
    if (p.skills.moneySmarts < 7 && has("invest")) return { type: "CHOOSE_ACTION", action: "invest", payload: invSpec(p) }
    const mortgaged = p.assets.filter(a => a.loanBalance > 0)
    const shares = p.assets.find(a => a.classId === "shares")
    const hasCommercial = p.assets.some(a => a.classId === "commercial")
    if (!hasCommercial && shares && shares.value + liquid >= 95_000 && liquid < 95_000 && has("harvest"))
      return { type: "CHOOSE_ACTION", action: "harvest", payload: { sellUid: shares.uid } }
    if (!hasCommercial && liquid >= 95_000 && has("buyAsset"))
      return { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "commercial" } }
    if (p.age >= 32 && mortgaged.length > 0 && liquid > 15_000 && has("payDebt"))
      return { type: "CHOOSE_ACTION", action: "payDebt", payload: { assetUid: mortgaged[0].uid, amount: Math.min(liquid - 5_000, mortgaged[0].loanBalance) } }
    if (p.age < 32 && liquid >= 25_000 && p.assets.filter(a => a.classId === "resi").length < 2 && has("buyAsset"))
      return { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "resi" } }
    if (liquid > 15_000 && has("buyAsset")) return { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "shares", amount: liquid - 10_000 } }
    if (p.skills.proSkills < 4 && has("workHarder")) return { type: "CHOOSE_ACTION", action: "workHarder" }
    return fallback(legal, p)
  }

  if (botId === "entrepreneur") {
    if (p.skills.moneySmarts < 4 && has("invest")) return { type: "CHOOSE_ACTION", action: "invest", payload: invSpec(p) }
    if (p.skills.proSkills < 4 && has("workHarder")) return { type: "CHOOSE_ACTION", action: "workHarder" }
    if (p.skills.grit < 4 && has("hustle")) return { type: "CHOOSE_ACTION", action: "hustle" }
    const biz = p.assets.find(a => a.classId === "business")
    if (p.staffQuitUnpaid && liquid > 12_000) return { type: "CHOOSE_ACTION", action: "payDebt", payload: { amount: 10_000 } }
    if (!biz) {
      // liquidate the index runway once the gate is open and funds are close
      const idx = p.assets.find(a => a.classId === "index")
      if (liquid >= 125_000 && has("buyAsset")) return { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "business", amount: 120_000 } }
      if (idx && idx.value + liquid >= 130_000 && has("harvest")) return { type: "CHOOSE_ACTION", action: "harvest", payload: { sellUid: idx.uid } }
      if (liquid > 10_000 && has("buyAsset")) return { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "index", amount: liquid - 5_000 } }
      if (p.skills.proSkills < 7 && has("workHarder")) return { type: "CHOOSE_ACTION", action: "workHarder" }
      return fallback(legal, p)
    }
    // grow the business with every spare dollar
    if (liquid > 10_000 && has("buyAsset")) return { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "business", amount: liquid - 5_000 } }
    return fallback(legal, p)
  }

  // tortoise — shrink the bar, hustle for side income (grit identity), stack pure income
  if (p.lifestyleBracketDelta === 0 && has("downsize")) return { type: "CHOOSE_ACTION", action: "downsize" }
  if (p.skills.grit < 7 && has("hustle")) return { type: "CHOOSE_ACTION", action: "hustle" }
  if (p.skills.proSkills < 4 && has("workHarder")) return { type: "CHOOSE_ACTION", action: "workHarder" }
  if (!p.ownsHome && has("buyHome")) return { type: "CHOOSE_ACTION", action: "buyHome" }
  if (liquid > 6_000 && has("buyAsset"))
    return { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "savings", amount: liquid - 3_000 } }
  return fallback(legal, p)

  function act(a, pl) {
    if (a === "invest") return { type: "CHOOSE_ACTION", action: "invest", payload: invSpec(pl) }
    return { type: "CHOOSE_ACTION", action: a }
  }
}

function invSpec(p) {
  const cls = p.skills.moneySmarts >= 3 ? "shares" : p.skills.moneySmarts >= 2 ? "index" : "savings"
  const spare = Math.max(0, p.cash - 2_000)
  return spare >= 1_000 ? { assetClassId: cls, amount: spare } : undefined
}

function fallback(legal, p) {
  if (legal.includes("invest")) return { type: "CHOOSE_ACTION", action: "invest", payload: invSpec(p) }
  if (legal.length === 0) throw new Error("DEADLOCK: no legal actions")
  return { type: "CHOOSE_ACTION", action: legal[0] }
}

function actionCount(p, a) {
  // proxy: skill level − 1 equals times taken
  const map = { invest: "moneySmarts", workHarder: "proSkills", hustle: "grit", study: "bigBrain" }
  return p.skills[map[a]] - 1
}

// ---------------------------------------------------------------- game loop

function runGame(seed, botOrder) {
  let state = buildNewGame(
    botOrder.map((b, i) => ({ id: `${b}-${i}`, name: b, emoji: "🤖" })),
    seed
  )
  let guard = 0
  while (state.turnStage !== "gameOver") {
    if (++guard > 3_000) throw new Error("RUNAWAY GAME")
    const p = state.players[state.currentPlayerIndex]
    const bot = p.id.split("-")[0]

    if (state.turnStage === "careerReel") {
      state = reduce(state, { type: "RESOLVE_CAREER_REEL" })
      continue
    }
    if (state.turnStage === "action") {
      const before = state
      state = reduce(state, pickAction(state, bot))
      if (state === before) {
        // action rejected → safe fallback
        state = reduce(state, fallback(legalActions(state), p))
        if (state === before) throw new Error(`STUCK: ${bot} at age ${p.age}`)
      }
      continue
    }
    if (state.turnStage === "spin") {
      const { outcome, nextCursor } = buildSpinOutcome(state)
      state = reduce(state, { type: "RESOLVE_SPIN", outcome, nextCursor })
      continue
    }
    if (state.turnStage === "minigame") {
      // 50% win rate, cash only (power-ups excluded from sim per spec §12)
      const win = (state.rngCursor * 2654435761 % 100) < 50
      state = reduce(state, { type: "MINIGAME_RESULT", won: win })
      continue
    }
    if (state.turnStage === "reaction") {
      state = reduce(state, { type: "REACTION", play: false })
      continue
    }
    if (state.turnStage === "settle") {
      state = reduce(state, { type: "END_TURN" })
      continue
    }
    throw new Error(`Unknown stage ${state.turnStage}`)
  }
  const winner = state.players.find(pl => pl.id === state.winnerId)
  const backstop = !winner.hasWon
  return { winnerBot: winner.id.split("-")[0], freedomAge: winner.age, backstop }
}

// ---------------------------------------------------------------- run the batch

const wins = Object.fromEntries(BOTS.map(b => [b, 0]))
const agesByBot = Object.fromEntries(BOTS.map(b => [b, []]))
const agesBySeed = new Map()
let backstops = 0
let failures = 0

for (let g = 0; g < GAMES; g++) {
  const seed = 1000 + g
  // rotate seating so position doesn't bias
  const order = [...BOTS.slice(g % 4), ...BOTS.slice(0, g % 4)]
  try {
    const r = runGame(seed, order)
    wins[r.winnerBot]++
    agesByBot[r.winnerBot].push(r.freedomAge)
    if (r.backstop) backstops++
    const sk = seed % 50 // bucket seeds for variance decomposition
    if (!agesBySeed.has(sk)) agesBySeed.set(sk, [])
    agesBySeed.get(sk).push(r.freedomAge)
  } catch (e) {
    failures++
    if (failures <= 3) console.error(`game ${g}: ${e.message}`)
  }
}

// ---------------------------------------------------------------- stats

const allAges = Object.values(agesByBot).flat().sort((a, b) => a - b)
const median = allAges[Math.floor(allAges.length / 2)]
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1)
const variance = a => {
  const m = mean(a)
  return mean(a.map(x => (x - m) ** 2))
}
// luck share: between-seed-bucket variance ÷ total variance
const total = variance(allAges)
const grandMean = mean(allAges)
let between = 0
let n = 0
for (const ages of agesBySeed.values()) {
  between += ages.length * (mean(ages) - grandMean) ** 2
  n += ages.length
}
const luckShare = total > 0 ? between / n / total : 0

console.log(`\n=== Dream Life balance sim — ${GAMES} games ===`)
for (const b of BOTS) {
  const pct = ((wins[b] / GAMES) * 100).toFixed(1)
  const med = agesByBot[b].sort((x, y) => x - y)[Math.floor(agesByBot[b].length / 2)] ?? "—"
  console.log(`${b.padEnd(14)} win ${pct.padStart(5)}%   median freedom age ${med}`)
}
console.log(`median freedom age (all): ${median}`)
console.log(`backstop games: ${((backstops / GAMES) * 100).toFixed(1)}%`)
console.log(`luck share (seed variance): ${(luckShare * 100).toFixed(1)}%`)
console.log(`deadlocks/failures: ${failures}`)

const winPcts = BOTS.map(b => wins[b] / GAMES)
const pass =
  winPcts.every(w => w >= 0.15 && w <= 0.35) &&
  luckShare <= 0.3 &&
  median >= 33 && median <= 47 &&
  backstops / GAMES < 0.1 &&
  failures === 0
console.log(pass ? "\n✅ ACCEPTANCE PASSED" : "\n❌ ACCEPTANCE FAILED")
process.exit(pass ? 0 : 1)
