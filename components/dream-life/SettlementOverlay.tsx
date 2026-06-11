"use client"

// Mockup: 16-year-settlement.html — ledger, freedom check, next player.
// Numbers come straight from state.lastSettlement, never recomputed here.

import type { GameAction, GameState } from "@/lib/dream-life/types"
import { ASSET_CLASSES } from "@/lib/dream-life/content/assets"
import { fmtMoneyFull } from "./theme"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
}

export default function SettlementOverlay({ state, dispatch }: Props) {
  const st = state.lastSettlement!
  const settled = state.players.find(p => p.id === st.playerId)!
  const next = state.players[state.currentPlayerIndex]
  const isPhase3 = state.phaseOf[settled.id] === "phase3" || state.phaseOf[settled.id] === "careerReel"

  const rows: { label: string; amount: number; kind: "in" | "out" }[] = [
    { label: `💼 Salary`, amount: st.salary, kind: "in" },
    ...(st.passive !== 0 ? [{ label: "💵 Passive income", amount: st.passive, kind: st.passive >= 0 ? ("in" as const) : ("out" as const) }] : []),
    { label: "🧾 Living costs", amount: -st.lifestyle, kind: "out" },
    ...(st.interest > 0 ? [{ label: "🏦 Debt interest", amount: -st.interest, kind: "out" as const }] : []),
    ...(st.premiums > 0 ? [{ label: "🛡️ Insurance premium", amount: -st.premiums, kind: "out" as const }] : []),
  ]

  const growth = st.assetChanges.filter(c => c.delta !== 0)

  return (
    <div className="absolute inset-0 z-40 bg-indigo-950/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm flex flex-col gap-2.5 py-3">
        <div className="text-center text-white" style={{ textShadow: "0 2px 0 rgba(46,16,101,.35)" }}>
          <div className="font-black text-lg">
            📒 {settled.emoji} {settled.name}&apos;s Year in Review
          </div>
        </div>

        <div className="bg-white rounded-3xl border-[3px] border-white overflow-hidden" style={{ boxShadow: "0 6px 0 rgba(46,16,101,.18)" }}>
          <div className="px-4 py-3 flex flex-col gap-1 text-[13px]">
            {rows.map((r, i) => (
              <div key={i} className={`flex justify-between font-bold ${r.amount >= 0 ? "text-green-700" : "text-red-700"}`}>
                <span>{r.label}</span>
                <b>
                  {r.amount >= 0 ? "+" : "−"}
                  {fmtMoneyFull(Math.abs(r.amount)).slice(r.amount < 0 ? 1 : 0)}
                </b>
              </div>
            ))}
            <div className={`flex justify-between font-black border-t-2 border-gray-100 pt-1.5 text-[15px] ${st.saved >= 0 ? "text-green-800" : "text-red-700"}`}>
              <span>{st.saved >= 0 ? "Saved this year" : "Went backwards"}</span>
              <b>
                {st.saved >= 0 ? "+" : ""}
                {fmtMoneyFull(st.saved)}
              </b>
            </div>
            {growth.length > 0 && (
              <div className="flex justify-between text-[11px] font-bold text-violet-700 pt-0.5">
                <span>📈 Assets</span>
                <b className="text-right">
                  {growth.map(c => `${ASSET_CLASSES[c.classId].emoji} ${c.delta >= 0 ? "+" : "−"}${fmtMoneyFull(Math.abs(c.delta)).slice(c.delta < 0 ? 1 : 0)}`).join(" · ")}
                </b>
              </div>
            )}
          </div>
        </div>

        {isPhase3 && (
          <div className="bg-white rounded-3xl border-[3px] border-violet-200 overflow-hidden" style={{ boxShadow: "0 6px 0 rgba(46,16,101,.18)" }}>
            <div className="px-4 py-2.5">
              <div className="text-[9px] font-black uppercase tracking-wider text-violet-400 mb-1">The freedom check</div>
              <div className="relative h-5 bg-violet-50 border-2 border-violet-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full" style={{ width: `${st.freedomPct}%` }} />
                <span className="absolute top-1/2 -translate-y-[55%] text-[13px]" style={{ left: `calc(${Math.max(st.freedomPct, 3)}% - 9px)` }}>
                  {settled.emoji}
                </span>
              </div>
              <div className="text-center text-[11px] font-black text-violet-700 mt-1">
                {st.freedomPct >= 100 ? "FREE! 🏁🎉" : `${st.freedomPct}% — not free yet, keep building!`}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => dispatch({ type: "DISMISS_OVERLAY" })}
          className="rounded-[20px] border-[3px] border-white/70 bg-gradient-to-br from-green-400 to-green-600 py-3.5 text-white font-black text-lg active:scale-[0.99]"
          style={{ boxShadow: "0 6px 0 #15803d, 0 12px 24px rgba(0,0,0,.25)", textShadow: "0 1px 0 rgba(0,0,0,.2)" }}
        >
          {next.id === settled.id ? "KEEP GOING ▶" : `${next.emoji} ${next.name.toUpperCase()}'S TURN ▶`}
        </button>
      </div>
    </div>
  )
}
