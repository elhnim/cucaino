"use client"

import { useReducer, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { gameReducer, createInitialState } from "@/lib/money-town/gameLogic"
import type { GameState } from "@/lib/money-town/types"
import type { Kid } from "@/lib/domain/types"
import GameLobby from "./GameLobby"
import JobSpinCeremony from "./JobSpinCeremony"
import GameBoard from "./GameBoard"
import LeverOverlay from "./LeverOverlay"
import ResultCard from "./ResultCard"
import ActionPanel from "./ActionPanel"
import RulesModal from "./RulesModal"
import WinScreen from "./WinScreen"
import MiniGame from "./MiniGame"

const SAVE_KEY = 'money-town-v8-save'

interface Props {
  kids: Kid[]
  activeKidId: string | null
}

export default function MoneyTownGame({ kids, activeKidId }: Props) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SAVE_KEY)
        if (saved) return JSON.parse(saved) as GameState
      } catch {}
    }
    return createInitialState()
  })

  const router = useRouter()
  const [rulesOpen, setRulesOpen] = useState(false)

  const handleExit = useCallback(() => {
    dispatch({ type: 'NEW_GAME' })
    router.push(activeKidId ? `/kid/${activeKidId}/play` : '/select-kid')
  }, [activeKidId, dispatch, router])

  // Persist state
  useEffect(() => {
    if (state.phase === 'lobby') return
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)) } catch {}
  }, [state])

  // Clear save on win or new game
  useEffect(() => {
    if (state.phase === 'win' || state.phase === 'lobby') {
      try { localStorage.removeItem(SAVE_KEY) } catch {}
    }
  }, [state.phase])

  const currentPlayer = state.players[state.currentPlayerIndex]
  const activeKid = kids.find(k => k.id === activeKidId) ?? null

  if (state.phase === 'lobby') {
    return (
      <GameLobby
        kids={kids}
        activeKid={activeKid}
        dispatch={dispatch}
      />
    )
  }

  if (state.phase === 'job-spin') {
    return (
      <JobSpinCeremony
        key={state.jobSpinPlayerIndex}
        players={state.players}
        spinPlayerIndex={state.jobSpinPlayerIndex}
        dispatch={dispatch}
      />
    )
  }

  if (state.phase === 'win' && state.winnerId) {
    const winner = state.players.find(p => p.id === state.winnerId)!
    return (
      <WinScreen
        winner={winner}
        players={state.players}
        round={state.round}
        byTimeout={state.winByTimeout}
        activeKidId={activeKidId}
        onPlayAgain={() => dispatch({ type: 'NEW_GAME' })}
      />
    )
  }

  if (!currentPlayer) return null

  // Board is always mounted for board/lever/result/action phases
  return (
    <div className="relative h-full bg-sky-50">
      <GameBoard
        state={state}
        dispatch={dispatch}
        onHowToPlay={() => setRulesOpen(true)}
        onExit={handleExit}
      />

      {state.phase === 'lever' && (
        <LeverOverlay
          player={currentPlayer}
          onResult={(segment) => dispatch({ type: 'LEVER_RESULT', segment })}
        />
      )}

      {state.phase === 'result' && state.pendingResult && (
        <>
          {state.pendingResult.miniGameType ? (
            <div className="fixed inset-0 z-40 overflow-y-auto bg-sky-50">
              <MiniGame
                minigame={{
                  type: state.pendingResult.miniGameType,
                  reflexGameId: state.pendingResult.reflexGameId,
                }}
                usedTriviaIds={state.usedTriviaIds}
                dispatch={dispatch}
              />
            </div>
          ) : (
            <ResultCard
              result={state.pendingResult}
              player={currentPlayer}
              state={state}
              dispatch={dispatch}
            />
          )}
        </>
      )}

      {state.phase === 'action' && (
        <ActionPanel
          player={currentPlayer}
          state={state}
          dispatch={dispatch}
        />
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
