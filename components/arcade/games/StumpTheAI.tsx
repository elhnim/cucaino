"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { askStumpQuestion } from "@/lib/actions/arcade";
import { STUMP_MAX_GUESSES, STUMP_MAX_QUESTIONS, stumpProgress, type StumpAnswer, type StumpTurn } from "@/lib/arcade/rules";
import type { StumpMove } from "@/lib/arcade/validate";
import { playSfx } from "@/lib/audio/sound-manager";
import {
  ARC,
  ArcButton,
  ArcadeStage,
  Celebrate,
  ErrorBox,
  HowTo,
  PrimaryButton,
  SecondaryButton,
  SectionLabel,
  SparkNote,
  Thinking,
  Tile,
  panelStyle,
  readStat,
  safeAction,
  useBusy,
  useSparks,
  writeStat,
  type ArcVariant,
} from "../ui";

// Rules: think of something secret. The AI has 20 turns to find it; each question or
// guess uses a turn, and it only gets 3 guesses. Survive all that and you win!
// Look: a TV quiz-show stage — marquee lights, spotlights, the AI host at its podium.

type Phase = "idle" | "thinking" | "asking" | "guessing" | "ai_won" | "kid_won";

const CATEGORIES = [
  { label: "Animals", emoji: "🐾", value: "Animals" },
  { label: "Foods", emoji: "🍕", value: "Foods" },
  { label: "Household Items", emoji: "🏠", value: "Household Items" },
  { label: "Sports & Hobbies", emoji: "⚽", value: "Sports & Hobbies" },
  { label: "Characters", emoji: "⭐", value: "Cartoon & Story Characters" },
  { label: "Anything!", emoji: "🎲", value: "Anything!" },
];

const ANSWERS: { value: StumpAnswer; label: string; variant: ArcVariant }[] = [
  { value: "Yes", label: "✅ Yes", variant: "success" },
  { value: "No", label: "❌ No", variant: "danger" },
  { value: "Sometimes", label: "🤏 Sometimes", variant: "amber" },
  { value: "Not sure", label: "🤷 Not sure", variant: "slate" },
];

const COST = 3;

/** two crossing spotlight beams from the top of the stage */
const SPOTLIGHTS = [
  "conic-gradient(from 160deg at 18% -6%, transparent 0deg, rgba(255,233,168,0.16) 10deg, rgba(255,233,168,0.05) 26deg, transparent 34deg)",
  "conic-gradient(from 166deg at 82% -6%, transparent 0deg, rgba(94,242,255,0.14) 8deg, rgba(94,242,255,0.04) 24deg, transparent 32deg)",
].join(", ");

interface StumpTheAIProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function StumpTheAI(props: StumpTheAIProps) {
  return (
    <ArcadeStage tone="green" backdrop={SPOTLIGHTS}>
      <StumpInner {...props} />
    </ArcadeStage>
  );
}

