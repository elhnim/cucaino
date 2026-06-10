"use client"

import Link from "next/link"
import type { CSSProperties } from "react"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { ASSETS } from "@/lib/money-town/constants"
import type { Player } from "@/lib/money-town/types"

interface Props {
  winner: Player
  players: Player[]
  round: number
  byTimeout?: boolean
  activeKidId: string | null
  onPlayAgain: () => void
}

const RAIN = ['🎉', '⭐', '💰', '🏆', '✨', '🎊']
const MEDALS = ['🥇', '🥈', '🥉', '🏅']

export default function WinScreen({ winner, players, round, byTimeout = false, activeKidId, onPlayAgain }: Props) {
  const passive = computePassiveIncome(winner)
  const netWorth = winner.cash + winner.assets.reduce((s, a) => {
    const def = ASSETS.find(d => d.id === a.defId)
    return s + (def?.cost ?? 0)
  }, 0)
  const backHref = activeKidId ? `/kid/${activeKidId}/play` : "/select-kid"

  // Sort all players by passive income desc
  const sorted = [...players].sort((a, b) => computePassiveIncome(b) - computePassiveIncome(a))

  return (
    <div className="h-full overflow-y-auto relative"
      style={{ background: "linear-gradient(180deg, #fbbf24 0%, #fde68a 40%, #fef3c7 70%, #d9f99d 100%)" }}>
    <div className="min-h-full flex flex-col items-center justify-center p-6 text-center"
      style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}>
      <Link href={backHref} className="absolute top-3 left-4 z-20 text-sm font-black text-amber-900 bg-white/80 backdrop-blur px-3 py-1.5 rounded-full active:scale-95 transition-transform">
        ← Games
      </Link>

      {/* Celebration rain */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {RAIN.map((e, i) => (
          <span key={i} className="emoji-rain-piece text-3xl"
            style={{ left: `${8 + i * 16}%`, animationDelay: `${i * 0.55}s` }}>
            {e}
          </span>
        ))}
      </div>

      {/* Victory lap at the bottom */}
      <div className="fixed bottom-2 left-0 right-0 h-12 pointer-events-none" aria-hidden>
        <span className="walk-x left-4 bottom-0 text-3xl" style={{ "--walk-dist": "75vw", animationDuration: "9s" } as CSSProperties}>
          <span className="walk-bob inline-block">{winner.emoji}</span>
        </span>
        <span className="walk-x left-4 bottom-0 text-xl" style={{ "--walk-dist": "75vw", animationDuration: "9s", animationDelay: "-0.4s" } as CSSProperties}>
          <span className="walk-bob inline-block" style={{ animationDelay: "0.15s" }}>🎈</span>
        </span>
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Winner on a glowing pedestal */}
        <div className="inline-block mb-3">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center text-7xl mx-auto"
            style={{ background: "rgba(255,255,255,0.6)", border: "4px solid rgba(255,255,255,0.9)", boxShadow: "0 0 50px rgba(251,191,36,0.8)" }}
          >
            <span className="avatar-party inline-block">{winner.emoji}</span>
          </div>
        </div>
        <h1 className="text-4xl font-black text-amber-950 mb-1 animate-pop">{winner.name}</h1>
        <h2 className="text-2xl font-black text-amber-800 mb-1">
          {byTimeout ? '🏁 CLOSEST TO FREEDOM!' : '🎉 ESCAPED THE RAT RACE!'}
        </h2>
        <p className="text-sm font-bold text-amber-700/70 mb-6">
          {byTimeout
            ? `Time's up after 12 rounds — ${winner.name} built the most freedom!`
            : `Money works for ${winner.name} now · Round ${round}`}
        </p>

        {/* Winner stats */}
        <div className="bg-white/90 backdrop-blur rounded-3xl shadow-lg p-6 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="font-bold text-gray-500">😴 Money while sleeping</span>
            <span className="font-black text-green-600">${passive.toLocaleString()}/turn</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold text-gray-500">🧾 Living expenses</span>
            <span className="font-black text-red-500">${winner.expenses.toLocaleString()}/turn</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold text-gray-500">📦 Assets owned</span>
            <span className="font-black">{winner.assets.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold text-gray-500">💎 Net worth</span>
            <span className="font-black">${netWorth.toLocaleString()}</span>
          </div>
        </div>

        {/* All players standings */}
        {players.length > 1 && (
          <div className="bg-white/90 backdrop-blur rounded-3xl shadow-lg p-4 mb-6">
            <h3 className="font-black text-gray-700 mb-3 text-sm">🏁 Final standings</h3>
            {sorted.map((p, i) => {
              const pPassive = computePassiveIncome(p)
              const pct = p.expenses > 0 ? Math.round(pPassive / p.expenses * 100) : 0
              return (
                <div key={p.id} className={`flex items-center gap-2 mb-1.5 rounded-xl px-2 py-1.5 ${i === 0 ? 'bg-yellow-50 border border-yellow-200' : ''}`}>
                  <span className="text-lg">{MEDALS[Math.min(i, MEDALS.length - 1)]}</span>
                  <span className={`text-xl inline-block ${i === 0 ? 'avatar-idle' : ''}`}>{p.emoji}</span>
                  <span className="flex-1 font-black text-sm text-gray-800 text-left">{p.name}</span>
                  <span className="text-xs font-black text-blue-600">{pct}% free</span>
                </div>
              )
            })}
          </div>
        )}

        <button type="button" onClick={onPlayAgain}
          className="w-full py-4 text-white text-xl font-black rounded-3xl active:scale-95 transition-transform mb-3"
          style={{ background: "linear-gradient(180deg, #34d399, #10b981 60%, #059669)", boxShadow: "0 5px 0 #047857, 0 12px 28px rgba(5,150,105,0.4)" }}>
          Play Again 🔄
        </button>
      </div>
    </div>
    </div>
  )
}
