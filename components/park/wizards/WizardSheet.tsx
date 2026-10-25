"use client";

// Talking to a wizard, RPG style (portrait + name plate + dialogue box): a greeting, then today's lesson one line at a time (read aloud), a
// "try it" or fun fact, one easy question, and the lesson joins your Book of Wisdom. Each wizard
// teaches one lesson a day — come back tomorrow for the next.
import { useEffect, useMemo, useState } from "react";
import type { Lesson, WizardDef } from "@/lib/park/wizards";
import { speak, stopSpeaking } from "@/lib/park/wizards/wisdomBook";
import { getMuted, playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, alpha, cardStyle, display, glass } from "../ui/theme";
import { GameButton } from "../ui/GameButton";

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
      <style>{PARK_CSS + "@keyframes wiz-pop { 0% { transform: translateY(6px); opacity: 0; } 100% { transform: none; opacity: 1; } } .wiz-pop { animation: wiz-pop 0.28s ease-out; } @keyframes wiz-nudge { 0%,100% { transform: translateX(0); } 50% { transform: translateX(3px); } } .wiz-nudge { display: inline-block; animation: wiz-nudge 1s ease-in-out infinite; }"}</style>
      <div style={frame} onClick={(e) => e.stopPropagation()} className="gp-sheet">
        {/* portrait + name plate sit on the dialogue box's top edge */}
        <div style={{ ...portrait, background: `radial-gradient(circle at 50% 30%, ${wizard.robe}, ${alpha(wizard.hat, 0.9)} 75%)` }} aria-hidden>
          <span style={{ fontSize: 44, lineHeight: 1, filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.45))" }}>🧙</span>
        </div>
        <div style={namePlate}>
          <div style={{ ...display(19, C.goldHi), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wizard.name}</div>
          <div style={{ fontWeight: 800, fontSize: 11.5, letterSpacing: 0.4, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wizard.title}</div>
        </div>
        <div style={{ position: "absolute", top: 50, right: 10, display: "flex", gap: 8, zIndex: 2 }}>
          <button type="button" onClick={toggleTalk} style={iconBtn} className="gp-press" aria-label={talk ? "Stop reading aloud" : "Read aloud"}>
            {talk ? "🔊" : "🔇"}
          </button>
          <button type="button" onClick={onClose} style={iconBtn} className="gp-press" aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ ...glass({ edge: wizard.robe, fill: "rgba(16,14,42,0.9)", blur: 12 }), ...box }}>
          <div style={lessonTag}>
            <span style={{ fontSize: 18 }}>{lesson.emoji}</span> <span>Today&apos;s lesson · {lesson.title}</span>
          </div>

          {/* already learned today */}
          {i === -1 && (
            <>
              <div style={bubble}>{wizard.farewell[0]} You&apos;ve learned today&apos;s lesson — come back tomorrow for a brand new one! ✨</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <GameButton variant="secondary" onClick={() => setI(1)}>
                  📖 Hear it again
                </GameButton>
                <GameButton onClick={onClose}>Bye! 👋</GameButton>
              </div>
            </>
          )}

          {step && step.kind !== "quiz" && step.kind !== "done" && (
            <>
              <div style={{ ...bubble, ...(step.kind !== "say" ? { ...cardStyle(step.kind === "try" ? C.success : C.gold, step.kind === "try" ? "rgba(20,60,44,0.6)" : "rgba(64,48,12,0.6)"), padding: "12px 14px" } : {}) }} key={i} className="wiz-pop">
                {step.kind === "try" && <b style={{ color: C.success }}>🪄 Try this today: </b>}
                {step.kind === "fact" && <b style={{ color: C.gold }}>🌟 Fun fact! </b>}
                {step.text}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {steps.slice(0, -1).map((_, k) => (
                    <span key={k} style={{ width: 8, height: 8, borderRadius: 2, transform: "rotate(45deg)", background: k <= i ? C.gold : "rgba(255,255,255,0.18)", boxShadow: k === i ? `0 0 8px ${C.gold}` : undefined }} />
                  ))}
                </div>
                <GameButton onClick={next}>
                  Next <span className="wiz-nudge">▶</span>
                </GameButton>
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
                  const lit = show && (picked === k || (right && picked === lesson.quiz!.answer));
                  const tone = lit ? (right ? C.success : C.danger) : "soft";
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={show && picked === lesson.quiz!.answer}
                      onClick={() => {
                        setPicked(k);
                        playSfx(right ? "correct" : "wrong");
                      }}
                      className="gp-press"
                      style={{ ...cardStyle(tone, lit ? alpha(right ? C.success : C.danger, 0.28) : "rgba(40,36,90,0.7)"), ...optBtn }}
                    >
                      <span style={{ ...display(15, C.gold), width: 24, flexShrink: 0 }}>{String.fromCharCode(65 + k)}</span>
                      {o}
                    </button>
                  );
                })}
              </div>
              {picked !== null && (
                <div style={{ fontWeight: 800, fontSize: 14, color: picked === lesson.quiz.answer ? C.success : "#ff9aa8", textAlign: "center" }}>
                  {picked === lesson.quiz.answer ? `✅ Yes! ${lesson.quiz.explain}` : "Not quite — have another go! 💪"}
                </div>
              )}
              {picked === lesson.quiz.answer && (
                <GameButton style={{ alignSelf: "center" }} onClick={next}>
                  Collect my card 📖
                </GameButton>
              )}
            </>
          )}

          {step?.kind === "done" && (
            <>
              <div style={{ ...cardStyle(wizard.robe, "rgba(40,30,90,0.85)"), ...cardReveal, boxShadow: `0 0 24px ${alpha(wizard.robe, 0.6)}` }} className="wiz-pop">
                <div style={{ fontSize: 46 }}>{lesson.emoji}</div>
                <div style={display(18)}>{lesson.title}</div>
                <div style={{ fontWeight: 800, fontSize: 12, color: C.gold, marginTop: 4 }}>New card for your Book of Wisdom!</div>
              </div>
              <div style={bubble}>{wizard.farewell[Math.floor(Math.random() * wizard.farewell.length)]}</div>
              <GameButton style={{ alignSelf: "center" }} onClick={onClose}>
                Thank you! 🌟
              </GameButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "16px 12px max(16px, env(safe-area-inset-bottom))",
  background: "linear-gradient(to top, rgba(5,4,18,0.6), rgba(5,4,18,0.1) 70%)",
  fontFamily: FONT.body,
};
const frame: React.CSSProperties = { position: "relative", width: "min(620px, 100%)", paddingTop: 40 };
const box: React.CSSProperties = { borderRadius: 20, padding: "48px 16px 16px", display: "flex", flexDirection: "column", gap: 12, maxHeight: "calc(86vh - 40px)", overflowY: "auto" };
const portrait: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 14,
  zIndex: 2,
  width: 78,
  height: 78,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "3px solid #ffd36b",
  boxShadow: "0 0 0 2px rgba(0,0,0,0.5), 0 0 18px rgba(255,211,107,0.5), 0 8px 16px rgba(0,0,0,0.5), inset 0 -6px 12px rgba(0,0,0,0.3)",
};
const namePlate: React.CSSProperties = {
  position: "absolute",
  top: 22,
  left: 84,
  zIndex: 1,
  padding: "6px 16px 6px 18px",
  borderRadius: "0 12px 12px 0",
  background: "linear-gradient(rgba(40,30,8,0.96), rgba(24,18,6,0.96)) padding-box, linear-gradient(90deg, #ffe9a8, #e89a1c) border-box",
  border: "1.5px solid transparent",
  boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
  maxWidth: "calc(100% - 196px)",
};
const iconBtn: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  border: "1.5px solid rgba(160,200,255,0.4)",
  background: "radial-gradient(circle at 50% 30%, rgba(90,86,160,0.8), rgba(20,18,50,0.9))",
  color: "#f5f3ff",
  boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
  fontSize: 17,
  cursor: "pointer",
  flexShrink: 0,
};
const lessonTag: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, paddingRight: 100, fontFamily: FONT.display, fontWeight: 400, letterSpacing: 0.4, fontSize: 14, color: C.cyan, textShadow: "0 0 10px rgba(94,242,255,0.35)" };
const bubble: React.CSSProperties = { fontWeight: 700, fontSize: 18.5, lineHeight: 1.45, color: C.text, padding: "2px 2px" };
const optBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, minHeight: 48, padding: "10px 14px", fontWeight: 800, fontSize: 16, textAlign: "left", cursor: "pointer" };
const cardReveal: React.CSSProperties = { alignSelf: "center", width: 210, padding: 16, textAlign: "center", borderRadius: 18 };
