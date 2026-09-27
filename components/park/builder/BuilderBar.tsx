"use client";

// Dream Park build mode HUD: ticket balance, piece shelf (by category, locked ones show what
// unlocks them), and the place / rotate / move / remove controls. The 3D ghost + grid live in
// lib/park/world/dreamPark.ts; rules are shared with the server (lib/park/builder/rules.ts).
import { useState } from "react";
import { PIECES, PIECE_CATEGORIES, getPiece, type PieceCategory } from "@/lib/park/registry/pieces";
import { isUnlocked, refundFor, unlockHint } from "@/lib/park/builder/rules";
import { CandyButton } from "../ui/CandySheet";

export interface BuilderSelection {
  pieceId: string;
  /** when moving an existing piece */
  uid?: string;
  r: number;
  cell: { gx: number; gz: number; ok: boolean } | null;
}

export function BuilderBar({
  tickets,
  level,
  streak,
  selection,
  selectedPlaced,
  busy,
  message,
  onPick,
  onRotate,
  onConfirm,
  onCancel,
  onMove,
  onRemove,
  onDone,
}: {
  tickets: number;
  level: number;
  streak: number;
  selection: BuilderSelection | null;
  /** a placed piece the kid tapped (not yet moving) */
  selectedPlaced: { uid: string; piece: string } | null;
  busy: boolean;
  message: string | null;
  onPick: (pieceId: string) => void;
  onRotate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onMove: () => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const [cat, setCat] = useState<PieceCategory>("candy");
  const selDef = selection ? getPiece(selection.pieceId) : null;
  const placedDef = selectedPlaced ? getPiece(selectedPlaced.piece) : null;

  return (
    <>
      <div style={topBar}>
        <div style={ticketChip}>
          🎟️ <b style={{ fontSize: 20 }}>{tickets}</b> <span style={{ fontSize: 13 }}>tickets</span>
        </div>
        <div style={{ ...ticketChip, fontSize: 14 }}>🔨 Building my Dream Park</div>
        <CandyButton color="#36b8ff" onClick={onDone} style={{ pointerEvents: "auto" }}>
          ✓ Done
        </CandyButton>
      </div>

      {message && <div style={msg}>{message}</div>}

      <div style={dock}>
        {selection && selDef ? (
          <div style={actionRow}>
            <div style={{ fontWeight: 900, color: "#7a2e62", flex: 1, minWidth: 0 }}>
              {selDef.emoji} {selDef.name}
              <div style={{ fontSize: 13, fontWeight: 800, color: "#b0799f" }}>
                {selection.cell ? (selection.cell.ok ? "Looks great here!" : "Can't go there — try another spot") : "Tap a spot on your lawn 👇"}
              </div>
            </div>
            <CandyButton small color="#a96bff" onClick={onRotate}>
              ↻ Turn
            </CandyButton>
            <CandyButton small color="#ff4f6d" onClick={onCancel}>
              ✕
            </CandyButton>
            <CandyButton color="#2fcf8f" onClick={onConfirm} disabled={busy || !selection.cell?.ok}>
              {selection.uid ? "✓ Move here" : `✓ Place · 🎟️${selDef.cost}`}
            </CandyButton>
          </div>
        ) : selectedPlaced && placedDef ? (
          <div style={actionRow}>
            <div style={{ fontWeight: 900, color: "#7a2e62", flex: 1 }}>
              {placedDef.emoji} {placedDef.name}
            </div>
            <CandyButton small color="#a96bff" onClick={onMove}>
              ✥ Move
            </CandyButton>
            <CandyButton small color="#ff4f6d" onClick={onRemove} disabled={busy}>
              🗑 Remove{refundFor(placedDef.id) > 0 ? ` (+${refundFor(placedDef.id)}🎟️)` : ""}
            </CandyButton>
            <CandyButton small color="#9b7090" onClick={onCancel}>
              ✕
            </CandyButton>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
              {PIECE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  style={{
                    ...tab,
                    background: cat === c.id ? "linear-gradient(#ff7fbd,#ff4f9e)" : "#fff",
                    color: cat === c.id ? "#fff" : "#7a2e62",
                    boxShadow: cat === c.id ? "0 3px 0 #d23a82" : "0 3px 0 #f5d3e6",
                  }}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
              {PIECES.filter((p) => p.category === cat).map((p) => {
                const unlocked = isUnlocked(p, level, streak);
                const afford = tickets >= p.cost;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => unlocked && onPick(p.id)}
                    style={{ ...pieceCard, opacity: unlocked ? 1 : 0.55, filter: unlocked ? "none" : "grayscale(0.6)" }}
                  >
                    <div style={{ fontSize: 34, lineHeight: 1 }}>{unlocked ? p.emoji : "🔒"}</div>
                    <div style={{ fontWeight: 900, fontSize: 12, color: "#5a2350", marginTop: 4 }}>{p.name}</div>
                    <div style={{ fontWeight: 900, fontSize: 12, color: afford ? "#d23a82" : "#b0799f" }}>
                      {unlocked ? `🎟️ ${p.cost}` : unlockHint(p).replace("Unlocks at ", "")}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const topBar: React.CSSProperties = {
  position: "fixed",
  top: "max(14px, env(safe-area-inset-top))",
  left: 14,
  right: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  zIndex: 25,
  pointerEvents: "none",
};
const ticketChip: React.CSSProperties = {
  pointerEvents: "auto",
  borderRadius: 999,
  padding: "8px 14px",
  fontWeight: 900,
  color: "#7a2e62",
  background: "linear-gradient(#fff,#fff0f8)",
  boxShadow: "0 4px 0 #ffb8d9, 0 8px 16px rgba(122,46,98,0.16)",
};
const msg: React.CSSProperties = {
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 60px)",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 25,
  borderRadius: 18,
  padding: "8px 16px",
  fontWeight: 900,
  color: "#7a2e62",
  background: "#fff",
  boxShadow: "0 4px 0 #ffb8d9",
  pointerEvents: "none",
  maxWidth: "90vw",
  textAlign: "center",
};
const dock: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 25,
  padding: "12px 12px calc(12px + env(safe-area-inset-bottom))",
  background: "linear-gradient(rgba(255,248,252,0.92), #fff8fc)",
  borderRadius: "26px 26px 0 0",
  boxShadow: "0 -8px 24px rgba(122,46,98,0.18)",
};
const actionRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const tab: React.CSSProperties = { border: "none", borderRadius: 999, padding: "7px 14px", fontWeight: 900, fontSize: 14, whiteSpace: "nowrap", cursor: "pointer" };
const pieceCard: React.CSSProperties = {
  flex: "0 0 96px",
  border: "none",
  borderRadius: 20,
  padding: "10px 6px",
  background: "#fff",
  boxShadow: "0 4px 0 #f5d3e6, 0 6px 12px rgba(122,46,98,0.08)",
  cursor: "pointer",
  textAlign: "center",
};
