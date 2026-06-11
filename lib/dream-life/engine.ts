// Dream Life — pure game engine.
// `reduce` is a pure function: (state, action) → state. Every random draw happens in
// `buildSpinOutcome` / `buildNewGame` via the seeded RNG; results enter the reducer as
// action payloads, so games are deterministic and save/replay-safe.

import type {
  ActionPayload,
  AssetInstance,
  GameAction,
  GameState,
  MinigameId,
  Player,
  PlayerActionId,
  PowerUpPayload,
  ReelKind,
  SpinOutcome,
} from "./types"
import { drawsAt, weightedPick } from "./rng"
import { ASSET_CLASSES } from "./content/assets"
import {
  ASSET_DECKS,
  LIFE_DECK,
  MARKET_DECK,
  REEL_MIX,
  TRADIE_DECK,
  type CardEffect,
  type EventCard,
} from "./content/decks"
import {
  APPRENTICE_WAGES,
  BACKSTOP_AGE,
  CREDIT_CARD_RATE,
  DOWNSIZE_PCT,
  HOME_PRICE,
  OVERTIME_PAY,
  TOOL_UP_INCOME,
  TOOL_UP_LOAN,
  TOOL_UP_RATE,
  TRADIE_RANKS,
} from "./content/careers"
import {
  HUSTLE_SALARY_CUT,
  PHASE1_CARDS,
  PHASE1_GIGS,
  PHASE1_MINIGAME_PRIZE,
  PHASE1_START_AGE,
  PHASE3_MINIGAME_PRIZE,
  STARTING_CASH,
  STUDY_SALARY_CUT,
} from "./content/phase1"
import { GR_HUSTLE_PAY_BONUS, GR_LIFE_LOSS_SHRINK, MS_EVENT_SHRINK } from "./content/skills"
import { HAND_MAX, PERMANENTS, POWERUPS, RARITY_WEIGHT } from "./content/powerups"
import {
  assetTypeCount,
  currentRank,
  debtInterest,
  effectiveRates,
  expensesOf,
  freedomPct,
  hasWonCheck,
  legalActions,
  lifestyleOf,
  netWorth,
  passiveIncome,
  phase1Gig,
  qualifiedCareers,
  salaryOf,
} from "./selectors"

const COLORS = ["red", "blue", "green", "amber"] as const
const MINIGAMES: MinigameId[] = ["coinrain", "lemonsqueeze", "cashgrab", "petrush"]

let uidCounter = 0
function uid(prefix: string): string {
  uidCounter += 1
  return `${prefix}-${uidCounter}-${Math.abs((uidCounter * 2654435761) % 1e9)}`
}

// ---------------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------------

export function buildNewGame(
  players: { id: string; name: string; emoji: string }[],
  seed: number
): GameState {
  const tier1 = PHASE1_GIGS.filter(g => g.tier === 1)
  const draws = drawsAt(seed, 0, players.length * 5)
  let d = 0

  const built: Player[] = players.slice(0, 4).map((pl, i) => {
    const gig = tier1[Math.floor(draws[d++] * tier1.length)]
    // exactly 2 cards + 2 minigames, seeded-random order (spec §4)
    const reel: ("card" | "minigame")[] = ["card", "card", "minigame", "minigame"]
    for (let j = reel.length - 1; j > 0; j--) {
      const k = Math.floor(draws[d++] * (j + 1)) % (j + 1)
      ;[reel[j], reel[k]] = [reel[k], reel[j]]
    }
    return makePlayer(pl, COLORS[i % COLORS.length], gig.id, reel)
  })

  return {
    schemaVersion: 1,
    seed,
    rngCursor: players.length * 5,
    players: built,
    phaseOf: Object.fromEntries(built.map(p => [p.id, "phase1" as const])),
    currentPlayerIndex: 0,
    turnStage: "action",
    pendingAction: null,
    pendingSpin: null,
    pendingReaction: null,
    lastSettlement: null,
    winnerId: null,
    log: [`A new life begins! ${built.map(p => p.emoji).join(" ")}`],
  }
}

function makePlayer(
  pl: { id: string; name: string; emoji: string },
  color: Player["color"],
  gigId: string,
  phase1Reel: ("card" | "minigame")[]
): Player {
  return {
    id: pl.id,
    name: pl.name,
    emoji: pl.emoji,
    color,
    age: PHASE1_START_AGE,
    cash: STARTING_CASH,
    skills: { moneySmarts: 1, proSkills: 1, grit: 1, bigBrain: 1 },
    talentTokens: 0,
    gigId,
    phase1Reel,
    phase1ReelCursor: 0,
    pendingReveal: null,
    careerId: null,
    qualifiedCareers: [],
    qualificationRank: 0,
    apprenticeshipYears: 0,
    hasTools: false,
    lifestyleBracketDelta: 0,
    ownsHome: false,
    insured: false,
    assets: [],
    debts: [],
    apprentices: 0,
    hand: [],
    permanents: [],
    usedOncePerGame: [],
    powerUpPlayedThisTurn: false,
    blockedActions: [],
    redTapeExpiresAge: null,
    salaryModThisYear: 1,
    headhuntExpiresAge: null,
    permanentSalaryMult: 1,
    staffQuitUnpaid: false,
    hotTipAssetUid: null,
    doubleIncomeAssetUid: null,
    taxBreakThisYear: false,
    secondActionAvailable: false,
    injuriesSurvived: 0,
    crashesSurvived: 0,
    hasWon: false,
  }
}

