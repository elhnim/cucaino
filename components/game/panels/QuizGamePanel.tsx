"use client";

import { useEffect, useState } from "react";
import { getQuizGameData, type QuizGameData } from "@/lib/actions/world-panels";
import QuizGame from "@/components/play/QuizGame";

/**
 * Renders the existing full-screen QuizGame on top of the (paused) 3D canvas. Its back
 * button returns to the Quiz Corner inside Play Hall — the kid never leaves the world.
 */
export function QuizGamePanel({ kidId, bankId, onExit }: { kidId: string; bankId: string; onExit: () => void }) {
  const [data, setData] = useState<QuizGameData | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    getQuizGameData(kidId, bankId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [kidId, bankId]);

  if (data === "loading") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#a06a3c", fontWeight: 700 }}>Loading quiz…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "#fff", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#a06a3c", fontWeight: 700 }}>This quiz has no questions yet.</p>
        <button type="button" onClick={onExit} style={{ border: "none", borderRadius: 999, padding: "10px 18px", fontWeight: 700, background: "#fbbf24", color: "#5a3a18" }}>
          ← Back to Quiz Corner
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "#fff", overflowY: "auto" }}>
      <QuizGame
        bankName={data.bankName}
        questions={data.questions}
        players={data.players}
        backHref={`/kid/${kidId}/play/quiz`}
        soloPlayerId={kidId}
        onExit={onExit}
      />
    </div>
  );
}
