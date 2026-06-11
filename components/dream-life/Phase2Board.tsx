"use client"

// Mockup: 08-phase2-apprenticeship.html

import type { GameAction, GameState } from "@/lib/dream-life/types"
import { debtInterest, legalActions, lifestyleOf, salaryOf } from "@/lib/dream-life/selectors"
import { OVERTIME_PAY, TOOL_UP_INCOME, TOOL_UP_LOAN, TOOL_UP_RATE } from "@/lib/dream-life/content/careers"
import { PLAYER_GRADIENTS, GOLD_GLOW, fmtMoney, fmtMoneyFull } from "./theme"
import { ActionRow, Chip, Label, PlayerStrip } from "./widgets"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
}

export default function Phase2Board({ state, dispatch }: Props) {
  const p = state.players[state.currentPlayerIndex]
  const legal = legalActions(state)
  const wage = salaryOf(p, "phase2")
  const lifestyle = lifestyleOf(p, "phase2")
  const invested = p.assets.reduce((s, a) => s + a.value, 0)
  const debt = p.debts.reduce((s, d) => s + d.balance, 0)
  const can = (a: string) => legal.includes(a as (typeof legal)[number])

  return (
    <div className="flex flex-col gap-2.5 p-3 min-h-full">
      <div className="text-center text-white" style={{ textShadow: "0 2px 0 rgba(46,16,101,.35)" }}>
        <div className="font-black text-lg">
          <span className="text-2xl">{p.emoji}</span> {p.name} — Age {p.age}
        </div>
        <div className="text-[11px] font-bold text-violet-100">
          Apprentice wage this year: <b className="text-green-300">{fmtMoney(wage)}</b> · living costs {fmtMoney(lifestyle)}
        </div>
      </div>

      <div className="bg-white rounded-3xl border-[3px] border-yellow-300 overflow-hidden" style={{ boxShadow: GOLD_GLOW }}>
        <div className={`bg-gradient-to-br ${PLAYER_GRADIENTS[p.color]} px-3 py-2 flex items-center gap-2 text-white`}>
          <span className="text-2xl">{p.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-black text-[13px]">{p.name} · 🔧 Apprentice</div>
            <div className="text-[9px] opacity-85">
              Qualification rank {"⭐".repeat(Math.max(1, p.qualificationRank + 1))} · graduates at 20
            </div>
          </div>
          <div className="text-right">
            <div className="font-black text-[15px]">{fmtMoneyFull(p.cash)}</div>
            <div className="text-[9px] opacity-75">cash</div>
          </div>
        </div>
        <div className="px-3 py-2 flex flex-col gap-2">
          <div className="flex gap-1.5">
            <Chip value={fmtMoney(wage)} label="wage" kind="green" />
            <Chip value={fmtMoney(lifestyle)} label="expenses" kind="red" />
            <Chip value={fmtMoney(invested)} label="invested" kind="purple" />
            <Chip value={fmtMoney(debt)} label="debt" kind="gold" />
          </div>
          <div className="bg-violet-50 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-violet-700 leading-snug">
            💡 Meanwhile, a Doctor would still be studying — earning $0 and borrowing for uni. Different timelines, same finish
            line!
          </div>
        </div>
      </div>

      <Label>Pick ONE action</Label>
      <ActionRow
        emoji="🎓"
        title="Master the trade"
        sub="+1 qualification rank → bigger starting salary at 20"
        tag={p.qualificationRank >= 3 ? "✓ MAXED" : "FREE"}
        tagKind={can("masterTrade") ? "free" : "locked"}
        locked={!can("masterTrade")}
        onClick={() => dispatch({ type: "CHOOSE_ACTION", action: "masterTrade" })}
      />
      <ActionRow
        emoji="💪"
        title="Overtime"
        sub={`+${fmtMoney(OVERTIME_PAY)} cash now, nothing long-term`}
        tag={`+${fmtMoney(OVERTIME_PAY)}`}
        tagKind="free"
        locked={!can("overtime")}
        onClick={() => dispatch({ type: "CHOOSE_ACTION", action: "overtime" })}
      />
      <ActionRow
        emoji="💰"
        title="Invest"
        sub="Money Smarts +1 · keep the compounding going"
        tag="FREE"
        tagKind="free"
        locked={!can("invest")}
        onClick={() =>
          dispatch({
            type: "CHOOSE_ACTION",
            action: "invest",
            payload:
              p.cash > 2_000
                ? { assetClassId: p.skills.moneySmarts >= 3 ? "shares" : p.skills.moneySmarts >= 2 ? "index" : "savings", amount: p.cash - 1_000 }
                : undefined,
          })
        }
      />
      <ActionRow
        emoji="🚚"
        title={
          <>
            Tool up <span className="text-green-600 text-[10px]">(good debt)</span>
          </>
        }
        sub={`borrow ${fmtMoney(TOOL_UP_LOAN)} for a ute & tools → +${fmtMoney(TOOL_UP_INCOME)}/yr income · owe ${TOOL_UP_RATE * 100}%/yr`}
        tag={p.hasTools ? "✓ OWNED" : "LOAN"}
        tagKind={p.hasTools ? "locked" : "cost"}
        locked={!can("toolUp")}
        onClick={() => dispatch({ type: "CHOOSE_ACTION", action: "toolUp" })}
      />

      <div className="mt-auto pt-1">
        <PlayerStrip state={state} />
      </div>
    </div>
  )
}
