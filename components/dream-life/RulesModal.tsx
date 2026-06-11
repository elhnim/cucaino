"use client"

// Mockup: 03-rules.html — 5-slide carousel.

import { useState } from "react"

const SLIDES = [
  {
    emoji: "🏆",
    title: "How to Win",
    bg: "from-amber-300 to-amber-500",
    body: "Every turn is ONE YEAR of your life, starting at age 13.\n\nBe the first player whose PASSIVE INCOME covers all your EXPENSES. Passive income is money your assets pay you — rent, dividends, business profit — while you sleep. 😴💰\n\nWatch the Freedom bar on your card. When it hits 100% — you're out of the rat race and you WIN! 🏁\n\nEarn → learn → buy assets → let assets pay your bills → FREEDOM.",
  },
  {
    emoji: "🧒",
    title: "Teen Years & the 4 Skills",
    bg: "from-sky-400 to-blue-600",
    body: "Ages 13–16 you work teen gigs and build FOUR skills:\n\n💰 Money Smarts — unlocks better investments\n🏆 Pro Skills — climbs the career ladder\n🛡️ Grit — tougher, better gigs, side hustles\n🧠 Big Brain — smarter jobs, clever tricks\n\nEach action can only be taken TWICE as a teen — you can't max everything. Choose who you're becoming!",
  },
  {
    emoji: "🎓",
    title: "Picking Your Career",
    bg: "from-violet-400 to-violet-600",
    body: "At 17 the Career Reel spins! Your teen choices decide which of 12 careers you QUALIFY for — skills unlock careers, mini-game wins unlock talent careers like Artist and Athlete.\n\nIn this version every path leads to the trades 🔧 — more lives are coming soon!\n\nThen it's 3 years of apprenticeship: earn while you learn, debt-free.",
  },
  {
    emoji: "🏠",
    title: "Assets & Debt",
    bg: "from-green-400 to-green-600",
    body: "Assets are things that PAY YOU: savings, funds, property, a business.\n\n📈 Growth assets (shares, crypto) build wealth but pay little — they can't win until you SELL them and buy income assets.\n💵 Income assets (savings, commercial property, business) pay the cash that frees you.\n\nDebt is the mirror of investing — it compounds AGAINST you. Good debt buys things that earn. Bad debt just costs.",
  },
  {
    emoji: "🃏",
    title: "Power-Up Cards",
    bg: "from-pink-400 to-rose-500",
    body: "Win mini-games and hit milestones to earn power-up cards (hold up to 3).\n\n⚡ Boost cards super-charge your year.\n😈 Attack cards mess with your rivals.\n🪖 Defence cards block bad luck — the game will offer them automatically when something bad hits you.\n\nKnowing WHEN to play a card is the real skill. Good luck — live your dream life! 🌟",
  },
]

export default function RulesModal({ onClose }: { onClose: () => void }) {
  const [slide, setSlide] = useState(0)
  const cur = SLIDES[slide]
  const isLast = slide === SLIDES.length - 1

  return (
    <div className="fixed inset-0 z-50 bg-indigo-950/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[28px] border-4 border-white w-full max-w-md overflow-hidden" style={{ maxHeight: "88dvh", boxShadow: "0 10px 0 rgba(46,16,101,.25)" }}>
        <div className={`bg-gradient-to-br ${cur.bg} px-6 pt-7 pb-5 text-center text-white`} style={{ textShadow: "0 2px 0 rgba(0,0,0,.18)" }}>
          <div className="text-6xl inline-block animate-bounce">{cur.emoji}</div>
          <h2 className="text-2xl font-black leading-tight mt-1">{cur.title}</h2>
          <div className="flex justify-center gap-1.5 mt-3">
            {SLIDES.map((_, i) => (
              <span key={i} className={`w-2 h-2 rounded-full ${i === slide ? "bg-white" : "bg-white/40"}`} />
            ))}
          </div>
        </div>
        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "40dvh" }}>
          <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-line">{cur.body}</p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border-[3px] border-gray-200 py-3 font-black text-gray-400 text-sm"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => (isLast ? onClose() : setSlide(s => s + 1))}
            className="flex-[2] rounded-2xl border-[3px] border-white/70 bg-gradient-to-br from-violet-400 to-violet-600 py-3 font-black text-white"
            style={{ boxShadow: "0 5px 0 #6d28d9" }}
          >
            {isLast ? "LET'S PLAY! 🌟" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  )
}
