"use client"

import type { Player, BadLuckEvent, GameAction } from "@/lib/money-town/types"
import { ASSETS } from "@/lib/money-town/constants"

interface Props {
  player: Player
  event: BadLuckEvent
  dispatch: (action: GameAction) => void
}

function describeEffect(player: Player, event: BadLuckEvent): string {
  if (event.type === 'flat' || event.type === 'friend' || event.type === 'cash') {
    return `Lose $${event.amount}`
  }
  if (event.type === 'business-skip') {
    const hasBusiness = player.assets.some(a => ASSETS.find(x => x.id === a.assetId)?.type === 'business')
    return hasBusiness ? 'One business earns $0 next round' : 'Lose $100 (no businesses)'
  }
  if (event.type === 'property-repair') {
    const hasProperty = player.assets.some(a => ASSETS.find(x => x.id === a.assetId)?.type === 'property')
    return hasProperty ? 'Pay 10% of one property\'s value (min $50)' : 'Lose $100 (no properties)'
  }
  return ''
}

export default function BadLuckCard({ player, event, dispatch }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">{event.emoji}</div>
      <h2 className="text-2xl font-black text-gray-700 mb-2">Bad Luck!</h2>
      <p className="text-gray-600 text-lg mb-2">{event.description}</p>
      <p className="text-sm font-bold text-red-500 mb-8">{describeEffect(player, event)}</p>
      <button
        type="button"
        onClick={() => dispatch({ type: 'DISMISS_BAD_LUCK' })}
        className="px-10 py-4 bg-gray-700 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform"
      >
        OK 😤
      </button>
    </div>
  )
}
