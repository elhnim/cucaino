"use client";

// The engine for the clue-guessing game (What Am I?).
// Rules: clues arrive hardest-first. A wrong guess reveals the next clue. Once all 5
// clues are out you get 3 last tries. The fewer clues you need, the
// more points you score. Near-misses and typos are forgiven (lib/arcade/match.ts).
// Look: a glowing mystery box that the clues pop out of, one by one.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArcadeResult } from "@/lib/actions/arcade";
import { matchGuess } from "@/lib/arcade/match";
import { CLUE_COUNT, FINAL_TRIES, clueRank, cluePoints } from "@/lib/arcade/rules";
import type { ClueRound } from "@/lib/arcade/validate";
import { recentAnswers, rememberAnswer } from "@/lib/arcade/variety";
import { playSfx } from "@/lib/audio/sound-manager";
import {
  ARC,
  ArcButton,
  ArcadeStage,
  Celebrate,
  ErrorBox,
  GameTitle,
  HowTo,
  MissCard,
  Panel,
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
  type ArcTone,
  type ArcVariant,
} from "./ui";

type Phase = "idle" | "loading" | "playing" | "won" | "lost";

export interface ClueGameConfig {
  /** localStorage namespace for recent answers + stats */
  key: string;
  title: string;
  emoji: string;
  intro: string;
  loadingLines: string[];
  /** colour family for the game ("sky" = cyan mystery box, "amber" = gold) */
  tone: "sky" | "amber";
  /** kept for config compatibility (the dark theme uses `tone` for its glow) */
  gradient: string;
  categories?: { label: string; emoji: string; value: string }[];
  generate: (kidId: string, category: string, avoid: string[]) => Promise<ArcadeResult<ClueRound>>;
}

const TONE: Record<ClueGameConfig["tone"], { stage: ArcTone; btn: ArcVariant; accent: string }> = {
  sky: { stage: "cyan", btn: "cyan", accent: ARC.cyan },
  amber: { stage: "amber", btn: "amber", accent: "#ffc15e" },
};

const COST = 1;

export default function ClueGame(props: { kidId: string | null; sparksBalance: number; config: ClueGameConfig }) {
  return (
    <ArcadeStage tone={TONE[props.config.tone].stage}>
      <ClueGameInner {...props} />
    </ArcadeStage>
  );
}

