"use client";

// Once a kid picks a place: big buttons for every sensible way to get there, with times
// (lib/park/map/planner.ts). Tapping one starts a guided trip — this bar then shows the current
// step and how far's left, ticking forward as lib/park/map/tripMachine.ts advances it.
import type { MapEntity } from "@/lib/park/map/entities";
import { formatEta, type TripOption } from "@/lib/park/map/planner";
import type { TripStatus } from "@/lib/park/map/tripMachine";

export function TripBar({
  target,
  options,
  status,
  onStart,
  onCancel,
  onClose,
}: {
  target: MapEntity;
  options: TripOption[];
  /** non-null once a trip is under way */
  status: TripStatus | null;
  onStart: (opt: TripOption) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  if (status) {
    const leg = status.leg;
    return (
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>{target.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 13, color: "rgba(226,230,255,0.8)" }}>Going to {target.name}</div>
            <div style={{ fontWeight: 900, fontSize: 16, color: "#5ef2ff" }}>{status.done ? "🎉 You made it!" : leg?.instruction ?? "…"}</div>
            {!status.done && status.remaining !== null && <div style={{ fontSize: 12, opacity: 0.8 }}>{Math.max(0, Math.round(status.remaining))} m to go</div>}
          </div>
          <button type="button" style={stopBtn} onClick={status.done ? onClose : onCancel}>
            {status.done ? "✓" : "✕"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "#f5f3ff" }}>
          {target.emoji} Go to {target.name}?
        </div>
        <button type="button" style={stopBtn} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        {options.map((o) => (
          <button key={o.mode} type="button" style={modeBtn} onClick={() => onStart(o)}>
            <span style={{ fontSize: 22 }}>{o.emoji}</span>
            <span style={{ fontWeight: 900, fontSize: 13 }}>{o.label}</span>
            <span style={{ fontSize: 11.5, opacity: 0.8 }}>{formatEta(o.etaMin)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  left: "max(14px, env(safe-area-inset-left))",
  right: "max(14px, env(safe-area-inset-right))",
  bottom: "calc(max(14px, env(safe-area-inset-bottom)) + 8px)",
  zIndex: 52,
  borderRadius: 18,
  padding: 12,
  border: "1.5px solid transparent",
  background: "linear-gradient(rgba(18,16,44,0.92), rgba(18,16,44,0.92)) padding-box, linear-gradient(135deg, rgba(94,242,255,0.9), rgba(232,154,28,0.5)) border-box",
  boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
  color: "#f5f3ff",
};
const modeBtn: React.CSSProperties = {
  minWidth: 84,
  minHeight: 64,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  borderRadius: 14,
  border: "1.5px solid rgba(160,200,255,0.35)",
  background: "rgba(255,255,255,0.06)",
  color: "#f5f3ff",
  cursor: "pointer",
  flexShrink: 0,
};
const stopBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  flexShrink: 0,
  borderRadius: 999,
  border: "1.5px solid rgba(160,200,255,0.4)",
  background: "rgba(90,86,160,0.5)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
