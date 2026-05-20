"use client"

import { useState, useCallback } from "react"
import type { Player, GameAction } from "@/lib/money-town/types"
import { JOBS, PLAYER_COLORS, PLAYER_COLOR_CLASSES, STARTING_CASH } from "@/lib/money-town/constants"

const GUEST_EMOJIS = ['😎', '🤩', '🥳', '😜', '🦊', '🐼', '🦄', '🐸']

interface Props {
  kidName: string | null
  dispatch: (action: GameAction) => void
}

export default function GameLobby({ kidName, dispatch }: Props) {
  const [players, setPlayers] = useState<Player[]>(() => {
    if (kidName) {
      return [{
        id: 'p1',
        name: kidName,
        emoji: '😎',
        color: 'red',
        cash: STARTING_CASH,
        job: JOBS[Math.floor(Math.random() * JOBS.length)],
        assets: [],
      }]
    }
    return []
  })
  const [guestName, setGuestName] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)

  const usedColors = players.map(p => p.color)
  const nextColor = PLAYER_COLORS.find(c => !usedColors.includes(c)) ?? 'red'

  const addGuest = useCallback(() => {
    const name = guestName.trim()
    if (!name || players.length >= 4) return
    const newPlayer: Player = {
      id: `p${Date.now()}`,
      name,
      emoji: GUEST_EMOJIS[players.length % GUEST_EMOJIS.length],
      color: nextColor,
      cash: STARTING_CASH,
      job: JOBS[Math.floor(Math.random() * JOBS.length)],
      assets: [],
    }
    setPlayers(prev => [...prev, newPlayer])
    setGuestName('')
    setAddingGuest(false)
  }, [guestName, players.length, nextColor])

  const removePlayer = (id: string) => setPlayers(prev => prev.filter(p => p.id !== id))

  const startGame = () => {
    if (players.length < 2) return
    players.forEach(p => dispatch({ type: 'ADD_PLAYER', player: p }))
    dispatch({ type: 'START_GAME' })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-green-50 p-4 pb-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-black text-center text-yellow-900 pt-6 mb-1">💰 Money Town</h1>
        <p className="text-center text-sm text-yellow-700 mb-6">
          Escape the Rat Race! First to build enough passive income wins.
        </p>

        {/* Player slots */}
        <div className="space-y-3 mb-4">
          {players.map(p => {
            const cc = PLAYER_COLOR_CLASSES[p.color]
            return (
              <div key={p.id} className={`${cc.bg} border-2 ${cc.border} rounded-2xl p-4 flex items-center gap-3`}>
                <span className="text-3xl">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className={`font-black ${cc.text} truncate`}>{p.name}</div>
                  <div className="text-xs text-gray-500">{p.job.emoji} {p.job.name} · ${p.job.salary}/round · ${p.job.expenses} expenses</div>
                </div>
                {!(p.id === 'p1' && kidName !== null) && (
                  <button
                    type="button"
                    onClick={() => removePlayer(p.id)}
                    className="text-gray-300 hover:text-red-400 text-lg leading-none"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center text-sm text-gray-400">
              Player slot {players.length + i + 1}
            </div>
          ))}
        </div>

        {/* Add guest */}
        {players.length < 4 && (
          <div className="mb-6">
            {addingGuest ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addGuest()}
                  placeholder="Enter name…"
                  autoFocus
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-yellow-400"
                />
                <button
                  type="button"
                  onClick={addGuest}
                  disabled={!guestName.trim()}
                  className="px-4 py-2 bg-yellow-500 text-white font-black rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingGuest(false); setGuestName('') }}
                  className="px-3 py-2 border-2 border-gray-200 text-gray-500 rounded-xl"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingGuest(true)}
                className="w-full border-2 border-dashed border-yellow-300 text-yellow-700 font-bold rounded-2xl py-3 text-sm hover:border-yellow-400 active:scale-95 transition-transform"
              >
                ➕ Add Guest Player
              </button>
            )}
          </div>
        )}

        {/* Start button */}
        <button
          type="button"
          onClick={startGame}
          disabled={players.length < 2}
          className="w-full py-4 bg-green-500 text-white text-xl font-black rounded-2xl shadow-md disabled:opacity-40 active:scale-95 transition-transform"
        >
          {players.length < 2 ? `Add ${2 - players.length} more player${players.length === 1 ? '' : 's'}` : 'Start Game 🚀'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">2–4 players · Pass the device between turns</p>
      </div>
    </div>
  )
}
