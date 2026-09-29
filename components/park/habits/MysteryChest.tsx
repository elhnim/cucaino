"use client";

// The daily mystery chest: it appears once every one of today's quests is done. Tap to shake
// it open; the server picks the surprise (tickets, a pet treat feast or a rare sticker), revealed
// with a rarity-coloured burst of light.
import { useState } from "react";
import { openMysteryChest, type ChestPrize } from "@/lib/actions/park-habits";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, RARITY, alpha, display, glass, type Rarity } from "../ui/theme";
import { GameButton } from "../ui/GameButton";

export function MysteryChest({ kidId, onClose, onPrize }: { kidId: string; onClose: () => void; onPrize: (prize: ChestPrize, tickets: number) => void }) {
  const [phase, setPhase] = useState<"closed" | "shaking" | "open">("closed");
  const [prize, setPrize] = useState<ChestPrize | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (phase !== "closed") return;
    setPhase("shaking");
    playSfx("tap");
    const [res] = await Promise.all([openMysteryChest(kidId), new Promise((r) => setTimeout(r, 1300))]);
    if (!res.ok) {
      setError(res.error);
      setPhase("closed");
      return;
    }
    setPrize(res.prize);
    setPhase("open");
    playSfx("win");
    onPrize(res.prize, res.tickets);
  };

  const icon = prize?.kind === "tickets" ? "🎟️" : prize?.kind === "pet" ? "🍪" : prize?.kind === "sticker" ? prize.sticker : "🎁";
  const rarity: Rarity = !prize ? "legendary" : prize.kind === "sticker" ? "legendary" : prize.kind === "pet" ? "epic" : prize.amount >= 5 ? "epic" : "rare";
  const glow = RARITY[rarity].color;

  return (
    <div style={wrap} onClick={phase === "open" ? onClose : undefined}>
      <style>{PARK_CSS + css}</style>
      <div style={{ ...glass({ edge: phase === "open" ? glow : "gold", fill: "rgba(20,16,46,0.9)", blur: 12 }), ...card }} className="gp-popin" onClick={(e) => e.stopPropagation()}>
        <div style={{ ...display(phase === "open" ? 16 : 24, phase === "open" ? glow : C.text), textTransform: phase === "open" ? "uppercase" : undefined, letterSpacing: phase === "open" ? 2 : 0.4 }}>
          {phase === "open" ? `${RARITY[rarity].label} reward!` : "All quests complete!"}
        </div>
        <div style={stage}>
          {/* light rays + burst behind the chest */}
          <div aria-hidden className={phase === "open" ? "chest-rays chest-rays-on" : "chest-rays"} style={{ ...rays, background: `repeating-conic-gradient(from 0deg, ${alpha(glow, phase === "open" ? 0.5 : 0.22)} 0deg 10deg, transparent 10deg 30deg)` }} />
          <div aria-hidden style={{ ...halo, background: `radial-gradient(circle, ${alpha(glow, phase === "open" ? 0.75 : 0.35)}, transparent 65%)` }} />
          {phase === "open" &&
            Array.from({ length: 12 }, (_, k) => (
              <span key={k} aria-hidden className="chest-spark" style={{ ...spark, background: k % 3 ? glow : "#fff", ["--a" as string]: `${k * 30}deg`, animationDelay: `${(k % 4) * 40}ms` } as React.CSSProperties} />
            ))}
          <button type="button" onClick={() => void open()} className={phase === "shaking" ? "chest-shake" : phase === "closed" ? "chest-bob" : "chest-pop"} style={chestBtn} aria-label="Open the mystery chest">
            {phase === "open" ? icon : "🎁"}
          </button>
        </div>
        {phase === "open" && prize ? (
          <>
            <div style={{ ...display(24), textShadow: `0 0 16px ${alpha(glow, 0.7)}` }}>{prize.text}</div>
            <GameButton big onClick={onClose}>
              Collect! ✨
            </GameButton>
          </>
        ) : (
          <div style={{ fontWeight: 800, fontSize: 14.5, color: C.dim }}>{phase === "shaking" ? "Opening…" : "Tap the chest to open today's surprise!"}</div>
        )}
        {error && <div style={{ fontWeight: 900, color: C.danger }}>{error}</div>}
        <div style={{ fontWeight: 700, fontSize: 12, color: C.mute }}>A new chest appears every day you finish all your quests.</div>
      </div>
    </div>
  );
}

const css =
  "@keyframes chest-bob { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-10px) rotate(3deg); } }" +
  "@keyframes chest-shake { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-12deg) scale(1.05); } 40% { transform: rotate(12deg) scale(1.1); } 60% { transform: rotate(-8deg) scale(1.15); } 80% { transform: rotate(8deg) scale(1.2); } }" +
  "@keyframes chest-pop { 0% { transform: scale(0.3); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }" +
  "@keyframes chest-rays { to { transform: rotate(360deg); } }" +
  "@keyframes chest-spark { 0% { opacity: 1; transform: rotate(var(--a)) translateY(-20px) scale(1.2); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(-130px) scale(0.6); } }" +
  ".chest-bob { animation: chest-bob 1.6s ease-in-out infinite; } .chest-shake { animation: chest-shake 0.45s ease-in-out infinite; } .chest-pop { animation: chest-pop 0.5s ease-out; }" +
  ".chest-rays { animation: chest-rays 18s linear infinite; } .chest-rays-on { animation-duration: 8s; }" +
  ".chest-spark { animation: chest-spark 900ms ease-out forwards; }" +
  "@media (prefers-reduced-motion: reduce) { .chest-bob, .chest-shake, .chest-rays, .chest-spark { animation: none !important; } }";

const wrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 85, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: C.scrim, fontFamily: FONT.body };
const card: React.CSSProperties = {
  width: "min(420px, 100%)",
  borderRadius: 24,
  padding: 22,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  textAlign: "center",
  overflow: "hidden",
  position: "relative",
};
const stage: React.CSSProperties = { position: "relative", width: 220, height: 180, display: "flex", alignItems: "center", justifyContent: "center" };
const rays: React.CSSProperties = {
  position: "absolute",
  width: 320,
  height: 320,
  left: "50%",
  top: "50%",
  marginLeft: -160,
  marginTop: -160,
  borderRadius: "50%",
  WebkitMask: "radial-gradient(circle, #000 20%, transparent 68%)",
  mask: "radial-gradient(circle, #000 20%, transparent 68%)",
  pointerEvents: "none",
};
const halo: React.CSSProperties = { position: "absolute", inset: 10, borderRadius: "50%", pointerEvents: "none" };
const spark: React.CSSProperties = { position: "absolute", left: "50%", top: "50%", width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: 2, transformOrigin: "center", pointerEvents: "none" };
const chestBtn: React.CSSProperties = { position: "relative", border: "none", background: "none", fontSize: 104, lineHeight: 1.1, cursor: "pointer", filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.5))", minWidth: 120, minHeight: 120 };
