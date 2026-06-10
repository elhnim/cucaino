"use client"

import { useRef, useEffect, useState } from "react"
import type { Player, GameAction } from "@/lib/money-town/types"
import { JOBS } from "@/lib/money-town/constants"

const SEGMENT_HEIGHT = 80
const SPIN_DURATION = 2200
const NUM_ROTATIONS = 5

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
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={{ background: "linear-gradient(180deg, #7dd3fc 0%, #e0f2fe 55%, #d9f99d 100%)" }}>
        {/* celebration rain */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {[12, 32, 52, 72, 90].map((left, i) => (
            <span key={left} className="emoji-rain-piece text-2xl" style={{ left: `${left}%`, animationDelay: `${i * 0.5}s` }}>
              {i % 2 === 0 ? '🎉' : result.emoji}
            </span>
          ))}
        </div>
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center relative animate-pop">
          <div className="text-6xl mb-3"><span className="avatar-party inline-block">{result.emoji}</span></div>
          <h2 className="text-2xl font-black text-gray-900 mb-1">
            <span className="walk-bob inline-block mr-1">{player.emoji}</span> {player.name} is a
          </h2>
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "linear-gradient(180deg, #7dd3fc 0%, #e0f2fe 55%, #d9f99d 100%)" }}>
      <div className="text-4xl mb-1"><span className="avatar-party inline-block">{player.emoji}</span></div>
      <h2 className="text-2xl font-black text-sky-950 mb-1 text-center">
        {player.name}
      </h2>
      <p className="text-sm font-bold text-sky-600 mb-6 text-center">Pull the lever to land your first job!</p>

      {/* Reel machine */}
      <div className="rounded-3xl p-4 mb-6 w-64" style={{ background: "linear-gradient(160deg, #ef4444, #dc2626 60%, #b91c1c)", boxShadow: "0 8px 0 #991b1b, 0 18px 36px rgba(0,0,0,0.35)" }}>
        {/* Marquee lights */}
        <div className="flex justify-between px-1 mb-2" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="marquee-light w-2 h-2 rounded-full bg-yellow-300" style={{ animationDelay: `${(i % 2) * 0.45}s`, boxShadow: "0 0 6px rgba(253,224,71,0.9)" }} />
          ))}
        </div>
        <div className="bg-yellow-400 text-red-800 font-black text-xs text-center py-1 rounded-xl mb-3 tracking-widest bar-shimmer">
          ★ JOB LOTTERY ★
        </div>
        {/* Window */}
        <div className="bg-slate-900 rounded-2xl overflow-hidden relative" style={{ height: 240, boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)" }}>
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
        className={`px-8 py-4 text-yellow-950 text-xl font-black rounded-2xl active:scale-95 disabled:opacity-60 transition-transform ${leverPressed ? 'translate-y-2' : ''}`}
        style={{ background: "linear-gradient(180deg, #fde047, #facc15 60%, #eab308)", boxShadow: spinning ? "none" : "0 5px 0 #a16207, 0 10px 22px rgba(234,179,8,0.4)" }}>
        {spinning ? '🎲 Spinning…' : '🎰 PULL THE LEVER!'}
      </button>

      {spinPlayerIndex > 0 && (
        <p className="mt-4 text-xs text-gray-400">
          Player {spinPlayerIndex + 1} of {players.length}
        </p>
      )}
    </div>
  )
}
