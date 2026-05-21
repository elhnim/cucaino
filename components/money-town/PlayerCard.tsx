"use client"

import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES, ASSETS } from "@/lib/money-town/constants"
import type { Player, PaydayInfo } from "@/lib/money-town/types"

interface Props {
  player: Player
  isActive: boolean
  paydayInfo: PaydayInfo | null
}

export default function PlayerCard({ player, isActive, paydayInfo }: Props) {
  const cc = PLAYER_COLOR_CLASSES[player.color]
  const passive = computePassiveIncome(player)
  const progressPct = player.expenses > 0 ? Math.min(100, Math.round(passive / player.expenses * 100)) : 0

  return (
    <div className={`bg-white rounded-2xl border-2 ${isActive ? 'border-blue-500 shadow-lg' : cc.border} p-3 relative overflow-hidden`}>
      {/* Active / Won badges */}
      {isActive && !player.hasWon && (
        <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-black px-2 py-0.5 rounded-full">YOUR TURN</span>
      )}
      {player.hasWon && (
        <span className="absolute top-2 right-2 bg-green-500 text-white text-xs font-black px-2 py-0.5 rounded-full">🏆 FREE!</span>
      )}

      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{player.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-black text-gray-900 text-sm truncate">{player.name}</div>
          <div className="text-xs text-gray-500 truncate">
            ${player.salary.toLocaleString()}/turn · exp ${player.expenses.toLocaleString()}
          </div>
        </div>
        {/* Cash */}
        <div className="text-right">
          <div className="font-black text-yellow-600 text-lg leading-none">${player.cash.toLocaleString()}</div>
          <div className="text-xs text-gray-400">cash</div>
        </div>
      </div>

      {/* Degree status */}
      {player.degreeStatus && (
        <div className="mb-2">
          {player.degreeStatus === 'graduated' ? (
            <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">
              🎓 Graduated
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
              📚 Degree: {player.degreeStatus.turnsLeft} turn{player.degreeStatus.turnsLeft !== 1 ? 's' : ''} left
            </span>
          )}
        </div>
      )}

      {/* Payday banner */}
      {paydayInfo && (
        <div className="mb-2 bg-green-50 border border-green-200 rounded-xl p-2 text-xs space-y-0.5">
          {paydayInfo.degreeArrived && (
            <div className="text-purple-700 font-black text-center">🎓 Degree arrived!</div>
          )}
          <div className="flex justify-between text-green-700">
            <span>Salary</span><span className="font-bold">+${paydayInfo.salary.toLocaleString()}</span>
          </div>
          {paydayInfo.passive > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Passive</span><span className="font-bold">+${paydayInfo.passive.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-red-600">
            <span>Expenses</span><span className="font-bold">-${paydayInfo.expenses.toLocaleString()}</span>
          </div>
          <div className={`flex justify-between font-black border-t border-green-200 pt-0.5 ${paydayInfo.net >= 0 ? 'text-green-800' : 'text-red-700'}`}>
            <span>Net</span><span>{paydayInfo.net >= 0 ? '+' : ''}{paydayInfo.net.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Rat Race progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Rat Race Escape</span>
          <span className="font-bold text-blue-600">${passive.toLocaleString()}/${player.expenses.toLocaleString()}</span>
        </div>
        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
          {/* Milestone marks */}
          {[25, 50, 75].map(m => (
            <div key={m} className="absolute top-0 bottom-0 w-px bg-white/60" style={{ left: `${m}%` }} />
          ))}
          {/* Runner emoji */}
          {progressPct > 0 && progressPct < 100 && (
            <span className="absolute top-1/2 -translate-y-1/2 text-xs leading-none transition-all duration-500"
              style={{ left: `calc(${progressPct}% - 6px)` }}>
              🏃
            </span>
          )}
          {progressPct >= 100 && (
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs">🏆</span>
          )}
        </div>
      </div>

      {/* Assets strip */}
      <div className="overflow-x-auto">
        {player.assets.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No assets yet.</p>
        ) : (
          <div className="flex gap-1.5 pb-1">
            {player.assets.map(a => {
              const def = ASSETS.find(d => d.id === a.defId)
              return (
                <span key={a.uid} className="flex-shrink-0 inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5 text-xs font-bold text-gray-700 whitespace-nowrap">
                  {def?.emoji ?? '📦'} ${a.income.toLocaleString()}/t
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
