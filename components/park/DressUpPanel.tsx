"use client";

import { PARK_ANIMALS, type ParkAnimal } from "@/lib/park/registry/animals";
import { CandySheet } from "./ui/CandySheet";
import { C, alpha } from "./ui/theme";

/** Pick which animal you are in the park — swaps the 3D character live. */
export function DressUpPanel({ currentId, onPick, onClose }: { currentId: string; onPick: (a: ParkAnimal) => void; onClose: () => void }) {
  return (
    <CandySheet title="🪞 Who do you want to be?" subtitle="Your hero changes straight away" color={C.cyan} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 10 }}>
        {PARK_ANIMALS.map((a) => {
          const on = a.id === currentId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a)}
              aria-pressed={on}
              className="gp-press"
              style={{
                border: on ? `2px solid ${C.gold}` : "1.5px solid rgba(160,190,255,0.22)",
                background: on ? `radial-gradient(circle at 50% 30%, ${alpha(C.gold, 0.35)}, rgba(40,30,20,0.85) 75%)` : "radial-gradient(circle at 50% 30%, rgba(90,86,170,0.5), rgba(24,22,60,0.85) 75%)",
                borderRadius: 16,
                padding: "12px 4px",
                minHeight: 92,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                boxShadow: on ? `0 0 16px ${alpha(C.gold, 0.55)}` : "0 4px 12px rgba(0,0,0,0.3)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              <span style={{ fontSize: 38, lineHeight: 1, filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.4))" }}>{a.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: on ? C.goldHi : C.text }}>{a.name}</span>
            </button>
          );
        })}
      </div>
    </CandySheet>
  );
}
