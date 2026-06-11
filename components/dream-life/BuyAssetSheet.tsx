"use client"

// Mockup: 12-buy-asset.html — asset shop, Money Smarts unlock ladder, Business multi-gate.

import type { AssetClassId, GameAction, GameState, SkillId } from "@/lib/dream-life/types"
import { ASSET_CLASSES } from "@/lib/dream-life/content/assets"
import { SKILL_META, fmtMoney, fmtMoneyFull } from "./theme"
import { ActionRow } from "./widgets"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
  onClose: () => void
}

export default function BuyAssetSheet({ state, dispatch, onClose }: Props) {
  const p = state.players[state.currentPlayerIndex]
  const isMyTurn = state.turnStage === "action"

  function gateInfo(id: AssetClassId): { unlocked: boolean; label: string } {
    const cls = ASSET_CLASSES[id]
    if (cls.unlock.kind === "moneySmarts") {
      const ok = p.skills.moneySmarts >= cls.unlock.level
      return { unlocked: ok, label: ok ? "" : `🔒 SMARTS L${cls.unlock.level}` }
    }
    const parts = Object.entries(cls.unlock.levels) as [SkillId, number][]
    const ok = parts.every(([s, l]) => p.skills[s] >= l)
    const detail = parts.map(([s, l]) => `${SKILL_META[s].emoji}L${l} ${p.skills[s] >= l ? "✓" : "✗"}`).join(" ")
    return { unlocked: ok, label: ok ? "" : `🔒 ${detail}` }
  }

  function affordable(id: AssetClassId): boolean {
    return p.cash >= ASSET_CLASSES[id].entry
  }

  function buy(id: AssetClassId) {
    const cls = ASSET_CLASSES[id]
    const amount = cls.price === null ? Math.max(cls.entry, p.cash - 2_000) : undefined
    dispatch({ type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: id, amount } })
    onClose()
  }

  const rows: { id: AssetClassId; sub: string }[] = [
    { id: "savings", sub: "💵 4% income · 📈 0% growth · super safe (calm 95%)" },
    { id: "index", sub: "💵 1.5% net · 📈 7% growth · smooth wealth-builder" },
    { id: "shares", sub: "💵 2% net · 📈 9% growth · big swings (±25–40%)" },
    { id: "resi", sub: "$20K deposit on a $100K house · pays off when the loan is gone · 📈 7%" },
    { id: "commercial", sub: "$90K deposit on $300K · +3% net from day one — bought for income" },
    { id: "crypto", sub: "$0 income, wild growth — the pure gamble" },
    { id: "business", sub: "best net yield in the game 👑 · the generalist's crown — needs 3 skills" },
  ]

  return (
    <div className="absolute inset-0 z-40 bg-indigo-950/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-[28px] w-full max-w-md overflow-y-auto"
        style={{ maxHeight: "94dvh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 pt-4 pb-2.5 border-b border-gray-100 flex items-center justify-between z-10">
          <div>
            <div className="font-black text-[16px] text-indigo-950">🛍️ Buy An Asset</div>
            <div className="text-[10px] text-gray-500 font-semibold">
              Cash: <b className="text-amber-600">{fmtMoneyFull(p.cash)}</b> · every asset rolls its own dice each year 🎲
            </div>
          </div>
          <button type="button" onClick={onClose} className="font-black text-gray-300 text-xl px-1">✕</button>
        </div>

        <div className="px-3.5 py-3 flex flex-col gap-2">
          {rows.map(({ id, sub }) => {
            const cls = ASSET_CLASSES[id]
            const gate = gateInfo(id)
            const canBuy = isMyTurn && gate.unlocked && affordable(id)
            const tag = !gate.unlocked
              ? gate.label
              : !affordable(id)
                ? `🔒 need ${fmtMoney(cls.entry)}`
                : cls.price !== null
                  ? `${fmtMoney(cls.entry)} dep`
                  : `${fmtMoney(cls.entry)} min`
            return (
              <ActionRow
                key={id}
                emoji={cls.emoji}
                title={cls.label}
                sub={sub}
                tag={tag}
                tagKind={canBuy ? "free" : "locked"}
                locked={!canBuy}
                onClick={() => buy(id)}
              />
            )
          })}

          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl px-3 py-2 text-[10px] font-bold text-amber-700 leading-snug">
            💡 <b>Strategy tip:</b> growth assets build wealth; income assets win the game. Grow first, then <b>harvest</b> into
            income.
          </div>
        </div>
      </div>
    </div>
  )
}
