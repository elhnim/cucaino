"use client"

// Mockup: 15-reactive-prompt.html — pass-the-tablet defence window, no timer.

import type { GameAction, GameState } from "@/lib/dream-life/types"
import { POWERUPS } from "@/lib/dream-life/content/powerups"
import { LIFE_DECK, TRADIE_DECK } from "@/lib/dream-life/content/decks"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
}

export default function ReactionPrompt({ state, dispatch }: Props) {
  const pr = state.pendingReaction!
  const target = state.players.find(p => p.id === pr.targetPlayerId)!
  const card = [...LIFE_DECK.negative, ...TRADIE_DECK.negative].find(c => c.code === pr.trigger.code)
  const defCard = target.hand.find(c => c.uid === pr.eligibleCardUids[0])
  const def = defCard ? POWERUPS[defCard.id] : null
  const halved = target.insured && card?.tags?.includes("insurable")

  return (
    <div className="absolute inset-0 z-50 bg-indigo-950/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-[28px] border-4 border-white w-full max-w-md overflow-hidden" style={{ boxShadow: "0 10px 0 rgba(46,16,101,.25)" }}>
        <div className="bg-gradient-to-br from-red-400 to-red-600 px-5 pt-6 pb-4 text-center text-white" style={{ textShadow: "0 2px 0 rgba(0,0,0,.18)" }}>
          <div className="text-6xl inline-block animate-bounce">{card?.emoji ?? "⚠️"}</div>
          <h2 className="text-2xl font-black leading-tight">{card?.title ?? "Bad luck!"}</h2>
          <div className="text-[12px] opacity-90">{card?.blurb}</div>
        </div>
        <div className="px-4 py-4 text-center">
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-3 py-2.5">
            <div className="text-[13px] font-black text-yellow-800">📲 Pass the tablet to {target.name}!</div>
            <div className="text-[11px] text-gray-500 font-semibold">
              {target.emoji} {target.name} holds a card that can answer this…
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => dispatch({ type: "REACTION", play: true })}
              className="flex-1 rounded-2xl border-[3px] border-amber-200 bg-amber-50 p-3 text-center active:scale-[0.98]"
              style={{ boxShadow: "0 4px 0 rgba(109,40,217,.15)" }}
            >
              <div className="text-3xl">{def?.emoji}</div>
              <div className="font-black text-[13px] text-indigo-950">Play {def?.label}</div>
              <div className="text-[10px] font-black text-green-600">BLOCKS IT — nothing lost</div>
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "REACTION", play: false })}
              className="flex-1 rounded-2xl border-[3px] border-gray-200 bg-gray-50 p-3 text-center active:scale-[0.98]"
            >
              <div className="text-3xl">😮‍💨</div>
              <div className="font-black text-[13px] text-indigo-950">Take the hit</div>
              <div className="text-[10px] font-black text-red-600">{halved ? "insurance halves it" : "ouch — keep the card"}</div>
            </button>
          </div>

          <div className="text-[10px] text-gray-400 font-semibold mt-3">Saving it for something worse? That&apos;s the strategy. 😏</div>
        </div>
      </div>
    </div>
  )
}
