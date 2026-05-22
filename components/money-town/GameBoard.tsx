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

  useEffect(() => {
    if (!pendingPayday) return
    const t = setTimeout(() => dispatch({ type: 'CLEAR_PAYDAY' }), 2000)
    return () => clearTimeout(t)
  }, [pendingPayday, dispatch])

  // Clockwise corner positions: TL, TR, BR, BL
  const corners = [
    players[0] ?? null,
    players[1] ?? null,
    players[2] ?? null,
    players[3] ?? null,
  ]

  const cornerIndex = [0, 1, 3, 2] // maps corners to player index (TL, TR, BR, BL)

  function leverFor(ci: number) {
    return phase === 'board' && cornerIndex[ci] === currentPlayerIndex
      ? () => dispatch({ type: 'PULL_LEVER' })
      : undefined
  }

  return (
    <div className="h-screen bg-blue-950 flex flex-col overflow-hidden">

      {/* Header */}
      <header className="shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 flex items-center justify-between z-10">
        <button type="button" onClick={() => setConfirmExit(true)}
          className="text-sm font-bold text-white/80 hover:text-white">✕ Exit</button>
        <div className="flex items-center gap-2">
          <span className="font-black text-white text-sm">💰 Money Town</span>
          <span className="bg-yellow-400 text-yellow-900 font-black text-xs px-2 py-0.5 rounded-full">R{round}</span>
        </div>
        <button type="button" onClick={onHowToPlay}
          className="text-sm font-bold text-white/80 hover:text-white">? Help</button>
      </header>

      {/* Exit confirmation */}
      {confirmExit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-xs text-center">
            <div className="text-4xl mb-3">🚪</div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Quit the game?</h2>
            <p className="text-sm text-gray-500 mb-5">Your progress will be lost.</p>
            <button type="button" onClick={onExit}
              className="w-full py-3 bg-red-500 text-white font-black rounded-2xl mb-2 active:scale-95 transition-transform">
              Yes, quit
            </button>
            <button type="button" onClick={() => setConfirmExit(false)}
              className="w-full py-3 border-2 border-gray-200 text-gray-600 font-black rounded-2xl active:scale-95 transition-transform">
              Keep playing
            </button>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 min-h-0 p-2">
        <div className="h-full rounded-2xl border-[5px] border-yellow-400 bg-blue-900 p-1.5 grid grid-cols-3 grid-rows-3 gap-1.5">

          {/* ── TOP-LEFT: Player 1 ── */}
          <div className="min-h-0 min-w-0">
            {corners[0]
              ? <PlayerCard player={corners[0]} isActive={cornerIndex[0] === currentPlayerIndex} paydayInfo={cornerIndex[0] === currentPlayerIndex ? pendingPayday : null} onPullLever={leverFor(0)} />
              : <div className="h-full rounded-xl bg-blue-800/40" />}
          </div>

          {/* ── TOP-CENTER: turn indicator ── */}
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-yellow-300 font-black text-[10px] uppercase tracking-widest">Now Playing</span>
            <span className="text-2xl">{currentPlayer?.emoji}</span>
            <span className="text-white font-black text-xs text-center leading-tight">
              {currentPlayer?.name?.toUpperCase()}
            </span>
          </div>

          {/* ── TOP-RIGHT: Player 2 ── */}
          <div className="min-h-0 min-w-0">
            {corners[1]
              ? <PlayerCard player={corners[1]} isActive={cornerIndex[1] === currentPlayerIndex} paydayInfo={cornerIndex[1] === currentPlayerIndex ? pendingPayday : null} onPullLever={leverFor(1)} />
              : <div className="h-full rounded-xl bg-blue-800/40" />}
          </div>

          {/* ── MIDDLE-LEFT: decorative ── */}
          <div className="flex items-center justify-center">
            <span className="text-yellow-400/50 font-black text-[9px] tracking-widest [writing-mode:vertical-rl] rotate-180">
              MONEY TOWN
            </span>
          </div>

          {/* ── CENTER: decorative ── */}
          <div className="flex items-center justify-center p-1">
            <div className="w-full h-full rounded-xl bg-blue-800/60 border-2 border-yellow-400/20 flex flex-col items-center justify-center gap-1">
              <span className="text-3xl">🎰</span>
              <span className="text-yellow-300/60 font-black text-[9px] uppercase tracking-widest">Round {round}</span>
            </div>
          </div>

          {/* ── MIDDLE-RIGHT: decorative ── */}
          <div className="flex items-center justify-center">
            <span className="text-yellow-400/50 font-black text-[9px] tracking-widest [writing-mode:vertical-rl]">
              RAT RACE
            </span>
          </div>

          {/* ── BOTTOM-LEFT: Player 4 (BL) ── */}
          <div className="min-h-0 min-w-0">
            {corners[3]
              ? <PlayerCard player={corners[3]} isActive={cornerIndex[3] === currentPlayerIndex} paydayInfo={cornerIndex[3] === currentPlayerIndex ? pendingPayday : null} onPullLever={leverFor(3)} />
              : <div className="h-full rounded-xl bg-blue-800/40" />}
          </div>

          {/* ── BOTTOM-CENTER: round + motto ── */}
          <div className="flex flex-col items-center justify-center gap-0.5">
            <span className="text-yellow-300 font-black text-[10px] uppercase tracking-widest">Round</span>
            <span className="text-white font-black text-xl">{round}</span>
            <span className="text-yellow-400/60 font-bold text-[8px] tracking-widest text-center">MANY LIVES<br/>ONE FREEDOM</span>
          </div>

          {/* ── BOTTOM-RIGHT: Player 3 (BR) ── */}
          <div className="min-h-0 min-w-0">
            {corners[2]
              ? <PlayerCard player={corners[2]} isActive={cornerIndex[2] === currentPlayerIndex} paydayInfo={cornerIndex[2] === currentPlayerIndex ? pendingPayday : null} onPullLever={leverFor(2)} />
              : <div className="h-full rounded-xl bg-blue-800/40" />}
          </div>

        </div>
      </div>
    </div>
  )
}