// ---------------------------------------------------------------------------------
// Spin construction (the only other place randomness happens)
// ---------------------------------------------------------------------------------

export function buildSpinOutcome(state: GameState): { outcome: SpinOutcome; nextCursor: number } {
  const p = state.players[state.currentPlayerIndex]
  const phase = state.phaseOf[p.id]
  const draws = drawsAt(state.seed, state.rngCursor, 4 + p.assets.length)
  let d = 0
  const nextCursor = state.rngCursor + 4 + p.assets.length

  if (phase === "phase1") {
    const kind = p.phase1Reel[p.phase1ReelCursor] ?? "card"
    if (kind === "minigame") {
      return {
        outcome: {
          reelCard: null,
          reelKind: "minigame",
          minigameId: MINIGAMES[Math.floor(draws[d++] * MINIGAMES.length)],
          assetRolls: [],
        },
        nextCursor,
      }
    }
    const card = PHASE1_CARDS[Math.floor(draws[d++] * PHASE1_CARDS.length)]
    return {
      outcome: { reelCard: card.code, reelKind: "life", minigameId: null, assetRolls: [] },
      nextCursor,
    }
  }

  if (phase === "phase2") {
    const card = PHASE1_CARDS[Math.floor(draws[d++] * PHASE1_CARDS.length)]
    return {
      outcome: {
        reelCard: card.code,
        reelKind: "life",
        minigameId: null,
        assetRolls: rollAssets(p, draws, () => draws[d++]),
      },
      nextCursor,
    }
  }

  // phase 3
  const mixRoll = draws[d++]
  let reelKind: ReelKind
  if (mixRoll < REEL_MIX.life) reelKind = "life"
  else if (mixRoll < REEL_MIX.life + REEL_MIX.career) reelKind = "career"
  else if (mixRoll < REEL_MIX.life + REEL_MIX.career + REEL_MIX.market) reelKind = "market"
  else reelKind = "minigame"

  let reelCard: string | null = null
  let minigameId: MinigameId | null = null
  if (reelKind === "minigame") {
    minigameId = MINIGAMES[Math.floor(draws[d++] * MINIGAMES.length)]
  } else if (reelKind === "market") {
    reelCard = MARKET_DECK[Math.floor(draws[d++] * MARKET_DECK.length)].code
  } else {
    const deck = reelKind === "life" ? LIFE_DECK : TRADIE_DECK
    const negative = draws[d++] < 0.5
    const pool = (negative ? deck.negative : deck.positive).filter(
      c => c.minAge === undefined || p.age >= c.minAge
    )
    const card = weightedPick(
      pool,
      c => (c.lateWeightFrom !== undefined && p.age >= c.lateWeightFrom ? 2 : 1),
      draws[d++]
    )
    reelCard = card.code
  }

  return {
    outcome: { reelCard, reelKind, minigameId, assetRolls: rollAssets(p, draws, () => draws[d++]) },
    nextCursor,
  }
}

function rollAssets(p: Player, _draws: number[], next: () => number) {
  return p.assets.map(a => {
    const cls = ASSET_CLASSES[a.classId]
    const forced = p.hotTipAssetUid === a.uid
    const r = next()
    let roll: "risk" | "opportunity" | "calm"
    if (forced) roll = "opportunity"
    else if (r < cls.risk) roll = "risk"
    else if (r < cls.risk + cls.opp) roll = "opportunity"
    else roll = "calm"
    let card: string | null = null
    if (roll !== "calm") {
      const deck = roll === "risk" ? ASSET_DECKS[a.classId].negative : ASSET_DECKS[a.classId].positive
      card = deck[Math.floor(next() * deck.length)].code
    }
    return { uid: a.uid, roll, card }
  })
}

// ---------------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------------

export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "NEW_GAME":
      return buildNewGame(action.players, action.seed)
    case "CHOOSE_ACTION":
      return chooseAction(state, action.action, action.payload)
    case "PLAY_POWERUP":
      return playPowerUp(state, action.uid, action.payload)
    case "RESOLVE_SPIN":
      return resolveSpin(state, action.outcome, action.nextCursor)
    case "MINIGAME_RESULT":
      return minigameResult(state, action.won)
    case "REACTION":
      return resolveReaction(state, action.play)
    case "RESOLVE_CAREER_REEL":
      return resolveCareerReel(state)
    case "END_TURN":
      return endTurn(state)
    case "DISMISS_OVERLAY":
      return { ...state, lastSettlement: null }
    default:
      return state
  }
}

// ---- helpers ----------------------------------------------------------------------

function cur(state: GameState): Player {
  return state.players[state.currentPlayerIndex]
}

function patchPlayer(state: GameState, id: string, patch: Partial<Player>): GameState {
  return {
    ...state,
    players: state.players.map(p => (p.id === id ? { ...p, ...patch } : p)),
  }
}

function log(state: GameState, msg: string): GameState {
  return { ...state, log: [msg, ...state.log].slice(0, 50) }
}

