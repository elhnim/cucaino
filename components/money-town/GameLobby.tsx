"use client"

import { useState, type CSSProperties } from "react"
import Link from "next/link"
import type { Kid } from "@/lib/domain/types"
import type { Player, GameAction } from "@/lib/money-town/types"
import { PLAYER_COLORS, STARTING_CASH } from "@/lib/money-town/constants"
import RulesModal from "./RulesModal"

const RULES_SEEN_KEY = 'money-town-rules-seen'

const GUEST_EMOJIS = ['😎', '🤩', '🥳', '😜', '🦊', '🐼', '🦄', '🐸']

interface Props {
  kids: Kid[]
  activeKid: Kid | null
  dispatch: (action: GameAction) => void
}

function makePlayer(id: string, name: string, emoji: string, colorIndex: number): Player {
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]
  return {
    id, name, emoji, color,
    cash: STARTING_CASH,
    salary: 0, expenses: 0, baseJobId: '',
    assets: [], degreeStatus: null, insurance: 0,
    stocksFrozen: 0, laidOff: 0, recession: 0, rentSurge: 0, boom: 0,
    turnCount: 0, hasWon: false,
  }
}

export default function GameLobby({ kids, activeKid, dispatch }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (activeKid) return new Set([activeKid.id])
    return new Set()
  })
  const [guests, setGuests] = useState<{ id: string; name: string }[]>([])
  const [guestName, setGuestName] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem(RULES_SEEN_KEY)
  })

  function closeRules() {
    try { localStorage.setItem(RULES_SEEN_KEY, '1') } catch {}
    setRulesOpen(false)
  }

  const totalPlayers = selected.size + guests.length
  const canAdd = totalPlayers < 4

  function toggleKid(kid: Kid) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(kid.id)) next.delete(kid.id)
      else if (totalPlayers < 4) next.add(kid.id)
      return next
    })
  }

  function addGuest() {
    const name = guestName.trim()
    if (!name || !canAdd) return
    setGuests(prev => [...prev, { id: `guest-${Date.now()}`, name }])
    setGuestName('')
    setAddingGuest(false)
  }

  function startGame() {
    if (totalPlayers < 1) return
    const players: Player[] = []
    let colorIdx = 0
    kids.filter(k => selected.has(k.id)).forEach(k => {
      players.push(makePlayer(k.id, k.name, k.avatar ?? '😊', colorIdx++))
    })
    guests.forEach(g => {
      players.push(makePlayer(g.id, g.name, GUEST_EMOJIS[colorIdx % GUEST_EMOJIS.length], colorIdx++))
    })
    players.forEach(p => dispatch({ type: 'ADD_PLAYER', player: p }))
    dispatch({ type: 'START_GAME' })
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(180deg, #7dd3fc 0%, #bae6fd 30%, #e0f2fe 55%, #d9f99d 80%, #86efac 100%)" }}>
      {/* Sky scene header */}
      <header className="relative overflow-hidden px-4 pt-4 pb-2">
        <span className="absolute top-3 right-6 text-4xl" style={{ filter: "drop-shadow(0 0 18px rgba(253,224,71,0.9))" }}>☀️</span>
        <span className="cloud-drift text-3xl opacity-70" style={{ top: "8px", animationDuration: "34s", animationDelay: "-10s" }}>☁️</span>
        <span className="cloud-drift text-xl opacity-50" style={{ top: "40px", animationDuration: "24s", animationDelay: "-3s" }}>☁️</span>

        <div className="relative flex items-center justify-between">
          <Link href={activeKid ? `/kid/${activeKid.id}/play` : "/select-kid"}
            className="text-sm font-black text-sky-900 bg-white/70 backdrop-blur px-3 py-1.5 rounded-full active:scale-95 transition-transform">
            ← Games
          </Link>
          <button type="button" onClick={() => setRulesOpen(true)}
            className="text-sm font-black text-sky-900 bg-white/70 backdrop-blur px-3 py-1.5 rounded-full active:scale-95 transition-transform">
            📖 Rules
          </button>
        </div>

        <div className="relative text-center mt-5 mb-1">
          <h1 className="text-4xl font-black text-sky-950 drop-shadow-sm tracking-tight">
            💰 MONEY TOWN
          </h1>
          <p className="text-xs font-black text-sky-700 uppercase tracking-[0.25em] mt-1">Escape the rat race!</p>
          <div className="text-2xl mt-2 select-none" aria-hidden>
            <span className="avatar-idle inline-block">🏠</span>
            <span className="avatar-idle inline-block" style={{ animationDelay: "0.4s" }}>🏪</span>
            <span className="avatar-idle inline-block" style={{ animationDelay: "0.8s" }}>🏦</span>
            <span className="avatar-idle inline-block" style={{ animationDelay: "1.2s" }}>🏰</span>
            <span className="avatar-idle inline-block" style={{ animationDelay: "1.6s" }}>🌳</span>
          </div>

          {/* Living street — townsfolk wandering past */}
          <div className="relative h-9 mt-1 max-w-sm mx-auto overflow-hidden" aria-hidden>
            <span className="walk-x left-2 bottom-0 text-2xl" style={{ "--walk-dist": "250px", animationDuration: "11s" } as CSSProperties}>
              <span className="walk-bob inline-block">🚶</span>
            </span>
            <span className="walk-x left-2 bottom-0 text-lg" style={{ "--walk-dist": "250px", animationDuration: "15s", animationDelay: "-7s" } as CSSProperties}>
              <span className="walk-bob inline-block" style={{ animationDelay: "0.18s" }}>🐕</span>
            </span>
            <span className="drive-by left-0 bottom-0 text-2xl" style={{ animationDuration: "6.5s" }}>🚗</span>
            <span className="drive-by left-0 top-0 text-base" style={{ animationDuration: "13s", animationDelay: "-5s" }}>🕊️</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-8 max-w-md mx-auto w-full">
        <h2 className="text-xl font-black text-center text-emerald-950 mb-1">Who&apos;s playing?</h2>
        <p className="text-center text-sm font-bold text-emerald-700/70 mb-4">Tap to join the town · 1–4 players</p>

        {/* Family kids */}
        {kids.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {kids.map(k => {
              const isSelected = selected.has(k.id)
              return (
                <button key={k.id} type="button" onClick={() => toggleKid(k)}
                  className={`relative rounded-3xl p-4 border-[3px] text-center transition-all active:scale-95 ${
                    isSelected
                      ? 'border-yellow-400 bg-white shadow-xl pulse-ring'
                      : 'border-white/60 bg-white/80 backdrop-blur shadow-sm'
                  }`}>
                  {isSelected && (
                    <span className="absolute top-2 right-2 bg-yellow-400 text-yellow-950 text-xs rounded-full w-6 h-6 flex items-center justify-center font-black animate-pop">✓</span>
                  )}
                  <div className={`text-4xl mb-1 inline-block ${isSelected ? 'avatar-bounce' : 'avatar-idle'}`}>{k.avatar ?? '😊'}</div>
                  <div className="font-black text-sm text-gray-800 truncate">{k.name}</div>
                  {isSelected && <div className="text-[9px] font-black text-yellow-600 uppercase tracking-widest mt-0.5">Ready!</div>}
                </button>
              )
            })}
          </div>
        )}

        {/* Guests */}
        {guests.map((g, i) => (
          <div key={g.id} className="flex items-center gap-3 bg-white/90 backdrop-blur border-[3px] border-purple-200 rounded-3xl px-4 py-3 mb-2 shadow-sm">
            <span className="text-2xl avatar-idle inline-block">{GUEST_EMOJIS[i % GUEST_EMOJIS.length]}</span>
            <span className="flex-1 font-black text-gray-800">{g.name} <span className="text-xs text-purple-400 font-bold">Guest</span></span>
            <button type="button" onClick={() => setGuests(prev => prev.filter(x => x.id !== g.id))}
              className="text-gray-300 hover:text-red-400 text-lg active:scale-90 transition-transform">✕</button>
          </div>
        ))}

        {/* Add guest */}
        {canAdd && (
          <div className="mb-6">
            {addingGuest ? (
              <div className="flex gap-2">
                <input type="text" value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addGuest()}
                  placeholder="Guest name…" autoFocus
                  className="flex-1 border-[3px] border-white/80 bg-white/90 rounded-2xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-yellow-400"
                />
                <button type="button" onClick={addGuest} disabled={!guestName.trim()}
                  className="px-4 py-2 bg-emerald-500 text-white font-black rounded-2xl disabled:opacity-40 active:scale-95 transition-transform">
                  Add
                </button>
                <button type="button" onClick={() => { setAddingGuest(false); setGuestName('') }}
                  className="px-3 py-2 border-[3px] border-white/80 bg-white/60 text-gray-500 rounded-2xl">✕</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingGuest(true)}
                className="w-full border-[3px] border-dashed border-emerald-400/60 text-emerald-800 font-black rounded-3xl py-3 text-sm bg-white/40 active:scale-95 transition-transform">
                ➕ Add a guest player
              </button>
            )}
          </div>
        )}

        {/* Learn how to play */}
        <button type="button" onClick={() => setRulesOpen(true)}
          className="w-full flex items-center gap-4 bg-white/90 backdrop-blur border-[3px] border-sky-200 rounded-3xl px-5 py-4 mb-4 active:scale-95 transition-transform text-left shadow-sm">
          <span className="text-3xl avatar-idle inline-block">📖</span>
          <div className="flex-1">
            <div className="font-black text-sky-950 text-base">Learn how to play</div>
            <div className="text-xs font-bold text-sky-600 mt-0.5">Earn money while you sleep · buy assets · escape!</div>
          </div>
          <span className="text-sky-400 text-lg">›</span>
        </button>

        <button type="button" onClick={startGame} disabled={totalPlayers < 1}
          className="w-full py-4 text-white text-xl font-black rounded-3xl disabled:opacity-40 active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(180deg, #34d399 0%, #10b981 60%, #059669 100%)",
            boxShadow: totalPlayers >= 1 ? "0 5px 0 #047857, 0 12px 28px rgba(5,150,105,0.4)" : "none",
          }}>
          {totalPlayers < 1 ? 'Pick a player to start' : `Start the game! 🚀 (${totalPlayers} player${totalPlayers > 1 ? 's' : ''})`}
        </button>

        <p className="text-center text-xs font-bold text-emerald-800/50 mt-3">Pass the device between turns 🔄</p>
      </div>

      {rulesOpen && <RulesModal onClose={closeRules} />}
    </div>
  )
}
