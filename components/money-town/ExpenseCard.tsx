"use client"

import type { Player, ExpenseEvent, GameAction } from "@/lib/money-town/types"

interface Props {
  player: Player
  event: ExpenseEvent
  dispatch: (action: GameAction) => void
}

export default function ExpenseCard({ player, event, dispatch }: Props) {
  const newCash = Math.max(0, player.cash - event.cost)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">{event.emoji}</div>
      <h2 className="text-2xl font-black text-red-700 mb-2">Surprise Expense!</h2>
      <p className="text-gray-600 mb-2">{event.description}</p>
      <div className="text-4xl font-black text-red-500 mb-2">−${event.cost}</div>
      <p className="text-sm text-gray-400 mb-8">
        Cash: ${player.cash} → <strong>${newCash}</strong>
      </p>
      <button
        type="button"
        onClick={() => dispatch({ type: 'DISMISS_EXPENSE' })}
        className="px-10 py-4 bg-gray-700 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform"
      >
        OK 😬
      </button>
    </div>
  )
}
