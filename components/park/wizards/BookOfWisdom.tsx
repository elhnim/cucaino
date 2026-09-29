"use client";

// The Book of Wisdom: every lesson card collected from the park's wizards, grouped by wizard,
// shown like a collectible card binder. Tap a card to read it again.
import { useMemo, useState } from "react";
import { WIZARDS, lessonsFor, lessonById, type Lesson } from "@/lib/park/wizards";
import { readWisdom } from "@/lib/park/wizards/wisdomBook";
import { CandySheet } from "../ui/CandySheet";
import { C, alpha, cardStyle, display, sectionLabel } from "../ui/theme";
import { IconChip } from "../ui/IconChip";
import { ProgressBar } from "../ui/ProgressBar";

export function BookOfWisdom({ kidId, onClose }: { kidId: string; onClose: () => void }) {
  const book = useMemo(() => readWisdom(kidId), [kidId]);
  const [open, setOpen] = useState<Lesson | null>(null);
  const total = Object.keys(book).length;
  const all = WIZARDS.reduce((a, w) => a + lessonsFor(w.id).length, 0);

  return (
    <CandySheet
      title="📖 Book of Wisdom"
      subtitle={
        <div>
          <div>
            <b style={{ color: C.text }}>{total}</b> of {all} lesson cards · each wizard teaches one a day
          </div>
          <ProgressBar value={all ? total / all : 0} color={C.violet} to="#e8d4ff" height={8} style={{ marginTop: 6, maxWidth: 320 }} />
        </div>
      }
      color={C.violet}
      onClose={onClose}
    >
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" onClick={() => setOpen(null)} style={back} className="gp-press">
            ← All cards
          </button>
          <div style={{ fontSize: 48, textAlign: "center", filter: `drop-shadow(0 0 14px ${alpha(C.violet, 0.8)})` }}>{open.emoji}</div>
          <div style={{ ...display(24), textAlign: "center" }}>{open.title}</div>
          {open.lines.map((l, i) => (
            <p key={i} style={line}>
              {l}
            </p>
          ))}
          {open.tryIt && <p style={{ ...line, ...cardStyle(C.success, "rgba(20,60,44,0.6)"), padding: "10px 14px" }}>🪄 {open.tryIt}</p>}
          {open.funFact && <p style={{ ...line, ...cardStyle(C.gold, "rgba(64,48,12,0.6)"), padding: "10px 14px" }}>🌟 {open.funFact}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {total === 0 && <p style={{ textAlign: "center", fontWeight: 800, color: C.dim }}>Find a wizard 🧙 in the park — each one has a lesson for you today!</p>}
          {WIZARDS.map((w) => {
            const got = lessonsFor(w.id).filter((l) => book[l.id]);
            return (
              <div key={w.id}>
                <div style={{ ...sectionLabel, color: C.text, textTransform: "none", letterSpacing: 0.4, fontSize: 16 }}>
                  <IconChip color={w.robe} size={32} round style={{ fontSize: 18 }}>
                    🧙
                  </IconChip>
                  <span>{w.name}</span>
                  <span style={{ fontSize: 13, color: C.mute }}>
                    {got.length}/{lessonsFor(w.id).length}
                  </span>
                  <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${alpha(w.robe, 0.7)}, transparent)` }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                  {got.map((l) => (
                    <button key={l.id} type="button" onClick={() => setOpen(lessonById(l.id) ?? l)} className="gp-press" style={{ ...cardStyle(w.robe, "rgba(40,32,96,0.8)"), ...cardBtn, boxShadow: `0 0 12px ${alpha(w.robe, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.1)` }}>
                      <span style={{ fontSize: 28 }}>{l.emoji}</span>
                      <span style={{ fontWeight: 900, fontSize: 11.5, color: C.text, lineHeight: 1.15 }}>{l.title}</span>
                    </button>
                  ))}
                  {got.length < lessonsFor(w.id).length && (
                    <div style={{ ...cardBtn, border: "1.5px dashed rgba(160,190,255,0.3)", background: "rgba(255,255,255,0.03)", color: C.mute }}>
                      <span style={{ fontSize: 22, opacity: 0.6 }}>❔</span>
                      <span style={{ fontWeight: 800, fontSize: 11 }}>More to learn</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CandySheet>
  );
}

const back: React.CSSProperties = {
  alignSelf: "flex-start",
  minHeight: 44,
  border: "1px solid rgba(160,190,255,0.3)",
  borderRadius: 999,
  padding: "0 16px",
  fontWeight: 900,
  color: C.text,
  background: "rgba(255,255,255,0.07)",
  cursor: "pointer",
};
const line: React.CSSProperties = { margin: 0, borderRadius: 14, padding: "4px 4px", fontWeight: 700, fontSize: 17, lineHeight: 1.5, color: C.text };
const cardBtn: React.CSSProperties = { borderRadius: 14, padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", textAlign: "center", minHeight: 88 };
