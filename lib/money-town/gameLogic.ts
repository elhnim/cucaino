import type {
  GameState, GameAction, Player, OwnedAsset, ResultPayload, PaydayInfo, ReelSegment, MarketOffer
} from './types'
import {
  ASSETS, JOBS, DEGREE_JOBS, REEL_SEGMENTS, REFLEX_GAMES, TRIVIA_QUESTIONS,
  STARTING_CASH, DEGREE_COST, DEGREE_TURNS, MIN_TURNS_TO_WIN, CASH_FLOOR,
  MAX_ROUNDS, INSURANCE_COST, MAX_INSURANCE, SELL_RATIO, MARKET_SIZE, MARKET_PRICE_MULTS,
} from './constants'
import type { TriviaQuestion } from './constants'

// ─── Helpers ────────────────────────────────────────────────────────────────

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

let _propSeq = 0

export function computePassiveIncome(player: Player): number {
  let total = 0
  for (const a of player.assets) {
    let inc = a.income
    if (a.isStock && player.stocksFrozen > 0) inc = 0
    if (player.recession > 0) inc = Math.floor(inc / 2)
    if (player.rentSurge > 0 && a.isProperty) inc += 60
    if (player.boom > 0 && a.isBusiness) inc *= 2
    total += inc
  }
  return total
}

export function checkWin(player: Player): boolean {
  return player.turnCount >= MIN_TURNS_TO_WIN && computePassiveIncome(player) >= player.expenses
}

export function ownedPropertyCount(player: Player): number {
  return player.assets.filter(a => a.isProperty).length
}

export function canBuyAsset(player: Player, defId: string): boolean {
  const def = ASSETS.find(a => a.id === defId)
  if (!def) return false
  if (def.isProperty) {
    if (ownedPropertyCount(player) >= 3) return false
  } else if (def.requiresProperties) {
    if (ownedPropertyCount(player) < def.requiresProperties) return false
    if (player.assets.some(a => a.defId === 'hotel')) return false
  } else {
    if (player.assets.some(a => a.defId === def.id)) return false
  }
  if (def.degreeOnly && player.degreeStatus !== 'graduated') return false
  return true
}

/** Freedom progress 0–100+ — used for the timeout winner and the track UI */
export function freedomPct(player: Player): number {
  return player.expenses > 0 ? Math.round(computePassiveIncome(player) / player.expenses * 100) : 0
}

export function netWorth(player: Player): number {
  return player.cash + player.assets.reduce((s, a) => {
    const def = ASSETS.find(d => d.id === a.defId)
    return s + (def?.cost ?? 0)
  }, 0)
}

/** Draw this turn's market: 3 random eligible assets with price swings.
    Hot deals reward waiting for the right moment; pricey offers punish impatience. */
function generateMarket(player: Player): MarketOffer[] {
  const pool = ASSETS.filter(a => canBuyAsset(player, a.id))
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, MARKET_SIZE).map(a => ({
    defId: a.id,
    priceMult: rand(MARKET_PRICE_MULTS),
  }))
}

function applyBuyAsset(player: Player, defId: string, discount = 1): Player {
  const def = ASSETS.find(a => a.id === defId)
  if (!def) return player
  const cost = Math.floor(def.cost * discount)
  if (player.cash < cost) return player

  const uid = def.isProperty ? `prop_${++_propSeq}` : def.id
  const owned: OwnedAsset = {
    uid,
    defId: def.id,
    income: def.income,
    isProperty: !!def.isProperty,
    isStock: !!def.isStock,
    isBusiness: !!def.isBusiness,
  }
  return { ...player, cash: player.cash - cost, assets: [...player.assets, owned] }
}

// ─── Card drawing ────────────────────────────────────────────────────────────

