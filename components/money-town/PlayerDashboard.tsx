"use client"

import { useState } from "react"
import type { Player, GameAction } from "@/lib/money-town/types"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"
import AssetList from "./AssetList"
import ProgressChart from "./ProgressChart"

interface Props {
  player: Player
  players: Player[]
  round: number
  totalPlayers: number
  dispatch: (action: GameAction) => void
}

export default function PlayerDashboard({ player, players, round, totalPlayers, dispatch }: Props) {
  const [showAssets, setShowAssets] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const passive = computePassiveIncome(player.assets)
  const cc = PLAYER_COLOR_CLASSES[player.color]
  const winPercent = Math.min(100, Math.round((passive / player.job.expenses) * 100))

  return (
    <div className="min-h-screen flex flex-col p-4 pb-8 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pt-4 mb-4">
        <div className="text-xs text-gray-400 font-medium">Round {round}</div>
        <div className="flex gap-2">
          <button onClick={() => setShowProgress(true)} className="text-lg">📊</button>
          <button onClick={() => setShowAssets(true)} className="text-lg">🏗️</button>
        </div>
      </div>

      {/* Player card */}
      <div className={`${cc.bg} border-2 ${cc.border} rounded-3xl p-5 mb-5 text-center`}>
        <div className="text-5xl mb-2">{player.emoji}</div>
        <div className={`text-2xl font-black ${cc.text} mb-1`}>{player.name}</div>
        <div className="text-xs text-gray-500">{player.job.emoji} {player.job.name}</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
          <div className="text-xs text-gray-400 mb-1">Cash</div>
          <div className="text-lg font-black text-gray-800">${player.cash}</div>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
          <div className="text-xs text-gray-400 mb-1">Passive</div>
          <div className={`text-lg font-black ${passive >= player.job.expenses ? 'text-green-600' : 'text-gray-800'}`}>
            ${passive}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
          <div className="text-xs text-gray-400 mb-1">Target</div>
          <div className="text-lg font-black text-gray-800">${player.job.expenses}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Rat Race progress</span>
          <span>{winPercent}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${passive >= player.job.expenses ? 'bg-green-500' : 'bg-yellow-400'}`}
            style={{ width: `${winPercent}%` }}
          />
        </div>
        <div className="text-xs text-center mt-2 text-gray-500">
          {passive >= player.job.expenses ? '✅ Ready to win!' : `⏳ Need $${player.job.expenses - passive} more/round`}
        </div>
      </div>

      {/* Spin button */}
      <button
        type="button"
        onClick={() => dispatch({ type: 'SPIN' })}
        className="w-full py-5 bg-green-500 text-white text-2xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform"
      >
        🎡 SPIN!
      </button>

      {showAssets && (
        <AssetList player={player} dispatch={dispatch} onClose={() => setShowAssets(false)} />
      )}

      {showProgress && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowProgress(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
            <ProgressChart players={players} />
            <button onClick={() => setShowProgress(false)} className="w-full mt-4 py-3 bg-gray-100 rounded-2xl font-bold text-gray-600">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