function findCard(code: string): EventCard {
  if (code.startsWith("P1-")) {
    const p1 = PHASE1_CARDS.find(c => c.code === code)
    if (!p1) throw new Error(`Unknown card code: ${code}`)
    return {
      code: p1.code,
      emoji: p1.emoji,
      title: p1.title,
      blurb: p1.blurb,
      effect: { kind: "cash", amount: p1.cashDelta },
    }
  }
  const all: EventCard[] = [
    ...Object.values(ASSET_DECKS).flatMap(dk => [...dk.negative, ...dk.positive]),
    ...LIFE_DECK.negative,
    ...LIFE_DECK.positive,
    ...TRADIE_DECK.negative,
    ...TRADIE_DECK.positive,
    ...MARKET_DECK,
  ]
  const card = all.find(c => c.code === code)
  if (!card) throw new Error(`Unknown card code: ${code}`)
  return card
}

// ---- CHOOSE_ACTION ------------------------------------------------------------------

function chooseAction(state: GameState, actionId: PlayerActionId, payload?: ActionPayload): GameState {
  const p = cur(state)
  if (state.turnStage !== "action") return state
  if (!legalActions(state).includes(actionId)) return state

  let next = applyAction(state, p.id, actionId, payload)
  const after = next.players[next.currentPlayerIndex]

  // PWR-W01 second action: consume the flag instead of advancing to spin
  if (after.secondActionAvailable) {
    next = patchPlayer(next, after.id, { secondActionAvailable: false })
    next = { ...next, pendingAction: { action: actionId, payload } }
    return next
  }

  return { ...next, pendingAction: { action: actionId, payload }, turnStage: "spin" }
}

function applyAction(state: GameState, pid: string, actionId: PlayerActionId, payload?: ActionPayload): GameState {
  const p = state.players.find(pl => pl.id === pid)!
  const phase = state.phaseOf[pid]

  switch (actionId) {
    case "invest": {
      let next = patchPlayer(state, pid, {
        skills: { ...p.skills, moneySmarts: Math.min(10, p.skills.moneySmarts + 1) },
      })
      const amount = payload?.amount ?? 0
      if (amount > 0) next = buyLiquidAsset(next, pid, payload?.assetClassId ?? "savings", amount)
      return next
    }
    case "workHarder":
      return patchPlayer(state, pid, {
        skills: { ...p.skills, proSkills: Math.min(10, p.skills.proSkills + 1) },
        pendingReveal: { kind: "promotion" },
      })
    case "hustle":
      return patchPlayer(state, pid, {
        skills: { ...p.skills, grit: Math.min(10, p.skills.grit + 1) },
        pendingReveal: phase === "phase1" ? { kind: "gigSpin" } : null,
      })
    case "study":
      return patchPlayer(state, pid, {
        skills: { ...p.skills, bigBrain: Math.min(10, p.skills.bigBrain + 1) },
        pendingReveal: phase === "phase1" ? { kind: "jobSpin" } : null,
      })
    case "masterTrade":
      return patchPlayer(state, pid, { qualificationRank: Math.min(3, p.qualificationRank + 1) })
    case "overtime": {
      const bonus = p.skills.grit >= 9 ? 1 + GR_HUSTLE_PAY_BONUS : 1
      return patchPlayer(state, pid, { cash: p.cash + Math.round(OVERTIME_PAY * bonus) })
    }
    case "toolUp":
      return patchPlayer(state, pid, {
        cash: p.cash,
        hasTools: true,
        debts: [...p.debts, { uid: uid("debt"), kind: "tools", balance: TOOL_UP_LOAN, rate: TOOL_UP_RATE }],
      })
    case "buyAsset":
      return buyAsset(state, pid, payload)
    case "payDebt":
      return payDebt(state, pid, payload)
    case "insurance":
      return patchPlayer(state, pid, { insured: !p.insured })
    case "buyHome":
      if (p.cash < HOME_PRICE) return state
      return grantMilestone(patchPlayer(state, pid, { cash: p.cash - HOME_PRICE, ownsHome: true }), pid, "PER-06")
    case "downsize":
      return patchPlayer(state, pid, { lifestyleBracketDelta: -1 })
    case "harvest": {
      const asset = p.assets.find(a => a.uid === payload?.sellUid)
      if (!asset) return state
      const proceeds = Math.max(0, Math.round(asset.value - asset.loanBalance))
      return patchPlayer(state, pid, {
        cash: p.cash + proceeds,
        assets: p.assets.filter(a => a.uid !== asset.uid),
      })
    }
    default:
      return state
  }
}

function purchaseDiscount(p: Player): number {
  let mult = 1
  if (p.skills.proSkills >= 8) mult *= 0.9 // PS-L08 Network
  if (p.permanents.includes("PER-06")) mult *= 0.95 // 🧲 Dealmaker
  return mult
}

function buyLiquidAsset(state: GameState, pid: string, classId: AssetInstance["classId"], amount: number): GameState {
  const p = state.players.find(pl => pl.id === pid)!
  const cls = ASSET_CLASSES[classId]
  if (cls.price !== null) return state // leveraged classes go through buyAsset
  const spend = Math.min(amount, p.cash)
  if (spend < cls.entry) return state
  // extend an existing holding of the class, else create one
  const existing = p.assets.find(a => a.classId === classId)
  const assets = existing
    ? p.assets.map(a => (a.uid === existing.uid ? { ...a, value: a.value + spend } : a))
    : [...p.assets, { uid: uid(classId), classId, value: spend, loanBalance: 0, modifiers: [] }]
  return patchPlayer(state, pid, { cash: p.cash - spend, assets })
}