function drawEventCard(player: Player): { player: Player; payload: ResultPayload } {
  type EventCard = { emoji: string; name: string; apply: (p: Player) => { player: Player; cashDelta: number; extra?: Partial<Player> } }

  const events: EventCard[] = [
    { emoji: '🚗', name: 'Car Breakdown',      apply: (p) => ({ player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - 300) }, cashDelta: -300 }) },
    { emoji: '🏥', name: 'Medical Bill',        apply: (p) => ({ player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - 450) }, cashDelta: -450 }) },
    { emoji: '📋', name: 'Tax Audit',           apply: (p) => { const d = Math.max(200, Math.floor(p.cash * 0.10)); return { player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - d) }, cashDelta: -d } } },
    { emoji: '🏠', name: 'Roof Leak',           apply: (p) => { const d = p.assets.some(a=>a.isProperty) ? 750 : 500; return { player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - d) }, cashDelta: -d } } },
    { emoji: '📉', name: 'Stock Market Dip',    apply: (p) => ({ player: { ...p, stocksFrozen: 1 }, cashDelta: -1 }) },
    { emoji: '💸', name: 'Unexpected Expense',  apply: (p) => ({ player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - 400) }, cashDelta: -400 }) },
    { emoji: '💰', name: 'Tax Refund',          apply: (p) => ({ player: { ...p, cash: p.cash + 450 }, cashDelta: 450 }) },
    { emoji: '🎉', name: 'Work Bonus',          apply: (p) => { const d = Math.floor(p.salary * 0.35); return { player: { ...p, cash: p.cash + d }, cashDelta: d } } },
    { emoji: '💼', name: 'Side Hustle',         apply: (p) => ({ player: { ...p, cash: p.cash + 350 }, cashDelta: 350 }) },
    { emoji: '🍀', name: 'Lucky Day',           apply: (p) => ({ player: { ...p, cash: p.cash + 400 }, cashDelta: 400 }) },
    { emoji: '📈', name: 'Rent Surge',          apply: (p) => ({ player: { ...p, rentSurge: 1 }, cashDelta: 1 }) },
  ]

  const card = rand(events)
  const result = card.apply(player)

  // Insurance shield absorbs one bad event entirely
  if (result.cashDelta < 0 && player.insurance > 0) {
    return {
      player: { ...player, insurance: player.insurance - 1 },
      payload: {
        kind: 'event',
        emoji: '🛡️',
        title: card.name,
        description: `${card.name} hit — but your insurance covered it! No damage.`,
        tone: 'neutral',
        cashDelta: 0,
        salaryDelta: 0,
        expensesDelta: 0,
        shieldUsed: true,
      },
    }
  }

  const tone = result.cashDelta > 0 ? 'good' : result.cashDelta < 0 ? 'bad' : 'neutral'

  const descriptions: Record<string, string> = {
    'Car Breakdown': 'Your car needs repairs. Pay $300.',
    'Medical Bill': 'Unexpected medical bill. Pay $450.',
    'Tax Audit': 'The tax office wants a visit. Pay 10% of cash (min $200).',
    'Roof Leak': 'Water is dripping! Pay $500 (or $750 if you own property).',
    'Stock Market Dip': 'Markets are down. Your stocks earn nothing next turn.',
    'Unexpected Expense': 'Something came up. Pay $400.',
    'Tax Refund': 'Great news — the tax office owes you $450!',
    'Work Bonus': 'You went above and beyond. Receive 35% of your salary.',
    'Side Hustle': 'Extra gig pays off — +$350.',
    'Lucky Day': 'Everything went your way — +$400.',
    'Rent Surge': 'Rents are hot! Each Investment Property earns +$60 extra next turn.',
  }

  return {
    player: result.player,
    payload: {
      kind: 'event',
      emoji: card.emoji,
      title: card.name,
      description: descriptions[card.name] ?? card.name,
      tone,
      cashDelta: result.cashDelta,
      salaryDelta: 0,
      expensesDelta: 0,
    },
  }
}

