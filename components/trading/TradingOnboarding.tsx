"use client";

import { useState } from "react";

interface Props {
  onDone: () => void;
}

type Phase = "welcome" | "tour" | "done";

const COMPANIES = [
  { emoji: "🍿", name: "Chomp Snacks", price: 45 },
  { emoji: "🎮", name: "Zapp Gaming", price: 85 },
  { emoji: "🛴", name: "Zoom Wheels", price: 30 },
  { emoji: "🎬", name: "Flick Studios", price: 120 },
  { emoji: "🐾", name: "Pawz Pet Co.", price: 25 },
  { emoji: "⚽", name: "Blast Sports", price: 55 },
  { emoji: "🍔", name: "Yumm Burgers", price: 40 },
  { emoji: "💡", name: "Spark Gadgets", price: 95 },
  { emoji: "🌊", name: "Splash Parks", price: 70 },
  { emoji: "🍭", name: "Sweet Street", price: 20 },
];

interface SlideConfig {
  heroGradient: string;
  emoji: string;
  headline: string;
  tagline: string;
  body: React.ReactNode;
}

function FactCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">{icon}</span>
        <div>
          <p className="font-black text-gray-900 text-sm">{title}</p>
          <p className="text-gray-600 text-xs mt-1 leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function Slide0Body() {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
        <p className="text-center text-xs font-black text-green-700 uppercase tracking-wide mb-3">Exchange Rate</p>
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <p className="text-4xl font-black text-gray-900">⭐ 1</p>
            <p className="text-xs text-gray-500 mt-1">Star</p>
          </div>
          <div className="text-3xl text-gray-400">→</div>
          <div className="text-center">
            <p className="text-4xl font-black text-green-700">🪙 1,000</p>
            <p className="text-xs text-gray-500 mt-1">Nuggets</p>
          </div>
        </div>
      </div>
      <FactCard
        icon="💰"
        title="Earn stars from tasks first"
        desc="Complete your chores and activities to earn ⭐ stars, then deposit them here as Nuggets."
      />
      <FactCard
        icon="📤"
        title="Withdraw profits back to stars"
        desc="When your Nuggets grow, cash out at 🪙 1,000 = ⭐ 1 star. Use stars to buy real rewards!"
      />
    </div>
  );
}

function Slide1Body() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {COMPANIES.map((c) => (
          <div key={c.name} className="bg-white rounded-xl p-2 text-center shadow-sm border border-gray-100">
            <p className="text-2xl">{c.emoji}</p>
            <p className="text-xs font-black text-gray-800 mt-1 leading-tight">{c.name}</p>
            <p className="text-xs text-green-700 font-bold">🪙{c.price}</p>
          </div>
        ))}
      </div>
      <FactCard
        icon="💡"
        title="You can buy fractions!"
        desc="Can't afford a full share? Buy 0.5 or 0.1 of one. Every Nugget counts."
      />
    </div>
  );
}

