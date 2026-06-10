"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface Pet {
  id: number
  emoji: string
  x: number
  y: number
  dx: number
  dy: number
  caught: boolean
}

interface Props {
  onComplete: (cashEarned: number) => void
}

const PETS = ['🐶', '🐱', '🐰', '🐹', '🐸', '🦊']
const GAME_DURATION = 15
const MAX_EARN = 100

export default function PetRush({ onComplete }: Props) {
  const [pets, setPets] = useState<Pet[]>([])
  const [caught, setCaught] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const nextId = useRef(0)

  const spawnPet = useCallback(() => {
    setPets(prev => {
      if (prev.filter(p => !p.caught).length >= 5) return prev
      return [...prev, {
        id: nextId.current++,
        emoji: PETS[Math.floor(Math.random() * PETS.length)],
        x: 10 + Math.random() * 80,
        y: 10 + Math.random() * 80,
        dx: (Math.random() - 0.5) * 2,
        dy: (Math.random() - 0.5) * 2,
        caught: false,
      }]
    })
  }, [])

  useEffect(() => {
    if (!started || done) return
    const spawn = setInterval(spawnPet, 1500)
    return () => clearInterval(spawn)
  }, [started, done, spawnPet])

  useEffect(() => {
    if (!started || done) return
    const move = setInterval(() => {
      setPets(prev => prev.map(p => {
        if (p.caught) return p
        let nx = p.x + p.dx
        let ny = p.y + p.dy
        let ndx = p.dx
        let ndy = p.dy
        if (nx < 2 || nx > 93) { ndx = -ndx; nx = Math.max(2, Math.min(93, nx)) }
        if (ny < 2 || ny > 88) { ndy = -ndy; ny = Math.max(2, Math.min(88, ny)) }
        return { ...p, x: nx, y: ny, dx: ndx, dy: ndy }
      }))
    }, 60)
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

  const catchPet = (id: number) => {
    setPets(prev => prev.map(p => p.id === id ? { ...p, caught: true } : p))
    setCaught(c => c + 1)
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🐾</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Pet Rush!</h2>
        <p className="text-gray-500 text-sm mb-8">Tap the runaway pets before they escape! 15 seconds · earn up to $100</p>
        <button onClick={() => setStarted(true)} className="px-10 py-4 bg-orange-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform">
          Start!
        </button>
      </div>
    )
  }

  if (done) {
    const earned = Math.min(MAX_EARN, Math.round((caught / 8) * MAX_EARN))
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🐾</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Time&apos;s up!</h2>
        <p className="text-gray-500 mb-2">Caught {caught} pets!</p>
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
        <span>🐾 Caught: {caught}</span>
        <span>⏱️ {timeLeft}s</span>
      </div>
      <div className="flex-1 relative bg-orange-50 overflow-hidden select-none touch-none">
        {pets.filter(p => !p.caught).map(pet => (
          <button
            key={pet.id}
            type="button"
            onPointerDown={() => catchPet(pet.id)}
            className="absolute text-4xl leading-none"
            style={{ left: `${pet.x}%`, top: `${pet.y}%`, transform: 'translate(-50%,-50%)' }}
          >
            {pet.emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
