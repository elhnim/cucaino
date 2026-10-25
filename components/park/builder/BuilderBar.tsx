"use client";

// Dream Park build mode HUD: ticket balance, piece shelf (by category, locked ones show what
// unlocks them), and the place / rotate / move / remove controls. The 3D ghost + grid live in
// lib/park/world/dreamPark.ts; rules are shared with the server (lib/park/builder/rules.ts).
import { useState } from "react";
import { PIECES, PIECE_CATEGORIES, getPiece, type PieceCategory } from "@/lib/park/registry/pieces";
import { isUnlocked, refundFor, unlockHint } from "@/lib/park/builder/rules";
import { CandyButton } from "../ui/CandySheet";
import { C, FONT, PARK_CSS, alpha, cardStyle, display, glass } from "../ui/theme";
import { IconChip } from "../ui/IconChip";

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
      <style>{PARK_CSS}</style>
      <div style={topBar}>
        <div style={ticketChip}>
          <span style={{ fontSize: 18 }}>🎟️</span> <b style={display(22, C.text)}>{tickets}</b> <span style={{ fontSize: 13, color: C.dim }}>tickets</span>
        </div>
        <div style={{ ...ticketChip, ...display(15, C.goldHi) }}>🔨 Building my Dream Park</div>
        <CandyButton color="#36b8ff" onClick={onDone} style={{ pointerEvents: "auto" }}>
          ✓ Done
        </CandyButton>
      </div>

      {message && <div style={msg}>{message}</div>}

      <div style={dock}>
        {selection && selDef ? (
          <div style={actionRow}>
            <div style={{ ...display(18), flex: 1, minWidth: 0 }}>
              {selDef.emoji} {selDef.name}
              <div style={{ fontSize: 13, fontWeight: 800, fontFamily: FONT.body, color: selection.cell && !selection.cell.ok ? "#ff9aa8" : C.dim, marginTop: 2 }}>
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
            <div style={{ ...display(18), flex: 1 }}>
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
                  className="gp-press"
                  style={{
                    ...tab,
                    ...(cat === c.id
                      ? { color: C.ink, background: `linear-gradient(${C.goldHi}, ${C.gold} 50%, ${C.goldDeep})`, borderColor: "#fff0b8", boxShadow: `0 0 12px ${alpha(C.gold, 0.45)}` }
                      : { color: C.text, background: "rgba(255,255,255,0.06)", borderColor: "rgba(160,190,255,0.22)" }),
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
                    className="gp-press"
                    style={{ ...pieceCard, ...cardStyle(unlocked && afford ? C.cyan : "soft", "rgba(30,27,74,0.9)"), opacity: unlocked ? 1 : 0.55, filter: unlocked ? "none" : "grayscale(0.6)" }}
                  >
                    <div style={{ fontSize: 34, lineHeight: 1, filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.4))" }}>{unlocked ? p.emoji : "🔒"}</div>
                    <div style={{ fontWeight: 900, fontSize: 12, color: C.text, marginTop: 5 }}>{p.name}</div>
                    <div style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 13, color: afford ? C.cyan : C.mute, marginTop: 2 }}>
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
  ...glass({ edge: "cyan", fill: "rgba(14,12,38,0.78)" }),
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 14,
  padding: "8px 14px",
  fontWeight: 900,
};
const msg: React.CSSProperties = {
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 60px)",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 25,
  ...glass({ edge: "gold", fill: "rgba(18,16,44,0.88)" }),
  borderRadius: 14,
  padding: "8px 16px",
  fontWeight: 900,
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
  ...glass({ edge: "cyan", fill: "rgba(16,14,42,0.86)", blur: 12 }),
  borderBottomWidth: 0,
  padding: "12px 12px calc(12px + env(safe-area-inset-bottom))",
  borderRadius: "22px 22px 0 0",
};
const actionRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const tab: React.CSSProperties = { border: "1px solid", borderRadius: 10, minHeight: 40, padding: "0 14px", fontFamily: FONT.display, fontWeight: 400, letterSpacing: 0.3, fontSize: 14, whiteSpace: "nowrap", cursor: "pointer" };
const pieceCard: React.CSSProperties = {
  flex: "0 0 96px",
  borderRadius: 14,
  padding: "10px 6px",
  cursor: "pointer",
  textAlign: "center",
};
