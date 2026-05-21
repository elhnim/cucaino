"use client"

import { useEffect } from "react"
import type { GameState, GameAction } from "@/lib/money-town/types"
import PlayerCard from "./PlayerCard"

interface Props {
  state: GameState
  dispatch: (action: GameAction) => void
  onHowToPlay: () => void
}

export default function GameBoard({ state, dispatch, onHowToPlay }: Props) {
  const { players, currentPlayerIndex, round, phase, pendingPayday } = state
  const currentPlayer = players[currentPlayerIndex]

  // Auto-clear payday banner after 2s
  useEffect(() => {
    if (!pendingPayday) return
    const t = setTimeout(() => dispatch({ type: 'CLEAR_PAYDAY' }), 2000)
    return () => clearTimeout(t)
  }, [pendingPayday, dispatch])

  const gridClass = players.length <= 2
    ? 'flex flex-col gap-3'
    : 'grid grid-cols-2 gap-3'

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 flex items-center justify-between">
        <span className="font-black text-white text-lg">💰 Money Town</span>
        <span className="bg-yellow-400 text-yellow-900 font-black text-xs px-3 py-1 rounded-full">
          ROUND {round}
        </span>
        <button type="button" onClick={onHowToPlay}
          className="text-sm font-bold text-white/80 hover:text-white">
          ? Help
        </button>
      </header>

      {/* Turn banner */}
      <div className="bg-blue-600 text-white text-center py-2 px-4 flex items-center justify-center gap-2">
        <span className="text-lg">{currentPlayer?.emoji}</span>
        <span className="font-black text-sm">
          {currentPlayer?.name?.toUpperCase()}'S TURN
        </span>
        {phase === 'board' && !pendingPayday && (
          <span className="ml-2 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded-full">
            Pull Lever ›
          </span>
        )}
      </div>

      {/* Player grid */}
      <div className={`flex-1 p-3 ${gridClass}`}>
        {players.map((player, i) => (
          <PlayerCard
            key={player.id}
            player={player}
            isActive={i === currentPlayerIndex}
            paydayInfo={i === currentPlayerIndex ? pendingPayday : null}
          />
        ))}
      </div>

      {/* Bottom CTA */}
      {phase === 'board' && (
        <div className="p-4 pb-6">
          <button
            type="button"
            onClick={() => dispatch({ type: 'PULL_LEVER' })}
            disabled={!!pendingPayday}
            className="w-full py-4 bg-yellow-500 text-white text-xl font-black rounded-2xl shadow-lg disabled:opacity-50 active:scale-95 transition-transform"
          >
            🎰 Pull the Lever — {currentPlayer?.name}'s Turn
          </button>
        </div>
      )}
    </div>
  )
}