function Slide2Body() {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <div className="flex items-center justify-between gap-1">
          {[
            { icon: "📰", label: "Read today's news" },
            { icon: "🧠", label: "Predict what happens" },
            { icon: "🛒", label: "Buy or sell shares" },
            { icon: "🌅", label: "Check back tomorrow!" },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-1">
              <div className="flex flex-col items-center text-center">
                <span className="text-xl">{step.icon}</span>
                <span className="text-xs text-gray-700 font-semibold leading-tight mt-1" style={{ maxWidth: "56px" }}>
                  {step.label}
                </span>
              </div>
              {i < arr.length - 1 && <span className="text-gray-400 text-sm flex-shrink-0">→</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
        <p className="text-xs font-black text-orange-600 uppercase tracking-wide mb-2">
          📰 Today&apos;s News — what do YOU think will happen?
        </p>
        <div className="flex items-start gap-2 py-2">
          <span className="text-lg">🍿</span>
          <div className="flex-1">
            <p className="text-xs font-black text-gray-900">Chomp Snacks</p>
            <p className="text-xs text-gray-600 leading-relaxed">Kids spotted sneaking Chomp into classrooms nationwide 👀</p>
          </div>
          <span className="text-lg">🤔</span>
        </div>
        <div className="border-t border-gray-100" />
        <div className="flex items-start gap-2 pt-2">
          <span className="text-lg">🎮</span>
          <div className="flex-1">
            <p className="text-xs font-black text-gray-900">Zapp Gaming</p>
            <p className="text-xs text-gray-600 leading-relaxed">Zapp CEO says new console needs &apos;just a little more time&apos; ⏳</p>
          </div>
          <span className="text-lg">🤔</span>
        </div>
      </div>
    </div>
  );
}

function Slide3Body() {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">🍿</span>
          <div>
            <p className="font-black text-gray-900 text-sm">Chomp Snacks pays dividends</p>
            <p className="text-gray-600 text-xs mt-1 leading-relaxed">
              Hold shares for 7 days → earn 2% of your holding value as bonus Nuggets automatically!
            </p>
          </div>
        </div>
      </div>
      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">🐾</span>
          <div>
            <p className="font-black text-gray-900 text-sm">Pawz, Flick, Yumm &amp; Sweet Street too</p>
            <p className="text-gray-600 text-xs mt-1 leading-relaxed">
              Look for the 💰 Pays dividend badge in the Market tab.
            </p>
          </div>
        </div>
      </div>
      <FactCard
        icon="⏰"
        title="Patience pays off"
        desc="The longer you hold dividend stocks, the more free Nuggets you collect. It adds up!"
      />
    </div>
  );
}

function Slide4Body() {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
        <p className="text-center text-xs font-black text-blue-700 uppercase tracking-wide mb-3">Example Withdrawal</p>
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <p className="text-3xl font-black text-gray-900">🪙 5,500</p>
            <p className="text-xs text-gray-500 mt-1">Nuggets</p>
          </div>
          <div className="text-3xl text-gray-400">→</div>
          <div className="text-center">
            <p className="text-3xl font-black text-blue-700">⭐ 5</p>
            <p className="text-xs text-gray-500 mt-1">Stars</p>
          </div>
        </div>
        <p className="text-center text-xs text-gray-500 mt-3">leftover 🪙 500 stays in your account</p>
      </div>
      <FactCard
        icon="🎁"
        title="Spend stars on real rewards"
        desc="Every star you withdraw can be spent in the Store on stickers, screen time, or whatever rewards your parents set up."
      />
      <FactCard
        icon="📈"
        title="Only withdraw when you profit"
        desc="If you deposited 2 stars and now have 2,500 Nuggets, withdraw = 2 stars back. No gain yet. Keep growing!"
      />
    </div>
  );
}

function Slide5Body() {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
        <p className="font-black text-orange-700 text-sm mb-2">⚠️ Important!</p>
        <p className="text-gray-700 text-xs leading-relaxed">
          Prices can go DOWN. You could lose some or all of your Nuggets. If you run out, earn more stars from tasks and deposit again.
        </p>
      </div>
      <FactCard
        icon="🧠"
        title="Think before you buy"
        desc="Read the news carefully. Don't put all your Nuggets in one company. Spread the risk!"
      />
      <FactCard
        icon="🎓"
        title="Losing is learning"
        desc="Even professional investors lose sometimes. The important thing is to learn from it and try again!"
      />
    </div>
  );
}

const SLIDES: SlideConfig[] = [
  {
    heroGradient: "from-[#065f46] to-[#10b981]",
    emoji: "🪙",
    headline: "Meet the Nugget!",
    tagline: "Your in-game currency for trading",
    body: <Slide0Body />,
  },
  {
    heroGradient: "from-[#1e1b4b] to-[#4338ca]",
    emoji: "🏪",
    headline: "10 Companies to Invest In",
    tagline: "Buy shares and own a piece of each one",
    body: <Slide1Body />,
  },
  {
    heroGradient: "from-[#b45309] to-[#f59e0b]",
    emoji: "🔮",
    headline: "Read the News. Predict Tomorrow!",
    tagline: "Today's news moves tomorrow's prices — not today's!",
    body: <Slide2Body />,
  },
  {
    heroGradient: "from-[#7c3aed] to-[#c026d3]",
    emoji: "💰",
    headline: "Some Companies Pay You Just for Holding!",
    tagline: "That's called a dividend — free Nuggets every week!",
    body: <Slide3Body />,
  },
  {
    heroGradient: "from-[#0369a1] to-[#0ea5e9]",
    emoji: "🏧",
    headline: "Turn Profits Back Into Stars",
    tagline: "Withdraw when you're winning and spend on real rewards!",
    body: <Slide4Body />,
  },
  {
    heroGradient: "from-[#991b1b] to-[#f97316]",
    emoji: "⚠️",
    headline: "You Can Lose Nuggets Too!",
    tagline: "This is real investing practice — losses are part of learning",
    body: <Slide5Body />,
  },
];