function drawBigEventCard(player: Player, otherCount = 0): { player: Player; payload: ResultPayload } {
  type BigCard = { emoji: string; name: string; desc: string; tone: 'good'|'bad'|'neutral'; apply: (p: Player) => { player: Player; cashDelta: number; salaryDelta?: number; expensesDelta?: number; othersDelta?: number } }

  const cards: BigCard[] = [
    // Head-to-head cards — only when there are rivals at the table
    ...(otherCount > 0 ? [
      {
        emoji: '🎩', name: 'Charity Gala', tone: 'good' as const,
        desc: `You hosted a charity gala — every other player chips in $120!`,
        apply: (p: Player) => ({ player: { ...p, cash: p.cash + 120 * otherCount }, cashDelta: 120 * otherCount, othersDelta: -120 }),
      },
      {
        emoji: '🎂', name: 'Birthday Treat', tone: 'bad' as const,
        desc: `It's your birthday — you shout everyone! Pay each player $75.`,
        apply: (p: Player) => ({ player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - 75 * otherCount) }, cashDelta: -75 * otherCount, othersDelta: 75 }),
      },
    ] : []),
    {
      emoji: '👶', name: 'Twins!', tone: 'bad',
      desc: 'Congratulations (kind of) — living expenses +$120/round permanently.',
      apply: (p) => ({ player: { ...p, expenses: p.expenses + 120 }, cashDelta: 0, expensesDelta: 120 }),
    },
    {
      emoji: '🌪️', name: 'Laid Off', tone: 'bad',
      desc: "You've been laid off! No salary next turn (passive income still pays).",
      apply: (p) => ({ player: { ...p, laidOff: 1 }, cashDelta: 0 }),
    },
    {
      emoji: '💰', name: 'Inheritance', tone: 'good',
      desc: 'A distant relative left you money — receive $1,200!',
      apply: (p) => ({ player: { ...p, cash: p.cash + 1200 }, cashDelta: 1200 }),
    },
    {
      emoji: '🏥', name: 'Major Surgery', tone: 'bad',
      desc: 'A big medical bill hits. Pay $900.',
      apply: (p) => ({ player: { ...p, cash: Math.max(CASH_FLOOR, p.cash - 900) }, cashDelta: -900 }),
    },
    {
      emoji: '📉', name: 'Recession', tone: 'bad',
      desc: 'Economic downturn — all your passive income is halved next turn.',
      apply: (p) => ({ player: { ...p, recession: 1 }, cashDelta: 0 }),
    },
    {
      emoji: '🚀', name: 'Business Boom', tone: 'good',
      desc: 'Markets are booming! All your businesses earn double next turn.',
      apply: (p) => ({ player: { ...p, boom: 1 }, cashDelta: 0 }),
    },
    {
      emoji: '🌟', name: 'Viral Moment', tone: 'good',
      desc: 'Your business went viral! Receive $650 per business you own.',
      apply: (p) => {
        const count = p.assets.filter(a => a.isBusiness).length
        const delta = count * 650
        return { player: { ...p, cash: p.cash + delta }, cashDelta: delta }
      },
    },
    {
      emoji: '💎', name: 'Windfall', tone: 'good',
      desc: 'Lucky break — receive $1,000!',
      apply: (p) => ({ player: { ...p, cash: p.cash + 1000 }, cashDelta: 1000 }),
    },
  ]

  const card = rand(cards)
  const result = card.apply(player)

  // Insurance shield absorbs one bad cash hit (not head-to-head cards)
  if (result.cashDelta < 0 && !result.othersDelta && player.insurance > 0) {
    return {
      player: { ...player, insurance: player.insurance - 1 },
      payload: {
        kind: 'big-event',
        emoji: '🛡️',
        title: card.name,
        description: `${card.name} hit — but your insurance covered it! No damage.`,
        tone: 'neutral',
        cashDelta: 0,
        salaryDelta: 0,
        expensesDelta: 0,
        shieldUsed: true,
      },
    }
  }

  return {
    player: result.player,
    payload: {
      kind: 'big-event',
      emoji: card.emoji,
      title: card.name,
      description: card.desc,
      tone: card.tone,
      cashDelta: result.cashDelta,
      salaryDelta: result.salaryDelta ?? 0,
      expensesDelta: result.expensesDelta ?? 0,
      othersDelta: result.othersDelta,
    },
  }
}

