"use client"

import { useState } from "react"

interface Props {
  onClose: () => void
}

const SLIDES = [
  {
    emoji: '🏆',
    title: 'How to WIN',
    body: "Earn money while you sleep — first to cover your bills WINS! 😴💰",
    bg: 'from-yellow-400 to-amber-500',
  },
  {
    emoji: '💼',
    title: 'Your Job & Salary',
    body: "Your job pays a SALARY 💵. Your EXPENSES are what you pay every turn.",
    bg: 'from-blue-400 to-blue-600',
  },
  {
    emoji: '📦',
    title: 'Assets = Money Machines',
    body: "ASSETS earn money for you — even while you're not working! 🏠",
    bg: 'from-green-400 to-emerald-600',
  },
  {
    emoji: '🎰',
    title: 'The Lever (Life happens!)',
    body: "Pull the lever each turn for a surprise — good or bad! 🎲",
    bg: 'from-purple-400 to-purple-600',
  },
  {
    emoji: '🎓',
    title: 'University Degree',
    body: "Pay $900 to study — unlock much better jobs in 2 turns! 🎓",
    bg: 'from-indigo-400 to-indigo-600',
  },
  {
    emoji: '📈',
    title: 'Investing',
    body: "Buy stocks or property — they pay you every single turn! 💡",
    bg: 'from-teal-400 to-teal-600',
  },
  {
    emoji: '🧠',
    title: 'Play Smart!',
    body: "Watch for deals, grab insurance, and make smart trades! 🎯",
    bg: 'from-orange-400 to-red-500',
  },
  {
    emoji: '🏁',
    title: 'Escaping the Rat Race',
    body: "Earn more from assets than bills — and you're FREE! 🏃",
    bg: 'from-rose-400 to-rose-600',
  },
]

export default function RulesModal({ onClose }: Props) {
  const [slide, setSlide] = useState(0)
  const current = SLIDES[slide]
  const isLast = slide === SLIDES.length - 1

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-white rounded-t-3xl w-full max-w-md overflow-hidden" style={{ maxHeight: '92dvh', paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* Coloured header */}
        <div className={`bg-gradient-to-br ${current.bg} px-6 pt-8 pb-6 text-center`}>
          <div className="text-6xl mb-3">{current.emoji}</div>
          <h2 className="text-2xl font-black text-white leading-tight">{current.title}</h2>
          {/* Dot indicators */}
          <div className="flex justify-center gap-1.5 mt-4">
            {SLIDES.map((_, i) => (
              <button key={i} type="button" onClick={() => setSlide(i)}
                className={`rounded-full transition-all ${i === slide ? 'bg-white w-5 h-2' : 'bg-white/40 w-2 h-2'}`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: '38vh' }}>
          {current.body.split('\n\n').map((para, i) => (
            <p key={i} className="text-base text-gray-700 leading-relaxed mb-3 last:mb-0">{para}</p>
          ))}
        </div>

        {/* Navigation */}
        <div className="px-5 pb-6 pt-2 flex gap-3">
          {slide > 0 && (
            <button type="button" onClick={() => setSlide(s => s - 1)}
              className="flex-1 py-3 border-2 border-gray-200 text-gray-600 font-black rounded-2xl active:scale-95 transition-transform">
              ← Back
            </button>
          )}
          {isLast ? (
            <button type="button" onClick={onClose}
              className={`flex-1 py-3 text-white font-black rounded-2xl active:scale-95 transition-transform bg-gradient-to-r ${current.bg}`}>
              Let's Play! 🚀
            </button>
          ) : (
            <button type="button" onClick={() => setSlide(s => s + 1)}
              className={`flex-1 py-3 text-white font-black rounded-2xl active:scale-95 transition-transform bg-gradient-to-r ${current.bg}`}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
