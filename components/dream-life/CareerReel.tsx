"use client"

// Mockup: 07-career-reel.html — qualified pool lit, spin lands on Tradesperson.

import { useState } from "react"
import type { GameAction, GameState } from "@/lib/dream-life/types"
import { qualifiedCareers } from "@/lib/dream-life/selectors"
import { CAREERS } from "@/lib/dream-life/content/careers"
import { SKILL_META, TOY_SHADOW, GOLD_GLOW } from "./theme"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
}

function gateLabel(careerId: keyof typeof CAREERS): string {
  const c = CAREERS[careerId]
  if (c.gate.kind === "talent") return `🎟️ ${c.gate.tokens} TOKEN${c.gate.tokens > 1 ? "S" : ""}`
  const meta = SKILL_META[c.gate.skill]
  return `${meta.emoji} ${meta.label.split(" ")[0].toUpperCase()} L${c.gate.level}`
}

export default function CareerReel({ state, dispatch }: Props) {
  const p = state.players[state.currentPlayerIndex]
  const qualified = new Set(qualifiedCareers(p))
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="flex flex-col gap-2.5 p-3 min-h-full">
      <div className="text-center text-white" style={{ textShadow: "0 2px 0 rgba(46,16,101,.35)" }}>
        <div className="font-black text-lg">
          <span className="text-2xl">{p.emoji}</span> {p.name}, it&apos;s time to choose your path!
        </div>
        <div className="text-[11px] font-bold text-violet-100">
          Your teen years earned you <b className="text-yellow-300">{qualified.size} career{qualified.size === 1 ? "" : "s"}</b> — the reel picks among them
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {Object.values(CAREERS).map(c => {
          const q = qualified.has(c.id)
          const isTradie = c.id === "tradesperson"
          return (
            <div
              key={c.id}
              className={`bg-white rounded-2xl border-[3px] p-2 text-center ${
                revealed && isTradie ? "border-yellow-300 scale-105" : q ? "border-violet-300" : "border-white opacity-35"
              }`}
              style={{ boxShadow: revealed && isTradie ? GOLD_GLOW : TOY_SHADOW }}
            >
              <div className="text-2xl">{c.emoji}</div>
              <div className="text-[9px] font-black text-indigo-950 leading-tight">{c.label}</div>
              <div className={`text-[8px] font-black ${q ? "text-green-600" : "text-gray-400"}`}>
                {q ? `${gateLabel(c.id)} ✓` : `🔒 ${gateLabel(c.id)}`}
              </div>
            </div>
          )
        })}
      </div>

      {revealed ? (
        <>
          <div className="rounded-[26px] overflow-hidden border-4 border-white -rotate-1" style={{ boxShadow: "0 10px 0 rgba(46,16,101,.22)" }}>
            <div className="px-4 pt-6 pb-4 text-center text-white bg-gradient-to-br from-amber-300 to-amber-500" style={{ textShadow: "0 2px 0 rgba(0,0,0,.18)" }}>
              <div className="text-6xl inline-block animate-bounce">🔧</div>
              <h3 className="text-[22px] font-black leading-tight">You&apos;re a Tradesperson!</h3>
              <div className="text-[11px] opacity-90">Earn while you learn — start your apprenticeship at 17, debt-free.</div>
            </div>
            <div className="bg-white px-4 py-3 text-center text-[11px] text-gray-500 leading-snug">
              🚧 <b>More lives coming soon!</b> In this version every path leads to the trades — your other qualified careers are
              saved for future updates.
            </div>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: "RESOLVE_CAREER_REEL" })}
            className="mt-auto rounded-[20px] border-[3px] border-white/70 bg-gradient-to-br from-green-400 to-green-600 py-3.5 text-white font-black text-lg active:scale-[0.99]"
            style={{ boxShadow: "0 6px 0 #15803d, 0 12px 24px rgba(0,0,0,.25)", textShadow: "0 1px 0 rgba(0,0,0,.2)" }}
          >
            START MY APPRENTICESHIP ▶
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-auto rounded-[20px] border-[3px] border-white/70 bg-gradient-to-br from-violet-400 to-violet-600 py-5 text-white font-black text-xl active:scale-[0.99]"
          style={{ boxShadow: "0 6px 0 #6d28d9, 0 12px 24px rgba(0,0,0,.25)", textShadow: "0 1px 0 rgba(0,0,0,.2)" }}
        >
          🎰 SPIN THE CAREER REEL!
        </button>
      )}
    </div>
  )
}