function drawChanceCard(player: Player): { player: Player; payload: ResultPayload } {
  const graduated = player.degreeStatus === 'graduated'

  if (graduated) {
    type GradCard = { emoji: string; name: string; desc: string; tone: 'good'|'neutral'; apply: (p: Player) => { player: Player; cashDelta: number; salaryDelta?: number; expensesDelta?: number; offerAssetDefId?: string; offerDiscount?: number; offerCareerSwitch?: boolean } }

    const gradCards: GradCard[] = [
      {
        emoji: '🎯', name: 'Promotion', tone: 'good',
        desc: 'Your boss noticed your degree. +$280 salary, +$200 expenses permanently.',
        apply: (p) => ({ player: { ...p, salary: p.salary + 280, expenses: p.expenses + 200 }, cashDelta: 0, salaryDelta: 280, expensesDelta: 200 }),
      },
      {
        emoji: '💼', name: 'Career Switch', tone: 'good',
        desc: 'A headhunter offers you a dream job. Choose your new career!',
        apply: (p) => ({ player: p, cashDelta: 0, offerCareerSwitch: true }),
      },
      {
        emoji: '🏠', name: 'Discounted Property', tone: 'good',
        desc: 'A colleague tips you off on a deal — Investment Property at 25% off ($1,800).',
        apply: (p) => ({ player: p, cashDelta: 0, offerAssetDefId: 'property', offerDiscount: 0.75 }),
      },
      {
        emoji: '💡', name: 'Tech Startup Deal', tone: 'good',
        desc: 'A startup opportunity lands in your inbox — Tech Startup at full price ($2,800).',
        apply: (p) => ({ player: p, cashDelta: 0, offerAssetDefId: 'startup', offerDiscount: 1 }),
      },
      {
        emoji: '🎁', name: 'Cash Gift', tone: 'good',
        desc: 'A generous relative hears about your degree — +$550.',
        apply: (p) => ({ player: { ...p, cash: p.cash + 550 }, cashDelta: 550 }),
      },
    ]

    // 1-in-3: a strategic fork instead of a straight card
    if (Math.random() < 0.34) {
      return {
        player,
        payload: {
          kind: 'chance', emoji: '🤝', title: 'Headhunter Calls',
          description: 'A top company wants you. What matters more — cash today or income forever?',
          tone: 'good', cashDelta: 0, salaryDelta: 0, expensesDelta: 0,
          choices: [
            { emoji: '💰', label: 'Signing bonus', desc: '+$700 cash right now' },
            { emoji: '💼', label: 'Big promotion', desc: '+$400 salary, +$280 expenses forever' },
          ],
          choiceEffects: [
            { cashDelta: 700, salaryDelta: 0, expensesDelta: 0 },
            { cashDelta: 0, salaryDelta: 400, expensesDelta: 280 },
          ],
        },
      }
    }

    const card = rand(gradCards)
    const result = card.apply(player)
    return {
      player: result.player,
      payload: {
        kind: 'chance',
        emoji: card.emoji,
        title: card.name,
        description: card.desc,
        tone: card.tone,
        cashDelta: result.cashDelta,
        salaryDelta: result.salaryDelta ?? 0,
        expensesDelta: result.expensesDelta ?? 0,
        offerAssetDefId: result.offerAssetDefId,
        offerDiscount: result.offerDiscount,
        offerCareerSwitch: result.offerCareerSwitch,
      },
    }
  }

  // No degree — half the time, offer a strategic fork
  if (Math.random() < 0.5) {
    const forks: ResultPayload[] = [
      {
        kind: 'chance', emoji: '🛤️', title: 'Crossroads',
        description: 'An opportunity with two paths. Quick money, or money that keeps coming?',
        tone: 'good', cashDelta: 0, salaryDelta: 0, expensesDelta: 0,
        choices: [
          { emoji: '💵', label: 'Take the cash', desc: '+$350 right now' },
          { emoji: '📈', label: 'Ask for a raise', desc: '+$70 salary every turn, forever' },
        ],
        choiceEffects: [
          { cashDelta: 350, salaryDelta: 0, expensesDelta: 0 },
          { cashDelta: 0, salaryDelta: 70, expensesDelta: 0 },
        ],
      },
      {
        kind: 'chance', emoji: '🌙', title: 'Free Weekend',
        description: 'You have a free weekend. How do you spend it?',
        tone: 'good', cashDelta: 0, salaryDelta: 0, expensesDelta: 0,
        choices: [
          { emoji: '💪', label: 'Work overtime', desc: '+$300 cash this weekend' },
          { emoji: '📚', label: 'Night course', desc: '+$60 salary every turn, forever' },
        ],
        choiceEffects: [
          { cashDelta: 300, salaryDelta: 0, expensesDelta: 0 },
          { cashDelta: 0, salaryDelta: 60, expensesDelta: 0 },
        ],
      },
    ]
    return { player, payload: rand(forks) }
  }

  type BasicCard = { emoji: string; name: string; desc: string; apply: (p: Player) => { player: Player; cashDelta: number; salaryDelta?: number; offerAssetDefId?: string } }

  const cheapestTier1 = ASSETS.filter(a => a.tier === 1 && canBuyAsset(player, a.id))[0]
  const basicCards: BasicCard[] = [
    {
      emoji: '💪', name: 'Minor Raise', desc: 'Your hard work paid off — +$60 salary permanently.',
      apply: (p) => ({ player: { ...p, salary: p.salary + 60 }, cashDelta: 0, salaryDelta: 60 }),
    },
    {
      emoji: '🎁', name: 'Cash Gift', desc: 'A relative sends you some cash — +$350.',
      apply: (p) => ({ player: { ...p, cash: p.cash + 350 }, cashDelta: 350 }),
    },
    ...(cheapestTier1 ? [{
      emoji: cheapestTier1.emoji,
      name: 'Small Deal',
      desc: `An opportunity knocks — buy a ${cheapestTier1.name} at full price ($${cheapestTier1.cost.toLocaleString()}).`,
      apply: (p: Player) => ({ player: p, cashDelta: 0, offerAssetDefId: cheapestTier1.id }),
    }] : []),
  ]

  const pool = basicCards.length > 0 ? basicCards : basicCards.slice(0, 2)
  const card = rand(pool)
  const result = card.apply(player)
  return {
    player: result.player,
    payload: {
      kind: 'chance',
      emoji: card.emoji,
      title: card.name,
      description: card.desc,
      tone: 'good',
      cashDelta: result.cashDelta,
      salaryDelta: result.salaryDelta ?? 0,
      expensesDelta: 0,
      offerAssetDefId: result.offerAssetDefId,
    },
  }
}

