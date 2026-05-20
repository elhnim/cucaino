"use client"

import { createPortal } from "react-dom"
import type { Player, GameAction } from "@/lib/money-town/types"
import { ASSETS } from "@/lib/money-town/constants"
import { sellValue } from "@/lib/money-town/gameLogic"

interface Props {
  player: Player
  dispatch: (action: GameAction) => void
  onClose: () => void
}

export default function AssetList({ player, dispatch, onClose }: Props) {
  const handleSell = (assetId: string) => {
    dispatch({ type: 'SELL_ASSET', assetId })
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-3xl p-5 max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-black mb-4">🏗️ Your Assets</h2>

        {player.assets.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <div className="text-4xl mb-2">🌱</div>
            <div className="text-sm">No assets yet — land on a Deal to buy your first one!</div>
          </div>
        ) : (
          <div className="space-y-3">
            {player.assets.map(owned => {
              const def = ASSETS.find(a => a.id === owned.assetId)
              if (!def) return null
              const net = owned.incomePerRound - owned.interestPerRound
              return (
                <div key={owned.assetId} className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-black text-gray-800">{def.emoji} {def.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        +${owned.incomePerRound}/round
                        {owned.interestPerRound > 0 && ` − $${owned.interestPerRound} interest`}
                        {' '}→ <strong className={net > 0 ? 'text-green-600' : 'text-red-500'}>${net}/round</strong>
                      </div>
                      {owned.mortgageDebt > 0 && (
                        <div className="text-xs text-orange-500 mt-0.5">🏦 Mortgage: ${owned.mortgageDebt} remaining</div>
                      )}
                      {owned.skipNextRound && (
                        <div className="text-xs text-amber-600 mt-0.5">⚠️ Earns $0 next round</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSell(owned.assetId)}
                      className="text-xs font-bold text-gray-400 border border-gray-200 rounded-xl px-3 py-1.5 whitespace-nowrap"
                    >
                      Sell ${sellValue(owned)}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button onClick={onClose} className="w-full mt-4 py-3 bg-gray-100 rounded-2xl font-bold text-gray-600">
          Close
        </button>
      </div>
    </div>,
    document.body
  )
}
