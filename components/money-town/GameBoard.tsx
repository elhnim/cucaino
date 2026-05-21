"use client"

import { useEffect, useState } from "react"
import type { GameState, GameAction } from "@/lib/money-town/types"
import PlayerCard from "./PlayerCard"

interface Props {
  state: GameState
  dispatch: (action: GameAction) => void
  onHowToPlay: () => void
  onExit: () => void
}

export default function GameBoard({ state, dispatch, onHowToPlay, onExit }: Props) {
  const { players, currentPlayerIndex, round, phase, pendingPayday } = state
  const currentPlayer = players[currentPlayerIndex]
  const [confirmExit, setConfirmExit] = useState(false)

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
        <button type="button" onClick={() => setConfirmExit(true)}
          className="text-sm font-bold text-white/80 hover:text-white flex items-center gap-1">
          ✕ Exit
        </button>
        <div className="flex items-center gap-2">
          <span className="font-black text-white text-base">💰 Money Town</span>
          <span className="bg-yellow-400 text-yellow-900 font-black text-xs px-2 py-0.5 rounded-full">
            R{round}
          </span>
        </div>
        <button type="button" onClick={onHowToPlay}
          className="text-sm font-bold text-white/80 hover:text-white">
          ? Help
        </button>
      </header>

      {/* Exit confirmation */}
      {confirmExit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-xs text-center">
            <div className="text-4xl mb-3">🚪</div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Quit the game?</h2>
            <p className="text-sm text-gray-500 mb-5">Your progress will be lost.</p>
            <button type="button"
              onClick={onExit}
              className="w-full py-3 bg-red-500 text-white font-black rounded-2xl mb-2 active:scale-95 transition-transform">
              Yes, quit
            </button>
            <button type="button"
              onClick={() => setConfirmExit(false)}
              className="w-full py-3 border-2 border-gray-200 text-gray-600 font-black rounded-2xl active:scale-95 transition-transform">
              Keep playing
            </button>
          </div>
        </div>
      )}


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
            className="w-full py-4 bg-yellow-500 text-white text-xl font-black rounded-2xl shadow-lg active:scale-95 transition-transform"
          >
            🎰 Pull the Lever — {currentPlayer?.name}'s Turn
          </button>
        </div>
      )}
    </div>
  )
}
