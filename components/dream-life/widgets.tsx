"use client"

// Shared small widgets: skill dots, mini player strip, action rows.

import type { GameState, Player, SkillId } from "@/lib/dream-life/types"
import { freedomPct } from "@/lib/dream-life/selectors"
import { SKILL_META, TOY_SHADOW, GOLD_GLOW, fmtMoney } from "./theme"

export function SkillDots({ player, max = 3 }: { player: Player; max?: 3 | 10 }) {
  return (
    <div className="flex flex-col gap-0.5">
      {(Object.keys(SKILL_META) as SkillId[]).map(id => {
        const meta = SKILL_META[id]
        const lvl = player.skills[id]
        return (
          <div key={id} className="flex items-center gap-1.5 py-0.5">
            <span className="font-black text-[11px] w-[104px] text-gray-800">
              {meta.emoji} {meta.label}
            </span>
            {Array.from({ length: max }, (_, i) => (
              <span
                key={i}
                className={`inline-block rounded-full ${max === 10 ? "w-2.5 h-2.5" : "w-3.5 h-3.5"} ${
                  i < lvl
                    ? "bg-gradient-to-br from-violet-300 to-violet-600"
                    : i === lvl
                      ? "bg-white border-2 border-dashed border-violet-500"
                      : "bg-violet-100"
                }`}
              />
            ))}
            <span className="text-[10px] text-gray-500 ml-1 font-bold">L{lvl}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PlayerStrip({ state }: { state: GameState }) {
  return (
    <div className="flex gap-2">
      {state.players.map((p, i) => {
        const active = i === state.currentPlayerIndex
        const phase = state.phaseOf[p.id]
        return (
          <div
            key={p.id}
            className={`flex-1 rounded-2xl border-[3px] p-1.5 text-center bg-white/80 ${active ? "border-yellow-300" : "border-white"}`}
            style={{ boxShadow: active ? GOLD_GLOW : TOY_SHADOW }}
          >
            <div className={`text-xl ${active ? "animate-bounce inline-block" : ""}`}>{p.emoji}</div>
            <div className="text-[11px] font-black text-indigo-950">{p.name}</div>
            <div className="text-[9px] font-bold text-violet-700">
              {phase === "phase3" ? `${freedomPct(p)}% free` : `Age ${p.age} · ${fmtMoney(p.cash)}`}
            </div>
            {phase === "phase3" && (
              <div className="h-1.5 bg-violet-100 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full" style={{ width: `${freedomPct(p)}%` }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ActionRow({
  emoji,
  title,
  sub,
  tag,
  tagKind = "free",
  locked = false,
  onClick,
}: {
  emoji: string
  title: React.ReactNode
  sub: string
  tag: string
  tagKind?: "free" | "cost" | "locked"
  locked?: boolean
  onClick?: () => void
}) {
  const tagCls =
    tagKind === "free" ? "bg-green-100 text-green-700" : tagKind === "cost" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-400"
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onClick}
      className={`w-full flex items-center gap-3 bg-white rounded-[20px] border-[3px] border-white px-3.5 py-2.5 text-left ${locked ? "opacity-60" : "active:scale-[0.99]"}`}
      style={{ boxShadow: "0 5px 0 rgba(46,16,101,.16)" }}
    >
      <span className={`text-3xl ${locked ? "grayscale-[60%]" : ""}`}>{emoji}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-black text-[15px] text-indigo-950">{title}</span>
        <span className="block text-[11px] font-semibold text-violet-900/60 leading-tight">{sub}</span>
      </span>
      <span className={`text-[11px] font-black rounded-full px-2.5 py-1 whitespace-nowrap ${tagCls}`}>{tag}</span>
    </button>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-black uppercase tracking-wider text-white" style={{ textShadow: "0 1px 1px rgba(46,16,101,.5)" }}>
      {children}
    </div>
  )
}

export function Chip({ value, label, kind }: { value: string; label: string; kind: "green" | "red" | "gold" | "purple" }) {
  const cls = {
    green: "bg-green-50 border-green-200 text-green-700",
    red: "bg-red-50 border-red-200 text-red-700",
    gold: "bg-yellow-50 border-yellow-200 text-yellow-700",
    purple: "bg-violet-50 border-violet-200 text-violet-700",
  }[kind]
  return (
    <div className={`flex-1 rounded-xl border-2 px-1.5 py-1 text-center ${cls}`}>
      <div className="text-[14px] font-black leading-tight">{value}</div>
      <div className="text-[8px] font-black uppercase tracking-wide">{label}</div>
    </div>
  )
}
