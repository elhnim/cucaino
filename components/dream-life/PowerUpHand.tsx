"use client"

// Mockup: 14-powerups-hand.html — 3 slots, permanents, attack explainer.

import { useState } from "react"
import type { GameAction, GameState, PowerUpPayload } from "@/lib/dream-life/types"
import { PERMANENTS, POWERUPS } from "@/lib/dream-life/content/powerups"
import { ASSET_CLASSES } from "@/lib/dream-life/content/assets"
import { SKILL_META, fmtMoney } from "./theme"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
  onClose: () => void
}

export default function PowerUpHand({ state, dispatch, onClose }: Props) {
  const p = state.players[state.currentPlayerIndex]
  const [targeting, setTargeting] = useState<string | null>(null) // card uid awaiting a target choice
  const isMyTurn = state.turnStage === "action"
  const rivals = state.players.filter(pl => pl.id !== p.id)

  function play(uid: string, payload?: PowerUpPayload) {
    dispatch({ type: "PLAY_POWERUP", uid, payload })
    setTargeting(null)
    onClose()
  }

  function needsTarget(id: string): "player" | "asset" | "skill" | null {
    const e = POWERUPS[id]?.effect
    if (!e) return null
    if (e.kind === "stealCash" || e.kind === "payCash" || e.kind === "lifestylePct" || e.kind === "redTape" || e.kind === "scandal" || e.kind === "poach") return "player"
    if (e.kind === "forceNegativeDraw" || e.kind === "shortSell") return "player" // then their asset — v1: first risky asset
    if (e.kind === "doubleIncome" || e.kind === "forceOpportunity") return "asset"
    if (e.kind === "grantSkill") return "skill"
    return null
  }

  const targetingCard = targeting ? p.hand.find(c => c.uid === targeting) : null
  const targetKind = targetingCard ? needsTarget(targetingCard.id) : null

  return (
    <div className="absolute inset-0 z-40 bg-indigo-950/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-[28px] w-full max-w-md overflow-y-auto"
        style={{ maxHeight: "94dvh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 pt-4 pb-2.5 border-b border-gray-100 flex items-center justify-between z-10">
          <div className="font-black text-[16px] text-indigo-950">🃏 {p.name}&apos;s Cards</div>
          <div className="flex items-center gap-2">
            <span className="bg-violet-100 text-violet-700 text-[11px] font-black px-2.5 py-1 rounded-full">{p.hand.length} / 3</span>
            <button type="button" onClick={onClose} className="font-black text-gray-300 text-xl px-1">✕</button>
          </div>
        </div>

        <div className="px-3.5 py-3 flex flex-col gap-2.5">
          {/* targeting flow */}
          {targetingCard && targetKind && (
            <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl px-3 py-2.5">
              <div className="text-[12px] font-black text-violet-800 mb-1.5">
                {POWERUPS[targetingCard.id].emoji} {POWERUPS[targetingCard.id].label} — choose a target:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {targetKind === "player" &&
                  rivals.map(r => {
                    // for asset-targeting offensive cards pick their biggest risky asset automatically
                    const e = POWERUPS[targetingCard.id].effect
                    const riskyAsset =
                      e.kind === "forceNegativeDraw" || e.kind === "shortSell"
                        ? [...r.assets].filter(a => ASSET_CLASSES[a.classId].risk >= 0.22).sort((a, b) => b.value - a.value)[0]
                        : undefined
                    const disabled = (e.kind === "forceNegativeDraw" || e.kind === "shortSell") && !riskyAsset
                    return (
                      <button
                        key={r.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => play(targetingCard.uid, { targetPlayerId: r.id, targetAssetUid: riskyAsset?.uid })}
                        className="bg-white border-2 border-violet-200 rounded-xl px-3 py-1.5 font-black text-[12px] text-indigo-950 disabled:opacity-40"
                      >
                        {r.emoji} {r.name}
                      </button>
                    )
                  })}
                {targetKind === "asset" &&
                  p.assets.map(a => (
                    <button
                      key={a.uid}
                      type="button"
                      onClick={() => play(targetingCard.uid, { targetAssetUid: a.uid })}
                      className="bg-white border-2 border-violet-200 rounded-xl px-3 py-1.5 font-black text-[12px] text-indigo-950"
                    >
                      {ASSET_CLASSES[a.classId].emoji} {fmtMoney(a.value)}
                    </button>
                  ))}
                {targetKind === "skill" &&
                  (Object.keys(SKILL_META) as (keyof typeof SKILL_META)[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => play(targetingCard.uid, { skillId: s })}
                      className="bg-white border-2 border-violet-200 rounded-xl px-3 py-1.5 font-black text-[12px] text-indigo-950"
                    >
                      {SKILL_META[s].emoji} {SKILL_META[s].label}
                    </button>
                  ))}
                <button type="button" onClick={() => setTargeting(null)} className="text-[11px] font-black text-gray-400 px-2">
                  cancel
                </button>
              </div>
            </div>
          )}

          <SectionLabel>In your hand — play one per turn</SectionLabel>
          <div className="flex gap-2">
            {p.hand.map(c => {
              const def = POWERUPS[c.id]
              const reactive = def.timing === "reactive"
              const playable = isMyTurn && !reactive && !p.powerUpPlayedThisTurn
              return (
                <div
                  key={c.uid}
                  className={`flex-1 rounded-2xl border-[3px] p-2.5 text-center ${reactive ? "border-amber-200 bg-amber-50" : "border-violet-200 bg-violet-50"}`}
                  style={{ boxShadow: "0 4px 0 rgba(109,40,217,.2)" }}
                >
                  <div className="text-3xl">{def.emoji}</div>
                  <div className="font-black text-[12px] text-indigo-950">{def.label}</div>
                  <div className={`text-[9px] font-black uppercase ${reactive ? "text-amber-600" : "text-violet-600"}`}>{def.timing}</div>
                  <div className="text-[9px] text-gray-500 font-semibold mt-1 leading-tight">{def.blurb}</div>
                  {reactive ? (
                    <div className="mt-1.5 text-[10px] font-black text-amber-700 bg-amber-200 rounded-full px-2 py-0.5 inline-block">AUTO-OFFERS</div>
                  ) : (
                    <button
                      type="button"
                      disabled={!playable}
                      onClick={() => (needsTarget(c.id) ? setTargeting(c.uid) : play(c.uid))}
                      className="mt-1.5 text-[10px] font-black text-white bg-violet-600 rounded-full px-2.5 py-0.5 disabled:opacity-40"
                    >
                      PLAY NOW
                    </button>
                  )}
                </div>
              )
            })}
            {Array.from({ length: 3 - p.hand.length }, (_, i) => (
              <div key={i} className="flex-1 rounded-2xl border-[3px] border-dashed border-violet-200 bg-violet-50/50 p-2.5 text-center opacity-60">
                <div className="text-3xl">➕</div>
                <div className="font-black text-[12px] text-indigo-950">Empty slot</div>
                <div className="text-[9px] text-gray-400 font-semibold mt-1 leading-tight">Win a mini-game or hit a milestone to draw</div>
              </div>
            ))}
          </div>
          {p.powerUpPlayedThisTurn && (
            <div className="text-[10px] font-bold text-gray-400 text-center">You&apos;ve played your power-up this year — one per turn!</div>
          )}

          <SectionLabel>Permanent badges — always on ⭐</SectionLabel>
          <div className="rounded-2xl border-2 border-gray-100 divide-y divide-dashed divide-gray-100">
            {Object.values(PERMANENTS).map(per => {
              const mine = p.permanents.includes(per.id)
              const someoneElse = !mine && state.players.some(pl => pl.permanents.includes(per.id))
              return (
                <div key={per.id} className={`flex items-center gap-2.5 px-3 py-2 ${mine ? "" : "opacity-45"}`}>
                  <span className="text-2xl">{per.emoji}</span>
                  <div className="flex-1">
                    <div className="font-black text-[13px] text-indigo-950">{per.label}</div>
                    <div className="text-[10px] font-semibold text-gray-500">
                      {per.blurb} · {mine ? "EARNED!" : someoneElse ? "claimed by a rival" : per.milestone}
                    </div>
                  </div>
                  <span className="font-black">{mine ? "⭐" : "🔒"}</span>
                </div>
              )
            })}
          </div>

          <div className="bg-white/90 border-2 border-gray-100 rounded-xl px-3 py-2 text-[10px] font-bold text-indigo-900 leading-snug">
            ⚔️ <b className="text-amber-600">Attack cards</b> (Lawsuit, Market Move, Red Tape…) target rivals — but every attack
            has a defence. Holding the right card at the right time is the game.
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-black uppercase tracking-wider text-violet-300">{children}</div>
}
