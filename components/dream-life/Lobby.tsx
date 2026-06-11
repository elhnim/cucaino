"use client"

// Mockups: 01-lobby-new.html, 02-lobby-resume.html

import { useState } from "react"
import type { Kid } from "@/lib/domain/types"
import type { GameState } from "@/lib/dream-life/types"
import { freedomPct } from "@/lib/dream-life/selectors"
import { CAREERS } from "@/lib/dream-life/content/careers"
import { TOY_SHADOW, GOLD_GLOW } from "./theme"

const GUEST_EMOJIS = ["😎", "🤩", "🥳", "😜", "🦊", "🐼", "🦄", "🐸"]

interface Props {
  kids: Kid[]
  activeKidId: string | null
  savedGame: GameState | null
  canSave: boolean
  onResume: () => void
  onStart: (players: { id: string; name: string; emoji: string }[], seed: number) => void
  onExit: () => void
  onHelp: () => void
}

export default function Lobby({ kids, activeKidId, savedGame, canSave, onResume, onStart, onExit, onHelp }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => (activeKidId ? new Set([activeKidId]) : new Set()))
  const [guests, setGuests] = useState<{ id: string; name: string }[]>([])
  const [guestName, setGuestName] = useState("")
  const [addingGuest, setAddingGuest] = useState(false)
  const [confirmErase, setConfirmErase] = useState(false)

  const total = selected.size + guests.length
  const canAdd = total < 4

  function toggleKid(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (canAdd) next.add(id)
      return next
    })
  }

  function start() {
    if (total < 1) return
    if (savedGame && !confirmErase) {
      setConfirmErase(true)
      return
    }
    const players: { id: string; name: string; emoji: string }[] = []
    let i = 0
    kids.filter(k => selected.has(k.id)).forEach(k => players.push({ id: k.id, name: k.name, emoji: k.avatar ?? "😊" }))
    guests.forEach(g => players.push({ id: g.id, name: g.name, emoji: GUEST_EMOJIS[i++ % GUEST_EMOJIS.length] }))
    onStart(players, Math.floor(Date.now() % 2_147_483_647))
  }

  return (
    <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onExit} className="text-sm font-black text-white/95">✕ Exit</button>
        <button type="button" onClick={onHelp} className="text-sm font-black text-white/95">? Help</button>
      </div>

      <div className="text-center text-white" style={{ textShadow: "0 2px 0 rgba(46,16,101,.35)" }}>
        <div className="text-5xl animate-bounce inline-block">🌟</div>
        <div className="font-black text-2xl">Dream Life</div>
        <div className="text-xs font-bold text-violet-100">
          Many lives, one freedom · 30–60 min{canSave ? " · saves automatically" : ""}
        </div>
        {!canSave && (
          <div className="text-[10px] font-bold text-amber-200 mt-1">⚠️ saving unavailable on this device — finish in one sitting</div>
        )}
      </div>

      {/* resume card (mockup 02) */}
      {savedGame && (
        <button
          type="button"
          onClick={onResume}
          className="bg-white rounded-3xl border-[3px] border-yellow-300 overflow-hidden text-left"
          style={{ boxShadow: GOLD_GLOW }}
        >
          <div className="bg-gradient-to-br from-violet-400 to-violet-600 px-3 py-2.5 flex items-center gap-2 text-white font-black">
            <span className="text-xl">💾</span>
            <div className="flex-1">
              <div className="text-sm">Resume your lives</div>
              <div className="text-[10px] opacity-80">Your game is waiting right where you left it</div>
            </div>
            <span className="bg-white text-violet-700 text-[11px] font-black px-2.5 py-1 rounded-full">▶ CONTINUE</span>
          </div>
          <div className="px-3 py-2 flex gap-2">
            {savedGame.players.map(p => (
              <div key={p.id} className="flex-1 text-center">
                <div className="text-2xl">{p.emoji}</div>
                <div className="font-black text-xs text-gray-800">{p.name}</div>
                <div className="text-[10px] text-gray-500">
                  Age {p.age}{p.careerId ? ` · ${CAREERS[p.careerId].emoji}` : ""}
                </div>
                {savedGame.phaseOf[p.id] === "phase3" && (
                  <div className="text-[10px] font-black text-green-600">{freedomPct(p)}% free</div>
                )}
              </div>
            ))}
          </div>
        </button>
      )}

      <div className="text-[11px] font-black uppercase tracking-wider text-white" style={{ textShadow: "0 1px 1px rgba(46,16,101,.5)" }}>
        Who&apos;s playing? (1–4)
      </div>

      <div className="grid grid-cols-2 gap-2">
        {kids.map(k => {
          const on = selected.has(k.id)
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => toggleKid(k.id)}
              className={`bg-white rounded-3xl border-[3px] p-3 text-center ${on ? "border-yellow-300" : "border-white opacity-90"}`}
              style={{ boxShadow: on ? GOLD_GLOW : TOY_SHADOW }}
            >
              <div className="text-3xl">{k.avatar ?? "😊"}</div>
              <div className="font-black text-gray-800">{k.name}</div>
              <div className={`text-[10px] font-black ${on ? "text-green-600" : "text-gray-400"}`}>{on ? "✓ PLAYING" : "TAP TO JOIN"}</div>
            </button>
          )
        })}
        {guests.map(g => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGuests(prev => prev.filter(x => x.id !== g.id))}
            className="bg-white rounded-3xl border-[3px] border-yellow-300 p-3 text-center"
            style={{ boxShadow: GOLD_GLOW }}
          >
            <div className="text-3xl">{GUEST_EMOJIS[guests.indexOf(g) % GUEST_EMOJIS.length]}</div>
            <div className="font-black text-gray-800">{g.name}</div>
            <div className="text-[10px] font-black text-green-600">✓ PLAYING</div>
          </button>
        ))}
        {canAdd && !addingGuest && (
          <button
            type="button"
            onClick={() => setAddingGuest(true)}
            className="bg-white/80 rounded-3xl border-[3px] border-dashed border-white p-3 text-center"
            style={{ boxShadow: TOY_SHADOW }}
          >
            <div className="text-3xl">➕</div>
            <div className="font-black text-gray-700">Guest</div>
            <div className="text-[10px] font-black text-gray-400">ADD A FRIEND</div>
          </button>
        )}
        {addingGuest && (
          <div className="bg-white rounded-3xl border-[3px] border-white p-3" style={{ boxShadow: TOY_SHADOW }}>
            <input
              autoFocus
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && guestName.trim()) {
                  setGuests(prev => [...prev, { id: `guest-${prev.length}-${guestName.trim()}`, name: guestName.trim() }])
                  setGuestName("")
                  setAddingGuest(false)
                }
              }}
              placeholder="Name…"
              className="w-full text-center font-black text-gray-800 outline-none"
            />
            <button
              type="button"
              className="w-full mt-1 text-[10px] font-black text-violet-600"
              onClick={() => {
                if (guestName.trim()) {
                  setGuests(prev => [...prev, { id: `guest-${prev.length}-${guestName.trim()}`, name: guestName.trim() }])
                  setGuestName("")
                }
                setAddingGuest(false)
              }}
            >
              ✓ ADD
            </button>
          </div>
        )}
      </div>

      <div className="bg-white/85 border-[3px] border-white rounded-2xl px-3 py-2.5 text-[11px] leading-relaxed font-semibold text-indigo-950" style={{ boxShadow: TOY_SHADOW }}>
        <b className="text-amber-600">How you win:</b> live your life one year at a time — earn, learn, invest. The first
        player whose <b>sleeping money</b> (passive income) pays for their whole life is <b>FREE</b> and wins! 🏁
      </div>

      <div className="mt-auto flex flex-col gap-2 pb-2">
        {confirmErase && (
          <div className="bg-red-50 border-[3px] border-red-200 rounded-2xl px-3 py-2 text-[11px] font-bold text-red-700 text-center">
            ⚠️ Starting a new life will erase the saved game. Tap START again to confirm.
          </div>
        )}
        <button
          type="button"
          onClick={start}
          disabled={total < 1}
          className="rounded-[20px] border-[3px] border-white/70 bg-gradient-to-br from-green-400 to-green-600 py-3.5 text-white font-black text-lg disabled:opacity-50 active:scale-[0.99]"
          style={{ boxShadow: "0 6px 0 #15803d, 0 12px 24px rgba(0,0,0,.25)", textShadow: "0 1px 0 rgba(0,0,0,.2)" }}
        >
          ▶ START LIFE
          <span className="block text-[11px] font-bold opacity-85">
            {total} player{total === 1 ? "" : "s"} · begins at age 13
          </span>
        </button>
        <button
          type="button"
          onClick={onHelp}
          className="rounded-[20px] border-[3px] border-white bg-white/35 py-2.5 font-black text-sm text-indigo-950"
          style={{ boxShadow: "0 4px 0 rgba(46,16,101,.15)" }}
        >
          📖 How to play
        </button>
      </div>
    </div>
  )
}
