"use client"

// Mockup: 11-portfolio.html — income vs growth assets, debts, pay-down/harvest.

import type { GameAction, GameState } from "@/lib/dream-life/types"
import { assetNetCash, effectiveRates, expensesOf, freedomPct, netWorth, passiveIncome } from "@/lib/dream-life/selectors"
import { ASSET_CLASSES } from "@/lib/dream-life/content/assets"
import { APPRENTICE_PASSIVE } from "@/lib/dream-life/content/careers"
import { fmtMoney, fmtMoneyFull } from "./theme"
import { Chip } from "./widgets"

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
  onClose: () => void
  onShop: () => void
}

export default function PortfolioSheet({ state, dispatch, onClose, onShop }: Props) {
  const p = state.players[state.currentPlayerIndex]
  const incomeAssets = p.assets.filter(a => assetNetCash(p, a) !== 0 || ASSET_CLASSES[a.classId].incomeRate > 0)
  const growthAssets = p.assets.filter(a => ASSET_CLASSES[a.classId].incomeRate === 0)
  const isMyTurn = state.turnStage === "action"

  return (
    <div className="absolute inset-0 z-40 bg-indigo-950/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-[28px] w-full max-w-md overflow-y-auto"
        style={{ maxHeight: "94dvh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 pt-4 pb-2.5 border-b border-gray-100 flex items-center justify-between z-10">
          <div className="font-black text-[16px] text-indigo-950">💼 {p.name}&apos;s Portfolio</div>
          <div className="flex items-center gap-2">
            <span className="bg-yellow-100 text-yellow-800 text-[11px] font-black px-2.5 py-1 rounded-full">NET {fmtMoney(netWorth(p))}</span>
            <button type="button" onClick={onClose} className="font-black text-gray-300 text-xl px-1">✕</button>
          </div>
        </div>

        <div className="px-3.5 py-3 flex flex-col gap-2.5">
          <div className="flex gap-1.5">
            <Chip value={fmtMoney(passiveIncome(p))} label="passive /yr" kind="green" />
            <Chip value={fmtMoney(expensesOf(p, "phase3"))} label="expenses /yr" kind="red" />
            <Chip value={`${freedomPct(p)}%`} label="freedom" kind="purple" />
          </div>

          <SectionLabel>Income assets — these pay your bills 💵</SectionLabel>
          <div className="rounded-2xl border-2 border-gray-100 divide-y divide-dashed divide-gray-100">
            {incomeAssets.length === 0 && p.apprentices === 0 && (
              <div className="px-3 py-3 text-[11px] text-gray-400 font-semibold text-center">Nothing paying you yet — that&apos;s the mission!</div>
            )}
            {incomeAssets.map(a => {
              const cls = ASSET_CLASSES[a.classId]
              const net = assetNetCash(p, a)
              const r = effectiveRates(p, a)
              const negGeared = net < 0 && a.loanBalance > 0
              return (
                <div key={a.uid} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="text-2xl">{cls.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-[13px] text-indigo-950">{cls.label}</div>
                    <div className="text-[10px] font-semibold text-gray-500">
                      value {fmtMoney(a.value)}
                      {a.loanBalance > 0 ? ` · loan ${fmtMoney(a.loanBalance)} @ ${(r.interest * 100).toFixed(1)}%` : " · owned outright"}
                    </div>
                    {negGeared && <div className="text-[10px] font-bold text-red-600">paying to hold it — pay the loan down to flip positive!</div>}
                  </div>
                  <div className="text-right">
                    <div className={`font-black text-[13px] ${net >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {net >= 0 ? "+" : ""}
                      {fmtMoney(net)}/yr
                    </div>
                    {a.loanBalance > 0 && isMyTurn && (
                      <button
                        type="button"
                        className="text-[9px] font-black text-white bg-green-600 rounded-full px-2 py-0.5"
                        onClick={() => {
                          const amount = Math.max(0, p.cash - 5_000)
                          if (amount > 0) {
                            dispatch({ type: "CHOOSE_ACTION", action: "payDebt", payload: { assetUid: a.uid, amount } })
                            onClose()
                          }
                        }}
                      >
                        PAY DOWN
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {p.apprentices > 0 && (
              <div className="flex items-center gap-2.5 px-3 py-2">
                <span className="text-2xl">👷</span>
                <div className="flex-1">
                  <div className="font-black text-[13px] text-indigo-950">Apprentices ×{p.apprentices}</div>
                  <div className="text-[10px] font-semibold text-gray-500">from &quot;Take On An Apprentice&quot; years — permanent</div>
                </div>
                <div className="font-black text-[13px] text-green-700">+{fmtMoney(p.apprentices * APPRENTICE_PASSIVE)}/yr</div>
              </div>
            )}
          </div>

          <SectionLabel>Growth assets — harvest these later 📈</SectionLabel>
          <div className="rounded-2xl border-2 border-gray-100 divide-y divide-dashed divide-gray-100">
            {growthAssets.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-gray-400 font-semibold text-center">No growth bets right now.</div>
            )}
            {growthAssets.map(a => {
              const cls = ASSET_CLASSES[a.classId]
              return (
                <div key={a.uid} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="text-2xl">{cls.emoji}</span>
                  <div className="flex-1">
                    <div className="font-black text-[13px] text-indigo-950">{cls.label}</div>
                    <div className="text-[10px] font-semibold text-gray-500">
                      value {fmtMoney(a.value)} · pays $0 income — can&apos;t win until you SELL it
                    </div>
                  </div>
                  {isMyTurn && (
                    <button
                      type="button"
                      className="text-[9px] font-black text-white bg-violet-600 rounded-full px-2 py-0.5"
                      onClick={() => {
                        dispatch({ type: "CHOOSE_ACTION", action: "harvest", payload: { sellUid: a.uid } })
                        onClose()
                      }}
                    >
                      💱 HARVEST
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <SectionLabel>Debts — the mirror of investing 🪞</SectionLabel>
          <div className="rounded-2xl border-2 border-gray-100 divide-y divide-dashed divide-gray-100">
            {p.debts.length === 0 && <div className="px-3 py-3 text-[11px] text-gray-400 font-semibold text-center">Debt-free! 🎉</div>}
            {p.debts.map(d => (
              <div key={d.uid} className="flex items-center gap-2.5 px-3 py-2">
                <span className="text-2xl">{d.kind === "creditCard" ? "💳" : d.kind === "tools" ? "🚚" : "🎓"}</span>
                <div className="flex-1">
                  <div className="font-black text-[13px] text-indigo-950">
                    {d.kind === "creditCard" ? "Credit card" : d.kind === "tools" ? "Tool loan" : "Education loan"}
                  </div>
                  <div className="text-[10px] font-semibold text-gray-500">
                    {fmtMoneyFull(d.balance)} @ {Math.round(d.rate * 100)}% → {fmtMoney(d.balance * d.rate)}/yr pushes your win bar up
                  </div>
                </div>
                {isMyTurn && (
                  <button
                    type="button"
                    className="text-[9px] font-black text-white bg-green-600 rounded-full px-2 py-0.5"
                    onClick={() => {
                      const amount = Math.max(0, p.cash - 2_000)
                      if (amount > 0) {
                        dispatch({ type: "CHOOSE_ACTION", action: "payDebt", payload: { debtUid: d.uid, amount } })
                        onClose()
                      }
                    }}
                  >
                    PAY DOWN
                  </button>
                )}
              </div>
            ))}
          </div>

          {isMyTurn && (
            <button
              type="button"
              onClick={onShop}
              className="rounded-[18px] border-[3px] border-white/70 bg-gradient-to-br from-violet-400 to-violet-600 py-3 font-black text-white"
              style={{ boxShadow: "0 5px 0 #6d28d9" }}
            >
              🛍️ Buy assets
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-black uppercase tracking-wider text-violet-300">{children}</div>
}
