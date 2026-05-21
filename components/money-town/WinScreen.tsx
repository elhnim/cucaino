"use client"

import Link from "next/link"
import type { Player } from "@/lib/money-town/types"
import { computePassiveIncome, sellValue } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"

interface Props {
  winner: Player
  round: number
  kidId: string | null
  onPlayAgain: () => void
}

const CONFETTI_EMOJIS = ['🎉', '⭐', '💰', '🏆', '✨', '🌟', '💎', '🎊']

export default function WinScreen({ winner, round, kidId, onPlayAgain }: Props) {
  const passive = computePassiveIncome(winner.assets)
  const cc = PLAYER_COLOR_CLASSES[winner.color]
  const netWorth = winner.cash + winner.assets.reduce((s, a) => s + sellValue(a), 0)
  const backHref = kidId ? `/kid/${kidId}/play` : "/select-kid"

  return (
    <div className={`min-h-screen ${cc.bg} flex flex-col items-center justify-center p-6 text-center relative`}>
      <Link href={backHref} className="absolute top-3 left-4 text-sm font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1 bg-white/80 px-3 py-1.5 rounded-full">
        ← Games
      </Link>
      {/* Confetti rain */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {CONFETTI_EMOJIS.map((e, i) => (
          <span
            key={i}
            className="absolute text-3xl animate-bounce"
            style={{
              left: `${(i + 1) * 12}%`,
              top: `${5 + (i % 3) * 10}%`,
              animationDelay: `${i * 0.15}s`,
              animationDuration: `${0.8 + (i % 3) * 0.3}s`,
            }}
          >
            {e}
          </span>
        ))}
      </div>

      <div className="relative z-10">
        <div className="text-7xl mb-4">{winner.emoji}</div>
        <h1 className={`text-4xl font-black ${cc.text} mb-2`}>{winner.name}</h1>
        <h2 className="text-2xl font-black text-gray-800 mb-1">🎉 YOU ESCAPED THE RAT RACE!</h2>
        <p className="text-gray-500 mb-8">First to build enough passive income</p>

        <div className="bg-white rounded-3xl shadow-md p-6 mb-8 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Rounds played</span>
            <span className="font-black">{round}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Passive income</span>
            <span className="font-black text-green-600">${passive}/round</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Assets owned</span>
            <span className="font-black">{winner.assets.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Net worth</span>
            <span className="font-black">${netWorth}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onPlayAgain}
          className="w-full py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform mb-3"
        >
          Play Again 🔄
        </button>
      </div>
    </div>
  )
}