function StumpInner({ kidId, sparksBalance }: StumpTheAIProps) {
  const [sparks, setSparks] = useSparks(sparksBalance);
  const [busy, run] = useBusy();
  const [phase, setPhase] = useState<Phase>("idle");
  const [category, setCategory] = useState("Animals");
  const [turns, setTurns] = useState<StumpTurn[]>([]);
  const [move, setMove] = useState<StumpMove | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ kid: 0, ai: 0 });

  useEffect(() => {
    setScore({ kid: readStat("stump:kid"), ai: readStat("stump:ai") });
  }, []);

  const bump = (who: "kid" | "ai") => {
    setScore((s) => {
      const next = { ...s, [who]: s[who] + 1 };
      writeStat(`stump:${who}`, next[who]);
      return next;
    });
  };

  /** ask the AI for its next move given the game so far */
  const ask = useCallback((history: StumpTurn[]) => run(async () => {
    setError(null);
    setPhase("thinking");
    const res = await safeAction(() => askStumpQuestion(category, history, kidId));
    if (!res.ok) {
      setError(res.error);
      setPhase(history.length === 0 ? "idle" : "asking");
      return;
    }
    setSparks(res.sparks);
    setMove(res.data);
    setPhase(res.data.type === "guess" ? "guessing" : "asking");
  }), [run, category, kidId, setSparks]);

  const start = () => {
    if (!kidId) return;
    setTurns([]);
    setMove(null);
    setSecret("");
    setRevealed(false);
    void ask([]);
  };

  const answer = (a: StumpAnswer) => {
    if (!move || busy) return;
    const next = [...turns, { kind: move.type, text: move.text, answer: a }];
    setTurns(next);
    if (move.type === "guess" && a === "Yes") {
      playSfx("wrong");
      bump("ai");
      setPhase("ai_won");
      return;
    }
    playSfx(move.type === "guess" ? "correct" : "tap");
    if (stumpProgress(next).kidWon) {
      playSfx("win");
      bump("kid");
      setPhase("kid_won");
      return;
    }
    void ask(next);
  };

  /** oops, tapped the wrong answer — take back the last one */
  const undo = () => {
    if (busy || turns.length === 0) return;
    const last = turns[turns.length - 1];
    setTurns(turns.slice(0, -1));
    setMove({ type: last.kind, text: last.text, reaction: "" });
    setError(null);
    setPhase(last.kind === "guess" ? "guessing" : "asking");
  };

  const progress = stumpProgress(turns);
  const guessesLeft = progress.guessesLeft;

  if (phase === "thinking") {
    return <Thinking emoji="🤖" lines={turns.length ? ["Hmm, let me think…", "Checking my brain files…", "Narrowing it down…"] : ["Getting ready to read your mind…"]} />;
  }

  if (phase === "ai_won") {
    return (
      <div>
        <div className="arc-pop" style={{ ...panelStyle(ARC.danger, "rgba(40,14,48,0.92)"), padding: "22px 16px", textAlign: "center", marginBottom: 16, boxShadow: "0 0 30px rgba(255,93,115,0.35), 0 10px 26px rgba(0,0,0,0.45)" }}>
          <Host size={92} />
          <h2 className="arc-display" style={{ fontSize: 34, margin: "12px 0 6px", color: "#fff", textShadow: "0 3px 0 rgba(0,0,0,0.45), 0 0 20px rgba(255,93,115,0.7)" }}>Got you!</h2>
          <p style={{ margin: 0, fontWeight: 800, lineHeight: 1.45 }}>
            I knew it was <strong className="arc-display" style={{ color: ARC.gold, fontSize: 22, textTransform: "capitalize" }}>{move?.text}</strong> — in {turns.length} {turns.length === 1 ? "turn" : "turns"}!
          </p>
          <p style={{ margin: "10px 0 0", fontWeight: 700, fontSize: 14, color: ARC.dim }}>Tip: pick something unusual — and remember I only get {STUMP_MAX_GUESSES} guesses.</p>
        </div>
        <Score score={score} />
        <PlayAgain onClick={start} disabled={busy || !kidId || sparks < COST} sparks={sparks} />
        <div style={{ marginTop: 14 }}><SecondaryButton onClick={() => setPhase("idle")}>Change category</SecondaryButton></div>
      </div>
    );
  }

  if (phase === "kid_won") {
    return (
      <div>
        <Celebrate title="YOU STUMPED ME! 🎉" accent={ARC.success}>
          <p style={{ margin: 0, lineHeight: 1.45 }}>
            {progress.left === 0 ? `I used all ${STUMP_MAX_QUESTIONS} turns and still don't know!` : `I used all ${STUMP_MAX_GUESSES} guesses and got them all wrong!`}
          </p>
          {!revealed ? (
            <form style={{ display: "flex", gap: 8, marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); if (secret.trim()) setRevealed(true); }}>
              <input
                type="text"
                value={secret}
                maxLength={40}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="So what was it?"
                aria-label="What was your secret?"
                className="arc-input"
                style={{ flex: 1, minWidth: 0 }}
              />
              <ArcButton type="submit" variant="gold" disabled={!secret.trim()}>
                Reveal
              </ArcButton>
            </form>
          ) : (
            <p className="arc-display arc-pop" style={{ fontSize: 24, margin: "14px 0 0", color: ARC.goldHi }}>It was {secret}! 🤯 Genius pick!</p>
          )}
        </Celebrate>
        <Score score={score} />
        <PlayAgain onClick={start} disabled={busy || !kidId || sparks < COST} sparks={sparks} />
        <div style={{ marginTop: 14 }}><SecondaryButton onClick={() => setPhase("idle")}>Change category</SecondaryButton></div>
      </div>
    );
  }

  if ((phase === "asking" || phase === "guessing") && move) {
    const turnNo = turns.length + 1;
    const guessing = phase === "guessing";
    return (
      <div>
        {/* scoreboard strip */}
        <div style={{ ...panelStyle(ARC.cyan, "rgba(8,10,30,0.92)"), padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: ARC.mute }}>TURN</p>
              <p className="arc-display" style={{ margin: 0, fontSize: 24, color: ARC.cyan, textShadow: `0 0 12px ${ARC.cyan}` }}>
                {Math.min(turnNo, STUMP_MAX_QUESTIONS)}<span style={{ color: ARC.mute, fontSize: 17 }}> / {STUMP_MAX_QUESTIONS}</span>
              </p>
            </div>
            <div style={{ textAlign: "right" }} aria-label={`${guessesLeft} guesses left`}>
              <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: ARC.mute }}>AI GUESSES</p>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} aria-hidden>
                {Array.from({ length: STUMP_MAX_GUESSES }, (_, i) => {
                  const lit = i < guessesLeft;
                  return (
                    <span key={i} style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: lit ? "radial-gradient(circle at 40% 35%, #ffb1bd, #ff5d73 60%, #a11a33)" : "rgba(255,255,255,0.08)", boxShadow: lit ? "0 0 12px rgba(255,93,115,0.75)" : "inset 0 0 0 1.5px rgba(255,255,255,0.14)", filter: lit ? "none" : "grayscale(1) opacity(.4)" }}>
                      🎯
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 3, marginTop: 10 }} aria-hidden>
            {Array.from({ length: STUMP_MAX_QUESTIONS }, (_, i) => {
              const used = i < turns.length;
              const now = i === turns.length;
              return (
                <span key={i} style={{ flex: 1, height: 8, borderRadius: 3, background: used ? ARC.success : now ? ARC.gold : "rgba(255,255,255,0.1)", boxShadow: used ? `0 0 6px ${ARC.success}` : now ? `0 0 8px ${ARC.gold}` : "none" }} />
              );
            })}
          </div>
        </div>

        {/* host + the big screen */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: -18, position: "relative", zIndex: 2 }}>
          <Host size={70} talking />
        </div>
        <div
          key={`${move.type}:${move.text}`}
          className="arc-pop"
          aria-live="polite"
          style={{
            ...panelStyle(guessing ? ARC.gold : ARC.cyan, guessing ? "rgba(58,36,6,0.94)" : "rgba(10,24,58,0.94)"),
            padding: "30px 18px 20px",
            marginBottom: 18,
            textAlign: "center",
            overflow: "hidden",
            boxShadow: guessing ? "0 0 34px rgba(255,211,107,0.5), 0 10px 26px rgba(0,0,0,0.45)" : "0 0 26px rgba(94,242,255,0.3), 0 10px 26px rgba(0,0,0,0.45)",
          }}
        >
          <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 4px)" }} />
          {guessing && <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(60% 80% at 50% 0%, rgba(255,233,168,0.3), transparent 70%)" }} />}
          <div style={{ position: "relative" }}>
            {move.reaction && <p style={{ margin: "0 0 8px", fontWeight: 800, fontSize: 14.5, color: guessing ? "#ffe9b8" : ARC.dim }}>{move.reaction}</p>}
            {guessing ? (
              <>
                <p className="arc-display" style={{ margin: "0 0 6px", fontSize: 18, letterSpacing: 2, color: ARC.gold }}>🤖 IS IT…</p>
                <p className="arc-display" style={{ margin: 0, fontSize: 36, color: "#fff", textTransform: "capitalize", textShadow: "0 3px 0 rgba(0,0,0,0.4), 0 0 20px rgba(255,211,107,0.8)" }}>{move.text}?</p>
              </>
            ) : (
              <p className="arc-display" style={{ margin: 0, fontSize: 25, color: "#fff", lineHeight: 1.25, textShadow: "0 2px 0 rgba(0,0,0,0.4), 0 0 14px rgba(94,242,255,0.45)" }}>{move.text}</p>
            )}
          </div>
        </div>

        {error && <ErrorBox message={error} onRetry={() => void ask(turns)} />}

        {!error && (guessing ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ArcButton variant="success" size="big" wrap onClick={() => answer("Yes")} disabled={busy} style={{ minHeight: 72 }}>
              ✅ Yes, you got it
            </ArcButton>
            <ArcButton variant="danger" size="big" wrap onClick={() => answer("No")} disabled={busy} style={{ minHeight: 72 }}>
              ❌ Nope!
            </ArcButton>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {ANSWERS.map((a) => (
              <ArcButton key={a.value} variant={a.variant} size="big" wrap onClick={() => answer(a.value)} disabled={busy} style={{ minHeight: 68 }}>
                {a.label}
              </ArcButton>
            ))}
          </div>
        ))}

        {turns.length > 0 && (
          <>
            <button type="button" onClick={undo} disabled={busy} style={{ display: "block", width: "100%", marginTop: 14, minHeight: 44, border: 0, background: "transparent", color: ARC.dim, fontWeight: 800, fontSize: 14, textDecoration: "underline", cursor: "pointer" }}>
              ↩️ Oops, undo my last answer
            </button>
            <details className="arc-details" style={{ ...panelStyle(), padding: 14, marginTop: 8 }}>
              <summary className="arc-display" style={{ fontSize: 17 }}>📋 What I know so far ({turns.length})</summary>
              <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6, fontSize: 14.5 }}>
                {turns.map((t, i) => (
                  <li key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 0", borderTop: i ? "1px solid rgba(160,190,255,0.12)" : undefined }}>
                    <span className="arc-display" style={{ width: 26, flexShrink: 0, color: ARC.mute }}>{i + 1}.</span>
                    <span style={{ flex: 1, fontWeight: 700, color: ARC.dim }}>{t.kind === "guess" ? `Guess: ${t.text}?` : t.text}</span>
                    <span style={{ fontWeight: 900, color: t.answer === "Yes" ? ARC.success : t.answer === "No" ? "#ff8b9c" : ARC.gold }}>{t.answer}</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    );
  }

  // idle
  return (
    <div>
      <Marquee>
        <span aria-hidden style={{ fontSize: 26 }}>🐾</span> STUMP THE AI
      </Marquee>
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 14px" }}>
        <Host size={96} podium />
      </div>
      <HowTo
        rules={[
          ["🤫", "Think of something secret (don't say it!)."],
          ["🤖", "The AI asks yes/no questions to work it out."],
          ["🎯", `It has ${STUMP_MAX_QUESTIONS} turns and only ${STUMP_MAX_GUESSES} guesses.`],
          ["🏆", "Survive them all to WIN!"],
        ]}
      />

      <SectionLabel>Pick a category</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {CATEGORIES.map((cat) => (
          <Tile key={cat.value} selected={category === cat.value} onClick={() => setCategory(cat.value)} style={{ minHeight: 58, padding: "0 12px", display: "flex", alignItems: "center", gap: 10, fontWeight: 900, fontSize: 15, textAlign: "left" }}>
            <span style={{ fontSize: 24 }} aria-hidden>{cat.emoji}</span>
            <span>{cat.label}</span>
          </Tile>
        ))}
      </div>

      {(score.kid > 0 || score.ai > 0) && <Score score={score} />}
      {error && <ErrorBox message={error} onRetry={sparks >= COST ? start : undefined} />}
      <PrimaryButton variant="success" onClick={start} disabled={busy || !kidId || sparks < COST}>
        I&apos;ve got one! Start — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
    </div>
  );
}