function ClueGameInner({ kidId, sparksBalance, config }: { kidId: string | null; sparksBalance: number; config: ClueGameConfig }) {
  const t = TONE[config.tone];
  const [sparks, setSparks] = useSparks(sparksBalance);
  const [busy, run] = useBusy();
  const [phase, setPhase] = useState<Phase>("idle");
  const [category, setCategory] = useState(config.categories?.[0]?.value ?? "");
  const [round, setRound] = useState<ClueRound | null>(null);
  const [shown, setShown] = useState(1);
  const [triesLeft, setTriesLeft] = useState(FINAL_TRIES);
  const [wrong, setWrong] = useState<string[]>([]);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; tone: "close" | "wrong" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStreak(readStat(`${config.key}:streak`));
    setBest(readStat(`${config.key}:best`));
  }, [config.key]);

  const recentKey = config.categories ? `${config.key}:${category}` : config.key;

  const play = useCallback(() => run(async () => {
    if (!kidId) return;
    setError(null);
    setPhase("loading");
    const res = await safeAction(() => config.generate(kidId, category, recentAnswers(recentKey)));
    if (!res.ok) {
      setError(res.error);
      setPhase("idle");
      return;
    }
    setSparks(res.sparks);
    rememberAnswer(recentKey, res.data.answer, 25);
    setRound(res.data);
    setShown(1);
    setTriesLeft(FINAL_TRIES);
    setWrong([]);
    setGuess("");
    setFeedback(null);
    setPhase("playing");
    setTimeout(() => inputRef.current?.focus(), 50);
  }), [run, kidId, config, category, recentKey, setSparks]);

  const lose = () => {
    playSfx("wrong");
    setStreak(0);
    writeStat(`${config.key}:streak`, 0);
    setPhase("lost");
  };

  const submit = () => {
    if (!round || phase !== "playing") return;
    const g = guess.trim();
    if (!g) return;
    const verdict = matchGuess(g, round.answer, round.aliases);
    if (verdict === "correct") {
      const pts = cluePoints(shown);
      const s = streak + 1;
      playSfx("win");
      setPoints(pts);
      setStreak(s);
      writeStat(`${config.key}:streak`, s);
      if (pts > best) {
        setBest(pts);
        writeStat(`${config.key}:best`, pts);
      }
      setPhase("won");
      return;
    }
    if (verdict === "close") {
      playSfx("tap");
      setFeedback({ text: "Ooh, SO close! 👀 Check your spelling or be more exact.", tone: "close" });
      return;
    }
    setWrong((w) => (w.includes(g) ? w : [...w, g]));
    setGuess("");
    if (shown < CLUE_COUNT) {
      playSfx("wrong");
      setShown(shown + 1);
      setFeedback({ text: `Nope, not ${g}! Here's another clue 👇`, tone: "wrong" });
    } else if (triesLeft > 1) {
      playSfx("wrong");
      setTriesLeft(triesLeft - 1);
      setFeedback({ text: `Not ${g}! ${triesLeft - 1} ${triesLeft - 1 === 1 ? "try" : "tries"} left.`, tone: "wrong" });
    } else {
      lose();
    }
    inputRef.current?.focus();
  };

  const nextClue = () => {
    if (shown >= CLUE_COUNT) return;
    playSfx("tap");
    setShown(shown + 1);
    setFeedback(null);
  };

  if (phase === "loading") return <Thinking emoji={config.emoji} lines={config.loadingLines} />;

  if ((phase === "won" || phase === "lost") && round) {
    const rank = clueRank(points);
    return (
      <div>
        {phase === "won" ? (
          <Celebrate title="You got it! 🎉" accent={t.accent}>
            <p className="arc-pop" style={{ fontSize: 64, margin: "4px 0", lineHeight: 1 }}>{round.emoji}</p>
            <p className="arc-display" style={{ fontSize: 30, margin: 0, textTransform: "capitalize", color: "#fff" }}>{round.answer}</p>
            <p style={{ marginTop: 10, color: ARC.dim }}>
              Solved on clue {shown} · <span style={{ color: ARC.gold }}>{points} / {CLUE_COUNT} points</span> · {rank.emoji} {rank.title}
            </p>
            {streak > 1 && <p className="arc-display" style={{ fontSize: 20, marginTop: 6, color: ARC.fire }}>🔥 {streak} in a row!</p>}
          </Celebrate>
        ) : (
          <MissCard emoji={round.emoji} title="So close!">
            It was <strong className="arc-display" style={{ color: "#fff", fontSize: 22, textTransform: "capitalize" }}>{round.answer}</strong>
          </MissCard>
        )}
        {round.funFact && (
          <Panel edge={ARC.gold} style={{ marginBottom: 14 }} className="arc-rise">
            <p className="arc-display" style={{ margin: "0 0 6px", color: ARC.gold, fontSize: 16, letterSpacing: 1 }}>🤓 FUN FACT</p>
            <p style={{ margin: 0, lineHeight: 1.55, fontWeight: 700 }}>{round.funFact}</p>
          </Panel>
        )}
        <details className="arc-details" style={{ ...panelStyle(), padding: 14, marginBottom: 16 }}>
          <summary className="arc-display" style={{ fontSize: 18 }}>📦 See all 5 clues</summary>
          <ol style={{ margin: "10px 0 0", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.45, fontWeight: 700, color: ARC.dim }}>
            {round.clues.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </details>
        {best > 0 && <p style={{ textAlign: "center", fontWeight: 800, fontSize: 14, color: ARC.dim, margin: "0 0 12px" }}>🏆 Best score: <span style={{ color: ARC.gold }}>{best} / {CLUE_COUNT}</span></p>}
        {error && <ErrorBox message={error} />}
        <PrimaryButton variant={t.btn} onClick={play} disabled={busy || !kidId || sparks < COST}>
          🎮 Play again — {COST} ⚡
        </PrimaryButton>
        <div style={{ marginTop: 14 }}>
          <SecondaryButton onClick={() => { setRound(null); setPhase("idle"); }}>{config.categories ? "Change category" : "Back"}</SecondaryButton>
        </div>
        <SparkNote cost={COST} sparks={sparks} />
      </div>
    );
  }

  if (phase === "playing" && round) {
    const potential = cluePoints(shown);
    const firstLetterHint = shown >= CLUE_COUNT;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <MysteryBox size={64} open />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="arc-display" style={{ margin: 0, fontSize: 22, color: "#fff" }}>
              Clue {shown} <span style={{ color: ARC.mute }}>/ {CLUE_COUNT}</span>
            </p>
            {shown >= CLUE_COUNT && (
              <p style={{ margin: "2px 0 0", fontWeight: 800, fontSize: 14, color: ARC.fire }}>
                {triesLeft} {triesLeft === 1 ? "try" : "tries"} left
              </p>
            )}
          </div>
          <span
            className="arc-display"
            key={potential}
            style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 14, fontSize: 17, color: ARC.ink, background: `linear-gradient(180deg, ${ARC.goldHi}, ${ARC.gold} 50%, ${ARC.goldDeep})`, boxShadow: `0 3px 0 #9a5c00, 0 0 14px rgba(255,211,107,0.55)` }}
          >
            ⭐ {potential} pt{potential === 1 ? "" : "s"}
          </span>
        </div>

        <ol style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {round.clues.slice(0, shown).map((c, i) => {
            const latest = i === shown - 1;
            return (
              <li
                key={i}
                className={latest ? "arc-pop" : undefined}
                style={{
                  ...panelStyle(latest ? t.accent : undefined, latest ? "rgba(20,44,78,0.92)" : "rgba(24,21,62,0.7)"),
                  padding: "12px 14px",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  opacity: latest ? 1 : 0.85,
                  boxShadow: latest ? `0 0 22px color-mix(in srgb, var(--arc-accent) 40%, transparent), 0 8px 20px rgba(0,0,0,0.35)` : undefined,
                }}
              >
                <span
                  className="arc-display"
                  aria-hidden
                  style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: latest ? "#032a33" : ARC.text, background: latest ? "var(--arc-accent)" : "rgba(255,255,255,0.1)" }}
                >
                  {i + 1}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: latest ? "var(--arc-accent)" : ARC.mute, marginBottom: 2 }}>Clue {i + 1}</span>
                  <span style={{ lineHeight: 1.45, fontWeight: latest ? 800 : 700, fontSize: latest ? 18 : 15.5, color: latest ? "#fff" : ARC.dim }}>{c}</span>
                </span>
              </li>
            );
          })}
          {Array.from({ length: CLUE_COUNT - shown }, (_, k) => (
            <li
              key={`locked${k}`}
              aria-hidden
              style={{ borderRadius: 18, border: "2px dashed rgba(160,190,255,0.22)", padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, color: ARC.mute, fontWeight: 800, fontSize: 14 }}
            >
              <span>🔒</span> Clue {shown + k + 1} is still in the box…
            </li>
          ))}
        </ol>

        {firstLetterHint && (
          <div className="arc-pop" style={{ ...panelStyle(ARC.gold, "rgba(60,44,12,0.85)"), padding: 12, marginBottom: 12, textAlign: "center", fontWeight: 800, color: "#ffe9b8" }}>
            💡 Free hint: it starts with{" "}
            <strong className="arc-display" style={{ fontSize: 24, color: ARC.goldHi }}>&quot;{round.answer[0].toUpperCase()}&quot;</strong>
          </div>
        )}

        {feedback && (
          <div
            key={feedback.text}
            className={feedback.tone === "wrong" ? "arc-shake" : "arc-pop"}
            aria-live="polite"
            style={{ ...panelStyle(feedback.tone === "close" ? ARC.gold : ARC.danger, feedback.tone === "close" ? "rgba(60,44,12,0.88)" : "rgba(70,12,34,0.88)"), padding: 12, marginBottom: 12, textAlign: "center", fontWeight: 800, color: feedback.tone === "close" ? "#ffe9b8" : "#ffe1e6" }}
          >
            {feedback.text}
          </div>
        )}

        <form style={{ display: "flex", gap: 8, marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            ref={inputRef}
            type="text"
            value={guess}
            maxLength={40}
            onChange={(e) => { setGuess(e.target.value); if (feedback?.tone === "close") setFeedback(null); }}
            placeholder="Type your guess…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            aria-label="Your guess"
            className="arc-input"
            style={{ flex: 1, minWidth: 0 }}
          />
          <ArcButton type="submit" variant="gold" disabled={!guess.trim()}>
            Guess!
          </ArcButton>
        </form>

        {wrong.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {wrong.map((w) => (
              <span key={w} className="arc-chip" style={{ textDecoration: "line-through", color: "#ffb3c0", borderColor: "rgba(255,93,115,0.4)", background: "rgba(255,93,115,0.1)" }}>
                ✖ {w}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <SecondaryButton onClick={nextClue} disabled={shown >= CLUE_COUNT}>Next clue ▶ (−1)</SecondaryButton>
          <SecondaryButton onClick={lose}>🏳️ Give up</SecondaryButton>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <MysteryBox size={116} />
      </div>
      <GameTitle title={config.title} />
      <HowTo
        rules={[
          ["🤖", config.intro.replace(/^🤖\s*/, "")],
          ["🧩", "Clues start tricky and get easier."],
          ["❌", "A wrong guess shows the next clue."],
          ["⭐", "Solve it early for more points (5 max)!"],
        ]}
        footer={
          streak > 0 || best > 0 ? (
            <>
              {streak > 0 ? <span style={{ color: ARC.fire }}>🔥 Streak: {streak}</span> : ""}
              {streak > 0 && best > 0 ? " · " : ""}
              {best > 0 ? <span style={{ color: ARC.gold }}>🏆 Best: {best}/{CLUE_COUNT}</span> : ""}
            </>
          ) : undefined
        }
      />

      {config.categories && (
        <>
          <SectionLabel>What&apos;s in the box?</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {config.categories.map((cat) => (
              <Tile key={cat.value} selected={category === cat.value} onClick={() => setCategory(cat.value)} style={{ minHeight: 84, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontWeight: 900, fontSize: 16 }}>
                <span style={{ fontSize: 30 }} aria-hidden>{cat.emoji}</span>
                {cat.label}
              </Tile>
            ))}
          </div>
        </>
      )}

      {error && <ErrorBox message={error} onRetry={sparks >= COST ? play : undefined} />}
      <PrimaryButton variant={t.btn} onClick={play} disabled={busy || !kidId || sparks < COST}>
        🎁 Open the box — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
    </div>
  );
}

/** a glowing gift-wrapped mystery box (lid lifts + light spills out when `open`) */
function MysteryBox({ size, open }: { size: number; open?: boolean }) {
  const s = size;
  return (
    <div aria-hidden className={open ? undefined : "arc-wobble"} style={{ position: "relative", width: s, height: s, flexShrink: 0 }}>
      {/* light spilling out */}
      <div style={{ position: "absolute", left: "50%", top: open ? -s * 0.25 : s * 0.05, width: s * 1.4, height: s * 0.9, transform: "translateX(-50%)", background: "radial-gradient(50% 60% at 50% 70%, color-mix(in srgb, var(--arc-accent) 70%, transparent), transparent 70%)", opacity: open ? 0.9 : 0.55, filter: "blur(2px)" }} />
      {/* box body */}
      <div
        style={{
          position: "absolute",
          left: s * 0.08,
          right: s * 0.08,
          bottom: 0,
          height: s * 0.62,
          borderRadius: s * 0.08,
          background: "linear-gradient(135deg, #7c4dea, #4b2bb8 60%, #2e1a7a)",
          boxShadow: `inset 0 ${s * 0.04}px 0 rgba(255,255,255,0.25), inset 0 -${s * 0.05}px 0 rgba(0,0,0,0.25), 0 ${s * 0.06}px ${s * 0.14}px rgba(0,0,0,0.45), 0 0 ${s * 0.2}px color-mix(in srgb, var(--arc-accent) 45%, transparent)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: s * 0.14, transform: "translateX(-50%)", background: `linear-gradient(90deg, ${ARC.goldDeep}, ${ARC.goldHi}, ${ARC.goldDeep})` }} />
        <span className="arc-display" style={{ position: "relative", fontSize: s * 0.34, color: "#fff", textShadow: `0 0 ${s * 0.1}px var(--arc-accent), 0 2px 0 rgba(0,0,0,0.4)` }}>?</span>
      </div>
      {/* lid */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: open ? s * 0.02 : s * 0.26,
          height: s * 0.2,
          borderRadius: s * 0.06,
          background: "linear-gradient(180deg, #9a72ff, #6a3fe0)",
          boxShadow: `inset 0 ${s * 0.03}px 0 rgba(255,255,255,0.35), 0 ${s * 0.03}px ${s * 0.06}px rgba(0,0,0,0.35)`,
          transform: open ? "rotate(-14deg) translateX(-6%)" : "none",
          transformOrigin: "left bottom",
          transition: "all 400ms cubic-bezier(.3,1.5,.5,1)",
        }}
      >
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: s * 0.14, transform: "translateX(-50%)", background: `linear-gradient(90deg, ${ARC.goldDeep}, ${ARC.goldHi}, ${ARC.goldDeep})` }} />
        {/* bow */}
        <div style={{ position: "absolute", left: "50%", top: -s * 0.12, transform: "translateX(-50%)", fontSize: s * 0.2, lineHeight: 1 }}>🎀</div>
      </div>
    </div>
  );
}
