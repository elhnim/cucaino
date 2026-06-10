"use client"

import { useEffect, useState, type CSSProperties } from "react"
import type { GameState, GameAction } from "@/lib/money-town/types"
import PlayerCard from "./PlayerCard"

interface Props {
  state: GameState
  dispatch: (action: GameAction) => void
  onHowToPlay: () => void
  onExit: () => void
}

const BOARD_STARS: { top: string; left: string; delay: string }[] = [
  { top: "12%", left: "42%", delay: "0s" },
  { top: "45%", left: "3%", delay: "0.7s" },
  { top: "50%", left: "95%", delay: "1.3s" },
  { top: "85%", left: "45%", delay: "0.4s" },
]

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
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "radial-gradient(circle at 50% 30%, #1e3a8a 0%, #172554 55%, #0c1130 100%)" }}>

      {/* Header */}
      <header className="shrink-0 px-4 py-2 flex items-center justify-between z-10" style={{ background: "linear-gradient(90deg, #1d4ed8, #2563eb, #1d4ed8)" }}>
        <button type="button" onClick={() => setConfirmExit(true)}
          className="text-sm font-black text-white/80 active:scale-95 transition-transform">✕ Exit</button>
        <div className="flex items-center gap-2">
          <span className="font-black text-white text-sm tracking-wide">💰 MONEY TOWN</span>
          <span className="bg-yellow-400 text-yellow-950 font-black text-xs px-2 py-0.5 rounded-full" style={{ boxShadow: "0 0 10px rgba(250,204,21,0.6)" }}>R{round}/12</span>
        </div>
        <button type="button" onClick={onHowToPlay}
          className="text-sm font-black text-white/80 active:scale-95 transition-transform">? Help</button>
      </header>

      {/* Exit confirmation */}
      {confirmExit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-xs text-center animate-pop">
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
      <div className="flex-1 min-h-0 p-2 max-w-4xl w-full mx-auto" style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}>
        <div
          className="relative h-full rounded-3xl border-[5px] border-yellow-400 p-1.5 grid grid-cols-[1.3fr_0.9fr_1.3fr] grid-rows-3 gap-1.5"
          style={{
            background: "linear-gradient(160deg, #1e3a8a 0%, #1e40af 50%, #172554 100%)",
            boxShadow: "0 0 34px rgba(250,204,21,0.25), inset 0 0 60px rgba(0,0,0,0.35)",
          }}
        >
          {/* twinkling board lights */}
          {BOARD_STARS.map((s, i) => (
            <span key={i} className="absolute twinkle text-yellow-300 text-xs pointer-events-none" style={{ top: s.top, left: s.left, animationDelay: s.delay }} aria-hidden>
              ✦
            </span>
          ))}

          {/* ── TOP-LEFT: Player 1 ── */}
          <div className="min-h-0 min-w-0">
            {corners[0]
              ? <PlayerCard player={corners[0]} isActive={cornerIndex[0] === currentPlayerIndex} paydayInfo={cornerIndex[0] === currentPlayerIndex ? pendingPayday : null} onPullLever={leverFor(0)} />
              : <div className="h-full rounded-2xl border-2 border-dashed border-white/10 bg-white/5" />}
          </div>

          {/* ── TOP-CENTER: turn indicator ── */}
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-yellow-300 font-black text-[10px] uppercase tracking-widest" style={{ textShadow: "0 0 8px rgba(250,204,21,0.6)" }}>★ Now Playing ★</span>
            <span className="text-3xl avatar-party inline-block">{currentPlayer?.emoji}</span>
            <span className="text-white font-black text-xs text-center leading-tight">
              {currentPlayer?.name?.toUpperCase()}
            </span>
          </div>

          {/* ── TOP-RIGHT: Player 2 ── */}
          <div className="min-h-0 min-w-0">
            {corners[1]
              ? <PlayerCard player={corners[1]} isActive={cornerIndex[1] === currentPlayerIndex} paydayInfo={cornerIndex[1] === currentPlayerIndex ? pendingPayday : null} onPullLever={leverFor(1)} />
              : <div className="h-full rounded-2xl border-2 border-dashed border-white/10 bg-white/5" />}
          </div>

          {/* ── MIDDLE-LEFT: decorative ── */}
          <div className="flex items-center justify-center">
            <span className="font-black text-[9px] tracking-widest [writing-mode:vertical-rl] rotate-180 text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(180deg, #fde047, #f59e0b)" }}>
              💰 MONEY TOWN 💰
            </span>
          </div>

          {/* ── CENTER: slot medallion ── */}
          <div className="flex items-center justify-center p-1">
            <div
              className="w-full h-full rounded-2xl flex flex-col items-center justify-center gap-1 border-2 border-yellow-400/40"
              style={{ background: "radial-gradient(circle at 50% 35%, #312e81, #1e1b4b 80%)", boxShadow: "inset 0 0 24px rgba(250,204,21,0.12)" }}
            >
              <span className="text-2xl avatar-idle inline-block" style={{ filter: "drop-shadow(0 0 10px rgba(250,204,21,0.5))" }}>🎰</span>
              {/* current player pacing the town square */}
              <div className="relative w-16 h-7 overflow-hidden" aria-hidden>
                <span className="walk-x left-0 bottom-0 text-xl" style={{ "--walk-dist": "38px", animationDuration: "3.6s" } as CSSProperties}>
                  <span className="walk-bob inline-block">{currentPlayer?.emoji}</span>
                </span>
              </div>
              <div className="flex gap-1" aria-hidden>
                {[0, 1, 2].map(i => (
                  <span key={i} className="marquee-light w-1.5 h-1.5 rounded-full bg-yellow-400" style={{ animationDelay: `${i * 0.3}s` }} />
                ))}
              </div>
            </div>
          </div>

          {/* ── MIDDLE-RIGHT: decorative ── */}
          <div className="flex items-center justify-center">
            <span className="font-black text-[9px] tracking-widest [writing-mode:vertical-rl] text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(180deg, #fde047, #f59e0b)" }}>
              🏃 ESCAPE THE RAT RACE 🏃
            </span>
          </div>

          {/* ── BOTTOM-LEFT: Player 4 (BL) ── */}
          <div className="min-h-0 min-w-0">
            {corners[3]
              ? <PlayerCard player={corners[3]} isActive={cornerIndex[3] === currentPlayerIndex} paydayInfo={cornerIndex[3] === currentPlayerIndex ? pendingPayday : null} onPullLever={leverFor(3)} />
              : <div className="h-full rounded-2xl border-2 border-dashed border-white/10 bg-white/5" />}
          </div>

          {/* ── BOTTOM-CENTER: round + motto ── */}
          <div className="flex flex-col items-center justify-center gap-0.5">
            <span className="text-yellow-300 font-black text-[10px] uppercase tracking-widest">Round</span>
            <span className="text-white font-black text-xl" style={{ textShadow: "0 0 12px rgba(255,255,255,0.4)" }}>{round}<span className="text-white/50 text-sm">/12</span></span>
            <span className="text-yellow-400/70 font-bold text-[8px] tracking-widest text-center">MANY LIVES<br/>ONE FREEDOM</span>
          </div>

          {/* ── BOTTOM-RIGHT: Player 3 (BR) ── */}
          <div className="min-h-0 min-w-0">
            {corners[2]
              ? <PlayerCard player={corners[2]} isActive={cornerIndex[2] === currentPlayerIndex} paydayInfo={cornerIndex[2] === currentPlayerIndex ? pendingPayday : null} onPullLever={leverFor(2)} />
              : <div className="h-full rounded-2xl border-2 border-dashed border-white/10 bg-white/5" />}
          </div>

        </div>
      </div>
    </div>
  )
}