/** the AI host: a glowing robot head (optionally behind a show podium) */
function Host({ size, talking, podium }: { size: number; talking?: boolean; podium?: boolean }) {
  return (
    <div aria-hidden style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        className={talking ? "arc-bob" : "arc-wobble"}
        style={{ width: size, height: size, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.56, background: "radial-gradient(circle at 38% 30%, #9cf5c8, #1d8f64 58%, #0b3b2c)", boxShadow: `0 0 0 4px rgba(255,255,255,0.12), 0 0 ${size * 0.35}px rgba(79,227,160,0.65), inset 0 -${size * 0.08}px ${size * 0.14}px rgba(0,0,0,0.35)` }}
      >
        🤖
      </div>
      {podium && (
        <div style={{ marginTop: -6, width: size * 1.7, height: size * 0.5, borderRadius: "10px 10px 4px 4px", background: "linear-gradient(180deg, #3b2f9a, #1c1660)", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.2), 0 6px 14px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", borderTop: `3px solid ${ARC.gold}` }}>
          <span className="arc-display" style={{ fontSize: size * 0.2, color: ARC.gold, letterSpacing: 2, textShadow: `0 0 8px ${ARC.gold}` }}>HOST</span>
        </div>
      )}
    </div>
  );
}

/** a game-show title plate with chasing marquee bulbs */
function Marquee({ children }: { children: ReactNode }) {
  return (
    <div
      className="arc-pop"
      style={{
        padding: 9,
        borderRadius: 20,
        marginBottom: 6,
        background: `radial-gradient(circle, ${ARC.goldHi} 0 3px, rgba(255,211,107,0.25) 3.5px 5px, transparent 5.5px) 0 0/18px 18px, linear-gradient(180deg, #8a1f55, #4a0f33)`,
        animation: "arc-chase 1.2s linear infinite",
        boxShadow: "0 0 26px rgba(255,211,107,0.35), 0 10px 22px rgba(0,0,0,0.45)",
      }}
    >
      <h1
        className="arc-display"
        style={{ margin: 0, borderRadius: 13, padding: "14px 10px", textAlign: "center", fontSize: 32, color: ARC.goldHi, background: "linear-gradient(180deg, #2a1466, #140b3a)", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 0 20px rgba(0,0,0,0.5)", textShadow: `0 3px 0 rgba(0,0,0,0.5), 0 0 18px ${ARC.gold}` }}
      >
        {children}
      </h1>
    </div>
  );
}

function Score({ score }: { score: { kid: number; ai: number } }) {
  return (
    <div style={{ ...panelStyle(ARC.gold, "rgba(8,10,30,0.92)"), padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
      <span className="sr-only">Scoreboard: you {score.kid}, AI {score.ai}</span>
      <ScoreSide label="🧒 YOU" value={score.kid} color={ARC.success} />
      <span className="arc-display" style={{ fontSize: 26, color: ARC.mute }} aria-hidden>:</span>
      <ScoreSide label="AI 🤖" value={score.ai} color={ARC.danger} />
    </div>
  );
}

function ScoreSide({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 70 }} aria-hidden>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: 1.2, color: ARC.dim }}>{label}</p>
      <p className="arc-display" style={{ margin: 0, fontSize: 32, color, textShadow: `0 0 14px ${color}` }}>{value}</p>
    </div>
  );
}

function PlayAgain({ onClick, disabled, sparks }: { onClick: () => void; disabled: boolean; sparks: number }) {
  return (
    <>
      <PrimaryButton variant="success" onClick={onClick} disabled={disabled}>
        🎮 Rematch — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
    </>
  );
}
