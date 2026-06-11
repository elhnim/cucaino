"use client"

// Mockup: 17-win-screen.html — freedom ceremony, winning life, standings, 4% lesson.

import type { GameAction, GameState } from "@/lib/dream-life/types"
import { currentRank, expensesOf, freedomPct, netWorth, passiveIncome } from "@/lib/dream-life/selectors"
import { ASSET_CLASSES } from "@/lib/dream-life/content/assets"
import { playSfx } from "@/lib/audio/sound-manager"
import { SKY_BG, PLAYER_GRADIENTS, fmtMoney } from "./theme"

interface Props {
  state: GameState
  onNewGame: () => void
  onExit: () => void
}

export default function WinScreen({ state, onNewGame, onExit }: Props) {
  const winner = state.players.find(p => p.id === state.winnerId)!
  const byBackstop = !winner.hasWon
  const others = state.players
    .filter(p => p.id !== winner.id)
    .sort((a, b) => freedomPct(b) - freedomPct(a) || netWorth(b) - netWorth(a))

  const engine: string[] = []
  const paidOff = winner.assets.filter(a => a.loanBalance === 0 && ASSET_CLASSES[a.classId].incomeRate > 0)
  if (paidOff.length > 0) engine.push(...paidOff.map(a => `${ASSET_CLASSES[a.classId].emoji} ${ASSET_CLASSES[a.classId].label}`))
  if (winner.apprentices > 0) engine.push(`👷 ${winner.apprentices} apprentice${winner.apprentices > 1 ? "s" : ""}`)
  if (winner.ownsHome) engine.push("🏡 owns her home")

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-3 p-4" style={SKY_BG}>
      <div className="text-center pt-4">
        <div className="text-6xl inline-block animate-bounce">🏆</div>
        <div className="font-black text-[28px] text-yellow-300" style={{ textShadow: "0 3px 0 rgba(46,16,101,.5), 0 0 24px rgba(255,217,61,.8)" }}>
          {winner.name.toUpperCase()} {byBackstop ? "RETIRES RICHEST!" : "IS FREE!"}
        </div>
        <div className="text-[13px] font-bold text-white" style={{ textShadow: "0 1px 1px rgba(46,16,101,.5)" }}>
          {byBackstop
            ? `Nobody broke free by 65 — the biggest net worth wins.`
            : `Financially free at age ${winner.age} — ${winner.name}'s assets pay for their whole life. 😴💰`}
        </div>
      </div>

      <div className="bg-white rounded-3xl border-[3px] border-white overflow-hidden" style={{ boxShadow: "0 6px 0 rgba(46,16,101,.18)" }}>
        <div className={`bg-gradient-to-br ${PLAYER_GRADIENTS[winner.color]} px-3 py-2.5 flex items-center gap-2 text-white`}>
          <span className="text-2xl">{winner.emoji}</span>
          <div className="flex-1">
            <div className="font-black text-[13px]">{winner.name}&apos;s winning life</div>
            <div className="text-[9px] opacity-85">🔧 Tradesperson → {currentRank(winner).title}</div>
          </div>
          <span className="bg-white text-amber-700 text-[11px] font-black px-2.5 py-1 rounded-full">1st 🏁</span>
        </div>
        <div className="px-3.5 py-2.5 flex flex-col gap-1 text-[12px] text-gray-700">
          <Row k="💵 Passive income" v={`${fmtMoney(passiveIncome(winner))}/yr`} good />
          <Row k="🧾 Expenses" v={`${fmtMoney(expensesOf(winner, "phase3"))}/yr`} />
          <Row k="💎 Net worth" v={fmtMoney(netWorth(winner))} />
          {engine.length > 0 && <Row k="🏠 The engine" v={engine.join(" · ")} />}
          <div className="bg-yellow-50 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-yellow-700 leading-snug mt-1">
            💡 Real-life rule: a portfolio paying ~4% means you need ~25× your yearly costs. The fastest way there? Spend less,
            own more things that pay you.
          </div>
        </div>
      </div>

      {others.length > 0 && (
        <div className="bg-white rounded-3xl border-[3px] border-white px-3.5 py-2.5" style={{ boxShadow: "0 6px 0 rgba(46,16,101,.18)" }}>
          <div className="text-[9px] font-black uppercase tracking-wider text-violet-400 mb-1">Final standings</div>
          {others.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 py-1 text-[12px]">
              <b className="text-gray-400">{i + 2}{i === 0 ? "nd" : i === 1 ? "rd" : "th"}</b>
              <span className="text-lg">{p.emoji}</span>
              <b className="text-indigo-950">{p.name}</b>
              <span className="text-gray-500 text-[11px]">
                {freedomPct(p)}% free · {fmtMoney(netWorth(p))} net worth · {currentRank(p).title}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex gap-2 pb-2">
        <button
          type="button"
          onClick={() => { playSfx("tap"); onNewGame() }}
          className="flex-1 rounded-[20px] border-[3px] border-white bg-white/35 py-3 font-black text-indigo-950"
          style={{ boxShadow: "0 4px 0 rgba(46,16,101,.15)" }}
        >
          🌱 New life
        </button>
        <button
          type="button"
          onClick={onExit}
          className="flex-1 rounded-[20px] border-[3px] border-white/70 bg-gradient-to-br from-green-400 to-green-600 py-3 font-black text-white"
          style={{ boxShadow: "0 5px 0 #15803d", textShadow: "0 1px 0 rgba(0,0,0,.2)" }}
        >
          🏠 Exit
        </button>
      </div>
    </div>
  )
}

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="flex justify-between">
      <span>{k}</span>
      <b className={good ? "text-green-700" : "text-indigo-950"}>{v}</b>
    </div>
  )
}
