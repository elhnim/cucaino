"use client";

// The Book of Wisdom: every lesson card collected from the park's wizards, grouped by wizard.
// Tap a card to read it again.
import { useMemo, useState } from "react";
import { WIZARDS, lessonsFor, lessonById, type Lesson } from "@/lib/park/wizards";
import { readWisdom } from "@/lib/park/wizards/wisdomBook";
import { CandySheet } from "../ui/CandySheet";

export function BookOfWisdom({ kidId, onClose }: { kidId: string; onClose: () => void }) {
  const book = useMemo(() => readWisdom(kidId), [kidId]);
  const [open, setOpen] = useState<Lesson | null>(null);
  const total = Object.keys(book).length;
  const all = WIZARDS.reduce((a, w) => a + lessonsFor(w.id).length, 0);

  return (
    <CandySheet title="📖 Book of Wisdom" subtitle={`${total} of ${all} lesson cards · each wizard teaches one a day`} color="#7c5cff" onClose={onClose}>
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" onClick={() => setOpen(null)} style={back}>
            ← All cards
          </button>
          <div style={{ fontSize: 44, textAlign: "center" }}>{open.emoji}</div>
          <div style={{ fontWeight: 900, fontSize: 20, textAlign: "center", color: "#3b2a6a" }}>{open.title}</div>
          {open.lines.map((l, i) => (
            <p key={i} style={line}>
              {l}
            </p>
          ))}
          {open.tryIt && <p style={{ ...line, background: "#e9fff1" }}>🪄 {open.tryIt}</p>}
          {open.funFact && <p style={{ ...line, background: "#fff7e0" }}>🌟 {open.funFact}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {total === 0 && <p style={{ textAlign: "center", fontWeight: 800, color: "#7b6aa8" }}>Find a wizard 🧙 in the park — each one has a lesson for you today!</p>}
          {WIZARDS.map((w) => {
            const got = lessonsFor(w.id).filter((l) => book[l.id]);
            return (
              <div key={w.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 10, background: w.robe, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>🧙</span>
                  <span style={{ fontWeight: 900, color: "#3b2a6a" }}>{w.name}</span>
                  <span style={{ fontWeight: 800, fontSize: 12, color: "#9a8cc0" }}>
                    {got.length}/{lessonsFor(w.id).length}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                  {got.map((l) => (
                    <button key={l.id} type="button" onClick={() => setOpen(lessonById(l.id) ?? l)} style={{ ...cardBtn, borderColor: w.robe }}>
                      <span style={{ fontSize: 26 }}>{l.emoji}</span>
                      <span style={{ fontWeight: 900, fontSize: 11, color: "#3b2a6a", lineHeight: 1.15 }}>{l.title}</span>
                    </button>
                  ))}
                  {got.length < lessonsFor(w.id).length && (
                    <div style={{ ...cardBtn, borderColor: "#e5dcf2", borderStyle: "dashed", color: "#b3a6d6" }}>
                      <span style={{ fontSize: 22 }}>❔</span>
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

const back: React.CSSProperties = { alignSelf: "flex-start", border: "none", borderRadius: 999, padding: "8px 14px", fontWeight: 900, color: "#5a3a8a", background: "#f1eaff", cursor: "pointer" };
const line: React.CSSProperties = { margin: 0, background: "#ffffff", borderRadius: 16, padding: "10px 14px", fontWeight: 800, fontSize: 16, lineHeight: 1.4, color: "#3b2a6a" };
const cardBtn: React.CSSProperties = { border: "3px solid", borderRadius: 16, padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "#ffffff", cursor: "pointer", textAlign: "center", minHeight: 84 };
