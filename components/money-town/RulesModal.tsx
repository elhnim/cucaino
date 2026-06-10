"use client"

import { useState } from "react"

interface Props {
  onClose: () => void
}

const SLIDES = [
  {
    emoji: '🏆',
    title: 'How to WIN',
    body: "You win by earning money while you sleep! 😴💰\n\nIn real life, people who don't have to work to pay their bills are called FINANCIALLY FREE.\n\nBuild enough \"sleeping money\" (passive income) to cover all your bills — first to do it WINS.\n\n⏰ You have 12 rounds. If nobody escapes, whoever is CLOSEST to freedom wins!",
    bg: 'from-yellow-400 to-amber-500',
  },
  {
    emoji: '💼',
    title: 'Your Job & Salary',
    body: "A job is how most people earn money. You go to work, you get paid — that's called a SALARY. 💵\n\nBut you also have LIVING EXPENSES — food, rent, electricity — things you pay every month no matter what.\n\nBigger salary usually means a fancier lifestyle and bigger bills too!",
    bg: 'from-blue-400 to-blue-600',
  },
  {
    emoji: '📦',
    title: 'Assets = Money Machines',
    body: "An ASSET is something you own that makes money for you — even when you're not working! 🏠\n\nA lemonade stand keeps selling while you sleep. A rental property collects rent every month.\n\nCollect enough assets and their income covers all your bills. That's freedom!",
    bg: 'from-green-400 to-emerald-600',
  },
  {
    emoji: '🎰',
    title: 'The Lever (Life happens!)',
    body: "Every turn you pull the lever — just like real life throws surprises at you! 🎲\n\nYou might get a tax bill 😬, a work bonus 🎉, or a once-in-a-lifetime chance.\n\nSometimes life is good, sometimes it's tough — keep building your assets no matter what!",
    bg: 'from-purple-400 to-purple-600',
  },
  {
    emoji: '🎓',
    title: 'University Degree',
    body: "Going to university costs money ($900) and takes 2 turns. But when you graduate 🎓, you unlock MUCH better jobs — like Engineer ($1,700/turn!) and better opportunities.\n\nIt's a real trade-off: spend now to earn way more later.\n\nIs it worth it? YOU decide!",
    bg: 'from-indigo-400 to-indigo-600',
  },
  {
    emoji: '📈',
    title: 'Investing',
    body: "INVESTING means putting your money to work! 💡\n\nInstead of spending $2,000, you buy Stocks or a Property that pays you every single turn.\n\nThe more you invest, the more money flows in — even while you're sleeping.\n\nRich people don't just save money — they put it to WORK!",
    bg: 'from-teal-400 to-teal-600',
  },
  {
    emoji: '🧠',
    title: 'Play Smart!',
    body: "Luck deals the cards — but STRATEGY wins the game! 🎯\n\n🏪 THE MARKET changes every turn. Hot deals save you 20% — but waiting for one costs you time. Pricey day? Maybe skip and save.\n\n🛡️ INSURANCE ($400) blocks one bad money event. Cheap peace of mind… or wasted cash?\n\n💱 You can SELL assets back at 75% — sometimes it's worth taking the loss to grab a better deal.\n\n🤔 Choice cards ask the big question: cash NOW, or income FOREVER?",
    bg: 'from-orange-400 to-red-500',
  },
  {
    emoji: '🏁',
    title: 'Escaping the Rat Race',
    body: "The RAT RACE means working just to pay your bills, with nothing left over. Most people are stuck in it!\n\nWhen your asset income ≥ your living expenses — you're OUT! 🏃\n\nYou don't NEED a job anymore. First player to escape WINS!\n\nBut everyone learns something real along the way. 🌟",
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
