import type { Player } from "@/lib/money-town/types"
import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"

interface Props {
  players: Player[]
  currentPlayer?: Player
}

export default function ProgressChart({ players, currentPlayer }: Props) {
  const allPlayers = players.length > 0 ? players : currentPlayer ? [currentPlayer] : []

  return (
    <div className="space-y-4">
      <h3 className="font-black text-gray-800 text-base">📊 Rat Race Progress</h3>
      {allPlayers.map(p => {
        const passive = computePassiveIncome(p.assets)
        const pct = Math.min(100, Math.round((passive / p.job.expenses) * 100))
        const cc = PLAYER_COLOR_CLASSES[p.color]
        return (
          <div key={p.id}>
            <div className="flex justify-between text-xs text-gray-600 mb-1 font-medium">
              <span>{p.emoji} {p.name}</span>
              <span>${passive} / ${p.job.expenses}/round</span>
            </div>
            <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${cc.badge} rounded-full transition-all`}
                style={{ width: `${pct}%` }}
              />
              {/* Target line at 100% */}
              <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-gray-600 z-10" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
