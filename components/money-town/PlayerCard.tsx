"use client"

import { computePassiveIncome } from "@/lib/money-town/gameLogic"
import { PLAYER_COLOR_CLASSES, ASSETS } from "@/lib/money-town/constants"
import type { Player, PaydayInfo } from "@/lib/money-town/types"

const HEADER_GRADIENT: Record<string, string> = {
  red:    'from-red-500 to-red-700',
  blue:   'from-blue-500 to-blue-700',
  green:  'from-green-500 to-green-700',
  yellow: 'from-amber-400 to-amber-600',
}

interface Props {
  player: Player
  isActive: boolean
  paydayInfo: PaydayInfo | null
  onPullLever?: () => void
}

export default function PlayerCard({ player, isActive, paydayInfo, onPullLever }: Props) {
  const cc = PLAYER_COLOR_CLASSES[player.color]
  const passive = computePassiveIncome(player)
  const progressPct = player.expenses > 0 ? Math.min(100, Math.round(passive / player.expenses * 100)) : 0
  const gradient = HEADER_GRADIENT[player.color] ?? 'from-blue-500 to-blue-700'

  return (
    <div className={`rounded-xl border-2 ${isActive ? 'border-white shadow-lg' : cc.border} relative overflow-hidden h-full flex flex-col`}>
      {/* Won badge */}
      {player.hasWon && (
        <span className="absolute top-1.5 right-1.5 z-20 bg-green-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">🏆 FREE!</span>
      )}

      {/* Gradient header */}
      <div className={`bg-gradient-to-br ${gradient} px-2 py-2 flex items-center gap-1.5 flex-shrink-0`}>
        <span className="text-2xl">{player.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-black text-white text-xs truncate leading-tight">{player.name}</div>
          {player.degreeStatus && player.degreeStatus !== 'graduated' && (
            <div className="text-[9px] text-white/75">📚 {player.degreeStatus.turnsLeft}t left</div>
          )}
          {player.degreeStatus === 'graduated' && (
            <div className="text-[9px] text-white/75">🎓 Grad</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-black text-white text-sm leading-none">${player.cash.toLocaleString()}</div>
          <div className="text-[9px] text-white/70">cash</div>
        </div>
      </div>

      {/* White body */}
      <div className="bg-white flex-1 px-2 py-1.5 flex flex-col gap-1.5 min-h-0 overflow-hidden">

        {/* Payday banner */}
        {paydayInfo && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-1.5 text-[10px] space-y-0.5 flex-shrink-0">
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

        {/* Freedom track */}
        <div className="flex-shrink-0">
          <div className="flex justify-between mb-0.5">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Freedom</span>
            <span className="text-[9px] font-bold text-blue-600">{progressPct}%</span>
          </div>
          <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
            {progressPct > 0 && progressPct < 100 && (
              <span className="absolute top-1/2 -translate-y-1/2 text-[10px] leading-none"
                style={{ left: `calc(${progressPct}% - 5px)` }}>🏃</span>
            )}
            {progressPct >= 100 && (
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px]">🏆</span>
            )}
          </div>
        </div>

        {/* Income / Expense badges */}
        <div className="flex gap-1 flex-shrink-0">
          <div className="flex-1 bg-yellow-50 border-2 border-yellow-200 rounded-xl px-1 py-1 flex flex-col items-center">
            <span className="text-[8px] font-black text-amber-700 uppercase tracking-wide leading-none">Income</span>
            <span className="text-sm font-black text-green-700 leading-tight">${player.salary.toLocaleString()}</span>
          </div>
          <div className="flex-1 bg-red-50 border-2 border-red-200 rounded-xl px-1 py-1 flex flex-col items-center">
            <span className="text-[8px] font-black text-red-700 uppercase tracking-wide leading-none">Expense</span>
            <span className="text-sm font-black text-red-600 leading-tight">${player.expenses.toLocaleString()}</span>
          </div>
        </div>

        {/* Assets */}
        <div className="mt-auto overflow-x-auto">
          {player.assets.length === 0 ? (
            <p className="text-[9px] text-gray-300 italic text-center py-1">No assets yet</p>
          ) : (
            <div className="flex gap-1 pb-0.5">
              {player.assets.map(a => {
                const def = ASSETS.find(d => d.id === a.defId)
                return (
                  <div key={a.uid} className="flex-shrink-0 flex flex-col items-center bg-green-50 border-2 border-green-300 rounded-xl px-1.5 py-1 min-w-[40px] max-w-[68px]">
                    <span className="text-lg leading-none">{def?.emoji ?? '📦'}</span>
                    <span className="text-[8px] font-black text-green-800 text-center leading-tight mt-0.5 truncate w-full text-center">{def?.name ?? 'Asset'}</span>
                    <span className="text-[9px] font-black text-white bg-green-600 rounded-full px-1.5 mt-0.5">${a.income.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* GO! overlay — active player's turn trigger */}
      {onPullLever && (
        <button
          type="button"
          onClick={onPullLever}
          className="absolute inset-0 flex items-center justify-center bg-black/20 active:bg-black/30 transition-colors"
        >
          <div
            className="bg-gradient-to-br from-green-500 to-green-700 text-white font-black text-xl px-5 py-3 rounded-2xl border-2 border-white/25 text-center"
            style={{ boxShadow: '0 5px 0px #14532d, 0 10px 28px rgba(0,0,0,0.5)' }}
          >
            ▶ GO!
            <div className="text-[11px] font-bold opacity-85">{player.name}'s Turn</div>
          </div>
        </button>
      )}
    </div>
  )
}
