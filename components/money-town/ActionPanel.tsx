"use client"

import type { Player, GameState, GameAction } from "@/lib/money-town/types"
import { ASSETS, DEGREE_COST, INSURANCE_COST, MAX_INSURANCE, SELL_RATIO } from "@/lib/money-town/constants"
import { canBuyAsset } from "@/lib/money-town/gameLogic"

interface Props {
  player: Player
  state: GameState
  dispatch: (action: GameAction) => void
}

function dealTag(mult: number): { label: string; cls: string } | null {
  if (mult <= 0.8) return { label: '🔥 HOT DEAL −20%', cls: 'bg-red-500 text-white' }
  if (mult <= 0.9) return { label: '✨ Deal −10%', cls: 'bg-orange-400 text-white' }
  if (mult >= 1.25) return { label: '📈 Pricey +25%', cls: 'bg-gray-400 text-white' }
  if (mult >= 1.1) return { label: '📈 +10%', cls: 'bg-gray-300 text-gray-700' }
  return null
}

export default function ActionPanel({ player, state, dispatch }: Props) {
  const canEnroll = !player.degreeStatus && player.cash >= DEGREE_COST
  const hasEnrolled = !!player.degreeStatus

  const offers = state.marketOffers
    .map(o => ({ ...o, def: ASSETS.find(a => a.id === o.defId) }))
    .filter(o => o.def && canBuyAsset(player, o.defId))

  const canInsure = player.insurance < MAX_INSURANCE && player.cash >= INSURANCE_COST

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
              <p className="text-sm font-bold text-gray-500">
                Cash: <span className="font-black text-yellow-600">💰 ${player.cash.toLocaleString()}</span>
                {player.insurance > 0 && (
                  <span className="ml-2 font-black text-blue-600">🛡️ ×{player.insurance}</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4 pb-8">
          {/* Today's market — rotating offers with price swings */}
          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">
              🏪 Today&apos;s market <span className="normal-case font-bold text-gray-300">· new deals every turn</span>
            </h3>
            {offers.length === 0 ? (
              <p className="text-xs text-gray-300 italic text-center py-2">Nothing for sale you can buy — check back next turn!</p>
            ) : (
              <div className="space-y-2">
                {offers.map(({ def, priceMult }) => {
                  const cost = Math.floor(def!.cost * priceMult)
                  const canAfford = player.cash >= cost
                  const tag = dealTag(priceMult)
                  return (
                    <button key={def!.id} type="button"
                      onClick={() => canAfford && dispatch({ type: 'BUY_ASSET', defId: def!.id, discount: priceMult })}
                      disabled={!canAfford}
                      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 disabled:opacity-40 active:scale-95 transition-transform border-2 ${
                        priceMult < 1 ? 'bg-gradient-to-r from-amber-50 to-white border-amber-300' : 'bg-gradient-to-r from-emerald-50 to-white border-emerald-200'
                      }`}>
                      <span className="text-2xl w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">{def!.emoji}</span>
                      <div className="flex-1 text-left">
                        <div className="font-black text-gray-900 text-sm flex items-center gap-1.5 flex-wrap">
                          {def!.name}
                          {tag && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${tag.cls}`}>{tag.label}</span>}
                        </div>
                        <div className="text-xs font-bold text-gray-500">
                          ${cost.toLocaleString()}
                          {priceMult !== 1 && <span className="line-through text-gray-300 ml-1">${def!.cost.toLocaleString()}</span>}
                          {' · '}<span className="text-green-600">+${def!.income.toLocaleString()}/turn</span>
                          {def!.degreeOnly && ' · 🎓'}
                          {def!.requiresProperties && ` · needs ${def!.requiresProperties} 🏠`}
                        </div>
                      </div>
                      {!canAfford && (
                        <span className="text-[10px] font-bold text-gray-400 shrink-0">
                          Need ${(cost - player.cash).toLocaleString()}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-[10px] font-bold text-gray-300 mt-1.5 text-center">Buying ends your turn — choose wisely!</p>
          </div>

          {/* Quick moves — these don't end the turn */}
          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">⚡ Quick moves</h3>
            <div className="space-y-2">
              <button type="button"
                onClick={() => dispatch({ type: 'BUY_INSURANCE' })}
                disabled={!canInsure}
                className="w-full flex items-center gap-3 bg-blue-50 border-2 border-blue-200 rounded-2xl px-4 py-3 disabled:opacity-40 active:scale-95 transition-transform">
                <span className="text-2xl w-11 h-11 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">🛡️</span>
                <div className="flex-1 text-left">
                  <div className="font-black text-blue-900 text-sm">Buy Insurance · ${INSURANCE_COST}</div>
                  <div className="text-xs font-bold text-blue-600">
                    Blocks one bad money event · you have {player.insurance}/{MAX_INSURANCE}
                  </div>
                </div>
              </button>

              {player.assets.map(a => {
                const def = ASSETS.find(d => d.id === a.defId)
                if (!def) return null
                const refund = Math.floor(def.cost * SELL_RATIO)
                return (
                  <button key={a.uid} type="button"
                    onClick={() => dispatch({ type: 'SELL_ASSET', uid: a.uid })}
                    className="w-full flex items-center gap-3 bg-gray-50 border-2 border-gray-200 rounded-2xl px-4 py-2.5 active:scale-95 transition-transform">
                    <span className="text-xl w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">{def.emoji}</span>
                    <div className="flex-1 text-left">
                      <div className="font-black text-gray-700 text-xs">Sell {def.name}</div>
                      <div className="text-[10px] font-bold text-gray-400">Get back ${refund.toLocaleString()} (75%)</div>
                    </div>
                    <span className="text-xs font-black text-amber-600">+${refund.toLocaleString()}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Degree section */}
          {!hasEnrolled && (
            <div>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">🎓 Education</h3>
              <button type="button"
                onClick={() => dispatch({ type: 'ENROLL_DEGREE' })}
                disabled={!canEnroll}
                className="w-full flex items-center gap-3 bg-purple-50 border-2 border-purple-200 rounded-2xl px-4 py-3 disabled:opacity-40 active:scale-95 transition-transform">
                <span className="text-2xl w-11 h-11 rounded-2xl bg-purple-100 flex items-center justify-center shrink-0">🎓</span>
                <div className="flex-1 text-left">
                  <div className="font-black text-purple-900">Enrol in Degree</div>
                  <div className="text-xs font-bold text-purple-600">
                    Pay ${DEGREE_COST.toLocaleString()} · unlock better careers in 2 turns
                  </div>
                </div>
                {!canEnroll && player.cash < DEGREE_COST && (
                  <span className="text-[10px] font-bold text-gray-400">Need ${(DEGREE_COST - player.cash).toLocaleString()}</span>
                )}
              </button>
            </div>
          )}

          {/* Skip */}
          <button type="button"
            onClick={() => dispatch({ type: 'END_TURN' })}
            className="w-full py-4 border-2 border-gray-200 text-gray-600 font-black text-lg rounded-2xl active:scale-95 transition-transform">
            ⏭️ Save my cash — End Turn
          </button>
        </div>
      </div>
    </div>
  )
}
