"use client"

interface Props {
  onClose: () => void
}

const RULES = [
  {
    emoji: '🏆',
    title: 'Goal',
    body: 'Escape the Rat Race! Build passive income from assets until it equals or exceeds your living expenses. First to do it wins.',
  },
  {
    emoji: '💼',
    title: 'Your Job',
    body: 'Each turn your salary is collected automatically and your living expenses are deducted. Higher salary = higher expenses. The difference is your starting cushion.',
  },
  {
    emoji: '🎰',
    title: 'The Reel',
    body: 'Pull the lever each turn. You might get an Event (good or bad things happening in life), a Chance (opportunities), a Mini-game, or a Big Event (major life moments).',
  },
  {
    emoji: '🏠',
    title: 'Assets',
    body: 'After the reel, take one action: buy an asset. Assets earn passive income every turn. Tier 1 is cheap to start. Tier 2 is where real money flows. Tier 3 is the Hotel — massive income but needs 3 Investment Properties first.',
  },
  {
    emoji: '🎓',
    title: 'Degree',
    body: 'Pay $900 to enrol. After 2 turns, you graduate. Graduates get much better Chance cards — Promotions, Career Switches, and discounted deals. Risk vs reward!',
  },
  {
    emoji: '🏨',
    title: 'Hotel',
    body: 'Own 3 Investment Properties first, then unlock the Hotel ($4,500 → +$900/turn). The ultimate passive income machine — Engineer players NEED it to escape.',
  },
  {
    emoji: '🏁',
    title: 'Winning',
    body: "When passive income ≥ living expenses: you're FREE! The game ends immediately. Standings show how far each player got.",
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
