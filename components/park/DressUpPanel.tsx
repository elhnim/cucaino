"use client";

import { WorldPanelShell } from "@/components/game/panels/WorldPanelShell";
import { PARK_ANIMALS, type ParkAnimal } from "@/lib/park/registry/animals";

/** Pick which animal you are in the park — swaps the 3D character live. */
export function DressUpPanel({ currentId, onPick, onClose }: { currentId: string; onPick: (a: ParkAnimal) => void; onClose: () => void }) {
  return (
    <WorldPanelShell title="🪞 Who do you want to be?" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 10 }}>
        {PARK_ANIMALS.map((a) => {
          const on = a.id === currentId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a)}
              style={{
                border: on ? "3px solid #ff5fa8" : "3px solid transparent",
                background: on ? "#fff0f7" : "#fff",
                borderRadius: 20,
                padding: "10px 4px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                boxShadow: "0 3px 0 #ffd1e6, 0 6px 12px rgba(0,0,0,0.06)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              <span style={{ fontSize: 38, lineHeight: 1 }}>{a.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#7a2e62" }}>{a.name}</span>
            </button>
          );
        })}
      </div>
    </WorldPanelShell>
  );
}
