"use client"

// Mockup: 06-phase1-minigame.html — intro card, then the shared mini-game full-screen.
// Win = earn ≥ $60 in the game (skill bar; the cash itself comes from the engine prize).

import { useState } from "react"
import type { GameAction, GameState, MinigameId } from "@/lib/dream-life/types"
import { PHASE1_MINIGAME_PRIZE, PHASE3_MINIGAME_PRIZE } from "@/lib/dream-life/content/phase1"
import CoinRain from "@/components/games/CoinRain"
import LemonSqueeze from "@/components/games/LemonSqueeze"
import CashGrab from "@/components/games/CashGrab"
import PetRush from "@/components/games/PetRush"

const WIN_BAR = 60

const GAME_META: Record<MinigameId, { emoji: string; label: string; blurb: string }> = {
  coinrain: { emoji: "🪙", label: "Coin Rain", blurb: "Catch as many coins as you can!" },
  lemonsqueeze: { emoji: "🍋", label: "Lemon Squeeze", blurb: "Squeeze! Tap as fast as you can!" },
  cashgrab: { emoji: "💵", label: "Cash Grab", blurb: "Grab the cash before it vanishes!" },
  petrush: { emoji: "🐾", label: "Pet Rush", blurb: "Round up the runaway pets!" },
}

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
}

export default function MinigameOverlay({ state, dispatch }: Props) {
  const [playing, setPlaying] = useState(false)
  const p = state.players[state.currentPlayerIndex]
  const phase = state.phaseOf[p.id]
  const id = state.pendingSpin?.minigameId ?? "coinrain"
  const meta = GAME_META[id]

  const onComplete = (cashEarned: number) => {
    dispatch({ type: "MINIGAME_RESULT", won: cashEarned >= WIN_BAR })
  }

  if (playing) {
    return (
      <div className="absolute inset-0 z-40 overflow-y-auto bg-sky-50">
        {id === "coinrain" && <CoinRain onComplete={onComplete} />}
        {id === "lemonsqueeze" && <LemonSqueeze onComplete={onComplete} />}
        {id === "cashgrab" && <CashGrab onComplete={onComplete} />}
        {id === "petrush" && <PetRush onComplete={onComplete} />}
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-40 bg-indigo-950/50 flex items-center justify-center p-5">
      <div className="w-full max-w-sm flex flex-col gap-3">
        <div className="text-center text-[12px] font-black text-violet-100 tracking-wide">🎰 TALENT TIME!</div>

        <div className="rounded-[26px] overflow-hidden border-4 border-white -rotate-1" style={{ boxShadow: "0 10px 0 rgba(46,16,101,.22), 0 18px 40px rgba(46,16,101,.25)" }}>
          <div className="px-4 pt-6 pb-4 text-center text-white bg-gradient-to-br from-violet-400 to-violet-600" style={{ textShadow: "0 2px 0 rgba(0,0,0,.18)" }}>
            <div className="text-6xl inline-block" style={{ animation: "spin 0s" }}>{meta.emoji}</div>
            <h3 className="text-[22px] font-black leading-tight">{meta.label}</h3>
            <div className="text-[11px] opacity-90">{meta.blurb}</div>
          </div>
          <div className="bg-white px-4 py-3 text-center">
            <div className="flex justify-center gap-2">
              <div className="rounded-xl border-2 border-green-200 bg-green-50 px-3 py-1.5">
                <div className="text-[13px] font-black text-green-700">WIN</div>
                <div className="text-[9px] font-black uppercase text-green-700">
                  {phase === "phase1" ? `~$${PHASE1_MINIGAME_PRIZE} + 🎟️ talent token` : `$${PHASE3_MINIGAME_PRIZE.toLocaleString()} + a power-up 🃏`}
                </div>
              </div>
              <div className="rounded-xl border-2 border-yellow-200 bg-yellow-50 px-3 py-1.5">
                <div className="text-[13px] font-black text-yellow-700">LOSE</div>
                <div className="text-[9px] font-black uppercase text-yellow-700">nothing lost!</div>
              </div>
            </div>
            {phase === "phase1" && (
              <div className="text-[11px] text-gray-500 mt-2 leading-snug">
                🎟️ Talent tokens unlock 🎨 Artist, 📱 Influencer, 🏅 Athlete &amp; 🎵 Musician careers.
                <br />
                You get exactly <b>2</b> talent chances as a teen — make them count!
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="rounded-[20px] border-[3px] border-white/70 bg-gradient-to-br from-green-400 to-green-600 py-3.5 text-white font-black text-lg active:scale-[0.99]"
          style={{ boxShadow: "0 6px 0 #15803d, 0 12px 24px rgba(0,0,0,.25)", textShadow: "0 1px 0 rgba(0,0,0,.2)" }}
        >
          ▶ PLAY!
        </button>
      </div>
    </div>
  )
}
