"use client";

// Doodle Guess — like Quick, Draw! You get a word, 60 seconds, and a drawing pad. The AI
// peeks at your doodle every few seconds (after you lift your finger) and shouts out its
// guesses. Get it to say your word to score — faster = more points, streaks = bonus.
// 5 words a round, 2 sparks a round (charged after the AI's first look).
// Look: an artist's easel + sketchbook, with the AI as a glowing crystal ball.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { lookAtDoodle, startDoodleRound } from "@/lib/actions/arcade";
import {
  DOODLE_LOOK_EVERY_MS,
  DOODLE_MAX_CALLS_PER_WORD,
  DOODLE_SECONDS,
  DOODLE_SPARK_COST,
  DOODLE_WORDS_PER_ROUND,
  doodlePoints,
  doodleRank,
  type DoodleDifficulty,
} from "@/lib/arcade/doodle";
import { recentAnswers, rememberAnswer } from "@/lib/arcade/variety";
import { playSfx } from "@/lib/audio/sound-manager";
import DoodleCanvas, { type DoodleCanvasHandle } from "../DoodleCanvas";
import {
  ARC,
  ArcButton,
  ArcadeStage,
  Celebrate,
  ErrorBox,
  GameTitle,
  HowTo,
  MissCard,
  PAPER,
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
} from "../ui";

type Phase = "idle" | "dealing" | "ready" | "drawing" | "word-done" | "summary";

interface WordResult {
  word: string;
  emoji: string;
  solved: boolean;
  points: number;
  seconds: number;
  /** data: URL of the doodle */
  img: string | null;
  caption: string;
}

const LEVELS: { value: DoodleDifficulty; label: string; emoji: string; blurb: string }[] = [
  { value: "easy", label: "Easy", emoji: "🖍️", blurb: "cat, sun, pizza…" },
  { value: "medium", label: "Medium", emoji: "✏️", blurb: "turtle, rocket, rainbow…" },
  { value: "hard", label: "Hard", emoji: "🖌️", blurb: "carousel, tornado, dancing…" },
];

const COLORS = [
  { value: "#1f2937", name: "Black" },
  { value: "#ef4444", name: "Red" },
  { value: "#f97316", name: "Orange" },
  { value: "#facc15", name: "Yellow" },
  { value: "#22c55e", name: "Green" },
  { value: "#3b82f6", name: "Blue" },
  { value: "#a855f7", name: "Purple" },
  { value: "#92400e", name: "Brown" },
];

const SIZES = [
  { width: 0.012, dot: 8, name: "Thin" },
  { width: 0.024, dot: 14, name: "Medium" },
  { width: 0.05, dot: 22, name: "Thick" },
];

/** messages we can't draw our way out of — stop auto-looking and show them */
const FATAL = /sparks|expired|another player|sign in|player first|switch it on|setting it up|find your player/i;

const DOODLE_CSS = `
.arc-paint{flex:1 1 0;max-width:44px;min-width:30px;aspect-ratio:1/1;border-radius:999px;border:0;cursor:pointer;touch-action:manipulation;position:relative;
  box-shadow:inset 0 -4px 0 rgba(0,0,0,.25), inset 0 3px 0 rgba(255,255,255,.35), 0 3px 0 rgba(0,0,0,.35);transition:transform 130ms cubic-bezier(.3,1.6,.5,1), box-shadow 130ms;}
.arc-paint:active{transform:scale(.88);}
.arc-paint[aria-pressed="true"]{transform:scale(1.14) translateY(-2px);box-shadow:inset 0 -4px 0 rgba(0,0,0,.25), inset 0 3px 0 rgba(255,255,255,.35), 0 0 0 3px #fff, 0 0 0 5px rgba(0,0,0,.35), 0 0 16px var(--paint);}
.arc-tool{min-height:48px;min-width:48px;padding:0 12px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;touch-action:manipulation;
  border:2px solid rgba(160,190,255,.25);background:linear-gradient(180deg, rgba(64,60,130,.85), rgba(32,28,80,.9));color:${ARC.text};font-weight:900;font-size:14.5px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 3px 0 rgba(6,5,20,.8);transition:transform 110ms, border-color 150ms;}
.arc-tool:active:not(:disabled){transform:translateY(2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 1px 0 rgba(6,5,20,.8);}
.arc-tool[aria-pressed="true"]{border-color:var(--arc-accent);background:linear-gradient(180deg, rgba(160,50,110,.85), rgba(90,24,70,.9));box-shadow:0 0 14px color-mix(in srgb, var(--arc-accent) 55%, transparent), 0 3px 0 rgba(6,5,20,.8);}
.arc-tool:disabled{opacity:.45;cursor:not-allowed;}
@keyframes arc-orb-swirl{to{transform:rotate(360deg)}}
@keyframes arc-orb-glow{0%,100%{box-shadow:0 0 16px rgba(176,107,255,.7), 0 0 36px rgba(94,242,255,.25), inset 0 -8px 14px rgba(0,0,0,.45), inset 0 4px 10px rgba(255,255,255,.25)}50%{box-shadow:0 0 28px rgba(210,150,255,1), 0 0 54px rgba(94,242,255,.5), inset 0 -8px 14px rgba(0,0,0,.45), inset 0 4px 10px rgba(255,255,255,.3)}}
`;

