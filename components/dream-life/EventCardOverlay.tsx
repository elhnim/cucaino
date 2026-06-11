"use client"

// Mockup: 05-phase1-event-card.html — spin → tilted event card → settle.
// Covers turnStage "spin" (tap to spin the year) and "settle" (card shown, effects applied).

import { useMemo } from "react"
import type { GameAction, GameState } from "@/lib/dream-life/types"
import { buildSpinOutcome } from "@/lib/dream-life/engine"
import { ASSET_DECKS, LIFE_DECK, MARKET_DECK, TRADIE_DECK } from "@/lib/dream-life/content/decks"
import { PHASE1_CARDS } from "@/lib/dream-life/content/phase1"
import { ASSET_CLASSES } from "@/lib/dream-life/content/assets"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
}

interface CardView {
  emoji: string
  title: string
  blurb: string
  negative: boolean
}

function findCardView(code: string): CardView {
  const p1 = PHASE1_CARDS.find(c => c.code === code)
  if (p1) return { emoji: p1.emoji, title: p1.title, blurb: p1.blurb, negative: p1.cashDelta < 0 }
  const all = [
    ...Object.values(ASSET_DECKS).flatMap(d => [...d.negative.map(c => ({ ...c, neg: true })), ...d.positive.map(c => ({ ...c, neg: false }))]),
    ...LIFE_DECK.negative.map(c => ({ ...c, neg: true })),
    ...LIFE_DECK.positive.map(c => ({ ...c, neg: false })),
    ...TRADIE_DECK.negative.map(c => ({ ...c, neg: true })),
    ...TRADIE_DECK.positive.map(c => ({ ...c, neg: false })),
    ...MARKET_DECK.map(c => ({ ...c, neg: c.code.includes("-N") })),
  ]
  const card = all.find(c => c.code === code)
  return card
    ? { emoji: card.emoji, title: card.title, blurb: card.blurb, negative: card.neg }
    : { emoji: "❓", title: code, blurb: "", negative: false }
}

export default function EventCardOverlay({ state, dispatch }: Props) {
  const p = state.players[state.currentPlayerIndex]
  const spin = state.pendingSpin

  const assetEvents = useMemo(
    () =>
      (spin?.assetRolls ?? [])
        .filter(r => r.card)
        .map(r => {
          const asset = p.assets.find(a => a.uid === r.uid)
          return { view: findCardView(r.card!), cls: asset ? ASSET_CLASSES[asset.classId] : null }
        }),
    [spin, p.assets]
  )

  // STAGE: spin — the big inviting "spin the year" moment
  if (state.turnStage === "spin") {
    return (
      <div className="absolute inset-0 z-40 bg-indigo-950/50 flex items-center justify-center p-5">
        <div className="text-center w-full max-w-sm">
          <div className="text-[12px] font-black text-violet-100 mb-3 tracking-wide">PLAN LOCKED IN…</div>
          <button
            type="button"
            onClick={() => {
              const { outcome, nextCursor } = buildSpinOutcome(state)
              dispatch({ type: "RESOLVE_SPIN", outcome, nextCursor })
            }}
            className="w-full rounded-[26px] border-4 border-white bg-gradient-to-br from-violet-400 to-violet-600 py-8 text-white active:scale-[0.98]"
            style={{ boxShadow: "0 10px 0 rgba(46,16,101,.4), 0 18px 40px rgba(46,16,101,.4)" }}
          >
            <span className="text-6xl inline-block animate-bounce">🎰</span>
            <span className="block font-black text-2xl mt-1" style={{ textShadow: "0 2px 0 rgba(0,0,0,.2)" }}>
              LIVE THE YEAR!
            </span>
            <span className="block text-[11px] font-bold opacity-85">what will age {p.age} bring?</span>
          </button>
        </div>
      </div>
    )
  }

  // STAGE: settle — reveal what happened, then settle up
  if (!spin) return null
  const main = spin.reelCard ? findCardView(spin.reelCard) : null

  return (
    <div className="absolute inset-0 z-40 bg-indigo-950/50 flex items-center justify-center p-5 overflow-y-auto">
      <div className="w-full max-w-sm flex flex-col gap-3 py-4">
        <div className="text-center text-[12px] font-black text-violet-100 tracking-wide">🎰 WHAT HAPPENED THIS YEAR…</div>

        {main && (
          <div className="rounded-[26px] overflow-hidden border-4 border-white -rotate-1" style={{ boxShadow: "0 10px 0 rgba(46,16,101,.22), 0 18px 40px rgba(46,16,101,.25)" }}>
            <div className={`px-4 pt-6 pb-4 text-center text-white bg-gradient-to-br ${main.negative ? "from-red-400 to-red-600" : "from-green-400 to-green-600"}`} style={{ textShadow: "0 2px 0 rgba(0,0,0,.18)" }}>
              <div className="text-6xl inline-block animate-bounce">{main.emoji}</div>
              <h3 className="text-[22px] font-black leading-tight">{main.title}</h3>
              <div className="text-[11px] opacity-90">{main.blurb}</div>
            </div>
          </div>
        )}

        {assetEvents.length > 0 && (
          <div className="bg-white/90 border-[3px] border-white rounded-2xl px-3 py-2.5" style={{ boxShadow: "0 4px 0 rgba(46,16,101,.15)" }}>
            <div className="text-[9px] font-black uppercase tracking-wider text-violet-400 mb-1">Your assets rolled their dice 🎲</div>
            {assetEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-2 py-1 text-[12px] font-bold text-indigo-950">
                <span className="text-lg">{e.cls?.emoji}</span>
                <span className="flex-1">
                  {e.view.emoji} {e.view.title}
                </span>
                <span className={`text-[10px] font-black ${e.view.negative ? "text-red-600" : "text-green-600"}`}>{e.view.negative ? "🔴" : "🟢"}</span>
              </div>
            ))}
          </div>
        )}

        {!main && assetEvents.length === 0 && (
          <div className="bg-white/90 border-[3px] border-white rounded-2xl px-4 py-5 text-center font-bold text-indigo-950 text-sm" style={{ boxShadow: "0 4px 0 rgba(46,16,101,.15)" }}>
            {spin.reelKind === "minigame"
              ? "🎮 Talent time is done — let's see how the year adds up!"
              : "⛅ A calm, steady year — sometimes that's the best kind!"}
          </div>
        )}

        <button
          type="button"
          onClick={() => dispatch({ type: "END_TURN" })}
          className="rounded-[20px] border-[3px] border-white/70 bg-gradient-to-br from-green-400 to-green-600 py-3.5 text-white font-black text-lg active:scale-[0.99]"
          style={{ boxShadow: "0 6px 0 #15803d, 0 12px 24px rgba(0,0,0,.25)", textShadow: "0 1px 0 rgba(0,0,0,.2)" }}
        >
          📒 SETTLE THE YEAR
        </button>
      </div>
    </div>
  )
}