function buyAsset(state: GameState, pid: string, payload?: ActionPayload): GameState {
  const p = state.players.find(pl => pl.id === pid)!
  const classId = payload?.assetClassId
  if (!classId) return state
  const cls = ASSET_CLASSES[classId]

  // unlock gate
  if (cls.unlock.kind === "moneySmarts" && p.skills.moneySmarts < cls.unlock.level) return state
  if (cls.unlock.kind === "multiSkill") {
    for (const [skill, lvl] of Object.entries(cls.unlock.levels))
      if (p.skills[skill as keyof Player["skills"]] < (lvl ?? 0)) return state
  }

  if (cls.price === null) {
    const amount = Math.round((payload?.amount ?? cls.entry) * purchaseDiscount(p))
    return buyLiquidAsset(state, pid, classId, Math.max(cls.entry, amount))
  }

  const deposit = Math.round(cls.entry * purchaseDiscount(p))
  if (p.cash < deposit) return state
  const asset: AssetInstance = {
    uid: uid(classId),
    classId,
    value: cls.price,
    loanBalance: cls.price - cls.entry,
    modifiers: [],
  }
  let next = patchPlayer(state, pid, { cash: p.cash - deposit, assets: [...p.assets, asset] })
  // 💎 Golden Touch milestone: hold 4+ asset types
  if (assetTypeCount(next.players.find(pl => pl.id === pid)!) >= 4) next = grantMilestone(next, pid, "PER-02")
  return next
}

function payDebt(state: GameState, pid: string, payload?: ActionPayload): GameState {
  const p = state.players.find(pl => pl.id === pid)!
  const amount = Math.min(payload?.amount ?? 0, p.cash)
  if (amount <= 0) return state

  if (payload?.assetUid) {
    const asset = p.assets.find(a => a.uid === payload.assetUid)
    if (!asset || asset.loanBalance <= 0) return state
    const pay = Math.min(amount, asset.loanBalance)
    return patchPlayer(state, pid, {
      cash: p.cash - pay,
      assets: p.assets.map(a => (a.uid === asset.uid ? { ...a, loanBalance: a.loanBalance - pay } : a)),
    })
  }

  if (payload?.debtUid) {
    const debt = p.debts.find(d => d.uid === payload.debtUid)
    if (!debt) return state
    const pay = Math.min(amount, debt.balance)
    const debts = p.debts
      .map(d => (d.uid === debt.uid ? { ...d, balance: d.balance - pay } : d))
      .filter(d => d.balance > 0)
    return patchPlayer(state, pid, { cash: p.cash - pay, debts })
  }

  // staff-quit rehire fee
  if (p.staffQuitUnpaid && amount >= 10_000) {
    return patchPlayer(state, pid, { cash: p.cash - 10_000, staffQuitUnpaid: false })
  }
  return state
}

// ---- power-ups ------------------------------------------------------------------------

function drawPowerUp(state: GameState, pid: string): GameState {
  const p = state.players.find(pl => pl.id === pid)!
  if (p.hand.length >= HAND_MAX) return state
  const pool = Object.values(POWERUPS)
  const [r] = drawsAt(state.seed, state.rngCursor, 1)
  const card = weightedPick(pool, c => RARITY_WEIGHT[c.rarity], r)
  return {
    ...patchPlayer(state, pid, { hand: [...p.hand, { id: card.id, uid: uid("pw") }] }),
    rngCursor: state.rngCursor + 1,
  }
}

function grantMilestone(state: GameState, pid: string, perId: string): GameState {
  const p = state.players.find(pl => pl.id === pid)!
  if (p.permanents.includes(perId)) return state
  // one of each per game: nobody else may hold it either
  if (state.players.some(pl => pl.permanents.includes(perId))) return state
  const per = PERMANENTS[perId]
  return log(
    patchPlayer(state, pid, { permanents: [...p.permanents, perId] }),
    `${p.emoji} earned ${per.emoji} ${per.label}!`
  )
}

