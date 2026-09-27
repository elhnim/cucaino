"use client";

import { useEffect, useState } from "react";
import { WorldPanelShell } from "./WorldPanelShell";
import { getQuizHubData, type QuizHubData } from "@/lib/actions/world-panels";
import { getQuizTheme } from "@/lib/registry/quiz-theme-registry";

export function QuizHubPanel({ onClose, onPick }: { onClose: () => void; onPick: (bankId: string) => void }) {
  const [data, setData] = useState<QuizHubData | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    getQuizHubData().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WorldPanelShell title="🎯 Quiz Corner" onClose={onClose}>
      {data === "loading" ? (
        <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>Loading…</p>
      ) : data.sets.length === 0 && data.banks.length === 0 ? (
        <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>No quizzes yet!</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...data.sets, ...data.banks].map((entry) => {
            const isSet = "themes" in entry;
            const emoji = isSet ? entry.emoji || getQuizTheme(entry.themes[0] ?? "custom").emoji : getQuizTheme(entry.category).emoji;
            return (
              <button
                key={entry.id}
                onClick={() => onPick(entry.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  background: "#fff",
                  border: "2px solid #f0d9b0",
                  borderRadius: 16,
                  padding: "10px 14px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 28 }}>{emoji}</span>
                <span style={{ fontWeight: 700, color: "#5a3a18" }}>{entry.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </WorldPanelShell>
  );
}