interface DoodleGuessProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function DoodleGuess(props: DoodleGuessProps) {
  return (
    <ArcadeStage tone="rose" wide>
      <style>{DOODLE_CSS}</style>
      <DoodleGuessInner {...props} />
    </ArcadeStage>
  );
}

function DoodleGuessInner({ kidId, sparksBalance }: DoodleGuessProps) {
  const [sparks, setSparks] = useSparks(sparksBalance);
  const [busy, run] = useBusy();
  const [phase, setPhase] = useState<Phase>("idle");
  const [difficulty, setDifficulty] = useState<DoodleDifficulty>("easy");
  const [words, setWords] = useState<{ word: string; emoji: string }[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<WordResult[]>([]);
  const [gallery, setGallery] = useState<WordResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);

  // drawing phase
  const [secondsLeft, setSecondsLeft] = useState(DOODLE_SECONDS);
  const [look, setLook] = useState<{ guesses: string[]; line: string; matchIndex: number } | null>(null);
  const [looking, setLooking] = useState(false);
  const [looksLeft, setLooksLeft] = useState(DOODLE_MAX_CALLS_PER_WORD);
  const [lookError, setLookError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(1);
  const [eraser, setEraser] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [timeUp, setTimeUp] = useState(false);

  const canvas = useRef<DoodleCanvasHandle>(null);
  const token = useRef("");
  /** mutable per-word bookkeeping the timers read (never stale) */
  const g = useRef({
    index: 0,
    serial: 0,
    version: 0,
    sentVersion: 0,
    lastSentAt: 0,
    strokeEndAt: 0,
    startedAt: 0,
    deadline: 0,
    penDown: false,
    inflight: false,
    pendingDone: false,
    finished: false,
    errors: 0,
    looksLeft: DOODLE_MAX_CALLS_PER_WORD,
    previous: [] as string[],
    streak: 0,
  });

  useEffect(() => {
    setBest(readStat(`doodle:best:${difficulty}`));
  }, [difficulty]);

  const current = words[index];

  const startRound = () => run(async () => {
    if (!kidId) return;
    setError(null);
    setPhase("dealing");
    const res = await safeAction(() => startDoodleRound(kidId, difficulty, recentAnswers("doodle")));
    if (!res.ok) {
      setError(res.error);
      setPhase("idle");
      return;
    }
    token.current = res.data.token;
    for (const w of res.data.words) rememberAnswer("doodle", w.word, 40);
    setWords(res.data.words);
    setIndex(0);
    setResults([]);
    setNewBest(false);
    g.current.streak = 0;
    setPhase("ready");
  });

  const beginWord = () => {
    const now = Date.now();
    Object.assign(g.current, {
      index,
      serial: g.current.serial + 1,
      version: 0,
      sentVersion: 0,
      lastSentAt: 0,
      strokeEndAt: 0,
      startedAt: now,
      deadline: now + DOODLE_SECONDS * 1000,
      penDown: false,
      inflight: false,
      pendingDone: false,
      finished: false,
      errors: 0,
      looksLeft: DOODLE_MAX_CALLS_PER_WORD,
      previous: [],
    });
    setSecondsLeft(DOODLE_SECONDS);
    setLook(null);
    setLooking(false);
    setLooksLeft(DOODLE_MAX_CALLS_PER_WORD);
    setLookError(null);
    setFatal(null);
    setStrokeCount(0);
    setTimeUp(false);
    setEraser(false);
    playSfx("tap");
    setPhase("drawing");
  };

  const finishWord = useCallback((solved: boolean, caption: string, img?: string | null) => {
    const s = g.current;
    if (s.finished) return;
    s.finished = true;
    s.serial++; // ignore any look still in flight
    const w = words[s.index];
    if (!w) return;
    const left = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
    const points = solved ? doodlePoints(left, s.streak) : 0;
    s.streak = solved ? s.streak + 1 : 0;
    const png = img ?? canvas.current?.exportPng(256) ?? null;
    const result: WordResult = {
      word: w.word,
      emoji: w.emoji,
      solved,
      points,
      seconds: DOODLE_SECONDS - left,
      img: png ? `data:image/png;base64,${png}` : null,
      caption,
    };
    playSfx(solved ? "win" : "wrong");
    setResults((r) => [...r, result]);
    setGallery((gl) => [result, ...gl].slice(0, 30));
    setPhase("word-done");
  }, [words]);

  /** ask the AI to look at the drawing now */
  const sendLook = useCallback(async (final: boolean): Promise<void> => {
    const s = g.current;
    if (s.inflight || s.finished || s.looksLeft <= 0) return;
    const png = canvas.current?.exportPng(256);
    if (!png) {
      if (final) finishWord(false, "Nothing drawn — the AI saw a blank page!", null);
      return;
    }
    const serial = s.serial;
    const version = s.version;
    s.inflight = true;
    setLooking(true);
    const res = await safeAction(() =>
      lookAtDoodle({ kidId, token: token.current, wordIndex: s.index, imageBase64: png, previous: s.previous, final }),
    );
    s.inflight = false;
    setLooking(false);
    if (res.ok) {
      // keep the newest round token even if the word ended mid-look (skip / time up): it
      // carries charged=true, so dropping it would charge the round a second time
      token.current = res.data.token;
      setSparks(res.sparks);
    }
    if (serial !== s.serial) return; // word already over
    s.lastSentAt = Date.now();
    if (!res.ok) {
      s.errors++;
      if (FATAL.test(res.error) || s.errors >= 3) setFatal(res.error);
      else setLookError("The AI blinked 👀 — keep drawing!");
      if (final || s.pendingDone) {
        s.pendingDone = false;
        if (Date.now() >= s.deadline) finishWord(false, "The AI ran out of time to look!", png);
      }
      return;
    }
    s.errors = 0;
    s.sentVersion = version;
    setLookError(null);
    setFatal(null);
    s.looksLeft = res.data.looksLeft;
    s.previous = res.data.guesses;
    setLooksLeft(res.data.looksLeft);
    setLook({ guesses: res.data.guesses, line: res.data.line, matchIndex: res.data.matchIndex });
    if (res.data.matchIndex >= 0) {
      finishWord(true, `AI: “${res.data.guesses[res.data.matchIndex]}!”`, png);
      return;
    }
    playSfx("tap");
    const top = res.data.guesses[0];
    if (final || res.data.looksLeft <= 0) {
      finishWord(false, top ? `AI thought: ${top}` : "The AI was stumped!", png);
    } else if (s.pendingDone) {
      s.pendingDone = false;
      void doneRef.current();
    }
  }, [kidId, finishWord, setSparks]);

  /** the kid pressed Done (or time ran out): one final look if the drawing changed */
  const done = useCallback(async () => {
    const s = g.current;
    if (s.finished) return;
    if (s.inflight) {
      s.pendingDone = true;
      return;
    }
    if (s.looksLeft > 0 && s.version > s.sentVersion) {
      await sendLook(true);
      return;
    }
    const top = s.previous[0];
    finishWord(false, top ? `AI thought: ${top}` : "The AI was stumped!");
  }, [sendLook, finishWord]);
  const doneRef = useRef(done);
  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  // the clock + the auto-look pacer
  useEffect(() => {
    if (phase !== "drawing") return;
    const t = setInterval(() => {
      const s = g.current;
      if (s.finished) return;
      const now = Date.now();
      const left = Math.max(0, Math.ceil((s.deadline - now) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setTimeUp(true);
        void doneRef.current();
        return;
      }
      const ready =
        !s.inflight &&
        !s.penDown &&
        s.version > s.sentVersion &&
        s.errors < 3 &&
        s.looksLeft > 1 && // keep one look for "Done"
        now - s.startedAt >= 2_500 &&
        now - s.strokeEndAt >= 600 &&
        now - s.lastSentAt >= DOODLE_LOOK_EVERY_MS;
      if (ready) void sendLook(false);
    }, 250);
    return () => clearInterval(t);
  }, [phase, sendLook]);

  const nextWord = () => {
    if (index + 1 < words.length) {
      setIndex(index + 1);
      setPhase("ready");
      return;
    }
    const total = results.reduce((a, r) => a + r.points, 0);
    if (total > best) {
      setBest(total);
      setNewBest(true);
      writeStat(`doodle:best:${difficulty}`, total);
    }
    if (results.some((r) => r.solved)) playSfx("sparkle");
    setPhase("summary");
  };

  const skip = () => {
    const top = g.current.previous[0];
    finishWord(false, top ? `Skipped — AI thought: ${top}` : "Skipped!");
  };

  const strokeStart = () => {
    g.current.penDown = true;
    setLookError(null);
  };
  const strokeEnd = (count: number) => {
    const s = g.current;
    s.penDown = false;
    s.version++;
    s.strokeEndAt = Date.now();
    setStrokeCount(count);
  };

  const progress = () => (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 }} aria-label={`Word ${index + 1} of ${words.length}`}>
      {words.map((w, i) => {
        const r = results[i];
        const now = !r && i === index;
        const edge = r ? (r.solved ? ARC.success : ARC.danger) : now ? "var(--arc-accent)" : "rgba(160,190,255,0.25)";
        return (
          <span
            key={i}
            className={now ? "arc-pulse" : undefined}
            style={{ width: 38, height: 38, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, color: ARC.dim, border: `2.5px solid ${edge}`, background: r ? (r.solved ? "rgba(79,227,160,0.18)" : "rgba(255,93,115,0.14)") : "rgba(255,255,255,0.06)", boxShadow: r || now ? `0 0 12px ${r ? (r.solved ? "rgba(79,227,160,0.5)" : "rgba(255,93,115,0.35)") : "rgba(255,134,189,0.55)"}` : "none" }}
          >
            {r ? (r.solved ? "✅" : "❌") : now ? "✏️" : "·"}
          </span>
        );
      })}
    </div>
  );

  const roundScore = results.reduce((a, r) => a + r.points, 0);

  if (phase === "dealing") return <Thinking emoji="🎨" lines={["Sharpening the pencils…", "Picking your words…"]} />;

  if (phase === "ready" && current) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {progress()}
        <Sketchbook className="arc-pop" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", color: PAPER.inkSoft }}>Word {index + 1} of {words.length}</p>
          <p className="arc-display" style={{ margin: "8px 0 0", fontSize: 22, color: "#b0306b" }}>Draw…</p>
          <p className="arc-bob" style={{ fontSize: 72, margin: "8px 0", lineHeight: 1 }} aria-hidden>{current.emoji}</p>
          <p className="arc-display" style={{ margin: 0, fontSize: 44, color: PAPER.ink, textTransform: "capitalize", wordBreak: "break-word" }}>{current.word}</p>
          <p style={{ margin: "12px 0 0", fontSize: 14.5, fontWeight: 800, color: PAPER.inkSoft, lineHeight: 1.4 }}>You have {DOODLE_SECONDS} seconds. The AI shouts guesses as you draw!</p>
        </Sketchbook>
        {roundScore > 0 && (
          <p className="arc-display" style={{ textAlign: "center", fontSize: 19, margin: "0 0 14px", color: "#fff" }}>
            Score so far: <span style={{ color: ARC.gold }}>{roundScore}</span>
            {g.current.streak > 1 ? <span style={{ color: ARC.fire }}> · 🔥 {g.current.streak} in a row</span> : ""}
          </p>
        )}
        <PrimaryButton variant="rose" onClick={beginWord}>
          ✏️ Go!
        </PrimaryButton>
      </div>
    );
  }

  if (phase === "drawing" && current) {
    const urgent = secondsLeft <= 10;
    const pct = (secondsLeft / DOODLE_SECONDS) * 100;
    const ringColor = urgent ? ARC.danger : "#ff86bd";
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", color: ARC.gold }}>Draw · {index + 1}/{words.length}</p>
            <p className="arc-display" style={{ margin: 0, fontSize: 27, color: "#fff", textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 0 14px rgba(255,134,189,0.55)" }}>
              {current.emoji} {current.word}
            </p>
          </div>
          <div
            className={urgent ? "arc-pulse" : undefined}
            aria-label={`${secondsLeft} seconds left`}
            style={{ flexShrink: 0, width: 66, height: 66, borderRadius: 999, padding: 5, background: `conic-gradient(${ringColor} ${pct}%, rgba(255,255,255,0.1) 0)`, boxShadow: `0 0 16px ${urgent ? "rgba(255,93,115,0.7)" : "rgba(255,134,189,0.4)"}`, transition: "background 250ms linear" }}
          >
            <div className="arc-display" style={{ width: "100%", height: "100%", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 25, color: urgent ? "#ffb3c0" : "#fff", background: "radial-gradient(circle at 40% 30%, #2d2670, #120f33)" }}>
              {secondsLeft}
            </div>
          </div>
        </div>

        {/* the AI crystal ball + its shouted guesses */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, minHeight: 88 }} aria-live="polite">
          <CrystalBall looking={looking} />
          <div style={{ ...panelStyle("#c29bff", "rgba(34,22,78,0.92)"), flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 18 }}>
            <span aria-hidden style={{ position: "absolute", left: -8, top: 22, width: 14, height: 14, transform: "rotate(45deg)", background: "rgba(34,22,78,0.98)", borderLeft: "1.5px solid rgba(194,155,255,0.8)", borderBottom: "1.5px solid rgba(194,155,255,0.8)" }} />
            <p className="arc-display" style={{ margin: 0, fontSize: 18, lineHeight: 1.25, color: "#fff" }}>
              {lookError ?? (look?.line || (strokeCount === 0 ? "Start drawing — I'm watching! 👀" : looking ? "Ooh, let me look…" : "Hmm… keep going!"))}
            </p>
            {look && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {look.guesses.slice(0, 5).map((gs, i) => {
                  const hit = i === look.matchIndex;
                  const top = i === 0 && !hit;
                  return (
                    <span
                      key={gs}
                      className={`arc-chip ${i === 0 || hit ? "arc-pop" : ""}`}
                      style={hit ? { background: ARC.success, color: "#04261a", borderColor: "#9cf5c8", boxShadow: `0 0 12px ${ARC.success}` } : top ? { background: "rgba(255,134,189,0.22)", color: "#ffd6e8", borderColor: "rgba(255,134,189,0.7)" } : { color: ARC.dim }}
                    >
                      {gs}?
                    </span>
                  );
                })}
              </div>
            )}
            <p style={{ margin: "6px 0 0", textAlign: "right", fontSize: 12, fontWeight: 800, color: ARC.mute }}>{looking ? "🔮 peeking…" : `AI looks left: ${looksLeft}`}</p>
          </div>
        </div>

        {fatal && <ErrorBox message={fatal} onRetry={FATAL.test(fatal) ? undefined : () => { g.current.errors = 0; setFatal(null); void sendLook(false); }} />}

        {/* the easel */}
        <Easel>
          <DoodleCanvas
            ref={canvas}
            color={color}
            width={SIZES[size].width}
            eraser={eraser}
            disabled={timeUp}
            onStrokeStart={strokeStart}
            onStrokeEnd={strokeEnd}
          />
        </Easel>

        {/* tools: a paint palette + brushes */}
        <div style={{ ...panelStyle("#ff86bd", "rgba(26,22,64,0.9)"), padding: "12px 10px", marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "4px 2px" }} role="toolbar" aria-label="Colours">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                aria-pressed={!eraser && color === c.value}
                onClick={() => { setColor(c.value); setEraser(false); }}
                className="arc-paint"
                style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45), ${c.value} 45%)`, ["--paint" as string]: c.value } as CSSProperties}
              />
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 }} role="toolbar" aria-label="Brush">
            {SIZES.map((s, i) => (
              <button key={s.name} type="button" aria-label={`${s.name} brush`} aria-pressed={size === i} onClick={() => setSize(i)} className="arc-tool">
                <span style={{ width: s.dot, height: s.dot, borderRadius: 999, background: eraser ? "#d1d5db" : color, boxShadow: "0 0 0 2px rgba(255,255,255,0.7)" }} />
              </button>
            ))}
            <button type="button" aria-pressed={eraser} onClick={() => setEraser(!eraser)} className="arc-tool">
              🧽 Rub
            </button>
            <button type="button" onClick={() => canvas.current?.undo()} disabled={strokeCount === 0} className="arc-tool">
              ↩️ Undo
            </button>
            <button type="button" onClick={() => canvas.current?.clear()} disabled={strokeCount === 0} className="arc-tool">
              🗑️ Clear
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginTop: 16 }}>
          <ArcButton variant="rose" block wrap onClick={() => void done()} disabled={strokeCount === 0 && !timeUp} style={{ minHeight: 60 }}>
            {timeUp ? "⏰ Final look…" : "✋ Done — guess!"}
          </ArcButton>
          <ArcButton variant="glass" block onClick={skip} style={{ minHeight: 60 }}>
            ⏭ Skip
          </ArcButton>
        </div>
      </div>
    );
  }

  if (phase === "word-done") {
    const r = results[results.length - 1];
    const last = index + 1 >= words.length;
    return (
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {progress()}
        {r?.solved ? (
          <Celebrate title="The AI got it! 🎉" accent="#ff86bd">
            <p className="arc-display" style={{ fontSize: 24, margin: 0, color: "#fff" }}>{r.emoji} <span style={{ textTransform: "capitalize" }}>{r.word}</span> in {r.seconds}s</p>
            <p style={{ margin: "8px 0 0" }}>
              <span className="arc-display" style={{ fontSize: 22, color: ARC.gold }}>+{r.points} points</span>
              {g.current.streak > 1 ? <span style={{ color: ARC.fire }}> · 🔥 {g.current.streak} in a row!</span> : ""}
            </p>
          </Celebrate>
        ) : (
          <MissCard emoji="🤔" title="So close!">
            It was <span className="arc-display" style={{ fontSize: 22, color: "#fff", textTransform: "capitalize" }}>{r?.emoji} {r?.word}</span>
          </MissCard>
        )}
        {r?.img && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <Polaroid img={r.img} alt={`Your drawing of ${r.word}`} caption={r.caption} solved={r.solved} tilt={-2} big />
          </div>
        )}
        <PrimaryButton variant="rose" onClick={nextWord}>
          {last ? "🏁 See my score" : "Next word ▶"}
        </PrimaryButton>
      </div>
    );
  }

  if (phase === "summary") {
    const solved = results.filter((r) => r.solved).length;
    const rank = doodleRank(roundScore, solved);
    return (
      <div>
        <Celebrate title={`${rank.emoji} ${rank.title}`} accent="#ff86bd">
          <p className="arc-display" style={{ fontSize: 44, margin: 0, color: ARC.goldHi }}>{roundScore} pts</p>
          <p style={{ margin: "6px 0 0" }}>The AI guessed {solved} of {results.length} drawings</p>
          {newBest && <p className="arc-display arc-pop" style={{ margin: "8px 0 0", fontSize: 20, color: ARC.gold }}>🏆 New best score!</p>}
        </Celebrate>
        {!newBest && best > 0 && <p style={{ textAlign: "center", fontSize: 14, fontWeight: 800, color: ARC.dim, margin: "0 0 12px" }}>🏆 Best ({difficulty}): <span style={{ color: ARC.gold }}>{best}</span></p>}
        <Gallery items={results} title="🖼️ This round" />
        {error && <ErrorBox message={error} />}
        <PrimaryButton variant="rose" onClick={startRound} disabled={busy || !kidId || sparks < DOODLE_SPARK_COST}>
          🎨 Play again — {DOODLE_SPARK_COST} ⚡
        </PrimaryButton>
        <div style={{ marginTop: 14 }}>
          <SecondaryButton onClick={() => setPhase("idle")}>Change level</SecondaryButton>
        </div>
        <SparkNote cost={DOODLE_SPARK_COST} sparks={sparks} />
      </div>
    );
  }

  // idle
  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <GameTitle emoji="🎨" title="Doodle Guess" sub="Draw it. The crystal ball guesses it!" />
      <HowTo
        rules={[
          ["✏️", `You get a word and ${DOODLE_SECONDS} seconds to draw it.`],
          ["🔮", "The AI crystal ball peeks at your drawing and shouts out guesses."],
          ["⚡", "Make it say your word — faster = more points!"],
          ["🔥", `${DOODLE_WORDS_PER_ROUND} words a round. Keep a streak for bonus points.`],
        ]}
      />

      <SectionLabel>Level</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {LEVELS.map((l) => (
          <Tile key={l.value} selected={difficulty === l.value} onClick={() => setDifficulty(l.value)} style={{ minHeight: 96, padding: "8px 6px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, textAlign: "center" }}>
            <span style={{ fontSize: 28 }} aria-hidden>{l.emoji}</span>
            <span className="arc-display" style={{ fontSize: 18 }}>{l.label}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: ARC.dim, lineHeight: 1.2 }}>{l.blurb}</span>
          </Tile>
        ))}
      </div>

      {best > 0 && <p style={{ textAlign: "center", fontSize: 14, fontWeight: 800, color: ARC.dim, margin: "0 0 12px" }}>🏆 Best ({difficulty}): <span style={{ color: ARC.gold }}>{best}</span></p>}
      {error && <ErrorBox message={error} onRetry={sparks >= DOODLE_SPARK_COST ? startRound : undefined} />}
      <PrimaryButton variant="rose" onClick={startRound} disabled={busy || !kidId || sparks < DOODLE_SPARK_COST}>
        Start a round — {DOODLE_SPARK_COST} ⚡
      </PrimaryButton>
      <SparkNote cost={DOODLE_SPARK_COST} sparks={sparks} />
      {gallery.length > 0 && <div style={{ marginTop: 22 }}><Gallery items={gallery} title="🖼️ Your gallery (this session)" /></div>}
    </div>
  );
}

/** the glowing AI crystal ball on its little gold stand */
function CrystalBall({ looking }: { looking: boolean }) {
  return (
    <div aria-hidden style={{ flexShrink: 0, width: 70, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={{
          position: "relative",
          width: 64,
          height: 64,
          borderRadius: 999,
          overflow: "hidden",
          background: "radial-gradient(circle at 50% 60%, #b06bff, #5a2fc8 58%, #1b0f4a)",
          animation: `arc-orb-glow ${looking ? 0.7 : 2.4}s ease-in-out infinite`,
        }}
      >
        <div style={{ position: "absolute", inset: -10, background: "conic-gradient(from 0deg, transparent, rgba(94,242,255,0.55), transparent 35%, rgba(255,134,189,0.5), transparent 70%)", filter: "blur(6px)", animation: `arc-orb-swirl ${looking ? 0.9 : 5}s linear infinite` }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, filter: "drop-shadow(0 0 6px rgba(255,255,255,0.7))" }}>{looking ? "👀" : "🤖"}</div>
        <div style={{ position: "absolute", left: 12, top: 9, width: 18, height: 11, borderRadius: 999, background: "rgba(255,255,255,0.7)", transform: "rotate(-30deg)", filter: "blur(1px)" }} />
      </div>
      <div style={{ marginTop: -4, width: 46, height: 14, borderRadius: "4px 4px 8px 8px", background: `linear-gradient(180deg, ${ARC.goldHi}, ${ARC.goldDeep})`, boxShadow: "0 3px 0 #8a5200, 0 4px 8px rgba(0,0,0,0.4)" }} />
    </div>
  );
}

/** a wooden easel frame around the drawing paper */
function Easel({ children }: { children: ReactNode }) {
  const wood = "linear-gradient(90deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 9px), linear-gradient(180deg, #b27a45, #8a5528 55%, #6b3f1c)";
  return (
    <div style={{ position: "relative", margin: "0 auto", width: "min(100%, 58vh)", paddingBottom: 26 }}>
      {/* legs */}
      <span aria-hidden style={{ position: "absolute", bottom: 0, left: "14%", width: 12, height: "40%", borderRadius: 4, background: wood, transform: "rotate(9deg)", transformOrigin: "top", boxShadow: "0 4px 8px rgba(0,0,0,0.4)" }} />
      <span aria-hidden style={{ position: "absolute", bottom: 0, right: "14%", width: 12, height: "40%", borderRadius: 4, background: wood, transform: "rotate(-9deg)", transformOrigin: "top", boxShadow: "0 4px 8px rgba(0,0,0,0.4)" }} />
      <div style={{ position: "relative", padding: 10, borderRadius: 12, background: wood, boxShadow: "inset 0 2px 0 rgba(255,220,170,0.35), inset 0 -3px 0 rgba(0,0,0,0.25), 0 12px 28px rgba(0,0,0,0.5), 0 0 30px rgba(255,134,189,0.18)" }}>
        {/* clip */}
        <span aria-hidden style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)", width: 56, height: 18, borderRadius: 6, zIndex: 2, background: "linear-gradient(180deg, #e8ecf5, #9aa3b8)", boxShadow: "0 3px 6px rgba(0,0,0,0.4), inset 0 1px 0 #fff" }} />
        {children}
      </div>
      {/* ledge */}
      <span aria-hidden style={{ position: "absolute", left: -6, right: -6, bottom: 18, height: 12, borderRadius: 4, background: wood, boxShadow: "0 5px 10px rgba(0,0,0,0.4)" }} />
    </div>
  );
}

/** cream sketchbook page with spiral rings along the top */
function Sketchbook({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={className} style={{ position: "relative", paddingTop: 14, ...style }}>
      <div aria-hidden style={{ position: "absolute", top: 0, left: 22, right: 22, height: 28, zIndex: 2, background: "radial-gradient(circle at 50% 60%, transparent 0 5px, #c8ccd8 5.5px 8px, transparent 8.5px) 0 0/26px 28px", filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.45))" }} />
      <div
        style={{
          borderRadius: 18,
          padding: "30px 18px 22px",
          textAlign: "center",
          color: PAPER.ink,
          background: `linear-gradient(rgba(120,150,210,0.14) 1px, transparent 1px) 0 12px/100% 28px, linear-gradient(180deg, #fffdf7, ${PAPER.cream})`,
          boxShadow: "0 0 0 3px rgba(255,134,189,0.5), 0 14px 30px rgba(0,0,0,0.5), 0 0 30px rgba(255,134,189,0.25), inset 0 -8px 20px rgba(150,110,60,0.12)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Polaroid({ img, alt, caption, solved, tilt = 0, big }: { img: string | null; alt: string; caption: ReactNode; solved: boolean; tilt?: number; big?: boolean }) {
  return (
    <figure className="arc-pop" style={{ margin: 0, position: "relative", width: big ? 200 : "100%", padding: "10px 10px 12px", background: "#fffdf8", borderRadius: 6, rotate: `${tilt}deg`, boxShadow: solved ? `0 0 0 3px ${ARC.gold}, 0 0 18px rgba(255,211,107,0.55), 0 10px 20px rgba(0,0,0,0.45)` : "0 10px 20px rgba(0,0,0,0.45)" }}>
      <span aria-hidden style={{ position: "absolute", top: -9, left: "50%", width: 64, height: 18, transform: "translateX(-50%) rotate(-3deg)", background: "rgba(255,210,230,0.75)", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={alt} style={{ display: "block", width: "100%", aspectRatio: "1 / 1", borderRadius: 2, background: "#fff", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }} />
      ) : null}
      <figcaption style={{ marginTop: 8, textAlign: "center", fontSize: 13, fontWeight: 800, lineHeight: 1.3, color: PAPER.inkSoft }}>{caption}</figcaption>
    </figure>
  );
}

