"use client"

// Mockup: 09-phase3-board.html — freedom bar, asset shelf, plan-your-year CTA, race strip.

import { useState } from "react"
import type { GameAction, GameState } from "@/lib/dream-life/types"
import {
  assetNetCash,
  currentRank,
  expensesOf,
  freedomPct,
  passiveIncome,
  salaryOf,
} from "@/lib/dream-life/selectors"
import { ASSET_CLASSES } from "@/lib/dream-life/content/assets"
import { APPRENTICE_PASSIVE } from "@/lib/dream-life/content/careers"
import { PLAYER_GRADIENTS, GOLD_GLOW, fmtMoney, fmtMoneyFull } from "./theme"
import { Label, PlayerStrip } from "./widgets"
import ActionSheet from "./ActionSheet"
import PortfolioSheet from "./PortfolioSheet"
import BuyAssetSheet from "./BuyAssetSheet"
import SkillsSheet from "./SkillsSheet"
import PowerUpHand from "./PowerUpHand"

type Sheet = null | "actions" | "portfolio" | "shop" | "skills" | "hand"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
}

export default function Phase3Board({ state, dispatch }: Props) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const p = state.players[state.currentPlayerIndex]
  const rank = currentRank(p)
  const passive = passiveIncome(p)
  const expenses = expensesOf(p, "phase3")
  const pct = freedomPct(p)
  const salary = salaryOf(p, "phase3")

  return (
    <div className="flex flex-col gap-2.5 p-3 min-h-full">
      {/* active player card */}
      <div className="bg-white rounded-3xl border-[3px] border-yellow-300 overflow-hidden" style={{ boxShadow: GOLD_GLOW }}>
        <div className={`bg-gradient-to-br ${PLAYER_GRADIENTS[p.color]} px-3 py-2 flex items-center gap-2 text-white`}>
          <span className="text-2xl">{p.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-black text-[13px] truncate">
              {p.name} · 🔧 {rank.title}
            </div>
            <div className="text-[9px] opacity-85">
              Salary {fmtMoney(salary)} · lifestyle {fmtMoney(expenses)}
              {p.insured ? " · 🛡️ insured" : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="font-black text-[15px]">{fmtMoneyFull(p.cash)}</div>
            <div className="text-[9px] opacity-75">cash</div>
          </div>
        </div>
        <div className="px-3 py-2 flex flex-col gap-2">
          {/* freedom bar */}
          <div>
            <div className="flex justify-between items-baseline mb-0.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-violet-400">Freedom — passive income vs expenses</span>
              <span className="text-[11px] font-black text-violet-700">{pct}% 🏁</span>
            </div>
            <div className="relative h-5 bg-violet-50 border-2 border-violet-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
              <span className="absolute top-1/2 -translate-y-[55%] text-[13px] animate-bounce" style={{ left: `calc(${Math.max(pct, 3)}% - 9px)` }}>
                {p.emoji}
              </span>
            </div>
            <div className="flex justify-between text-[9px] font-bold text-gray-500 mt-0.5">
              <span>💵 passive {fmtMoney(passive)}/yr</span>
              <span>🧾 expenses {fmtMoney(expenses)}/yr</span>
            </div>
          </div>
          {/* asset shelf */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {p.assets.map(a => {
              const cls = ASSET_CLASSES[a.classId]
              const net = assetNetCash(p, a)
              return (
                <button
                  key={a.uid}
                  type="button"
                  onClick={() => setSheet("portfolio")}
                  className="shrink-0 text-center bg-green-50 border-2 border-green-200 rounded-xl px-2 py-1"
                >
                  <div className="text-lg leading-none">{cls.emoji}</div>
                  <div className="text-[8px] font-black text-green-800">{cls.label.split(" ")[0]}</div>
                  <div className={`text-[9px] font-black text-white rounded-full px-1.5 ${net >= 0 ? "bg-green-600" : "bg-red-500"}`}>
                    {net >= 0 ? "+" : ""}
                    {fmtMoney(net)}
                  </div>
                </button>
              )
            })}
            {p.apprentices > 0 && (
              <div className="shrink-0 text-center bg-green-50 border-2 border-green-200 rounded-xl px-2 py-1">
                <div className="text-lg leading-none">👷</div>
                <div className="text-[8px] font-black text-green-800">Apprentice{p.apprentices > 1 ? `s ×${p.apprentices}` : ""}</div>
                <div className="text-[9px] font-black text-white bg-green-600 rounded-full px-1.5">+{fmtMoney(p.apprentices * APPRENTICE_PASSIVE)}</div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSheet("hand")}
              className="shrink-0 text-center bg-violet-50 border-2 border-violet-200 rounded-xl px-2 py-1"
            >
              <div className="text-lg leading-none">🃏</div>
              <div className="text-[8px] font-black text-violet-700">Hand</div>
              <div className="text-[9px] font-black text-white bg-violet-600 rounded-full px-1.5">
                {p.hand.length} card{p.hand.length === 1 ? "" : "s"}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* plan the year CTA */}
      <button
        type="button"
        onClick={() => setSheet("actions")}
        className="rounded-[20px] border-[3px] border-white/70 bg-gradient-to-br from-green-400 to-green-600 py-3.5 text-white font-black text-lg active:scale-[0.99]"
        style={{ boxShadow: "0 6px 0 #15803d, 0 12px 24px rgba(0,0,0,.25)", textShadow: "0 1px 0 rgba(0,0,0,.2)" }}
      >
        📋 PLAN YOUR YEAR
        <span className="block text-[11px] font-bold opacity-85">pick one action, then live the year</span>
      </button>

      <div className="flex gap-2">
        {(["portfolio", "skills", "hand"] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSheet(s)}
            className="flex-1 rounded-[18px] border-[3px] border-white bg-white/35 py-2.5 font-black text-[13px] text-indigo-950"
            style={{ boxShadow: "0 4px 0 rgba(46,16,101,.15)" }}
          >
            {s === "portfolio" ? "💼 Portfolio" : s === "skills" ? "📈 Skills" : "🃏 Cards"}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-1 flex flex-col gap-1.5">
        <Label>The race to freedom</Label>
        <PlayerStrip state={state} />
      </div>

      {/* sheets */}
      {sheet === "actions" && <ActionSheet state={state} dispatch={dispatch} onClose={() => setSheet(null)} onShop={() => setSheet("shop")} />}
      {sheet === "portfolio" && <PortfolioSheet state={state} dispatch={dispatch} onClose={() => setSheet(null)} onShop={() => setSheet("shop")} />}
      {sheet === "shop" && <BuyAssetSheet state={state} dispatch={dispatch} onClose={() => setSheet(null)} />}
      {sheet === "skills" && <SkillsSheet state={state} onClose={() => setSheet(null)} />}
      {sheet === "hand" && <PowerUpHand state={state} dispatch={dispatch} onClose={() => setSheet(null)} />}
    </div>
  )
}
