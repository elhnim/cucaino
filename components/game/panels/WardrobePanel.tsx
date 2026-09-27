"use client";

import { WorldPanelShell } from "./WorldPanelShell";
import { ANIMALS, type AnimalDef } from "@/lib/game3d/registry/animals";

/** Pick which cute animal you play as. Swaps the 3D character live behind the panel. */
export function WardrobePanel({
  currentId,
  accentColor,
  onPick,
  onClose,
}: {
  currentId: string;
  accentColor: string;
  onPick: (animal: AnimalDef) => void;
  onClose: () => void;
}) {
  return (
    <WorldPanelShell title="🐾 Choose your animal" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 10 }}>
        {ANIMALS.map((a) => {
          const on = a.id === currentId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a)}
              style={{
                border: on ? `3px solid ${accentColor}` : "3px solid transparent",
                background: on ? "#fff7e6" : "#ffffff",
                borderRadius: 18,
                padding: "10px 4px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                cursor: "pointer",
                touchAction: "manipulation",
                transform: on ? "scale(1.05)" : undefined,
                transition: "transform 120ms ease",
              }}
            >
              <span style={{ fontSize: 38, lineHeight: 1 }}>{a.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#5a3a18" }}>{a.name}</span>
            </button>
          );
        })}
      </div>
    </WorldPanelShell>
  );
}