function playPowerUp(state: GameState, cardUid: string, payload?: PowerUpPayload): GameState {
  const p = cur(state)
  if (p.powerUpPlayedThisTurn) return state
  const held = p.hand.find(c => c.uid === cardUid)
  if (!held) return state
  const def = POWERUPS[held.id]
  if (!def || def.timing !== "proactive") return state

  let next = patchPlayer(state, p.id, {
    hand: p.hand.filter(c => c.uid !== cardUid),
    powerUpPlayedThisTurn: true,
  })
  next = log(next, `${p.emoji} played ${def.emoji} ${def.label}`)

  const target = payload?.targetPlayerId
    ? next.players.find(pl => pl.id === payload.targetPlayerId)
    : undefined
  const shield = (t: Player, amount: number) => {
    let a = amount
    if (def.shieldable && t.permanents.includes("PER-05")) a = Math.round(a * 0.5) // 👑 Reputation
    if (def.shieldable && t.skills.grit >= 6) a = Math.round(a * 0.5) // GR-L06 Thick Skin
    return a
  }

  switch (def.effect.kind) {
    case "stealCash": {
      if (!target) return state
      const amt = shield(target, def.effect.amount)
      next = patchPlayer(next, target.id, { cash: Math.max(0, target.cash - amt) })
      return patchPlayer(next, p.id, { cash: next.players.find(pl => pl.id === p.id)!.cash + amt })
    }
    case "payCash": {
      if (!target) return state
      return patchPlayer(next, target.id, { cash: Math.max(0, target.cash - shield(target, def.effect.amount)) })
    }
    case "lifestylePct": {
      if (!target) return state
      return patchPlayer(next, target.id, { headhuntExpiresAge: target.age + def.effect.years })
    }
    case "redTape": {
      if (!target) return state
      return patchPlayer(next, target.id, {
        blockedActions: ["buyAsset", "workHarder"],
        redTapeExpiresAge: target.age + def.effect.years,
      })
    }
    case "scandal": {
      if (!target) return state
      const biz = target.assets.find(a => a.classId === "business")
      if (!biz) return state
      const r = effectiveRates(target, biz)
      return patchPlayer(next, target.id, {
        assets: target.assets.map(a =>
          a.uid === biz.uid
            ? { ...a, modifiers: [...a.modifiers, { source: "PWR-O06", field: "incomeRate" as const, delta: -r.income / 2, permanent: false }] }
            : a
        ),
      })
    }
    case "poach": {
      if (!target) return state
      if (target.apprentices > 0) return patchPlayer(next, target.id, { apprentices: target.apprentices - 1 })
      const star = target.assets.find(a => a.modifiers.some(m => m.source === "BUS-P04"))
      if (star)
        return patchPlayer(next, target.id, {
          assets: target.assets.map(a =>
            a.uid === star.uid ? { ...a, modifiers: a.modifiers.filter(m => m.source !== "BUS-P04") } : a
          ),
        })
      return state
    }
    case "forceNegativeDraw": {
      if (!target || !payload?.targetAssetUid) return state
      const asset = target.assets.find(a => a.uid === payload.targetAssetUid)
      if (!asset || ASSET_CLASSES[asset.classId].risk < 0.22) return state
      const deck = ASSET_DECKS[asset.classId].negative
      const [r] = drawsAt(next.seed, next.rngCursor, 1)
      const card = deck[Math.floor(r * deck.length)]
      next = { ...next, rngCursor: next.rngCursor + 1 }
      return applyAssetEvent(next, target.id, asset.uid, card)
    }
    case "doubleIncome":
      return patchPlayer(next, p.id, { doubleIncomeAssetUid: payload?.targetAssetUid ?? null })
    case "forceOpportunity":
      return patchPlayer(next, p.id, { hotTipAssetUid: payload?.targetAssetUid ?? null })
    case "grantSkill": {
      if (!payload?.skillId) return state
      const me = next.players.find(pl => pl.id === p.id)!
      return patchPlayer(next, p.id, {
        skills: { ...me.skills, [payload.skillId]: Math.min(10, me.skills[payload.skillId] + 1) },
      })
    }
    case "taxBreak":
      return patchPlayer(next, p.id, { taxBreakThisYear: true })
    case "secondAction":
      return patchPlayer(next, p.id, { secondActionAvailable: true })
    case "shortSell":
    case "copycat":
    case "jammer":
    case "blockEvent":
      // shortSell settles at END_TURN (v1: applied as immediate cash on negative roll — simplified to no-op);
      // jammer/blockEvent are reactive (handled in the reaction window); copycat replays last one-off (v1: no-op).
      return next
    default:
      return next
  }
}

// ---- RESOLVE_SPIN ---------------------------------------------------------------------

function resolveSpin(state: GameState, outcome: SpinOutcome, nextCursor: number): GameState {
  if (state.turnStage !== "spin") return state
  const p = cur(state)
  let next: GameState = { ...state, rngCursor: nextCursor, pendingSpin: outcome }

  if (outcome.reelKind === "minigame") {
    return { ...next, turnStage: "minigame" }
  }

  // reaction window? only for negative reel cards the player can answer (spec §8 flow)
  if (outcome.reelCard) {
    const card = findCard(outcome.reelCard)
    const negative = isNegative(card)
    if (negative) {
      const eligible = p.hand.filter(c => {
        const def = POWERUPS[c.id]
        if (!def || def.timing !== "reactive") return false
        if (def.effect.kind !== "blockEvent") return false
        if (def.effect.what === "lifeOrCareer") return outcome.reelKind === "life" || outcome.reelKind === "career"
        if (def.effect.what === "injuryIllness") return !!card.tags?.some(t => t === "injury" || t === "illness")
        return false
      })
      if (eligible.length > 0) {
        return {
          ...next,
          turnStage: "reaction",
          pendingReaction: {
            targetPlayerId: p.id,
            trigger: { kind: outcome.reelKind === "career" ? "careerCard" : "lifeCard", code: card.code },
            eligibleCardUids: eligible.map(c => c.uid),
          },
        }
      }
    }
  }

  next = applySpinEffects(next, outcome, null)
  return { ...next, turnStage: "settle" }
}

function isNegative(card: EventCard): boolean {
  return /-(N)\d\d$/.test(card.code) || card.code.includes("-N")
}

