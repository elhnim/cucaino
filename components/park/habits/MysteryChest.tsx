"use client";

// The daily mystery chest: it appears once every one of today's quests is done. Tap to shake
// it open; the server picks the surprise (tickets, a pet treat feast or a rare sticker).
import { useState } from "react";
import { openMysteryChest, type ChestPrize } from "@/lib/actions/park-habits";
import { playSfx } from "@/lib/audio/sound-manager";

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

  return (
    <div style={wrap} onClick={phase === "open" ? onClose : undefined}>
      <style>{css}</style>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "#5a2350" }}>{phase === "open" ? "You got…" : "All quests done! 🎉"}</div>
        <button type="button" onClick={() => void open()} className={phase === "shaking" ? "chest-shake" : phase === "closed" ? "chest-bob" : "chest-pop"} style={chestBtn} aria-label="Open the mystery chest">
          {phase === "open" ? icon : "🎁"}
        </button>
        {phase === "open" && prize ? (
          <>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#c2185b" }}>{prize.text}</div>
            <button type="button" style={okBtn} onClick={onClose}>
              Yay! 🎊
            </button>
          </>
        ) : (
          <div style={{ fontWeight: 800, fontSize: 14, color: "#9b7090" }}>{phase === "shaking" ? "Opening…" : "Tap the chest to open today's surprise!"}</div>
        )}
        {error && <div style={{ fontWeight: 900, color: "#e11d48" }}>{error}</div>}
        <div style={{ fontWeight: 800, fontSize: 12, color: "#b08aa5" }}>A new chest appears every day you finish all your quests.</div>
      </div>
    </div>
  );
}

const css =
  "@keyframes chest-bob { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-10px) rotate(3deg); } }" +
  "@keyframes chest-shake { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-14deg) scale(1.05); } 40% { transform: rotate(14deg) scale(1.1); } 60% { transform: rotate(-10deg) scale(1.15); } 80% { transform: rotate(10deg) scale(1.2); } }" +
  "@keyframes chest-pop { 0% { transform: scale(0.3); } 60% { transform: scale(1.3); } 100% { transform: scale(1); } }" +
  ".chest-bob { animation: chest-bob 1.6s ease-in-out infinite; } .chest-shake { animation: chest-shake 0.45s ease-in-out infinite; } .chest-pop { animation: chest-pop 0.5s ease-out; }";

const wrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 85, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(90,35,80,0.35)" };
const card: React.CSSProperties = {
  width: "min(420px, 100%)",
  borderRadius: 32,
  padding: 22,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  textAlign: "center",
  background: "radial-gradient(circle at 50% 30%, #fff9d6, #ffeaf5 70%)",
  boxShadow: "0 8px 0 #f3b6d6, 0 20px 40px rgba(122,46,98,0.25)",
};
const chestBtn: React.CSSProperties = { border: "none", background: "none", fontSize: 110, lineHeight: 1.1, cursor: "pointer", filter: "drop-shadow(0 10px 12px rgba(122,46,98,0.3))" };
const okBtn: React.CSSProperties = { border: "none", borderRadius: 999, padding: "12px 22px", fontWeight: 900, fontSize: 16, color: "#fff", background: "linear-gradient(#ff7fbd,#ff4f9e)", boxShadow: "0 4px 0 #d23a82", cursor: "pointer" };
