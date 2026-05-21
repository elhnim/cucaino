"use client"

import Link from "next/link"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { ASSETS, PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"
import type { Player } from "@/lib/money-town/types"

interface Props {
  winner: Player
  players: Player[]
  round: number
  activeKidId: string | null
  onPlayAgain: () => void
}

const CONFETTI = ['🎉', '⭐', '💰', '🏆', '✨', '🌟', '💎', '🎊']

export default function WinScreen({ winner, players, round, activeKidId, onPlayAgain }: Props) {
  const passive = computePassiveIncome(winner)
  const cc = PLAYER_COLOR_CLASSES[winner.color]
  const netWorth = winner.cash + winner.assets.reduce((s, a) => {
    const def = ASSETS.find(d => d.id === a.defId)
    return s + (def?.cost ?? 0)
  }, 0)
  const backHref = activeKidId ? `/kid/${activeKidId}/play` : "/select-kid"

  // Sort all players by passive income desc
  const sorted = [...players].sort((a, b) => computePassiveIncome(b) - computePassiveIncome(a))

  return (
    <div className={`min-h-screen ${cc.bg} flex flex-col items-center justify-center p-6 text-center relative`}>
      <Link href={backHref} className="absolute top-3 left-4 text-sm font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1 bg-white/80 px-3 py-1.5 rounded-full">
        ← Games
      </Link>

      {/* Confetti */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {CONFETTI.map((e, i) => (
          <span key={i} className="absolute text-3xl animate-bounce"
            style={{ left: `${(i + 1) * 12}%`, top: `${5 + (i % 3) * 10}%`, animationDelay: `${i * 0.15}s`, animationDuration: `${0.8 + (i % 3) * 0.3}s` }}>
            {e}
          </span>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-7xl mb-4">{winner.emoji}</div>
        <h1 className={`text-4xl font-black ${cc.text} mb-2`}>{winner.name}</h1>
        <h2 className="text-2xl font-black text-gray-800 mb-1">🎉 ESCAPED THE RAT RACE!</h2>
        <p className="text-gray-500 mb-6">Passive income ≥ living expenses in Round {round}</p>

        {/* Winner stats */}
        <div className="bg-white rounded-3xl shadow-md p-6 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Passive income</span>
            <span className="font-black text-green-600">${passive.toLocaleString()}/turn</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Living expenses</span>
            <span className="font-black text-red-500">${winner.expenses.toLocaleString()}/turn</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Assets owned</span>
            <span className="font-black">{winner.assets.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Net worth</span>
            <span className="font-black">${netWorth.toLocaleString()}</span>
          </div>
        </div>

        {/* All players standings */}
        {players.length > 1 && (
          <div className="bg-white rounded-3xl shadow-md p-4 mb-6">
            <h3 className="font-black text-gray-700 mb-3 text-sm">Final Standings</h3>
            {sorted.map((p, i) => {
              const pPassive = computePassiveIncome(p)
              const pct = p.expenses > 0 ? Math.round(pPassive / p.expenses * 100) : 0
              return (
                <div key={p.id} className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{p.hasWon ? '🏆' : `${i + 1}.`}</span>
                  <span className="text-xl">{p.emoji}</span>
                  <span className="flex-1 font-bold text-sm text-gray-800 text-left">{p.name}</span>
                  <span className="text-xs font-black text-blue-600">{pct}% free</span>
                </div>
              )
            })}
          </div>
        )}

        <button type="button" onClick={onPlayAgain}
          className="w-full py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform mb-3">
          Play Again 🔄
        </button>
      </div>
    </div>
  )
}
