"use client"

import type { Player, GameAction } from "@/lib/money-town/types"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"

interface Props {
  player: Player
  dispatch: (action: GameAction) => void
}

export default function PaydayCard({ player, dispatch }: Props) {
  const passive = computePassiveIncome(player.assets)
  const total = player.job.salary + passive
  const cc = PLAYER_COLOR_CLASSES[player.color]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">💰</div>
      <h2 className="text-3xl font-black text-gray-900 mb-2">Payday!</h2>
      <p className="text-gray-500 text-sm mb-6">Here&apos;s what {player.name} collected this round</p>

      <div className="bg-white rounded-3xl shadow-md p-6 w-full max-w-xs space-y-3 mb-8">
        <div className="flex justify-between text-sm font-medium text-gray-600">
          <span>{player.job.emoji} Salary</span>
          <span className="font-black text-gray-800">+${player.job.salary}</span>
        </div>
        <div className="flex justify-between text-sm font-medium text-gray-600">
          <span>💼 Passive income</span>
          <span className="font-black text-green-600">+${passive}</span>
        </div>
        <div className="border-t border-gray-100 pt-2 flex justify-between font-black text-gray-900">
          <span>Total earned</span>
          <span className="text-green-600">+${total}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>New cash balance</span>
          <span>${player.cash + total}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => dispatch({ type: 'COLLECT_PAYDAY' })}
        className={`w-full max-w-xs py-4 ${cc.badge} text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform`}
      >
        Collect! 🎉
      </button>
    </div>
  )
}
