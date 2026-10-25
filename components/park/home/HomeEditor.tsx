"use client";

// My Home decorating bar: ticket balance, which room you're looking at, the catalogue carousel
// (by category; price / lock / "you have 2" badges) and the place / turn / move / store controls.
// Purely presentational — HomeScreen owns the state and talks to the 3D room + server actions.
// Rules (grid, collisions, ownership) are shared with the server: lib/park/home/rules.ts.
import { useState } from "react";
import { HOME_CATEGORIES, HOME_ITEMS, getHomeItem, isStyle, type HomeCategory } from "@/lib/park/home/catalog";
import { ROOMS, available, canBuyMore, isItemUnlocked, itemUnlockHint, ownsStyle, placedCount, type HomeLayout, type Owned, type RoomId } from "@/lib/park/home/rules";
import { CandyButton } from "../ui/CandySheet";
import { C, FONT, PARK_CSS, alpha, cardStyle, display, glass } from "../ui/theme";

export type EditorSelection =
  | { kind: "ghost"; itemId: string; moving: boolean; ok: boolean; reason?: string }
  | { kind: "placed"; uid: string; itemId: string }
  | { kind: "buy"; itemId: string }
  | { kind: "style"; itemId: string }
  | null;

const CSS = `
.hm-scroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.hm-scroll::-webkit-scrollbar { display: none; }
@media (max-width: 440px) { .hm-lbl { display: none; } }
`;

