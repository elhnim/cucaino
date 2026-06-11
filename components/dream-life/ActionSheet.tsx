"use client"

// Mockup: 10-phase3-actions.html — bottom sheet, three groups, level context per row.

import type { GameAction, GameState } from "@/lib/dream-life/types"
import { legalActions } from "@/lib/dream-life/selectors"
import { SKILL_LADDERS } from "@/lib/dream-life/content/skills"
import { DOWNSIZE_PCT, HOME_LIFESTYLE_SLICE, HOME_PRICE, INSURANCE_PREMIUM, TRADIE_RANKS } from "@/lib/dream-life/content/careers"
import { fmtMoney, fmtMoneyFull } from "./theme"
import { ActionRow } from "./widgets"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
  onClose: () => void
  onShop: () => void
}

export default function ActionSheet({ state, dispatch, onClose, onShop }: Props) {
  const p = state.players[state.currentPlayerIndex]
  const legal = legalActions(state)
  const can = (a: string) => legal.includes(a as (typeof legal)[number])

  const nextRank = TRADIE_RANKS.find(r => r.psLevel > p.skills.proSkills)
  const mortgagedAsset = p.assets.find(a => a.loanBalance > 0)
  const firstDebt = p.debts[0]
  const growthAsset = [...p.assets].sort((a, b) => b.value - a.value).find(a => a.classId === "crypto" || a.classId === "shares" || a.classId === "index")

  const skillRow = (skill: keyof typeof SKILL_LADDERS, action: "invest" | "workHarder" | "hustle" | "study", emoji: string, title: string) => {
    const ladder = SKILL_LADDERS[skill]
    const lvl = p.skills[skill]
    const next = ladder.levels[lvl] // index lvl = next level def
    return (
      <ActionRow
        emoji={emoji}
        title={title}
        sub={next ? `${ladder.label} +1 · L${lvl + 1}: ${next.name} — ${next.blurb}` : `${ladder.label} is MAXED at L10!`}
        tag={next ? `L${lvl} → L${lvl + 1}` : "✓ MAX"}
        tagKind={next && can(action) ? "free" : "locked"}
        locked={!next || !can(action)}
        onClick={() =>
          dispatch({
            type: "CHOOSE_ACTION",
            action,
            payload:
              action === "invest" && p.cash > 2_000
                ? { assetClassId: p.skills.moneySmarts >= 3 ? "shares" : p.skills.moneySmarts >= 2 ? "index" : "savings", amount: p.cash - 1_000 }
                : undefined,
          })
        }
      />
    )
  }

  return (
    <div className="absolute inset-0 z-40 bg-indigo-950/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-[28px] w-full max-w-md overflow-y-auto"
        style={{ maxHeight: "94dvh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 pt-4 pb-2.5 border-b border-gray-100 flex items-center justify-between z-10">
          <div>
            <div className="font-black text-[17px] text-indigo-950">
              <span className="text-xl">{p.emoji}</span> Your Move, {p.name}
            </div>
            <div className="text-[10px] text-gray-500 font-semibold">
              Age {p.age} · {fmtMoneyFull(p.cash)} cash · one action shapes the whole year
            </div>
          </div>
          <button type="button" onClick={onClose} className="font-black text-gray-300 text-xl px-2">
            ✕
          </button>
        </div>

        <div className="px-3.5 py-3 flex flex-col gap-2">
          <GroupLabel>Grow your money</GroupLabel>
          <ActionRow
            emoji="🏠"
            title="Buy an asset"
            sub="open the shop — savings, funds, property, business"
            tag="SHOP →"
            tagKind={can("buyAsset") ? "free" : "locked"}
            locked={!can("buyAsset")}
            onClick={onShop}
          />
          <ActionRow
            emoji="💱"
            title="Harvest / convert"
            sub={
              growthAsset
                ? `sell your biggest growth pile (${fmtMoney(growthAsset.value)}) → cash for income assets or debt`
                : "no growth assets to sell yet"
            }
            tag={growthAsset ? "SELL" : "—"}
            tagKind={growthAsset && can("harvest") ? "cost" : "locked"}
            locked={!growthAsset || !can("harvest")}
            onClick={() => growthAsset && dispatch({ type: "CHOOSE_ACTION", action: "harvest", payload: { sellUid: growthAsset.uid } })}
          />

          <GroupLabel>Grow yourself</GroupLabel>
          {skillRow("proSkills", "workHarder", "🏆", nextRank ? `Work harder — next rank: ${nextRank.title}` : "Work harder")}
          {skillRow("moneySmarts", "invest", "💰", "Invest (study the markets)")}
          {skillRow("grit", "hustle", "🛡️", "Hustle")}
          {skillRow("bigBrain", "study", "🧠", "Study")}

          <GroupLabel>Shrink your expenses</GroupLabel>
          <ActionRow
            emoji="🏦"
            title="Pay down debt"
            sub={
              mortgagedAsset
                ? `mortgage ${fmtMoney(mortgagedAsset.loanBalance)} — every $ paid is a guaranteed win`
                : firstDebt
                  ? `${firstDebt.kind === "creditCard" ? "credit card" : firstDebt.kind} ${fmtMoney(firstDebt.balance)} at ${Math.round(firstDebt.rate * 100)}%`
                  : "no debts — nice!"
            }
            tag={can("payDebt") ? "PAY" : "—"}
            tagKind={can("payDebt") ? "cost" : "locked"}
            locked={!can("payDebt")}
            onClick={() => {
              const amount = Math.max(0, p.cash - 5_000)
              if (amount <= 0) return
              if (firstDebt) dispatch({ type: "CHOOSE_ACTION", action: "payDebt", payload: { debtUid: firstDebt.uid, amount } })
              else if (mortgagedAsset) dispatch({ type: "CHOOSE_ACTION", action: "payDebt", payload: { assetUid: mortgagedAsset.uid, amount } })
            }}
          />
          <ActionRow
            emoji="🏡"
            title="Buy your home outright"
            sub={`${fmtMoneyFull(HOME_PRICE)} · removes rent forever (−${HOME_LIFESTYLE_SLICE * 100}% lifestyle)`}
            tag={p.ownsHome ? "✓ OWNED" : can("buyHome") ? fmtMoney(HOME_PRICE) : `🔒 need ${fmtMoney(HOME_PRICE)}`}
            tagKind={can("buyHome") ? "cost" : "locked"}
            locked={!can("buyHome")}
            onClick={() => dispatch({ type: "CHOOSE_ACTION", action: "buyHome" })}
          />
          <ActionRow
            emoji="🪙"
            title="Live modestly"
            sub={`drop your lifestyle ${DOWNSIZE_PCT * 100}% below your rank — spend less than you earn`}
            tag={p.lifestyleBracketDelta < 0 ? "✓ ACTIVE" : "FREE"}
            tagKind={can("downsize") ? "free" : "locked"}
            locked={!can("downsize")}
            onClick={() => dispatch({ type: "CHOOSE_ACTION", action: "downsize" })}
          />
          <ActionRow
            emoji="🛡️"
            title={
              <>
                Insurance {p.insured && <span className="text-green-600 text-[10px]">(active ✓)</span>}
              </>
            }
            sub={`${fmtMoney(INSURANCE_PREMIUM)}/yr · halves life & career setbacks · auto-renews`}
            tag={p.insured ? "CANCEL" : "TAKE OUT"}
            tagKind="free"
            locked={!can("insurance")}
            onClick={() => dispatch({ type: "CHOOSE_ACTION", action: "insurance" })}
          />

          <div className="bg-violet-50 rounded-xl px-3 py-2 text-[10px] font-bold text-violet-700">
            🃏 You may also play <b>one power-up</b> before living the year — tap your hand on the board.
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-black uppercase tracking-wider text-violet-300 pt-1">{children}</div>
}
