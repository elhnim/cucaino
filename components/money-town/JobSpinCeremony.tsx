"use client"

import { useRef, useEffect, useState } from "react"
import type { Player, GameAction } from "@/lib/money-town/types"
import { JOBS } from "@/lib/money-town/constants"

const SEGMENT_HEIGHT = 80
const SPIN_DURATION = 3500
const NUM_ROTATIONS = 8

function easeInQuad(t: number) { return t * t }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }

function getScrolled(elapsed: number, totalDist: number): number {
  const t = Math.min(elapsed / SPIN_DURATION, 1)
  const P1 = 0.06, P2 = 0.41
  const D1 = 0.05, D2 = 0.65
  if (t <= P1) return D1 * easeInQuad(t / P1) * totalDist
  if (t <= P2) return (D1 + (D2 - D1) * ((t - P1) / (P2 - P1))) * totalDist
  return (D2 + (1 - D2) * easeOutCubic((t - P2) / (1 - P2))) * totalDist
}

interface Props {
  players: Player[]
  spinPlayerIndex: number
  dispatch: (action: GameAction) => void
}

export default function JobSpinCeremony({ players, spinPlayerIndex, dispatch }: Props) {
  const player = players[spinPlayerIndex]
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<typeof JOBS[0] | null>(null)
  const [leverPressed, setLeverPressed] = useState(false)
  const reelRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  const segments = JOBS

  function pullLever() {
    if (spinning || result) return
    const targetIdx = Math.floor(Math.random() * segments.length)
    const targetJob = segments[targetIdx]
    const totalDist = (NUM_ROTATIONS * segments.length + targetIdx - 1) * SEGMENT_HEIGHT

    setSpinning(true)
    setLeverPressed(true)
    setTimeout(() => setLeverPressed(false), 400)

    const start = performance.now()
    function frame(now: number) {
      const elapsed = now - start
      const scrolled = getScrolled(elapsed, totalDist)
      if (reelRef.current) reelRef.current.style.transform = `translateY(-${scrolled}px)`
      if (elapsed < SPIN_DURATION) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        if (reelRef.current) reelRef.current.style.transform = `translateY(-${totalDist}px)`
        setSpinning(false)
        setTimeout(() => setResult(targetJob), 400)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const numItems = Math.ceil(((NUM_ROTATIONS * segments.length + segments.length + 1) * SEGMENT_HEIGHT + 240) / SEGMENT_HEIGHT) + 6
  const reelItems = Array.from({ length: numItems }, (_, i) => segments[i % segments.length])

  if (result) {
    return (
      <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-3">{result.emoji}</div>
          <h2 className="text-2xl font-black text-gray-900 mb-1">{player.name} is a</h2>
          <h3 className="text-3xl font-black text-blue-600 mb-4">{result.name}</h3>
          <div className="bg-blue-50 rounded-2xl p-4 mb-6 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Salary/turn</span>
              <span className="font-black text-green-600">${result.salary.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Expenses/turn</span>
              <span className="font-black text-red-500">${result.expenses.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-blue-100 pt-1 mt-1">
              <span className="text-gray-500">Net/turn</span>
              <span className="font-black text-blue-700">${(result.salary - result.expenses).toLocaleString()}</span>
            </div>
          </div>
          <button type="button"
            onClick={() => dispatch({ type: 'JOB_SPIN_RESULT', jobId: result.id })}
            className="w-full py-4 bg-blue-500 text-white text-xl font-black rounded-2xl active:scale-95 transition-transform">
            {spinPlayerIndex < players.length - 1 ? `Next: ${players[spinPlayerIndex + 1]?.name} →` : "Let's Play! 🚀"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-6">
      <h2 className="text-2xl font-black text-blue-900 mb-1 text-center">
        {player.name}
      </h2>
      <p className="text-sm text-blue-500 mb-6 text-center">Pull the lever to get your job!</p>

      {/* Reel machine */}
      <div className="bg-red-500 rounded-3xl p-4 shadow-xl mb-6 w-64">
        <div className="bg-yellow-400 text-red-800 font-black text-xs text-center py-1 rounded-xl mb-3 tracking-widest">
          SPIN TO WIN
        </div>
        {/* Window */}
        <div className="bg-slate-900 rounded-2xl overflow-hidden relative" style={{ height: 240 }}>
          {/* Active row highlight */}
          <div className="absolute left-0 right-0 border-2 border-yellow-400 rounded-xl pointer-events-none z-10"
            style={{ top: SEGMENT_HEIGHT, height: SEGMENT_HEIGHT }} />
          {/* Reel */}
          <div ref={reelRef} className="absolute top-0 left-0 right-0">
            {reelItems.map((job, i) => (
              <div key={i} className="flex flex-col items-center justify-center text-white"
                style={{ height: SEGMENT_HEIGHT }}>
                <span className="text-2xl">{job.emoji}</span>
                <span className="text-xs font-bold mt-0.5">{job.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lever */}
      <button type="button" onClick={pullLever} disabled={spinning}
        className={`px-8 py-4 bg-yellow-500 text-white text-xl font-black rounded-2xl shadow-lg active:scale-95 disabled:opacity-60 transition-transform ${leverPressed ? 'translate-y-2' : ''}`}>
        {spinning ? 'Spinning…' : '🎰 Pull the Lever!'}
      </button>

      {spinPlayerIndex > 0 && (
        <p className="mt-4 text-xs text-gray-400">
          Player {spinPlayerIndex + 1} of {players.length}
        </p>
      )}
    </div>
  )
}