function resolveReaction(state: GameState, play: boolean): GameState {
  const pr = state.pendingReaction
  if (!pr || !state.pendingSpin) return state
  const p = state.players.find(pl => pl.id === pr.targetPlayerId)!

  let next = state
  let skipCode: string | null = null
  if (play && pr.eligibleCardUids.length > 0) {
    const used = pr.eligibleCardUids[0]
    const def = POWERUPS[p.hand.find(c => c.uid === used)!.id]
    next = patchPlayer(next, p.id, { hand: p.hand.filter(c => c.uid !== used) })
    next = log(next, `${p.emoji} answered with ${def.emoji} ${def.label} — blocked!`)
    skipCode = pr.trigger.code
  }

  next = applySpinEffects({ ...next, pendingReaction: null }, next.pendingSpin!, skipCode)
  return { ...next, turnStage: "settle" }
}

function applySpinEffects(state: GameState, outcome: SpinOutcome, skipCode: string | null): GameState {
  const p = cur(state)
  let next = state

  if (outcome.reelCard && outcome.reelCard !== skipCode) {
    const card = findCard(outcome.reelCard)
    if (card.effect.kind === "marketWide") next = applyMarketWide(next, card)
    else next = applyCardToPlayer(next, p.id, card, "reel")
  }

  for (const roll of outcome.assetRolls) {
    if (roll.card && roll.card !== skipCode) {
      next = applyAssetEvent(next, p.id, roll.uid, findCard(roll.card))
    }
  }

  return { ...next, pendingSpin: outcome }
}

function scaleLoss(p: Player, card: EventCard, amount: number, source: "reel" | "asset"): number {
  if (amount >= 0) return amount
  let a = amount
  const injuryIllness = !!card.tags?.some(t => t === "injury" || t === "illness")
  if (injuryIllness && (p.skills.grit >= 8 || p.permanents.includes("PER-03"))) return 0 // GR-L08 / Iron Body
  if (card.tags?.includes("scam") && p.skills.bigBrain >= 4) return 0 // BB-L04 sees through it
  if (p.insured && card.tags?.includes("insurable")) a *= 0.5 // insurance halves
  if (source === "reel" && p.skills.grit >= 4) a *= 1 - GR_LIFE_LOSS_SHRINK // GR-L04 Tough
  if (source === "asset" && p.skills.moneySmarts >= 8) a *= 1 - MS_EVENT_SHRINK // MS-L08 Steady Hand
  return Math.round(a)
}

function applyCardToPlayer(state: GameState, pid: string, card: EventCard, source: "reel" | "asset"): GameState {
  const p = state.players.find(pl => pl.id === pid)!
  const e = card.effect
  let next = log(state, `${p.emoji} ${card.emoji} ${card.title}`)

  switch (e.kind) {
    case "cash": {
      const amt = scaleLoss(p, card, e.amount, source)
      const injured = !!card.tags?.some(t => t === "injury" || t === "illness")
      return patchPlayer(next, pid, {
        cash: p.cash + amt,
        injuriesSurvived: injured ? p.injuriesSurvived + 1 : p.injuriesSurvived,
      })
    }
    case "salaryPctThisYear": {
      let pct = e.pct
      const injured = !!card.tags?.some(t => t === "injury" || t === "illness")
      if (pct < 0 && injured && (p.skills.grit >= 8 || p.permanents.includes("PER-03"))) pct = 0
      else if (pct < 0 && p.insured && card.tags?.includes("insurable")) pct *= 0.5
      let np = patchPlayer(next, pid, {
        salaryModThisYear: p.salaryModThisYear * (1 + pct),
        injuriesSurvived: injured && pct < 0 ? p.injuriesSurvived + 1 : p.injuriesSurvived,
      })
      const me = np.players.find(pl => pl.id === pid)!
      if (me.injuriesSurvived >= 3) np = grantMilestone(np, pid, "PER-03") // 🛡️ Iron Body
      return np
    }
    case "permanentSalaryMult":
      return patchPlayer(next, pid, { permanentSalaryMult: p.permanentSalaryMult * e.mult })
    case "apprentice":
      return patchPlayer(next, pid, { apprentices: Math.min(2, p.apprentices + 1) })
    case "drawPowerUp":
      return drawPowerUp(next, pid)
    case "valuePctOrCash": {
      const target = p.assets.find(a => a.classId === e.classId)
      if (target) return applyValuePct(next, pid, target.uid, e.pct)
      return patchPlayer(next, pid, { cash: p.cash + e.cashFallback })
    }
    default:
      return next
  }
}

function applyValuePct(state: GameState, pid: string, assetUid: string, pct: number): GameState {
  const p = state.players.find(pl => pl.id === pid)!
  return patchPlayer(state, pid, {
    assets: p.assets.map(a => (a.uid === assetUid ? { ...a, value: Math.max(0, Math.round(a.value * (1 + pct))) } : a)),
  })
}

