"use client"

// Mockup: 13-skills.html — 4 ladder cards, 10-dot rows, Now/Next lines.

import type { GameState, SkillId } from "@/lib/dream-life/types"
import { SKILL_LADDERS } from "@/lib/dream-life/content/skills"
import { SKILL_META } from "./theme"

interface Props {
  state: GameState
  onClose: () => void
}

const IDENTITY: Record<SkillId, string> = {
  moneySmarts: "buy your way free",
  proSkills: "climb your way free",
  grit: "out-hustle your way free",
  bigBrain: "outsmart your way free",
}

export default function SkillsSheet({ state, onClose }: Props) {
  const p = state.players[state.currentPlayerIndex]

  return (
    <div className="absolute inset-0 z-40 bg-indigo-950/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-[28px] w-full max-w-md overflow-y-auto"
        style={{ maxHeight: "94dvh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 pt-4 pb-2.5 border-b border-gray-100 flex items-center justify-between z-10">
          <div className="font-black text-[16px] text-indigo-950">📈 {p.name}&apos;s Skills</div>
          <button type="button" onClick={onClose} className="font-black text-gray-300 text-xl px-1">✕</button>
        </div>

        <div className="px-3.5 py-3 flex flex-col gap-2.5">
          {(Object.keys(SKILL_META) as SkillId[]).map(id => {
            const ladder = SKILL_LADDERS[id]
            const meta = SKILL_META[id]
            const lvl = p.skills[id]
            const now = ladder.levels[lvl - 1]
            const next = ladder.levels[lvl]
            return (
              <div key={id} className="rounded-2xl border-2 border-gray-100 overflow-hidden">
                <div className={`bg-gradient-to-br ${meta.grad} px-3 py-2 flex items-center gap-2 text-white`} style={{ textShadow: "0 1px 0 rgba(0,0,0,.15)" }}>
                  <span className="text-lg">{meta.emoji}</span>
                  <span className="font-black text-[13px] flex-1">
                    {meta.label} — <i className="font-bold">{IDENTITY[id]}</i>
                  </span>
                  <span className="bg-white text-gray-800 text-[11px] font-black px-2 py-0.5 rounded-full">L{lvl}</span>
                </div>
                <div className="px-3 py-2">
                  <div className="flex gap-1 mb-1.5">
                    {Array.from({ length: 10 }, (_, i) => (
                      <span
                        key={i}
                        className={`flex-1 h-2.5 rounded-full ${
                          i < lvl ? "bg-gradient-to-br from-violet-300 to-violet-600" : i === lvl ? "bg-white border-2 border-dashed border-violet-500" : "bg-violet-100"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] text-gray-700">
                    <b>Now:</b> {now.name} — {now.blurb}
                  </div>
                  {next ? (
                    <div className="text-[11px] font-bold text-violet-700">
                      <b>Next (L{lvl + 1}):</b> {next.name} — {next.blurb}
                    </div>
                  ) : (
                    <div className="text-[11px] font-bold text-amber-600">⭐ MAXED — a true {meta.label} legend!</div>
                  )}
                </div>
              </div>
            )
          })}
          <div className="text-center text-[10px] font-bold text-violet-400 pb-1">
            Every level costs a year — choose which life you&apos;re building 🌟
          </div>
        </div>
      </div>
    </div>
  )
}
