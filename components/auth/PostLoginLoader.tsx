"use client";

// Post-login "Blast-off" loader: entertains kids while genuinely preloading
// the family's screens (RSC prefetch = data + code warm-up).
// Min ~3s of fun so it never flashes; capped at ~7s so it never drags.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { preloadFamily } from "@/lib/actions/preload";

const MESSAGES = [
  "Strapping in… 🚀",
  "Waking up the pets… 🐾",
  "Counting your stars… ⭐",
  "Filling the toy box… 🧸",
  "Polishing the trophies… 🏆",
  "Stacking the gold coins… 🪙",
  "Charging up the fun… ⚡",
  "Drawing today's missions… 🗺️",
  "Almost there… 🌈",
];

const MIN_SHOW_MS = 3_000;
const MAX_SHOW_MS = 7_000;

export default function PostLoginLoader({ next }: { next: string }) {
  const router = useRouter();
  const [msgIdx, setMsgIdx] = useState(0);
  const [pct, setPct] = useState(4);
  const [ready, setReady] = useState(false);
  const launched = useRef(false);

  // rotate messages
  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 900);
    return () => clearInterval(t);
  }, []);

  // progress bar: eases toward 90% while loading, jumps to 100% when ready
  useEffect(() => {
    const t = setInterval(() => setPct((p) => (p < 90 ? p + Math.max(1, (90 - p) / 12) : p)), 120);
    return () => clearInterval(t);
  }, []);

  // the actual preload + navigation
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    const started = Date.now();

    const work = (async () => {
      router.prefetch(next);
      router.prefetch("/select-kid");
      const { kidIds } = await preloadFamily();
      for (const id of kidIds) {
        router.prefetch(`/kid/${id}/home`);
        router.prefetch(`/kid/${id}/todo`);
        router.prefetch(`/kid/${id}/play`);
      }
      // give prefetches a moment to land in the router cache
      await new Promise((r) => setTimeout(r, 800));
    })();

    const minTime = new Promise((r) => setTimeout(r, MIN_SHOW_MS));
    const cap = new Promise((r) => setTimeout(r, MAX_SHOW_MS));

    Promise.race([Promise.allSettled([work, minTime]), cap]).then(() => {
      setPct(100);
      setReady(true);
      setTimeout(() => router.push(next), 650);
    });
  }, [next, router]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(180deg, #4cc9ff 0%, #9f8bff 52%, #ffb46b 100%)" }}
    >
      {/* floating clouds */}
      <div className="absolute top-[12%] left-[-8px] text-5xl opacity-80" style={{ animation: "dl-float 6s ease-in-out infinite" }}>☁️</div>
      <div className="absolute top-[24%] right-[-12px] text-6xl opacity-80" style={{ animation: "dl-float 6s ease-in-out infinite", animationDelay: "2.4s" }}>☁️</div>
      <div className="absolute bottom-[18%] left-[8%] text-4xl opacity-70" style={{ animation: "dl-float 7s ease-in-out infinite", animationDelay: "1.2s" }}>☁️</div>
      {/* twinkles */}
      <div className="absolute top-[18%] left-[22%] text-2xl" style={{ animation: "dl-twinkle 1.8s ease-in-out infinite" }}>✨</div>
      <div className="absolute top-[35%] right-[18%] text-xl" style={{ animation: "dl-twinkle 1.8s ease-in-out infinite", animationDelay: ".6s" }}>✨</div>
      <div className="absolute bottom-[30%] right-[28%] text-2xl" style={{ animation: "dl-twinkle 1.8s ease-in-out infinite", animationDelay: "1.1s" }}>⭐</div>

      {/* the star of the show */}
      <div className="text-[88px] leading-none" style={{ animation: ready ? "dl-blastoff .7s ease-in forwards" : "dl-hover 1.4s ease-in-out infinite" }}>
        🚀
      </div>

      <div className="mt-4 font-black text-2xl text-white text-center px-6" style={{ textShadow: "0 2px 0 rgba(46,16,101,.35)" }}>
        {ready ? "READY! 🎉" : "Getting everything ready…"}
      </div>
      <div className="mt-1 h-6 font-bold text-sm text-violet-100 text-center" style={{ textShadow: "0 1px 1px rgba(46,16,101,.5)" }}>
        {ready ? "Here we go!" : MESSAGES[msgIdx]}
      </div>

      {/* progress bar */}
      <div className="mt-5 w-64 max-w-[70vw] h-5 bg-white/30 border-[3px] border-white rounded-full overflow-hidden" style={{ boxShadow: "0 4px 0 rgba(46,16,101,.18)" }}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-yellow-300 via-green-400 to-green-500 transition-all duration-300"
          style={{ width: `${Math.round(pct)}%` }}
        />
      </div>

      {/* confetti burst on ready */}
      {ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {["🎉", "⭐", "🎈", "✨", "🎊", "🌟", "🎉", "⭐"].map((e, i) => (
            <span
              key={i}
              className="absolute text-3xl"
              style={{
                animation: `dl-burst .9s ease-out forwards`,
                animationDelay: `${i * 0.05}s`,
                ["--dl-x" as string]: `${Math.cos((i / 8) * Math.PI * 2) * 130}px`,
                ["--dl-y" as string]: `${Math.sin((i / 8) * Math.PI * 2) * 130}px`,
              }}
            >
              {e}
            </span>
          ))}
        </div>
      )}

      <style jsx global>{`
        @keyframes dl-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes dl-hover { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-14px) rotate(3deg); } }
        @keyframes dl-twinkle { 0%, 100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.15); } }
        @keyframes dl-blastoff { to { transform: translateY(-120vh) scale(0.6); } }
        @keyframes dl-burst { from { transform: translate(0, 0) scale(0.4); opacity: 1; } to { transform: translate(var(--dl-x), var(--dl-y)) scale(1.2); opacity: 0; } }
      `}</style>
    </div>
  );
}