function drawMiniGameCard(): ResultPayload {
  const useTrivia = Math.random() < 0.5
  if (useTrivia) {
    return {
      kind: 'mini-game', emoji: '🧠', title: 'Trivia Time!',
      description: 'Answer 3 questions to earn cash.',
      tone: 'neutral', cashDelta: 0, salaryDelta: 0, expensesDelta: 0,
      miniGameType: 'trivia',
    }
  }
  const reflexGameId = rand(REFLEX_GAMES)
  const names: Record<string, string> = {
    'coin-rain': 'Coin Rain', 'lemon-squeeze': 'Lemon Squeeze',
    'cash-grab': 'Cash Grab', 'pet-rush': 'Pet Rush',
  }
  return {
    kind: 'mini-game', emoji: '🎮', title: names[reflexGameId] ?? 'Mini-Game',
    description: 'Play a quick game to earn cash!',
    tone: 'neutral', cashDelta: 0, salaryDelta: 0, expensesDelta: 0,
    miniGameType: 'reflex', reflexGameId,
  }
}

export function pickTriviaQuestions(usedIds: string[], count = 3): TriviaQuestion[] {
  const pool = TRIVIA_QUESTIONS.filter(q => !usedIds.includes(q.id))
  const source = pool.length >= count ? pool : TRIVIA_QUESTIONS
  return [...source].sort(() => Math.random() - 0.5).slice(0, count)
}

// ─── Turn helpers ────────────────────────────────────────────────────────────

