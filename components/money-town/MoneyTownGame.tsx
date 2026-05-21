"use client"

import { useReducer, useEffect } from "react"
import { gameReducer, createInitialState } from "@/lib/money-town/gameLogic"
import type { GameState } from "@/lib/money-town/types"
import GameLobby from "./GameLobby"
import PlayerDashboard from "./PlayerDashboard"
import SpinWheel from "./SpinWheel"
import PaydayCard from "./PaydayCard"
import DealCard from "./DealCard"
import ExpenseCard from "./ExpenseCard"
import BadLuckCard from "./BadLuckCard"
import BetweenTurns from "./BetweenTurns"
import MiniGame from "./MiniGame"
import WinScreen from "./WinScreen"

const SAVE_KEY = 'money-town-save'

interface Props {
  kidName: string | null
  kidId: string | null
}

export default function MoneyTownGame({ kidName, kidId }: Props) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SAVE_KEY)
        if (saved) return JSON.parse(saved) as GameState
      } catch {}
    }
    return createInitialState()
  })

  useEffect(() => {
    if (state.phase === 'lobby') return
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    } catch {}
  }, [state])

  useEffect(() => {
    if (state.phase === 'win') {
      try { localStorage.removeItem(SAVE_KEY) } catch {}
    }
  }, [state.phase])

  const currentPlayer = state.players[state.currentPlayerIndex]

  if (state.phase === 'lobby') {
    return <GameLobby kidName={kidName} kidId={kidId} dispatch={dispatch} />
  }

  if (state.phase === 'win' && state.winner) {
    const winner = state.players.find(p => p.id === state.winner)!
    return (
      <WinScreen
        winner={winner}
        round={state.round}
        kidId={kidId}
        onPlayAgain={() => dispatch({ type: 'RESTORE', state: createInitialState() })}
      />
    )
  }

  if (!currentPlayer) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-green-50">
      {state.phase === 'turn-start' && (
        <PlayerDashboard
          player={currentPlayer}
          players={state.players}
          round={state.round}
          totalPlayers={state.players.length}
          dispatch={dispatch}
        />
      )}
      {state.phase === 'spinning' && (
        <SpinWheel onResult={segment => dispatch({ type: 'SPIN_RESULT', segment })} />
      )}
      {state.phase === 'payday' && (
        <PaydayCard player={currentPlayer} dispatch={dispatch} />
      )}
      {state.phase === 'deal' && state.pendingDeal && (
        <DealCard player={currentPlayer} asset={state.pendingDeal} dispatch={dispatch} />
      )}
      {state.phase === 'expense' && state.pendingExpense && (
        <ExpenseCard player={currentPlayer} event={state.pendingExpense} dispatch={dispatch} />
      )}
      {state.phase === 'bad-luck' && state.pendingBadLuck && (
        <BadLuckCard player={currentPlayer} event={state.pendingBadLuck} dispatch={dispatch} />
      )}
      {state.phase === 'minigame' && state.pendingMinigame && (
        <MiniGame
          minigame={state.pendingMinigame}
          usedTriviaIds={state.usedTriviaIds}
          dispatch={dispatch}
        />
      )}
      {state.phase === 'between-turns' && (
        <BetweenTurns
          currentPlayer={currentPlayer}
          nextPlayer={state.players[(state.currentPlayerIndex + 1) % state.players.length]}
          dispatch={dispatch}
        />
      )}
    </div>
  )
}
