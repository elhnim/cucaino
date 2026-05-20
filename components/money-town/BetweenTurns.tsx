"use client"

import type { Player, GameAction } from "@/lib/money-town/types"
import { PLAYER_COLOR_CLASSES } from "@/lib/money-town/constants"

interface Props {
  currentPlayer: Player
  nextPlayer: Player
  dispatch: (action: GameAction) => void
}

export default function BetweenTurns({ currentPlayer, nextPlayer, dispatch }: Props) {
  const cc = PLAYER_COLOR_CLASSES[nextPlayer.color]

  return (
    <div
      className={`min-h-screen ${cc.bg} flex flex-col items-center justify-center p-6 cursor-pointer select-none`}
      onClick={() => dispatch({ type: 'NEXT_TURN' })}
    >
      <div className="text-6xl mb-4">{nextPlayer.emoji}</div>
      <h2 className={`text-3xl font-black ${cc.text} mb-2 text-center`}>
        Pass to {nextPlayer.name} 👋
      </h2>
      <p className="text-sm text-gray-500">Tap anywhere to continue</p>
    </div>
  )
}