function applyStartTurn(state: GameState): GameState {
  const player = state.players[state.currentPlayerIndex]

  // Tick degree before computing payday (so graduation shows this turn)
  let newDegreeStatus = player.degreeStatus
  let degreeArrived = false
  if (newDegreeStatus && newDegreeStatus !== 'graduated') {
    const remaining = newDegreeStatus.turnsLeft - 1
    if (remaining <= 0) {
      newDegreeStatus = 'graduated'
      degreeArrived = true
    } else {
      newDegreeStatus = { turnsLeft: remaining }
    }
  }

  const updatedForDegree = { ...player, degreeStatus: newDegreeStatus }

  // Compute passive income using current status flags (before ticking down)
  const passive = computePassiveIncome(updatedForDegree)
  const salary = updatedForDegree.laidOff > 0 ? 0 : updatedForDegree.salary
  const net = salary + passive - updatedForDegree.expenses
  const newCash = Math.max(CASH_FLOOR, updatedForDegree.cash + net)

  const turnedPlayer = {
    ...updatedForDegree,
    cash: newCash,
    turnCount: updatedForDegree.turnCount + 1,
    stocksFrozen: 0,
    laidOff: 0,
    recession: 0,
    rentSurge: 0,
    boom: 0,
  }

  const hasWon = checkWin(turnedPlayer)

  const payday: PaydayInfo = { salary, passive, expenses: turnedPlayer.expenses, net, degreeArrived }

  const newPlayers = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...turnedPlayer, hasWon } : p
  )

  return {
    ...state,
    players: newPlayers,
    pendingPayday: payday,
    phase: hasWon ? 'win' : 'board',
    winnerId: hasWon ? turnedPlayer.id : state.winnerId,
    marketOffers: generateMarket(turnedPlayer),
  }
}

/** Round cap reached — the player closest to freedom takes it (net worth breaks ties) */
function timeoutWinner(players: Player[]): Player {
  return [...players].sort((a, b) => {
    const pctDiff = freedomPct(b) - freedomPct(a)
    if (pctDiff !== 0) return pctDiff
    return netWorth(b) - netWorth(a)
  })[0]
}

function nextTurn(state: GameState): GameState {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length
  const newRound = nextIndex === 0 ? state.round + 1 : state.round

  // Hard stop: every game ends by round MAX_ROUNDS
  if (newRound > MAX_ROUNDS) {
    const winner = timeoutWinner(state.players)
    return {
      ...state,
      pendingResult: null,
      pendingPayday: null,
      phase: 'win',
      winnerId: winner.id,
      winByTimeout: true,
    }
  }

  const intermediate: GameState = {
    ...state,
    currentPlayerIndex: nextIndex,
    round: newRound,
    pendingResult: null,
  }
  return applyStartTurn(intermediate)
}

