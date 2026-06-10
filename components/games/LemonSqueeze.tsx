"use client"

import { useState, useEffect } from "react"

interface Props {
  onComplete: (cashEarned: number) => void
}

const GAME_DURATION = 15
const MAX_EARN = 100
const GOAL_TAPS = 30

export default function LemonSqueeze({ onComplete }: Props) {
  const [taps, setTaps] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const [squeeze, setSqueeze] = useState(false)

  useEffect(() => {
    if (!started || done) return
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setDone(true); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, done])

  const tap = () => {
    if (!started || done) return
    setTaps(t => t + 1)
    setSqueeze(true)
    setTimeout(() => setSqueeze(false), 100)
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🍋</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Lemon Squeeze!</h2>
        <p className="text-gray-500 text-sm mb-8">Tap the lemon as fast as you can to fill the glass! 15 seconds · earn up to $100</p>
        <button onClick={() => setStarted(true)} className="px-10 py-4 bg-yellow-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Start!
        </button>
      </div>
    )
  }

  if (done) {
    const earned = Math.round(Math.min(1, taps / GOAL_TAPS) * MAX_EARN)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🥤</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Time&apos;s up!</h2>
        <p className="text-gray-500 mb-2">{taps} squeezes!</p>
        <div className="text-4xl font-black text-green-600 mb-8">+${earned}</div>
        <button onClick={() => onComplete(earned)} className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Collect! 🎉
        </button>
      </div>
    )
  }

  const fillPct = Math.min(100, Math.round((taps / GOAL_TAPS) * 100))

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 select-none touch-none">
      <div className="flex justify-between w-full max-w-xs mb-6 text-sm font-bold text-gray-600">
        <span>Squeezes: {taps}</span>
        <span>⏱️ {timeLeft}s</span>
      </div>

      {/* Glass */}
      <div className="w-20 h-40 border-4 border-yellow-400 rounded-b-2xl overflow-hidden mb-6 bg-white relative">
        <div
          className="absolute bottom-0 left-0 right-0 bg-yellow-300 transition-all"
          style={{ height: `${fillPct}%` }}
        />
      </div>

      <button
        type="button"
        onPointerDown={tap}
        className={`text-8xl transition-transform duration-75 ${squeeze ? 'scale-90' : 'scale-100'}`}
      >
        🍋
      </button>
      <p className="text-xs text-gray-400 mt-4">Tap the lemon!</p>
    </div>
  )
}