function WelcomeScreen({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#064e3b] to-[#10b981] overflow-y-auto">
      {/* Hero section */}
      <div className="flex flex-col items-center justify-center pt-12 pb-6 px-6">
        <div className="text-8xl mb-2">📈</div>
        <div className="text-5xl mb-6">🪙</div>
        <h1 className="text-3xl font-black text-white text-center mb-3">
          Welcome to Nugget Market! 🪙
        </h1>
        <p className="text-white/75 text-sm font-bold text-center px-8 leading-relaxed">
          Turn your task stars into Nuggets and invest in kid-friendly companies. Watch your money grow! 🚀
        </p>
      </div>

      {/* Mini cards */}
      <div className="flex gap-2 px-4 pb-6">
        {[
          { emoji: "⭐", title: "Deposit Stars", desc: "Convert task stars into Nuggets to invest" },
          { emoji: "📊", title: "Buy Shares", desc: "Pick companies and watch Nuggets grow" },
          { emoji: "💸", title: "Withdraw", desc: "Cash out your profits back to stars!" },
        ].map((card) => (
          <div
            key={card.title}
            className="bg-white/10 border border-white/20 rounded-2xl p-3 text-center flex-1"
          >
            <p className="text-2xl mb-1">{card.emoji}</p>
            <p className="text-white font-black text-xs mb-1">{card.title}</p>
            <p className="text-white/70 text-xs leading-tight">{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 px-4 pb-8">
        <button
          onClick={onStart}
          className="w-full bg-white text-green-800 rounded-2xl py-4 font-black text-lg shadow-lg"
        >
          🎓 Show me how it works!
        </button>
        <button
          onClick={onSkip}
          className="w-full text-white/60 text-sm py-2"
        >
          Skip tour — I know what to do
        </button>
      </div>
    </div>
  );
}

function TourScreen({ onDone }: { onDone: () => void }) {
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = SLIDES[slideIndex];
  const isLast = slideIndex === SLIDES.length - 1;

  function handleNext() {
    if (isLast) {
      onDone();
    } else {
      setSlideIndex((i) => i + 1);
    }
  }

  function handleBack() {
    setSlideIndex((i) => Math.max(0, i - 1));
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Hero area */}
      <div className={`bg-gradient-to-b ${slide.heroGradient} px-6 py-8 flex flex-col items-center`} style={{ minHeight: "200px" }}>
        <p className="text-white/60 text-xs font-black uppercase tracking-widest mb-3">
          Step {slideIndex + 1} of {SLIDES.length}
        </p>
        <p className="text-6xl mb-3">{slide.emoji}</p>
        <h2 className="text-xl font-black text-white text-center mb-1">{slide.headline}</h2>
        <p className="text-white/75 text-xs text-center leading-relaxed">{slide.tagline}</p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {slide.body}
      </div>

      {/* Fixed footer */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`transition-all rounded-full ${
                i === slideIndex
                  ? "w-6 h-2.5 bg-green-600"
                  : "w-2.5 h-2.5 bg-gray-300"
              }`}
            />
          ))}
        </div>
        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleBack}
            disabled={slideIndex === 0}
            className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-2xl font-black text-gray-600 disabled:opacity-30 flex-shrink-0"
          >
            ←
          </button>
          <button
            onClick={handleNext}
            className="flex-1 bg-green-600 text-white rounded-2xl py-3 font-black text-sm shadow-md"
          >
            {isLast ? "Let's go! 🚀" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DoneScreen({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#064e3b] to-[#10b981] items-center justify-center px-6 py-12">
      <p className="text-7xl mb-4">🎉</p>
      <h2 className="text-2xl font-black text-white text-center mb-3">You&apos;re ready to trade!</h2>
      <p className="text-white/75 text-sm text-center leading-relaxed mb-6 px-4">
        Remember: read the news, make your prediction, and come back tomorrow to see if you were right! 🔮
      </p>
      <div className="bg-white/10 rounded-2xl p-4 w-full mb-6">
        {[
          "Deposit stars to get Nuggets",
          "Buy shares in companies you believe in",
          "Read today's news to predict tomorrow",
          "Withdraw profits back to stars",
        ].map((item) => (
          <div key={item} className="flex items-center gap-3 py-1.5">
            <span className="text-lg">✅</span>
            <p className="text-white font-semibold text-sm">{item}</p>
          </div>
        ))}
      </div>
      <button
        onClick={onDone}
        className="w-full bg-white text-green-800 rounded-2xl py-4 font-black text-lg shadow-lg"
      >
        🚀 Start Trading!
      </button>
    </div>
  );
}

export default function TradingOnboarding({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("welcome");

  if (phase === "welcome") {
    return (
      <div className="h-full">
        <WelcomeScreen onStart={() => setPhase("tour")} onSkip={onDone} />
      </div>
    );
  }

  if (phase === "tour") {
    return (
      <div className="h-full flex flex-col">
        <TourScreen onDone={() => setPhase("done")} />
      </div>
    );
  }

  return (
    <div className="h-full">
      <DoneScreen onDone={onDone} />
    </div>
  );
}
