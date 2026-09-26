"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bridge } from "@/lib/game3d/bridge/dataBridge";
import { moodFor, petEmoji } from "@/lib/pet/logic";
import type { Pet } from "@/lib/pet/logic";

interface PetPanelProps {
  kidId: string;
  pet: Pet | null;
  onPetChange: (pet: Pet) => void;
  onPointsChange: (points: number) => void;
  onClose: () => void;
  onReaction: () => void;
}

const ACTIONS = [
  { id: "feed", label: "Feed", emoji: "🍎", happy: "Yum! 🍎" },
  { id: "play", label: "Play", emoji: "🎾", happy: "Wheee! 🎾" },
  { id: "cuddle", label: "Cuddle", emoji: "🤗", happy: "Aww! 🤗" },
  { id: "wash", label: "Wash", emoji: "🛁", happy: "So fresh! ✨" },
] as const;

export function PetPanel({ kidId, pet, onPetChange, onPointsChange, onClose, onReaction }: PetPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!pet) {
    return (
      <div style={backdropStyle}>
        <div style={cardStyle}>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
          <div style={{ fontSize: 56, textAlign: "center" }}>🥚</div>
          <p style={{ textAlign: "center", fontWeight: 700, color: "#7a4a8c", margin: "8px 0 18px" }}>
            No pet here yet! Adopt one on your Home screen.
          </p>
          <button
            style={{ ...actionBtnStyle, width: "100%", background: "#f2a33c" }}
            onClick={() => router.push(`/kid/${kidId}/home`)}
          >
            🏡 Go to Home
          </button>
        </div>
      </div>
    );
  }

  const mood = moodFor(pet);

  const act = async (action: (typeof ACTIONS)[number]) => {
    if (busy) return;
    setBusy(true);
    setMessage(action.happy);
    try {
      const res =
        action.id === "feed" ? await bridge.feed(kidId, "apple")
        : action.id === "play" ? await bridge.play(kidId, 20)
        : action.id === "cuddle" ? await bridge.cuddle(kidId)
        : await bridge.wash(kidId);
      if (res.ok) {
        if (res.pet) onPetChange(res.pet);
        if (typeof res.pointsBalance === "number") onPointsChange(res.pointsBalance);
        onReaction();
      } else {
        setMessage(res.error ?? "Oops, try again!");
      }
    } catch {
      setMessage("Oops, try again!");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={backdropStyle}>
      <div style={cardStyle}>
        <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
        <div style={{ fontSize: 64, textAlign: "center" }}>{petEmoji(pet)}</div>
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 22, color: "#7a4a8c" }}>{pet.name}</div>
        <p style={{ textAlign: "center", color: "#a06a3c", margin: "4px 0 18px", minHeight: 22 }}>
          {message ?? `${mood.emoji} ${mood.message}`}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {ACTIONS.map((a) => (
            <button key={a.id} disabled={busy} style={actionBtnStyle} onClick={() => act(a)}>
              {a.emoji} {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  background: "rgba(30, 20, 40, 0.28)",
  zIndex: 40,
};

const cardStyle: React.CSSProperties = {
  position: "relative",
  width: "min(420px, 92vw)",
  margin: "0 0 max(24px, env(safe-area-inset-bottom))",
  background: "#fffaf0",
  borderRadius: 28,
  padding: "22px 20px 20px",
  boxShadow: "0 -8px 30px rgba(0,0,0,0.25)",
  border: "3px solid #f0d9b0",
};

const closeBtnStyle: React.CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: "none",
  background: "#f0d9b0",
  color: "#7a4a8c",
  fontWeight: 700,
  cursor: "pointer",
};

const actionBtnStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 16,
  padding: "12px 10px",
  fontSize: 17,
  fontWeight: 700,
  color: "#fff",
  background: "#46c43a",
  cursor: "pointer",
};
