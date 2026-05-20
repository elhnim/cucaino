"use client"

import type { Player, Asset, GameAction } from "@/lib/money-town/types"
import {
  mortgageDownPayment, mortgageDebt, mortgageInterestPerRound
} from "@/lib/money-town/gameLogic"

interface Props {
  player: Player
  asset: Asset
  dispatch: (action: GameAction) => void
}

export default function DealCard({ player, asset, dispatch }: Props) {
  const canBuyOutright = player.cash >= asset.cost
  const downPayment = mortgageDownPayment(asset)
  const debt = mortgageDebt(asset)
  const interest = mortgageInterestPerRound(asset)
  const netMortgage = asset.incomePerRound - interest
  const canMortgage = asset.type === 'property' && player.cash >= downPayment
  const alreadyOwns = player.assets.some(a => a.assetId === asset.id)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{asset.emoji}</div>
          <h2 className="text-2xl font-black text-gray-900">{asset.name}</h2>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
            {asset.type === 'property' ? 'Property' : 'Business'}
          </span>
        </div>

        {alreadyOwns && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center text-sm font-bold text-amber-700 mb-4">
            You already own this!
          </div>
        )}

        {/* Buy outright */}
        <div className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 p-4 mb-3">
          <div className="flex justify-between items-center mb-2">
            <span className="font-black text-gray-800">Buy Outright</span>
            <span className="text-sm font-bold text-gray-500">Cost: ${asset.cost}</span>
          </div>
          <div className="text-sm text-gray-600 mb-3">
            Earn <strong className="text-green-600">+${asset.incomePerRound}/round</strong> — no ongoing costs
          </div>
          <button
            type="button"
            disabled={!canBuyOutright || alreadyOwns}
            onClick={() => dispatch({ type: 'BUY_ASSET', assetId: asset.id, useMortgage: false })}
            className="w-full py-3 bg-green-500 text-white font-black rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
          >
            {canBuyOutright ? `Buy 💰 $${asset.cost}` : `Need $${asset.cost - player.cash} more`}
          </button>
        </div>

        {/* Mortgage option — properties only */}
        {asset.type === 'property' && (
          <div className="bg-blue-50 rounded-2xl shadow-sm border-2 border-blue-100 p-4 mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="font-black text-blue-800">Mortgage</span>
              <span className="text-sm font-bold text-blue-500">Down: ${downPayment}</span>
            </div>
            <div className="text-xs text-blue-700 space-y-0.5 mb-3">
              <div>Borrow ${debt} · Pay ${interest}/round interest</div>
              <div>Net income: <strong className={netMortgage > 0 ? 'text-green-600' : 'text-red-500'}>+${netMortgage}/round</strong></div>
            </div>
            <button
              type="button"
              disabled={!canMortgage || alreadyOwns}
              onClick={() => dispatch({ type: 'BUY_ASSET', assetId: asset.id, useMortgage: true })}
              className="w-full py-3 bg-blue-500 text-white font-black rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
            >
              {canMortgage ? `Mortgage 🏦 $${downPayment} down` : `Need $${downPayment - player.cash} more`}
            </button>
          </div>
        )}

        {/* Pass */}
        <button
          type="button"
          onClick={() => dispatch({ type: 'PASS_DEAL' })}
          className="w-full py-3 border-2 border-gray-200 text-gray-500 font-bold rounded-xl active:scale-95 transition-transform"
        >
          Pass ➡️
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">Cash on hand: ${player.cash}</p>
      </div>
    </div>
  )
}
