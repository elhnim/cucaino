"use client"

import { useRef, useEffect, useState } from "react"
import type { Player, ReelSegment } from "@/lib/money-town/types"
import { REEL_SEGMENTS } from "@/lib/money-town/constants"

const SEGMENT_HEIGHT = 80
const SPIN_DURATION = 5800
const NUM_ROTATIONS = 12

const SEGMENT_DISPLAY: Record<ReelSegment, { emoji: string; label: string }> = {
  'event':     { emoji: '📋', label: 'Event' },
  'chance':    { emoji: '🌟', label: 'Chance' },
  'mini-game': { emoji: '🎮', label: 'Mini-Game' },
  'big-event': { emoji: '💥', label: 'Big Event' },
}

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
  player: Player
  onResult: (segment: ReelSegment) => void
}

export default function LeverOverlay({ player, onResult }: Props) {
  const [spinning, setSpinning] = useState(false)
  const [leverPressed, setLeverPressed] = useState(false)
  const [done, setDone] = useState(false)
  const reelRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  function pullLever() {
    if (spinning || done) return
    const targetIdx = Math.floor(Math.random() * REEL_SEGMENTS.length)
    const targetSegment = REEL_SEGMENTS[targetIdx]
    const totalDist = (NUM_ROTATIONS * REEL_SEGMENTS.length + targetIdx - 1) * SEGMENT_HEIGHT

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
        setDone(true)
        setTimeout(() => onResult(targetSegment), 400)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const maxItems = Math.ceil(((NUM_ROTATIONS * REEL_SEGMENTS.length + REEL_SEGMENTS.length + 1) * SEGMENT_HEIGHT + 240) / SEGMENT_HEIGHT) + 6
  const reelItems = Array.from({ length: maxItems }, (_, i) => REEL_SEGMENTS[i % REEL_SEGMENTS.length])

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-xs overflow-hidden animate-pop" style={{ boxShadow: "0 0 40px rgba(250,204,21,0.35), 0 24px 50px rgba(0,0,0,0.5)" }}>
        {/* Player header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-4 flex items-center gap-3">
          <span className="text-3xl avatar-party inline-block">{player.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-black text-white truncate">{player.name}</div>
            <div className="text-xs text-blue-100">${player.cash.toLocaleString()} cash</div>
          </div>
          <span className="text-[10px] font-black text-yellow-200 uppercase tracking-widest text-right leading-tight">Your<br/>turn!</span>
        </div>

        <div className="p-5">
          {/* Reel machine */}
          <div className="rounded-3xl p-4 mb-5" style={{ background: "linear-gradient(160deg, #ef4444, #dc2626 60%, #b91c1c)", boxShadow: "0 8px 0 #991b1b, 0 16px 30px rgba(0,0,0,0.3)" }}>
            {/* Marquee lights */}
            <div className="flex justify-between px-1 mb-2" aria-hidden>
              {Array.from({ length: 8 }).map((_, i) => (
                <span key={i} className="marquee-light w-2 h-2 rounded-full bg-yellow-300" style={{ animationDelay: `${(i % 2) * 0.45}s`, boxShadow: "0 0 6px rgba(253,224,71,0.9)" }} />
              ))}
            </div>
            <div className="bg-yellow-400 text-red-800 font-black text-xs text-center py-1 rounded-xl mb-3 tracking-widest bar-shimmer">
              ★ SPIN TO WIN ★
            </div>
            {/* Window */}
            <div className="bg-slate-900 rounded-2xl overflow-hidden relative" style={{ height: 240, boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)" }}>
              <div className={`absolute left-0 right-0 border-2 border-yellow-400 rounded-xl pointer-events-none z-10 ${done ? 'pulse-ring' : ''}`}
                style={{ top: SEGMENT_HEIGHT, height: SEGMENT_HEIGHT, boxShadow: done ? "0 0 16px rgba(250,204,21,0.7)" : undefined }} />
              <div ref={reelRef} className="absolute top-0 left-0 right-0">
                {reelItems.map((seg, i) => {
                  const d = SEGMENT_DISPLAY[seg]
                  return (
                    <div key={i} className="flex flex-col items-center justify-center text-white"
                      style={{ height: SEGMENT_HEIGHT }}>
                      <span className="text-2xl">{d.emoji}</span>
                      <span className="text-xs font-bold mt-0.5">{d.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Lever */}
          <button
            type="button"
            onClick={pullLever}
            disabled={spinning || done}
            className={`w-full py-4 text-yellow-950 text-xl font-black rounded-2xl disabled:opacity-60 active:scale-95 transition-transform ${leverPressed ? 'translate-y-1' : ''}`}
            style={{ background: "linear-gradient(180deg, #fde047, #facc15 60%, #eab308)", boxShadow: spinning || done ? "none" : "0 5px 0 #a16207, 0 10px 22px rgba(234,179,8,0.4)" }}
          >
            {spinning ? '🎲 Spinning…' : done ? '✨ Loading…' : '🎰 PULL THE LEVER!'}
          </button>
        </div>
      </div>
    </div>
  )
}
