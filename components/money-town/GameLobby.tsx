"use client"

import { useState } from "react"
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
    assets: [], degreeStatus: null,
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
    <div className="min-h-screen bg-sky-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 flex items-center justify-between">
        <Link href={activeKid ? `/kid/${activeKid.id}/play` : "/select-kid"}
          className="text-sm font-bold text-white/80 hover:text-white flex items-center gap-1">
          ← Games
        </Link>
        <span className="font-black text-white text-lg">💰 Money Town</span>
        <button type="button" onClick={() => setRulesOpen(true)}
          className="text-sm font-bold text-white/80 hover:text-white">
          ? Rules
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-8 max-w-md mx-auto w-full">
        <h1 className="text-2xl font-black text-center text-blue-900 mb-1 pt-2">Who's playing?</h1>
        <p className="text-center text-sm text-blue-600 mb-4">Tap to select · 1–4 players</p>

        {/* Family kids */}
        {kids.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {kids.map(k => {
              const isSelected = selected.has(k.id)
              return (
                <button key={k.id} type="button" onClick={() => toggleKid(k)}
                  className={`relative rounded-2xl p-4 border-2 text-center transition-all active:scale-95 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}>
                  {isSelected && (
                    <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-black">✓</span>
                  )}
                  <div className="text-3xl mb-1">{k.avatar ?? '😊'}</div>
                  <div className="font-black text-sm text-gray-800 truncate">{k.name}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* Guests */}
        {guests.map((g, i) => (
          <div key={g.id} className="flex items-center gap-3 bg-white border-2 border-purple-200 rounded-2xl px-4 py-3 mb-2">
            <span className="text-2xl">{GUEST_EMOJIS[i % GUEST_EMOJIS.length]}</span>
            <span className="flex-1 font-bold text-gray-800">{g.name} <span className="text-xs text-purple-400 font-normal">Guest</span></span>
            <button type="button" onClick={() => setGuests(prev => prev.filter(x => x.id !== g.id))}
              className="text-gray-300 hover:text-red-400 text-lg">✕</button>
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
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-blue-400"
                />
                <button type="button" onClick={addGuest} disabled={!guestName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white font-black rounded-xl disabled:opacity-40 active:scale-95">
                  Add
                </button>
                <button type="button" onClick={() => { setAddingGuest(false); setGuestName('') }}
                  className="px-3 py-2 border-2 border-gray-200 text-gray-500 rounded-xl">✕</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingGuest(true)}
                className="w-full border-2 border-dashed border-blue-200 text-blue-600 font-bold rounded-2xl py-3 text-sm hover:border-blue-400 active:scale-95 transition-transform">
                ➕ Add Guest Player
              </button>
            )}
          </div>
        )}

        {/* Learn how to play */}
        <button type="button" onClick={() => setRulesOpen(true)}
          className="w-full flex items-center gap-4 bg-white border-2 border-blue-200 rounded-2xl px-5 py-4 mb-4 hover:border-blue-400 active:scale-95 transition-transform text-left shadow-sm">
          <span className="text-3xl">📖</span>
          <div className="flex-1">
            <div className="font-black text-blue-900 text-base">Learn how to play</div>
            <div className="text-xs text-blue-500 mt-0.5">Escape the Rat Race · earn passive income · buy assets</div>
          </div>
          <span className="text-blue-400 text-lg">›</span>
        </button>

        <button type="button" onClick={startGame} disabled={totalPlayers < 1}
          className="w-full py-4 bg-blue-500 text-white text-xl font-black rounded-2xl shadow-md disabled:opacity-40 active:scale-95 transition-transform">
          {totalPlayers < 1 ? 'Select a player to start' : `Start Game 🚀 (${totalPlayers} player${totalPlayers > 1 ? 's' : ''})`}
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">Pass the device between turns</p>
      </div>

      {rulesOpen && <RulesModal onClose={closeRules} />}
    </div>
  )
}
