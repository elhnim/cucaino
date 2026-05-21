"use client"

interface Props {
  onClose: () => void
}

const RULES = [
  {
    emoji: '🏆',
    title: 'How to WIN',
    body: "You win by earning money while you sleep! 😴💰 In real life, people who don't have to work to pay their bills are called FINANCIALLY FREE. That's your goal — build up enough \"sleeping money\" (passive income) to cover all your bills!",
  },
  {
    emoji: '💼',
    title: 'Your Job & Salary',
    body: "A job is how most people earn money. You go to work, you get paid — that's called a SALARY. 💵 But you also have LIVING EXPENSES — food, rent, electricity — things you must pay every single month whether you work or not. The tricky part: a bigger salary usually means a fancier lifestyle and bigger bills too!",
  },
  {
    emoji: '📦',
    title: 'Assets = Money Machines',
    body: "An ASSET is something you own that makes money for you — even when you're not working! 🏠 A lemonade stand keeps selling while you sleep. A rental property collects rent every month. The goal is to collect so many assets that their income covers all your bills. That's freedom!",
  },
  {
    emoji: '🎰',
    title: 'The Lever (Life happens!)',
    body: "Every turn you pull the lever — just like real life throws surprises at you! 🎲 You might get a tax bill (bad!), a work bonus (great!), or a once-in-a-lifetime chance. Sometimes life is good, sometimes it's tough — the key is to keep building your assets no matter what!",
  },
  {
    emoji: '🎓',
    title: 'University Degree',
    body: "Going to university costs money ($900) and takes 2 turns. But when you graduate 🎓, you get access to MUCH better jobs — like Engineer ($1,700/turn!) and better opportunities. It's a real-life trade-off: spend now to earn way more later. Is it worth it? YOU decide!",
  },
  {
    emoji: '📈',
    title: 'Investing',
    body: "INVESTING means putting your money to work! Instead of spending $2,000, you buy Stocks or a Property that pays you every single turn. The more you invest, the more money flows in — even while you're sleeping. Rich people don't just save money — they put it to work! 💡",
  },
  {
    emoji: '🏁',
    title: 'Escaping the Rat Race',
    body: "The RAT RACE means working just to pay your bills, with nothing left over. Most people are stuck in it! When your asset income ≥ your living expenses — you're OUT! 🏃 You don't NEED a job anymore. First player to escape wins. But everyone learns something real along the way!",
  },
]

export default function RulesModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-black text-gray-900">💰 How to Play</h2>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none font-bold">✕</button>
        </div>

        <div className="p-5 space-y-4 pb-8">
          {RULES.map(r => (
            <div key={r.title} className="flex gap-3">
              <span className="text-2xl shrink-0">{r.emoji}</span>
              <div>
                <h3 className="font-black text-gray-900 mb-0.5">{r.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{r.body}</p>
              </div>
            </div>
          ))}

          <button type="button" onClick={onClose}
            className="w-full py-4 bg-blue-500 text-white font-black text-lg rounded-2xl active:scale-95 transition-transform mt-2">
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}