// ─── Initial state ────────────────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    phase: 'lobby',
    players: [],
    currentPlayerIndex: 0,
    jobSpinPlayerIndex: 0,
    round: 1,
    pendingPayday: null,
    pendingResult: null,
    usedTriviaIds: [],
    winnerId: null,
    marketOffers: [],
    winByTimeout: false,
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {

    case 'ADD_PLAYER': {
      if (state.players.length >= 4) return state
      return { ...state, players: [...state.players, action.player] }
    }

    case 'REMOVE_PLAYER': {
      return { ...state, players: state.players.filter(p => p.id !== action.playerId) }
    }

    case 'START_GAME': {
      if (state.players.length < 1) return state
      return { ...state, phase: 'job-spin', jobSpinPlayerIndex: 0 }
    }

    case 'JOB_SPIN_RESULT': {
      const job = [...JOBS, ...DEGREE_JOBS].find(j => j.id === action.jobId)
      if (!job) return state
      const updatedPlayers = state.players.map((p, i) =>
        i === state.jobSpinPlayerIndex
          ? { ...p, salary: job.salary, expenses: job.expenses, baseJobId: job.id }
          : p
      )
      const allDone = state.jobSpinPlayerIndex >= state.players.length - 1
      if (!allDone) {
        return { ...state, players: updatedPlayers, jobSpinPlayerIndex: state.jobSpinPlayerIndex + 1 }
      }
      // All players have jobs — begin round 1 for player 0
      const readyState: GameState = {
        ...state,
        players: updatedPlayers,
        currentPlayerIndex: 0,
        round: 1,
      }
      return applyStartTurn(readyState)
    }

    case 'START_TURN': {
      return applyStartTurn(state)
    }

    case 'CLEAR_PAYDAY': {
      return { ...state, pendingPayday: null }
    }

    case 'PULL_LEVER': {
      return { ...state, phase: 'lever', pendingPayday: null }
    }

    case 'LEVER_RESULT': {
      const player = state.players[state.currentPlayerIndex]
      let updatedPlayer = player
      let payload: ResultPayload

      if (action.segment === 'event') {
        const r = drawEventCard(player)
        updatedPlayer = r.player
        payload = r.payload
      } else if (action.segment === 'big-event') {
        const r = drawBigEventCard(player, state.players.length - 1)
        updatedPlayer = r.player
        payload = r.payload
      } else if (action.segment === 'chance') {
        const r = drawChanceCard(player)
        updatedPlayer = r.player
        payload = r.payload
      } else {
        payload = drawMiniGameCard()
      }

      const newPlayers = state.players.map((p, i) => {
        if (i === state.currentPlayerIndex) return updatedPlayer
        // Head-to-head cards touch every rival's wallet
        if (payload.othersDelta) {
          return { ...p, cash: Math.max(CASH_FLOOR, p.cash + payload.othersDelta) }
        }
        return p
      })

      return {
        ...state,
        players: newPlayers,
        pendingResult: payload,
        phase: 'result',
      }
    }

    case 'CHOOSE_OPTION': {
      const effect = state.pendingResult?.choiceEffects?.[action.index]
      if (!effect) return state
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer = {
        ...player,
        cash: Math.max(CASH_FLOOR, player.cash + effect.cashDelta),
        salary: player.salary + effect.salaryDelta,
        expenses: player.expenses + effect.expensesDelta,
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers, pendingResult: null, phase: 'action' }
    }

    case 'DISMISS_RESULT': {
      const result = state.pendingResult
      if (!result) return { ...state, phase: 'action' }
      // Mini-games stay in 'result' phase — MiniGame component dispatches MINIGAME_COMPLETE
      if (result.miniGameType) return state
      return { ...state, pendingResult: null, phase: 'action' }
    }

    case 'MINIGAME_COMPLETE': {
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer = { ...player, cash: player.cash + action.cashEarned }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers, pendingResult: null, phase: 'action' }
    }

    case 'TRIVIA_COMPLETE': {
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer = { ...player, cash: player.cash + action.cashEarned }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      const newUsedIds = Array.from(new Set([...state.usedTriviaIds, ...action.triviaIds]))
      return { ...state, players: newPlayers, pendingResult: null, usedTriviaIds: newUsedIds, phase: 'action' }
    }

    case 'BUY_ASSET': {
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer = applyBuyAsset(player, action.defId, action.discount ?? 1)
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return nextTurn({ ...state, players: newPlayers })
    }

    case 'SELL_ASSET': {
      const player = state.players[state.currentPlayerIndex]
      const owned = player.assets.find(a => a.uid === action.uid)
      if (!owned) return state
      const def = ASSETS.find(d => d.id === owned.defId)
      const refund = Math.floor((def?.cost ?? 0) * SELL_RATIO)
      const updatedPlayer = {
        ...player,
        cash: player.cash + refund,
        assets: player.assets.filter(a => a.uid !== action.uid),
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      // Selling doesn't end the turn — it enables the pivot play (sell, then buy)
      return { ...state, players: newPlayers }
    }

    case 'BUY_INSURANCE': {
      const player = state.players[state.currentPlayerIndex]
      if (player.cash < INSURANCE_COST || player.insurance >= MAX_INSURANCE) return state
      const updatedPlayer = {
        ...player,
        cash: player.cash - INSURANCE_COST,
        insurance: player.insurance + 1,
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      // Quick defensive action — doesn't end the turn
      return { ...state, players: newPlayers }
    }

    case 'SWITCH_CAREER': {
      const job = DEGREE_JOBS.find(j => j.id === action.jobId)
      if (!job) return state
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer = { ...player, salary: job.salary, expenses: job.expenses, baseJobId: job.id }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return nextTurn({ ...state, players: newPlayers })
    }

    case 'ENROLL_DEGREE': {
      const player = state.players[state.currentPlayerIndex]
      if (player.cash < DEGREE_COST) return state
      const updatedPlayer = {
        ...player,
        cash: player.cash - DEGREE_COST,
        degreeStatus: { turnsLeft: DEGREE_TURNS },
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return nextTurn({ ...state, players: newPlayers })
    }

    case 'END_TURN': {
      return nextTurn(state)
    }

    case 'RESTORE': {
      return action.state
    }

    case 'NEW_GAME': {
      return createInitialState()
    }

    default:
      return state
  }
}