function Gallery({ items, title }: { items: WordResult[]; title: string }) {
  if (!items.length) return null;
  return (
    <div style={{ ...panelStyle("#ff86bd", "rgba(34,20,60,0.9)"), padding: "14px 12px 18px", marginBottom: 16 }}>
      <p className="arc-display" style={{ margin: "0 0 16px", fontSize: 19, color: "#fff" }}>{title}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 16 }}>
        {items.map((r, i) =>
          r.img ? (
            <Polaroid
              key={i}
              img={r.img}
              alt={`Drawing of ${r.word}`}
              solved={r.solved}
              tilt={[-2.5, 1.8, -1.2, 2.4][i % 4]}
              caption={
                <>
                  <span className="arc-display" style={{ display: "block", fontSize: 15, color: PAPER.ink, textTransform: "capitalize" }}>{r.solved ? "✅" : "❌"} {r.word}</span>
                  <span style={{ display: "block", fontSize: 12 }}>{r.caption}</span>
                </>
              }
            />
          ) : (
            <figure key={i} style={{ margin: 0, padding: 10, borderRadius: 6, background: "#fffdf8", textAlign: "center", rotate: `${[-2.5, 1.8, -1.2, 2.4][i % 4]}deg`, boxShadow: "0 10px 20px rgba(0,0,0,0.45)" }}>
              <div style={{ width: "100%", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, background: "#fff" }}>{r.emoji}</div>
              <figcaption style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: PAPER.inkSoft }}>
                <span className="arc-display" style={{ display: "block", fontSize: 15, color: PAPER.ink, textTransform: "capitalize" }}>{r.solved ? "✅" : "❌"} {r.word}</span>
                {r.caption}
              </figcaption>
            </figure>
          ),
        )}
      </div>
    </div>
  );
}
