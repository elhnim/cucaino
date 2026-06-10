"use client"

import type { Player, GameState, GameAction } from "@/lib/money-town/types"
import { ASSETS, DEGREE_COST } from "@/lib/money-town/constants"
import { canBuyAsset } from "@/lib/money-town/gameLogic"

interface Props {
  player: Player
  state: GameState
  dispatch: (action: GameAction) => void
}

export default function ActionPanel({ player, dispatch }: Props) {
  const canEnroll = !player.degreeStatus && player.cash >= DEGREE_COST
  const hasEnrolled = !!player.degreeStatus

  const allBuyable = ASSETS.filter(def => canBuyAsset(player, def.id))

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center">
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-gray-900">
                <span className="avatar-party inline-block mr-1">{player.emoji}</span> Your Move
              </h2>
              <p className="text-sm font-bold text-gray-500">Cash: <span className="font-black text-yellow-600">💰 ${player.cash.toLocaleString()}</span></p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4 pb-8">
          {/* Degree section */}
          {!hasEnrolled && (
            <div>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">Education</h3>
              <button type="button"
                onClick={() => dispatch({ type: 'ENROLL_DEGREE' })}
                disabled={!canEnroll}
                className="w-full flex items-center gap-3 bg-purple-50 border-2 border-purple-200 rounded-2xl px-4 py-3 disabled:opacity-40 active:scale-95 transition-transform hover:border-purple-400">
                <span className="text-2xl">🎓</span>
                <div className="flex-1 text-left">
                  <div className="font-black text-purple-900">Enrol in Degree</div>
                  <div className="text-xs text-purple-600">
                    Pay ${DEGREE_COST.toLocaleString()} · unlock better Chance cards in 2 turns
                  </div>
                </div>
                {!canEnroll && player.cash < DEGREE_COST && (
                  <span className="text-xs text-gray-400">Need ${(DEGREE_COST - player.cash).toLocaleString()} more</span>
                )}
              </button>
            </div>
          )}

          {/* Assets section */}
          {allBuyable.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">Buy an Asset</h3>
              <div className="space-y-2">
                {allBuyable.map(def => {
                  const canAfford = player.cash >= def.cost
                  return (
                    <button key={def.id} type="button"
                      onClick={() => canAfford && dispatch({ type: 'BUY_ASSET', defId: def.id })}
                      disabled={!canAfford}
                      className="w-full flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-white border-2 border-emerald-200 rounded-2xl px-4 py-3 disabled:opacity-40 active:scale-95 transition-transform hover:border-emerald-400">
                      <span className="text-2xl w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">{def.emoji}</span>
                      <div className="flex-1 text-left">
                        <div className="font-black text-gray-900 text-sm">{def.name}</div>
                        <div className="text-xs text-gray-500">
                          ${def.cost.toLocaleString()} · +${def.income.toLocaleString()}/turn
                          {def.degreeOnly && ' · degree required'}
                          {def.requiresProperties && ` · needs ${def.requiresProperties} properties`}
                        </div>
                      </div>
                      {!canAfford && (
                        <span className="text-xs text-gray-400 shrink-0">
                          Need ${(def.cost - player.cash).toLocaleString()} more
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Skip */}
          <button type="button"
            onClick={() => dispatch({ type: 'END_TURN' })}
            className="w-full py-4 border-2 border-gray-200 text-gray-600 font-black text-lg rounded-2xl active:scale-95 transition-transform hover:border-gray-300">
            ⏭️ Skip — End My Turn
          </button>
        </div>
      </div>
    </div>
  )
}
