// components/onboarding/WelcomeScreen.tsx
"use client";

interface WelcomeScreenProps {
  variant: "parent" | "kid";
  familyName?: string;
  kidName?: string;
  kidAvatar?: string;
  onContinue: () => void;
  onSkip?: () => void;
}

export function WelcomeScreen({
  variant,
  familyName,
  kidName,
  kidAvatar,
  onContinue,
  onSkip,
}: WelcomeScreenProps) {
  if (variant === "parent") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gradient-to-br from-indigo-500 to-purple-600">
        <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
          <div className="text-4xl mb-2">🏠</div>
          <h2 className="text-lg font-extrabold text-slate-800 mb-1">
            Welcome to Cucaino,<br />{familyName} family! 👋
          </h2>
          <p className="text-xs text-slate-500 mb-5">
            Here's how families get the most out of it:
          </p>

          <div className="flex flex-col gap-3 text-left mb-6">
            {[
              { emoji: "✅", title: "Set tasks once, repeat daily", sub: "No more reminding — kids check their own list" },
              { emoji: "⭐", title: "Stars make chores exciting", sub: "Kids earn stars for every task — they actually want to help" },
              { emoji: "🎁", title: "Rewards they'll work toward", sub: "You decide what's worth earning — screen time, treats, outings" },
              { emoji: "📊", title: "See everything at a glance", sub: "Daily progress, streaks, and family goals — all in one place" },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 items-start">
                <span className="text-xl">{item.emoji}</span>
                <div>
                  <p className="text-xs font-bold text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-indigo-50 rounded-xl p-3 mb-4 text-left">
            <p className="text-xs font-bold text-indigo-700 mb-1">📲 Best on your home screen</p>
            <p className="text-xs text-indigo-500 leading-relaxed">
              <strong>iPhone:</strong> tap Share <span className="select-none">⬆️</span> → "Add to Home Screen"<br />
              <strong>Android:</strong> tap Menu → "Add to Home Screen"
            </p>
          </div>

          <button
            onClick={onContinue}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm transition-colors"
          >
            Show me around →
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 py-1"
            >
              Skip intro
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-amber-400">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
        <div className="text-5xl mb-2">{kidAvatar}</div>
        <h2 className="text-lg font-extrabold text-slate-800 mb-1">
          Hey {kidName}! 👋
        </h2>
        <p className="text-xs text-slate-500 mb-4">Ready to earn some stars?</p>

        <div className="flex items-center justify-center gap-3 mb-5">
          {[
            { emoji: "📋", label: "Do tasks" },
            { emoji: "→", label: null },
            { emoji: "⭐", label: "Earn stars" },
            { emoji: "→", label: null },
            { emoji: "🎁", label: "Get rewards" },
          ].map((item, i) =>
            item.label ? (
              <div key={i} className="flex flex-col items-center">
                <span className="text-2xl">{item.emoji}</span>
                <span className="text-xs font-bold text-slate-700 mt-1">{item.label}</span>
              </div>
            ) : (
              <span key={i} className="text-slate-300 text-lg">→</span>
            )
          )}
        </div>

        <div className="bg-amber-50 rounded-xl p-3 text-left mb-5 flex flex-col gap-2">
          {[
            "🏅 Build streaks by doing tasks every day",
            "🏆 Unlock badges as you level up",
            "🎯 Save stars for the rewards you want most",
          ].map((line) => (
            <p key={line} className="text-xs text-slate-600">{line}</p>
          ))}
        </div>

        <div className="bg-amber-50 rounded-xl p-3 mb-4 text-left">
          <p className="text-xs font-bold text-amber-700 mb-1">📲 Add Cucaino to your home screen!</p>
          <p className="text-xs text-amber-600 leading-relaxed">
            <strong>iPhone:</strong> tap Share → "Add to Home Screen"<br />
            <strong>Android:</strong> tap Menu → "Add to Home Screen"
          </p>
        </div>

        <button
          onClick={onContinue}
          className="w-full bg-amber-400 hover:bg-amber-500 text-white font-extrabold py-3 rounded-xl text-sm transition-colors shadow-md"
        >
          Show me around! →
        </button>
        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 py-1"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
