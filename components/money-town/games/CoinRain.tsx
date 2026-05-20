"use client"

interface Props { onComplete: (cashEarned: number) => void }

export default function CoinRain({ onComplete }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">🪙</div>
      <h2 className="text-2xl font-black text-gray-900 mb-6">Coin Rain</h2>
      <p className="text-gray-500 mb-8">Coming soon!</p>
      <button
        type="button"
        onClick={() => onComplete(0)}
        className="px-10 py-4 bg-yellow-400 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform"
      >
        Skip
      </button>
    </div>
  )
}
