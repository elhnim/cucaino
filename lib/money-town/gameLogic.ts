import type { GameState, GameAction, Player, Asset, OwnedAsset, TriviaQuestion } from './types'
import {
  ASSETS,
  EXPENSE_EVENTS, BAD_LUCK_EVENTS, TRIVIA_QUESTIONS, REFLEX_GAMES
} from './constants'

// ─── Helpers ────────────────────────────────────────────────────────────────

export function computePassiveIncome(assets: OwnedAsset[]): number {
  return assets.reduce((sum, a) => {
    if (a.skipNextRound) return sum
    return sum + a.incomePerRound - a.interestPerRound
  }, 0)
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function checkWin(player: Player): boolean {
  return computePassiveIncome(player.assets) >= player.job.expenses
}

function pickDealAsset(round: number): Asset {
  let pool: Asset[]
  if (round <= 5)       pool = ASSETS.filter(a => a.tier === 1)
  else if (round <= 15) pool = ASSETS.filter(a => a.tier <= 2)
  else                  pool = ASSETS
  return pickRandom(pool)
}

function clearSkipFlags(player: Player): Player {
  return {
    ...player,
    assets: player.assets.map(a => ({ ...a, skipNextRound: false })),
  }
}

export function mortgageDownPayment(asset: Asset): number {
  return Math.round(asset.cost * 0.2)
}

export function mortgageDebt(asset: Asset): number {
  return asset.cost - mortgageDownPayment(asset)
}

export function mortgageInterestPerRound(asset: Asset): number {
  return Math.round(mortgageDebt(asset) * 0.05)
}

export function sellValue(owned: OwnedAsset): number {
  return Math.round(owned.purchasePrice * 0.8)
}

// ─── Initial state ───────────────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    phase: 'lobby',
    players: [],
    currentPlayerIndex: 0,
    round: 1,
    pendingDeal: null,
    pendingExpense: null,
    pendingBadLuck: null,
    pendingMinigame: null,
    lastSpinResult: null,
    winner: null,
    usedTriviaIds: [],
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
      if (state.players.length < 2) return state
      return { ...state, phase: 'turn-start' }
    }

    case 'SPIN': {
      return { ...state, phase: 'spinning' }
    }

    case 'SPIN_RESULT': {
      const { segment } = action
      const nextState: GameState = { ...state, lastSpinResult: segment }

      if (segment === 'payday') {
        return { ...nextState, phase: 'payday' }
      }
      if (segment === 'deal') {
        return { ...nextState, phase: 'deal', pendingDeal: pickDealAsset(state.round) }
      }
      if (segment === 'expense') {
        return { ...nextState, phase: 'expense', pendingExpense: pickRandom(EXPENSE_EVENTS) }
      }
      if (segment === 'bad-luck') {
        return { ...nextState, phase: 'bad-luck', pendingBadLuck: pickRandom(BAD_LUCK_EVENTS) }
      }
      if (segment === 'minigame') {
        const useTrivia = Math.random() < 0.5
        if (useTrivia) {
          return { ...nextState, phase: 'minigame', pendingMinigame: { type: 'trivia' } }
        } else {
          return {
            ...nextState,
            phase: 'minigame',
            pendingMinigame: { type: 'reflex', reflexGameId: pickRandom(REFLEX_GAMES) },
          }
        }
      }
      return nextState
    }

    case 'COLLECT_PAYDAY': {
      const player = state.players[state.currentPlayerIndex]
      const passive = computePassiveIncome(player.assets)
      const newCash = player.cash + player.job.salary + Math.max(0, passive)

      const updatedPlayer: Player = {
        ...clearSkipFlags(player),
        cash: newCash,
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )

      if (checkWin(updatedPlayer)) {
        return { ...state, players: newPlayers, winner: updatedPlayer.id, phase: 'win' }
      }

      return { ...state, players: newPlayers, phase: 'between-turns' }
    }

    case 'BUY_ASSET': {
      const { assetId, useMortgage } = action
      const asset = ASSETS.find(a => a.id === assetId)
      if (!asset) return state

      const player = state.players[state.currentPlayerIndex]
      const downPayment = useMortgage ? mortgageDownPayment(asset) : asset.cost
      if (player.cash < downPayment) return state

      const debt = useMortgage ? mortgageDebt(asset) : 0
      const interest = useMortgage ? mortgageInterestPerRound(asset) : 0

      const owned: OwnedAsset = {
        assetId: asset.id,
        purchasePrice: asset.cost,
        incomePerRound: asset.incomePerRound,
        mortgageDebt: debt,
        interestPerRound: interest,
        skipNextRound: false,
      }

      const updatedPlayer: Player = {
        ...player,
        cash: player.cash - downPayment,
        assets: [...player.assets, owned],
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )

      if (checkWin(updatedPlayer)) {
        return { ...state, players: newPlayers, winner: updatedPlayer.id, phase: 'win', pendingDeal: null }
      }

      return { ...state, players: newPlayers, pendingDeal: null, phase: 'between-turns' }
    }

    case 'SELL_ASSET': {
      const player = state.players[state.currentPlayerIndex]
      const owned = player.assets.find(a => a.assetId === action.assetId)
      if (!owned) return state

      const proceeds = sellValue(owned)
      const updatedPlayer: Player = {
        ...player,
        cash: player.cash + proceeds,
        assets: player.assets.filter(a => a.assetId !== action.assetId),
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers }
    }

    case 'PASS_DEAL': {
      return { ...state, pendingDeal: null, phase: 'between-turns' }
    }

    case 'DISMISS_EXPENSE': {
      const player = state.players[state.currentPlayerIndex]
      const expense = state.pendingExpense
      if (!expense) return state

      const updatedPlayer: Player = {
        ...player,
        cash: Math.max(0, player.cash - expense.cost),
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers, pendingExpense: null, phase: 'between-turns' }
    }

    case 'DISMISS_BAD_LUCK': {
      const player = state.players[state.currentPlayerIndex]
      const event = state.pendingBadLuck
      if (!event) return state

      let updatedPlayer = { ...player }

      if (event.type === 'flat' || event.type === 'friend' || event.type === 'cash') {
        updatedPlayer.cash = Math.max(0, player.cash - event.amount)
      } else if (event.type === 'business-skip') {
        const businesses = player.assets.filter(a => {
          const def = ASSETS.find(x => x.id === a.assetId)
          return def?.type === 'business'
        })
        if (businesses.length > 0) {
          const target = businesses[Math.floor(Math.random() * businesses.length)]
          updatedPlayer.assets = player.assets.map(a =>
            a.assetId === target.assetId ? { ...a, skipNextRound: true } : a
          )
        } else {
          updatedPlayer.cash = Math.max(0, player.cash - 100)
        }
      } else if (event.type === 'property-repair') {
        const properties = player.assets.filter(a => {
          const def = ASSETS.find(x => x.id === a.assetId)
          return def?.type === 'property'
        })
        if (properties.length > 0) {
          const target = properties[Math.floor(Math.random() * properties.length)]
          const fee = Math.max(50, Math.round(target.purchasePrice * 0.1))
          updatedPlayer.cash = Math.max(0, player.cash - fee)
        } else {
          updatedPlayer.cash = Math.max(0, player.cash - 100)
        }
      }

      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers, pendingBadLuck: null, phase: 'between-turns' }
    }

    case 'MINIGAME_COMPLETE': {
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer: Player = {
        ...player,
        cash: player.cash + action.cashEarned,
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      return { ...state, players: newPlayers, pendingMinigame: null, phase: 'between-turns' }
    }

    case 'TRIVIA_COMPLETE': {
      const player = state.players[state.currentPlayerIndex]
      const updatedPlayer: Player = {
        ...player,
        cash: player.cash + action.cashEarned,
      }
      const newPlayers = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? updatedPlayer : p
      )
      const newUsedIds = Array.from(new Set([...state.usedTriviaIds, ...action.triviaIds]))
      return {
        ...state,
        players: newPlayers,
        pendingMinigame: null,
        usedTriviaIds: newUsedIds,
        phase: 'between-turns',
      }
    }

    case 'NEXT_TURN': {
      const nextIndex = (state.currentPlayerIndex + 1) % state.players.length
      const newRound = nextIndex === 0 ? state.round + 1 : state.round
      return {
        ...state,
        phase: 'turn-start',
        currentPlayerIndex: nextIndex,
        round: newRound,
      }
    }

    case 'RESTORE': {
      return action.state
    }

    default:
      return state
  }
}

// ─── Trivia helper ───────────────────────────────────────────────────────────

export function pickTriviaQuestions(usedIds: string[], count = 3): TriviaQuestion[] {
  const pool = TRIVIA_QUESTIONS.filter(q => !usedIds.includes(q.id))
  const source = pool.length >= count ? pool : TRIVIA_QUESTIONS
  const shuffled = [...source].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
