"use client"

// Mockup: 04-phase1-board.html — teen years board + 4-action menu.

import type { GameAction, GameState } from "@/lib/dream-life/types"
import { legalActions, phase1Gig, salaryOf } from "@/lib/dream-life/selectors"
import { HUSTLE_SALARY_CUT, STUDY_SALARY_CUT } from "@/lib/dream-life/content/phase1"
import { PLAYER_GRADIENTS, TOY_SHADOW, GOLD_GLOW, fmtMoney, fmtMoneyFull } from "./theme"
import { ActionRow, Chip, Label, PlayerStrip, SkillDots } from "./widgets"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
}

export default function Phase1Board({ state, dispatch }: Props) {
  const p = state.players[state.currentPlayerIndex]
  const gig = phase1Gig(p)
  const legal = legalActions(state)
  const gross = salaryOf(p, "phase1")
  const invested = p.assets.reduce((s, a) => s + a.value, 0)
  const can = (a: string) => legal.includes(a as (typeof legal)[number])

  const choose = (action: "invest" | "workHarder" | "hustle" | "study") =>
    dispatch({ type: "CHOOSE_ACTION", action, payload: action === "invest" && p.cash > 2_000 ? { assetClassId: p.skills.moneySmarts >= 3 ? "shares" : p.skills.moneySmarts >= 2 ? "index" : "savings", amount: p.cash - 1_000 } : undefined })

  return (
    <div className="flex flex-col gap-2.5 p-3 min-h-full">
      {/* turn banner */}
      <div className="text-center text-white" style={{ textShadow: "0 2px 0 rgba(46,16,101,.35)" }}>
        <div className="font-black text-lg">
          <span className="text-2xl">{p.emoji}</span> {p.name} — Age {p.age}
        </div>
        <div className="text-[11px] font-bold text-violet-100">What are you doing this year?</div>
      </div>

      {/* active player card */}
      <div className="bg-white rounded-3xl border-[3px] border-yellow-300 overflow-hidden" style={{ boxShadow: GOLD_GLOW }}>
        <div className={`bg-gradient-to-br ${PLAYER_GRADIENTS[p.color]} px-3 py-2 flex items-center gap-2 text-white`}>
          <span className="text-2xl">{p.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-black text-[13px]">{p.name}</div>
            <div className="text-[9px] opacity-85">
              {gig.emoji} {gig.label} (Tier {gig.tier}) · {fmtMoney(gross)}/yr
            </div>
          </div>
          <div className="text-right">
            <div className="font-black text-[15px]">{fmtMoneyFull(p.cash)}</div>
            <div className="text-[9px] opacity-75">cash</div>
          </div>
        </div>
        <div className="px-3 py-2 flex flex-col gap-1.5">
          <SkillDots player={p} max={3} />
          <div className="flex gap-1.5">
            <Chip value={`📊 ${fmtMoney(invested)}`} label="invested" kind="purple" />
            <Chip value={`🎟️ ${p.talentTokens}`} label="talent tokens" kind="gold" />
          </div>
        </div>
      </div>

      {/* actions */}
      <Label>Pick ONE action</Label>
      <ActionRow
        emoji="💰"
        title="Invest"
        sub={`Money Smarts +1 · put spare cash to work${p.skills.moneySmarts >= 2 ? " (better funds unlocked!)" : ""}`}
        tag={can("invest") ? "FREE" : "✓ MAXED"}
        tagKind={can("invest") ? "free" : "locked"}
        locked={!can("invest")}
        onClick={() => choose("invest")}
      />
      <ActionRow
        emoji="🏆"
        title="Work harder"
        sub="Pro Skills +1 · promotion next year"
        tag={can("workHarder") ? "FREE" : "✓ MAXED"}
        tagKind={can("workHarder") ? "free" : "locked"}
        locked={!can("workHarder")}
        onClick={() => choose("workHarder")}
      />
      <ActionRow
        emoji="🛡️"
        title="Hustle"
        sub="Grit +1 · spin for a better gig next year"
        tag={p.skills.grit >= 3 ? "✓ MAXED" : can("hustle") ? `−${HUSTLE_SALARY_CUT * 100}% pay` : "🔒 can't afford"}
        tagKind={can("hustle") ? "cost" : "locked"}
        locked={!can("hustle")}
        onClick={() => choose("hustle")}
      />
      <ActionRow
        emoji="🧠"
        title="Study"
        sub="Big Brain +1 · spin for a knowledge job next year"
        tag={p.skills.bigBrain >= 3 ? "✓ MAXED" : can("study") ? `−${STUDY_SALARY_CUT * 100}% pay` : "🔒 can't afford"}
        tagKind={can("study") ? "cost" : "locked"}
        locked={!can("study")}
        onClick={() => choose("study")}
      />

      <div className="mt-auto pt-1">
        <PlayerStrip state={state} />
      </div>
    </div>
  )
}