export function HomeEditor({
  tickets,
  level,
  streak,
  owned,
  layout,
  room,
  selection,
  busy,
  message,
  petName,
  onRoom,
  onPick,
  onTurn,
  onPlace,
  onCancel,
  onMove,
  onStore,
  onBuy,
  onDone,
  onPet,
}: {
  tickets: number;
  level: number;
  streak: number;
  owned: Owned;
  layout: HomeLayout;
  room: RoomId;
  selection: EditorSelection;
  busy: boolean;
  message: string | null;
  petName?: string;
  onRoom: (room: RoomId) => void;
  onPick: (itemId: string) => void;
  onTurn: () => void;
  onPlace: () => void;
  onCancel: () => void;
  onMove: () => void;
  onStore: () => void;
  onBuy: () => void;
  onDone: () => void;
  onPet: () => void;
}) {
  const [cat, setCat] = useState<HomeCategory>("beds");
  const selDef = selection ? getHomeItem(selection.itemId) : undefined;

  let action: React.ReactNode = null;
  if (selection?.kind === "ghost" && selDef) {
    const isWall = selDef.surface === "wall";
    action = (
      <div style={actionRow}>
        <div style={{ ...display(18), flex: "1 1 260px", minWidth: 0 }}>
          {selDef.emoji} {selDef.name}
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: FONT.body, color: selection.ok ? C.dim : "#ff9aa8", marginTop: 2 }}>
            {selection.ok ? (isWall ? "Drag it along the walls 👆" : "Drag it round the floor 👆") : (selection.reason ?? "Can't go there — try another spot")}
          </div>
        </div>
        {!isWall && (
          <CandyButton small color="#a96bff" onClick={onTurn}>
            ↻ Turn
          </CandyButton>
        )}
        <CandyButton small color="#9b7090" onClick={onCancel}>
          ✕
        </CandyButton>
        <CandyButton color="#2fcf8f" onClick={onPlace} disabled={busy || !selection.ok}>
          {selection.moving ? "✓ Move here" : "✓ Place"}
        </CandyButton>
      </div>
    );
  } else if (selection?.kind === "placed" && selDef) {
    action = (
      <div style={actionRow}>
        <div style={{ ...display(18), flex: "1 1 260px", minWidth: 0 }}>
          {selDef.emoji} {selDef.name}
        </div>
        <CandyButton small color="#a96bff" onClick={onMove} disabled={busy}>
          ✥ Move
        </CandyButton>
        {selDef.surface !== "wall" && (
          <CandyButton small color="#36b8ff" onClick={onTurn} disabled={busy}>
            ↻ Turn
          </CandyButton>
        )}
        <CandyButton small color="#ff8a3d" onClick={onStore} disabled={busy}>
          📦 Put away
        </CandyButton>
        <CandyButton small color="#9b7090" onClick={onCancel}>
          ✕
        </CandyButton>
      </div>
    );
  } else if ((selection?.kind === "buy" || selection?.kind === "style") && selDef) {
    const needBuy = selection.kind === "buy" || !ownsStyle(selDef, owned);
    const afford = tickets >= selDef.cost;
    action = (
      <div style={actionRow}>
        <div style={{ ...display(18), flex: "1 1 260px", minWidth: 0 }}>
          {selDef.emoji} {selDef.name}
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: FONT.body, color: afford ? C.dim : "#ff9aa8", marginTop: 2 }}>
            {!needBuy ? "Painted! ✨" : afford ? (isStyle(selDef) ? `Try it on — like it? It's 🎟️ ${selDef.cost}` : `Get it for 🎟️ ${selDef.cost}?`) : `You need 🎟️ ${selDef.cost} — finish more quests!`}
          </div>
        </div>
        <CandyButton small color="#9b7090" onClick={onCancel}>
          {needBuy ? "✕" : "✓ OK"}
        </CandyButton>
        {needBuy && (
          <CandyButton color="#ffd36b" onClick={onBuy} disabled={busy || !afford}>
            {isStyle(selDef) ? "🎨 Buy & paint" : "🛍️ Buy"} · 🎟️{selDef.cost}
          </CandyButton>
        )}
      </div>
    );
  }

  return (
    <>
      <style>{PARK_CSS + CSS}</style>
      <div style={topBar}>
        <div style={chip}>
          <span style={{ fontSize: 18 }}>🎟️</span> <b style={display(21, C.text)}>{tickets}</b>
        </div>
        <div style={{ ...chip, padding: 4, gap: 4 }}>
          {(["bedroom", "den"] as const).map((id) => (
            <button key={id} type="button" className="gp-press" onClick={() => onRoom(id)} style={{ ...roomBtn, ...(room === id ? roomOn : null) }} aria-label={ROOMS[id].name}>
              {ROOMS[id].emoji}
              <span className="hm-lbl"> {ROOMS[id].name}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, pointerEvents: "auto" }}>
          <CandyButton small color="#ff8a3d" onClick={onPet}>
            🐾<span className="hm-lbl"> {petName || "Pet"}</span>
          </CandyButton>
          <CandyButton small color="#36b8ff" onClick={onDone}>
            ✓ Done
          </CandyButton>
        </div>
      </div>

      {message && <div style={msg}>{message}</div>}

      <div style={dock}>
        {action ?? (
          <>
            <div className="hm-scroll" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
              {HOME_CATEGORIES.map((c) => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)} className="gp-press" style={{ ...tab, ...(cat === c.id ? tabOn : tabOff) }}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            <div className="hm-scroll" style={{ display: "flex", gap: 9, overflowX: "auto", paddingBottom: 2 }}>
              {HOME_ITEMS.filter((it) => it.category === cat).map((it) => {
                const unlocked = isItemUnlocked(it, level, streak);
                const style = isStyle(it);
                const using = style && layout.rooms[room]?.[it.surface === "wallpaper" ? "wall" : "floor"] === it.id;
                const have = style ? (ownsStyle(it, owned) ? 1 : 0) : available(it, owned) - placedCount(layout.placed, it.id);
                const buyable = canBuyMore(it, owned);
                const afford = tickets >= it.cost;
                let badge: React.ReactNode;
                if (!unlocked) badge = <span style={{ color: C.mute }}>{itemUnlockHint(it).replace("Unlocks at ", "🔒 ")}</span>;
                else if (using) badge = <span style={{ color: C.success }}>✓ Using</span>;
                else if (have > 0) badge = <span style={{ color: C.success }}>{style ? "Yours" : it.cost === 0 ? `Free · ×${have}` : `×${have} to place`}</span>;
                else if (buyable) badge = <span style={{ color: afford ? C.cyan : C.mute }}>🎟️ {it.cost}</span>;
                else badge = <span style={{ color: C.mute }}>All placed</span>;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onPick(it.id)}
                    className="gp-press"
                    aria-label={it.name}
                    style={{ ...card, ...cardStyle(using ? C.success : unlocked && (have > 0 || afford) ? C.cyan : "soft", "rgba(30,27,74,0.9)"), opacity: unlocked ? 1 : 0.6, filter: unlocked ? "none" : "grayscale(0.6)" }}
                  >
                    {style ? (
                      <div style={{ width: 40, height: 34, margin: "0 auto", borderRadius: 9, border: "2px solid rgba(255,255,255,0.7)", background: `repeating-linear-gradient(${it.surface === "wallpaper" ? "90deg" : "45deg"}, ${it.swatch![0]} 0 8px, ${it.swatch![1]} 8px 16px)` }} />
                    ) : (
                      <div style={{ fontSize: 32, lineHeight: 1, height: 34, filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.4))" }}>{unlocked ? it.emoji : "🔒"}</div>
                    )}
                    <div style={{ fontWeight: 900, fontSize: 12, color: C.text, marginTop: 5, lineHeight: 1.15 }}>{it.name}</div>
                    <div style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 12.5, marginTop: 3 }}>{badge}</div>
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
  top: "max(12px, env(safe-area-inset-top))",
  left: 10,
  right: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 6,
  zIndex: 25,
  pointerEvents: "none",
};
const chip: React.CSSProperties = {
  ...glass({ edge: "cyan", fill: "rgba(14,12,38,0.8)" }),
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 14,
  padding: "7px 12px",
  fontWeight: 900,
};
const roomBtn: React.CSSProperties = {
  border: "1px solid rgba(160,190,255,0.22)",
  borderRadius: 10,
  minHeight: 38,
  minWidth: 44,
  padding: "0 10px",
  fontFamily: FONT.display,
  fontWeight: 400,
  fontSize: 14,
  whiteSpace: "nowrap",
  cursor: "pointer",
  color: C.text,
  background: "rgba(255,255,255,0.06)",
};
const roomOn: React.CSSProperties = { color: C.ink, background: `linear-gradient(${C.goldHi}, ${C.gold} 50%, ${C.goldDeep})`, borderColor: "#fff0b8", boxShadow: `0 0 12px ${alpha(C.gold, 0.45)}` };
const msg: React.CSSProperties = {
  position: "fixed",
  top: "calc(max(12px, env(safe-area-inset-top)) + 58px)",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 25,
  ...glass({ edge: "gold", fill: "rgba(18,16,44,0.9)" }),
  borderRadius: 14,
  padding: "8px 16px",
  fontWeight: 900,
  pointerEvents: "none",
  maxWidth: "88vw",
  textAlign: "center",
};
const dock: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 25,
  ...glass({ edge: "cyan", fill: "rgba(16,14,42,0.88)", blur: 12 }),
  borderBottomWidth: 0,
  padding: "10px 10px calc(10px + env(safe-area-inset-bottom))",
  borderRadius: "22px 22px 0 0",
  maxWidth: 980,
  margin: "0 auto",
};
const actionRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 64, justifyContent: "flex-end" };
const tab: React.CSSProperties = { border: "1px solid", borderRadius: 10, minHeight: 40, padding: "0 13px", fontFamily: FONT.display, fontWeight: 400, letterSpacing: 0.3, fontSize: 14, whiteSpace: "nowrap", cursor: "pointer" };
const tabOn: React.CSSProperties = { color: C.ink, background: `linear-gradient(${C.goldHi}, ${C.gold} 50%, ${C.goldDeep})`, borderColor: "#fff0b8", boxShadow: `0 0 12px ${alpha(C.gold, 0.45)}` };
const tabOff: React.CSSProperties = { color: C.text, background: "rgba(255,255,255,0.06)", borderColor: "rgba(160,190,255,0.22)" };
const card: React.CSSProperties = { flex: "0 0 92px", borderRadius: 14, padding: "9px 5px 8px", cursor: "pointer", textAlign: "center" };
