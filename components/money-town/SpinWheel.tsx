"use client"

import { useState, useRef } from "react"
import type { WheelSegment } from "@/lib/money-town/types"
import { WHEEL_SEGMENTS } from "@/lib/money-town/constants"

const SEGMENT_CONFIG: Record<WheelSegment, { emoji: string; label: string; color: string }> = {
  payday:     { emoji: '💰', label: 'Payday',    color: '#fbbf24' },
  deal:       { emoji: '🤝', label: 'Deal!',     color: '#34d399' },
  expense:    { emoji: '💸', label: 'Expense',   color: '#f87171' },
  minigame:   { emoji: '🎮', label: 'Mini-Game', color: '#818cf8' },
  'bad-luck': { emoji: '⚡', label: 'Bad Luck',  color: '#94a3b8' },
}

// 10 segments; each = 36 degrees
const SEGMENT_DEG = 360 / 10

interface Props {
  onResult: (segment: WheelSegment) => void
}

export default function SpinWheel({ onResult }: Props) {
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState<WheelSegment | null>(null)
  const currentRotation = useRef(0)

  const spin = () => {
    if (spinning) return
    setSpinning(true)
    setResult(null)

    const resultIndex = Math.floor(Math.random() * 10)
    const targetSegmentAngle = resultIndex * SEGMENT_DEG + SEGMENT_DEG / 2
    // Spin at least 5 full rotations + land on result
    const fullSpins = (5 + Math.floor(Math.random() * 4)) * 360
    const targetAngle = fullSpins + (360 - targetSegmentAngle)
    const newRotation = currentRotation.current + targetAngle

    currentRotation.current = newRotation
    setRotation(newRotation)

    setTimeout(() => {
      const segment = WHEEL_SEGMENTS[resultIndex]
      setResult(segment)
      setSpinning(false)
    }, 3500)
  }

  const handleContinue = () => {
    if (result) onResult(result)
  }

  // Build conic gradient
  const conicStops = WHEEL_SEGMENTS.map((seg, i) => {
    const start = i * 10
    const end = (i + 1) * 10
    return `${SEGMENT_CONFIG[seg].color} ${start}% ${end}%`
  }).join(', ')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-black text-gray-900 mb-8">🎡 Spin the Wheel!</h2>

      <div className="relative mb-8">
        {/* Pointer */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 text-2xl">▼</div>

        {/* Wheel */}
        <div
          className="w-64 h-64 rounded-full relative"
          style={{
            background: `conic-gradient(${conicStops})`,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 1)' : 'none',
          }}
        >
          {/* Segment emoji labels */}
          {WHEEL_SEGMENTS.map((seg, i) => {
            const angle = i * SEGMENT_DEG + SEGMENT_DEG / 2
            const rad = ((angle - 90) * Math.PI) / 180
            const r = 90
            const x = 128 + r * Math.cos(rad)
            const y = 128 + r * Math.sin(rad)
            return (
              <span
                key={i}
                className="absolute text-lg"
                style={{
                  left: x,
                  top: y,
                  transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                  pointerEvents: 'none',
                }}
              >
                {SEGMENT_CONFIG[seg].emoji}
              </span>
            )
          })}
        </div>
      </div>

      {!spinning && !result && (
        <button
          type="button"
          onClick={spin}
          className="px-10 py-4 bg-green-500 text-white text-2xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform"
        >
          SPIN!
        </button>
      )}

      {spinning && (
        <p className="text-gray-500 text-lg font-medium animate-pulse">Spinning…</p>
      )}

      {result && !spinning && (
        <div className="text-center">
          <div className="text-5xl mb-2">{SEGMENT_CONFIG[result].emoji}</div>
          <div className="text-2xl font-black text-gray-900 mb-6">{SEGMENT_CONFIG[result].label}!</div>
          <button
            type="button"
            onClick={handleContinue}
            className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-lg active:scale-95 transition-transform"
          >
            Continue ▶
          </button>
        </div>
      )}
    </div>
  )
}
