"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface Bag {
  id: number
  x: number
  y: number
  type: 'cash' | 'expense'
  speed: number
  dismissed: boolean
}

interface Props {
  onComplete: (cashEarned: number) => void
}

const GAME_DURATION = 15
const MAX_EARN = 150

export default function CashGrab({ onComplete }: Props) {
  const [bags, setBags] = useState<Bag[]>([])
  const [grabbed, setGrabbed] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const nextId = useRef(0)

  const spawnBag = useCallback(() => {
    setBags(prev => [
      ...prev.filter(b => !b.dismissed && b.x > -20),
      {
        id: nextId.current++,
        x: 110,
        y: 15 + Math.random() * 65,
        type: Math.random() < 0.6 ? 'cash' : 'expense',
        speed: 1.5 + Math.random() * 1.5,
        dismissed: false,
      },
    ])
  }, [])

  useEffect(() => {
    if (!started || done) return
    const spawn = setInterval(spawnBag, 1000)
    return () => clearInterval(spawn)
  }, [started, done, spawnBag])

  useEffect(() => {
    if (!started || done) return
    const move = setInterval(() => {
      setBags(prev => prev.map(b => ({ ...b, x: b.x - b.speed })).filter(b => b.x > -20))
    }, 50)
    return () => clearInterval(move)
  }, [started, done])

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

  const tap = (id: number, type: 'cash' | 'expense') => {
    setBags(prev => prev.map(b => b.id === id ? { ...b, dismissed: true } : b))
    if (type === 'cash') setGrabbed(g => g + 1)
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">💰</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Cash Grab!</h2>
        <p className="text-gray-500 text-sm mb-8">Tap 💰 money bags, avoid 💸 expenses! 15 seconds · earn up to $150</p>
        <button onClick={() => setStarted(true)} className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Start!
        </button>
      </div>
    )
  }

  if (done) {
    const earned = Math.round((grabbed / 10) * MAX_EARN)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">💰</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Time&apos;s up!</h2>
        <p className="text-gray-500 mb-2">Grabbed {grabbed} money bags!</p>
        <div className="text-4xl font-black text-green-600 mb-8">+${earned}</div>
        <button onClick={() => onComplete(earned)} className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Collect! 🎉
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <div className="flex justify-between p-4 text-sm font-bold text-gray-600">
        <span>💰 Grabbed: {grabbed}</span>
        <span>⏱️ {timeLeft}s</span>
      </div>
      <div className="flex-1 relative bg-green-50 overflow-hidden select-none touch-none">
        {bags.filter(b => !b.dismissed).map(bag => (
          <button
            key={bag.id}
            type="button"
            onPointerDown={() => tap(bag.id, bag.type)}
            className="absolute text-4xl leading-none"
            style={{ left: `${bag.x}%`, top: `${bag.y}%`, transform: 'translate(-50%,-50%)' }}
          >
            {bag.type === 'cash' ? '💰' : '💸'}
          </button>
        ))}
        <div className="absolute inset-y-0 right-0 w-1 bg-red-200" />
      </div>
    </div>
  )
}