function applyAssetEvent(state: GameState, pid: string, assetUid: string, card: EventCard): GameState {
  const p = state.players.find(pl => pl.id === pid)!
  const asset = p.assets.find(a => a.uid === assetUid)
  if (!asset) return state
  const e = card.effect
  let next = log(state, `${p.emoji} ${ASSET_CLASSES[asset.classId].emoji} ${card.emoji} ${card.title}`)

  switch (e.kind) {
    case "valuePct": {
      let pct = e.pct
      if (pct < 0) {
        if (p.skills.moneySmarts >= 8) pct *= 1 - MS_EVENT_SHRINK // MS-L08
        if (p.permanents.includes("PER-04")) pct *= 0.5 // 📊 Steady Hand permanent
      }
      let np = applyValuePct(next, pid, assetUid, pct)
      if (pct <= -0.2) {
        const me = np.players.find(pl => pl.id === pid)!
        np = patchPlayer(np, pid, { crashesSurvived: me.crashesSurvived + 1 })
        if (me.crashesSurvived + 1 >= 2) np = grantMilestone(np, pid, "PER-04")
      }
      return np
    }
    case "cash":
      return patchPlayer(next, pid, { cash: p.cash + scaleLoss(p, card, e.amount, "asset") })
    case "rateDelta":
      return patchPlayer(next, pid, {
        assets: p.assets.map(a =>
          a.uid === assetUid
            ? {
                ...a,
                modifiers: [
                  ...a.modifiers,
                  { source: card.code, field: e.field === "interestRate" ? ("interestRate" as const) : e.field === "operatingRate" ? ("operatingRate" as const) : ("incomeRate" as const), delta: e.delta, permanent: card.permanent === true },
                ],
              }
            : a
        ),
      })
    case "staffQuit":
      return patchPlayer(next, pid, { staffQuitUnpaid: true })
    default:
      return next
  }
}

function applyMarketWide(state: GameState, card: EventCard): GameState {
  if (card.effect.kind !== "marketWide") return state
  const what = card.effect.what
  let next = log(state, `🌍 ${card.emoji} ${card.title}`)
  next = {
    ...next,
    players: next.players.map(p => {
      let assets = p.assets
      if (what === "marketCrash") {
        assets = assets.map(a => {
          if (a.classId === "index" || a.classId === "shares" || a.classId === "crypto") {
            let pct = -0.2
            if (p.permanents.includes("PER-04")) pct *= 0.5
            return { ...a, value: Math.round(a.value * (1 + pct)) }
          }
          return a
        })
      } else if (what === "propertyBoom") {
        assets = assets.map(a =>
          a.classId === "resi" || a.classId === "commercial" ? { ...a, value: Math.round(a.value * 1.12) } : a
        )
      } else {
        const delta = what === "rateHike" ? 0.01 : -0.01
        assets = assets.map(a =>
          a.loanBalance > 0
            ? { ...a, modifiers: [...a.modifiers, { source: card.code, field: "interestRate" as const, delta, permanent: false }] }
            : a
        )
      }
      const crashed = what === "marketCrash" && p.assets.some(a => ["index", "shares", "crypto"].includes(a.classId))
      return { ...p, assets, crashesSurvived: crashed ? p.crashesSurvived + 1 : p.crashesSurvived }
    }),
  }
  return next
}

// ---- minigame ----------------------------------------------------------------------------

function minigameResult(state: GameState, won: boolean): GameState {
  if (state.turnStage !== "minigame") return state
  const p = cur(state)
  const phase = state.phaseOf[p.id]
  let next = state

  if (won) {
    if (phase === "phase1") {
      next = patchPlayer(next, p.id, {
        cash: p.cash + PHASE1_MINIGAME_PRIZE,
        talentTokens: p.talentTokens + 1,
      })
      next = log(next, `${p.emoji} won the mini-game! +$${PHASE1_MINIGAME_PRIZE} + 🎟️`)
    } else {
      next = patchPlayer(next, p.id, { cash: p.cash + PHASE3_MINIGAME_PRIZE })
      next = drawPowerUp(next, p.id)
      next = log(next, `${p.emoji} won the mini-game! +$${PHASE3_MINIGAME_PRIZE} + a power-up`)
    }
  } else {
    next = log(next, `${p.emoji} missed the mini-game — nothing lost!`)
  }

  return { ...next, turnStage: "settle" }
}

// ---- END_TURN (settle the year) ---------------------------------------------------------

