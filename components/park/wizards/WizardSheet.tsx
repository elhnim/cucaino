"use client";

// Talking to a wizard: a greeting, then today's lesson one line at a time (read aloud), a
// "try it" or fun fact, one easy question, and the lesson joins your Book of Wisdom. Each wizard
// teaches one lesson a day — come back tomorrow for the next.
import { useEffect, useMemo, useState } from "react";
import type { Lesson, WizardDef } from "@/lib/park/wizards";
import { speak, stopSpeaking } from "@/lib/park/wizards/wisdomBook";
import { getMuted, playSfx } from "@/lib/audio/sound-manager";

const VOICE: Record<string, { pitch: number; rate: number }> = {
  sage: { pitch: 0.75, rate: 0.85 },
  twinkle: { pitch: 1.4, rate: 1.05 },
  tinker: { pitch: 1.25, rate: 1.05 },
  marigold: { pitch: 1.1, rate: 0.95 },
  nova: { pitch: 1.2, rate: 1 },
  coral: { pitch: 0.95, rate: 0.9 },
};
const TALK_KEY = "cucaino.wizards.talk";

type Step = { kind: "say"; text: string } | { kind: "try"; text: string } | { kind: "fact"; text: string } | { kind: "quiz" } | { kind: "done" };

export function WizardSheet({
  wizard,
  lesson,
  learned,
  onLearned,
  onClose,
}: {
  wizard: WizardDef;
  lesson: Lesson;
  /** already learned today's lesson */
  learned: boolean;
  onLearned: () => void;
  onClose: () => void;
}) {
  const steps = useMemo<Step[]>(() => {
    const greet = wizard.greeting[Math.floor(Math.random() * wizard.greeting.length)];
    const s: Step[] = [{ kind: "say", text: greet }, ...lesson.lines.map((text) => ({ kind: "say" as const, text }))];
    if (lesson.tryIt) s.push({ kind: "try", text: lesson.tryIt });
    if (lesson.funFact) s.push({ kind: "fact", text: lesson.funFact });
    if (lesson.quiz) s.push({ kind: "quiz" });
    s.push({ kind: "done" });
    return s;
  }, [wizard, lesson]);
  const [i, setI] = useState(learned ? -1 : 0);
  const [picked, setPicked] = useState<number | null>(null);
  const [talk, setTalk] = useState(() => {
    try {
      return window.localStorage.getItem(TALK_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const step = i >= 0 ? steps[i] : null;
  const voice = VOICE[wizard.id] ?? { pitch: 1, rate: 1 };

  // read each line aloud
  useEffect(() => {
    if (!talk || getMuted() || !step) return;
    const text = step.kind === "say" ? step.text : step.kind === "try" ? `Try this: ${step.text}` : step.kind === "fact" ? `Fun fact! ${step.text}` : step.kind === "quiz" && lesson.quiz ? lesson.quiz.q : "";
    if (text) speak(text, voice);
  }, [i, talk]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), []);

  const next = () => {
    playSfx("tap");
    const n = i + 1;
    if (steps[n]?.kind === "done") {
      onLearned();
      playSfx("win");
    }
    setI(n);
  };
  const toggleTalk = () => {
    const v = !talk;
    setTalk(v);
    if (!v) stopSpeaking();
    try {
      window.localStorage.setItem(TALK_KEY, v ? "1" : "0");
    } catch {}
  };

  return (
    <div style={wrap} onClick={onClose}>
      <div style={{ ...card, background: `linear-gradient(160deg, ${wizard.robe}33, #fff8fc 45%, ${wizard.hat}22)` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ ...avatar, background: wizard.robe }}>🧙</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 19, color: "#3b2a6a" }}>{wizard.name}</div>
            <div style={{ fontWeight: 800, fontSize: 12, color: "#7b6aa8" }}>{wizard.title}</div>
          </div>
          <button type="button" onClick={toggleTalk} style={iconBtn} aria-label={talk ? "Stop reading aloud" : "Read aloud"}>
            {talk ? "🔊" : "🔇"}
          </button>
          <button type="button" onClick={onClose} style={iconBtn} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={lessonTag}>
          <span style={{ fontSize: 22 }}>{lesson.emoji}</span> <span>Today&apos;s lesson: {lesson.title}</span>
        </div>

        {/* already learned today */}
        {i === -1 && (
          <>
            <div style={bubble}>{wizard.farewell[0]} You&apos;ve learned today&apos;s lesson — come back tomorrow for a brand new one! ✨</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button type="button" style={softBtn} onClick={() => setI(1)}>
                📖 Hear it again
              </button>
              <button type="button" style={mainBtn} onClick={onClose}>
                Bye! 👋
              </button>
            </div>
          </>
        )}

        {step && step.kind !== "quiz" && step.kind !== "done" && (
          <>
            <div style={{ ...bubble, ...(step.kind !== "say" ? { background: step.kind === "try" ? "#e9fff1" : "#fff7e0" } : {}) }} key={i} className="wiz-pop">
              {step.kind === "try" && <b>🪄 Try this today: </b>}
              {step.kind === "fact" && <b>🌟 Fun fact! </b>}
              {step.text}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {steps.slice(0, -1).map((_, k) => (
                  <span key={k} style={{ width: 8, height: 8, borderRadius: 99, background: k <= i ? wizard.robe : "#e5dcf2" }} />
                ))}
              </div>
              <button type="button" style={mainBtn} onClick={next}>
                Next ✨
              </button>
            </div>
          </>
        )}

        {step?.kind === "quiz" && lesson.quiz && (
          <>
            <div style={bubble}>❓ {lesson.quiz.q}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {lesson.quiz.options.map((o, k) => {
                const show = picked !== null;
                const right = k === lesson.quiz!.answer;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={show && picked === lesson.quiz!.answer}
                    onClick={() => {
                      setPicked(k);
                      playSfx(right ? "correct" : "wrong");
                    }}
                    style={{ ...optBtn, background: show && picked === k ? (right ? "#2fcf8f" : "#ff8a8a") : show && right && picked === lesson.quiz!.answer ? "#2fcf8f" : "#ffffff", color: show && (picked === k || (right && picked === lesson.quiz!.answer)) ? "#fff" : "#3b2a6a" }}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div style={{ fontWeight: 800, fontSize: 14, color: picked === lesson.quiz.answer ? "#15803d" : "#b91c1c", textAlign: "center" }}>
                {picked === lesson.quiz.answer ? `✅ Yes! ${lesson.quiz.explain}` : "Not quite — have another go! 💪"}
              </div>
            )}
            {picked === lesson.quiz.answer && (
              <button type="button" style={{ ...mainBtn, alignSelf: "center" }} onClick={next}>
                Collect my card 📖
              </button>
            )}
          </>
        )}

        {step?.kind === "done" && (
          <>
            <div style={{ ...cardReveal, borderColor: wizard.robe }} className="wiz-pop">
              <div style={{ fontSize: 46 }}>{lesson.emoji}</div>
              <div style={{ fontWeight: 900, fontSize: 17, color: "#3b2a6a" }}>{lesson.title}</div>
              <div style={{ fontWeight: 800, fontSize: 12, color: "#7b6aa8" }}>New card for your Book of Wisdom!</div>
            </div>
            <div style={bubble}>{wizard.farewell[Math.floor(Math.random() * wizard.farewell.length)]}</div>
            <button type="button" style={{ ...mainBtn, alignSelf: "center" }} onClick={onClose}>
              Thank you! 🌟
            </button>
          </>
        )}
      </div>
      <style>{"@keyframes wiz-pop { 0% { transform: scale(0.92); opacity: 0; } 100% { transform: none; opacity: 1; } } .wiz-pop { animation: wiz-pop 0.3s ease-out; }"}</style>
    </div>
  );
}

const wrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "16px 12px max(16px, env(safe-area-inset-bottom))", background: "rgba(40,20,80,0.25)" };
const card: React.CSSProperties = { width: "min(560px, 100%)", borderRadius: 30, padding: 16, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 8px 0 #d9c8f5, 0 20px 40px rgba(60,30,120,0.3)", maxHeight: "86vh", overflowY: "auto" };
const avatar: React.CSSProperties = { width: 52, height: 52, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0, boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.15)" };
const iconBtn: React.CSSProperties = { width: 40, height: 40, borderRadius: 999, border: "none", background: "#ffffff", boxShadow: "0 3px 0 #e2d6f5", fontSize: 18, cursor: "pointer", flexShrink: 0 };
const lessonTag: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontWeight: 900, fontSize: 14, color: "#5a3a8a", background: "#ffffffcc", borderRadius: 16, padding: "6px 12px" };
const bubble: React.CSSProperties = { background: "#ffffff", borderRadius: 22, padding: "14px 16px", fontWeight: 800, fontSize: 18, lineHeight: 1.4, color: "#3b2a6a", boxShadow: "0 4px 0 #e8dcf8" };
const mainBtn: React.CSSProperties = { border: "none", borderRadius: 999, padding: "12px 20px", fontWeight: 900, fontSize: 16, color: "#fff", background: "linear-gradient(#a98bff, #7c5cff)", boxShadow: "0 4px 0 #5a3fd1", cursor: "pointer" };
const softBtn: React.CSSProperties = { ...mainBtn, color: "#5a3a8a", background: "#ffffff", boxShadow: "0 4px 0 #e2d6f5" };
const optBtn: React.CSSProperties = { border: "none", borderRadius: 18, padding: "12px 14px", fontWeight: 900, fontSize: 16, textAlign: "left", boxShadow: "0 3px 0 #e2d6f5", cursor: "pointer" };
const cardReveal: React.CSSProperties = { alignSelf: "center", width: 200, borderRadius: 22, padding: 16, textAlign: "center", background: "linear-gradient(#ffffff, #f6f0ff)", border: "4px solid", boxShadow: "0 6px 0 #e2d6f5" };
