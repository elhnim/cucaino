"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface Coin {
  id: number
  x: number
  y: number
  speed: number
  caught: boolean
}

interface Props {
  onComplete: (cashEarned: number) => void
}

const GAME_DURATION = 15
const MAX_EARN = 150

export default function CoinRain({ onComplete }: Props) {
  const [coins, setCoins] = useState<Coin[]>([])
  const [caught, setCaught] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const nextId = useRef(0)
  const areaRef = useRef<HTMLDivElement>(null)

  const spawnCoin = useCallback(() => {
    setCoins(prev => [
      ...prev.filter(c => !c.caught && c.y < 110),
      {
        id: nextId.current++,
        x: 5 + Math.random() * 85,
        y: -10,
        speed: 1.5 + Math.random() * 2,
        caught: false,
      },
    ])
  }, [])

  useEffect(() => {
    if (!started || done) return
    const spawn = setInterval(spawnCoin, 600)
    return () => clearInterval(spawn)
  }, [started, done, spawnCoin])

  useEffect(() => {
    if (!started || done) return
    const move = setInterval(() => {
      setCoins(prev => prev.map(c => ({ ...c, y: c.y + c.speed })).filter(c => c.y < 115))
    }, 50)
    return () => clearInterval(move)
  }, [started, done])

  useEffect(() => {
    if (!started || done) return
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer)
          setDone(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, done])

  const catchCoin = (id: number) => {
    setCoins(prev => prev.map(c => c.id === id ? { ...c, caught: true } : c))
    setCaught(prev => prev + 1)
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🪙</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Coin Rain!</h2>
        <p className="text-gray-500 text-sm mb-8">Tap the coins before they fall! 15 seconds · earn up to $150</p>
        <button onClick={() => setStarted(true)} className="px-10 py-4 bg-yellow-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Start!
        </button>
      </div>
    )
  }

  if (done) {
    const earned = Math.round((caught / 15) * MAX_EARN)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🪙</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Time&apos;s up!</h2>
        <p className="text-gray-500 mb-2">You caught {caught} coins</p>
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
        <span>🪙 Caught: {caught}</span>
        <span>⏱️ {timeLeft}s</span>
      </div>
      <div ref={areaRef} className="flex-1 relative bg-blue-50 overflow-hidden select-none touch-none">
        {coins.filter(c => !c.caught).map(coin => (
          <button
            key={coin.id}
            type="button"
            onPointerDown={() => catchCoin(coin.id)}
            className="absolute text-3xl leading-none"
            style={{ left: `${coin.x}%`, top: `${coin.y}%`, transform: 'translate(-50%,-50%)' }}
          >
            🪙
          </button>
        ))}
      </div>
    </div>
  )
}