function endTurn(state: GameState): GameState {
  if (state.turnStage !== "settle" && state.turnStage !== "spin") return state
  const p = cur(state)
  const phase = state.phaseOf[p.id]
  if (phase !== "phase1" && phase !== "phase2" && phase !== "phase3") return state

  // 1) income & expenses
  let gross = salaryOf(p, phase)
  if (phase === "phase1" && state.pendingAction) {
    if (state.pendingAction.action === "hustle") gross = Math.round(gross * (1 - HUSTLE_SALARY_CUT))
    if (state.pendingAction.action === "study") gross = Math.round(gross * (1 - STUDY_SALARY_CUT))
  }
  const passive = phase === "phase3" ? passiveIncome(p) : p.assets.reduce((s, a) => s + assetNetCashSafe(p, a), 0)
  const lifestyle = p.taxBreakThisYear ? 0 : lifestyleOf(p, phase)
  const interest = debtInterest(p)
  const premiums = p.insured ? 3000 : 0
  const saved = gross + passive - lifestyle - interest - premiums

  let cash = p.cash + saved
  let debts = p.debts.map(d => ({ ...d, balance: Math.round(d.balance * (1 + d.rate)) }))
  if (cash < 0) {
    debts = [...debts, { uid: uid("cc"), kind: "creditCard" as const, balance: -cash, rate: CREDIT_CARD_RATE }]
    cash = 0
  }

  // 2) asset growth + PS-L06 stock options + modifier expiry
  const grownAssets = p.assets.map(a => {
    const r = effectiveRates(p, a)
    return {
      ...a,
      value: Math.max(0, Math.round(a.value * (1 + r.growth))),
      modifiers: a.modifiers.filter(m => m.permanent),
    }
  })
  let assets = grownAssets
  if (phase === "phase3" && p.skills.proSkills >= 6) {
    const grant = Math.round(currentRank(p).salary * (p.skills.proSkills >= 9 ? 0.12 : 0.08))
    const existing = assets.find(a => a.classId === "shares")
    assets = existing
      ? assets.map(a => (a.uid === existing.uid ? { ...a, value: a.value + grant } : a))
      : [...assets, { uid: uid("shares"), classId: "shares" as const, value: grant, loanBalance: 0, modifiers: [] }]
  }

  const settledAge = p.age
  let next = patchPlayer(state, p.id, {
    cash,
    debts,
    assets,
    age: p.age + 1,
    salaryModThisYear: 1,
    taxBreakThisYear: false,
    hotTipAssetUid: null,
    doubleIncomeAssetUid: null,
    powerUpPlayedThisTurn: false,
    phase1ReelCursor: phase === "phase1" ? p.phase1ReelCursor + 1 : p.phase1ReelCursor,
    apprenticeshipYears: phase === "phase2" ? p.apprenticeshipYears + 1 : p.apprenticeshipYears,
    headhuntExpiresAge: p.headhuntExpiresAge !== null && p.age + 1 >= p.headhuntExpiresAge ? null : p.headhuntExpiresAge,
    blockedActions: p.redTapeExpiresAge !== null && p.age + 1 >= p.redTapeExpiresAge ? [] : p.blockedActions,
    redTapeExpiresAge: p.redTapeExpiresAge !== null && p.age + 1 >= p.redTapeExpiresAge ? null : p.redTapeExpiresAge,
  })

  const me = next.players.find(pl => pl.id === p.id)!

  // 3) settlement summary
  next = {
    ...next,
    lastSettlement: {
      playerId: p.id,
      salary: gross,
      passive,
      lifestyle,
      interest,
      premiums,
      saved,
      assetChanges: me.assets.map(a => {
        const before = p.assets.find(b => b.uid === a.uid)
        return { uid: a.uid, classId: a.classId, delta: a.value - (before?.value ?? 0) }
      }),
      freedomPct: freedomPct(me),
    },
  }

  // 4) milestones tied to rank
  if (phase === "phase3" && me.skills.proSkills >= 7) next = grantMilestone(next, p.id, "PER-01") // 🧰 Contractor
  if (phase === "phase3" && me.skills.proSkills >= 9) next = grantMilestone(next, p.id, "PER-05") // 👑 Master

  // 5) phase transitions
  if (phase === "phase1" && settledAge === 16) {
    next = { ...next, phaseOf: { ...next.phaseOf, [p.id]: "careerReel" } }
  }
  if (phase === "phase2" && me.apprenticeshipYears >= APPRENTICE_WAGES.length) {
    next = { ...next, phaseOf: { ...next.phaseOf, [p.id]: "phase3" } }
    next = log(next, `${me.emoji} graduated — a qualified Tradesperson at ${me.age}! 🔧`)
  }

  // 6) win check
  const updated = next.players.find(pl => pl.id === p.id)!
  if (next.phaseOf[p.id] === "phase3" && hasWonCheck(updated)) {
    next = patchPlayer(next, p.id, { hasWon: true })
    next = log(next, `🏆 ${updated.emoji} ${updated.name} IS FREE at age ${updated.age}!`)
    return { ...next, winnerId: p.id, turnStage: "gameOver", pendingAction: null, pendingSpin: null }
  }

  // 7) age-65 backstop: everyone has settled their age-65 year
  if (next.players.every(pl => pl.age > BACKSTOP_AGE)) {
    const richest = [...next.players].sort(
      (a, b) => netWorth(b) - netWorth(a) || passiveIncome(b) - passiveIncome(a) || b.cash - a.cash
    )[0]
    next = log(next, `⏰ Age 65! ${richest.emoji} ${richest.name} retires richest.`)
    return { ...next, winnerId: richest.id, turnStage: "gameOver", pendingAction: null, pendingSpin: null }
  }

  return advanceTurn(next)
}

/** phase-1/2 assets pay simple net cash too (compounding handled via growth) */
function assetNetCashSafe(p: Player, a: AssetInstance): number {
  const r = effectiveRates(p, a)
  return Math.round(a.value * (r.income - r.operating) - a.loanBalance * r.interest)
}

function advanceTurn(state: GameState): GameState {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length
  const nextPlayer = state.players[nextIndex]
  const phase = state.phaseOf[nextPlayer.id]
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    pendingAction: null,
    pendingSpin: null,
    pendingReaction: null,
    turnStage: phase === "careerReel" ? "careerReel" : "action",
  }
}

// ---- career reel ---------------------------------------------------------------------------

function resolveCareerReel(state: GameState): GameState {
  const p = cur(state)
  if (state.phaseOf[p.id] !== "careerReel") return state
  const qualified = qualifiedCareers(p)
  let next = patchPlayer(state, p.id, {
    careerId: "tradesperson", // v1: only built career (spec §5 first-build behaviour)
    qualifiedCareers: qualified,
  })
  next = { ...next, phaseOf: { ...next.phaseOf, [p.id]: "phase2" } }
  next = log(next, `${p.emoji} ${p.name} begins life as a 🔧 Tradesperson! (qualified for ${qualified.length})`)
  return { ...next, turnStage: "action" }
}

export { phase1Gig }
