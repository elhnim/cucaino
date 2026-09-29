"use client";

// Doodle Guess — like Quick, Draw! You get a word, 60 seconds, and a drawing pad. The AI
// peeks at your doodle every few seconds (after you lift your finger) and shouts out its
// guesses. Get it to say your word to score — faster = more points, streaks = bonus.
// 5 words a round, 2 sparks a round (charged after the AI's first look).
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Celebrate, ErrorBox, PrimaryButton, SecondaryButton, SparkNote, Thinking, readStat, safeAction, useBusy, useSparks, writeStat } from "../ui";

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

interface DoodleGuessProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function DoodleGuess({ kidId, sparksBalance }: DoodleGuessProps) {
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
    <div className="flex justify-center gap-2 mb-3" aria-label={`Word ${index + 1} of ${words.length}`}>
      {words.map((w, i) => {
        const r = results[i];
        return (
          <span
            key={i}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-lg font-black border-2 ${
              r ? (r.solved ? "bg-green-100 border-green-400" : "bg-rose-50 border-rose-200") : i === index ? "bg-white border-rose-400" : "bg-white border-gray-200"
            }`}
          >
            {r ? (r.solved ? "✅" : "❌") : i === index ? "✏️" : "·"}
          </span>
        );
      })}
    </div>
  );

  const roundScore = results.reduce((a, r) => a + r.points, 0);

  if (phase === "dealing") return <Thinking emoji="🎨" lines={["Sharpening the pencils…", "Picking your words…"]} />;

  if (phase === "ready" && current) {
    return (
      <div className="max-w-lg mx-auto">
        {progress()}
        <div className="bg-white rounded-3xl shadow-sm p-6 text-center mb-4">
          <p className="text-sm font-black uppercase tracking-wider text-gray-500">Word {index + 1} of {words.length}</p>
          <p className="text-lg font-bold text-gray-700 mt-2">Draw…</p>
          <p className="text-6xl my-3" aria-hidden>{current.emoji}</p>
          <p className="text-4xl font-black text-gray-900 capitalize">{current.word}</p>
          <p className="text-sm font-bold text-gray-500 mt-3">You have {DOODLE_SECONDS} seconds. The AI shouts guesses as you draw!</p>
        </div>
        {roundScore > 0 && <p className="text-center font-black text-gray-700 mb-3">Score so far: {roundScore}{g.current.streak > 1 ? ` · 🔥 ${g.current.streak} in a row` : ""}</p>}
        <PrimaryButton color="bg-rose-500 hover:bg-rose-600" onClick={beginWord}>
          ✏️ Go!
        </PrimaryButton>
      </div>
    );
  }

  if (phase === "drawing" && current) {
    const urgent = secondsLeft <= 10;
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-gray-500">Draw · {index + 1}/{words.length}</p>
            <p className="text-2xl font-black text-gray-900 capitalize truncate">{current.emoji} {current.word}</p>
          </div>
          <div className={`shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black border-4 ${urgent ? "border-rose-400 text-rose-600 bg-rose-50 animate-pulse" : "border-gray-200 text-gray-800 bg-white"}`} aria-label={`${secondsLeft} seconds left`}>
            {secondsLeft}
          </div>
        </div>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden mb-3">
          <div className={`h-full transition-all duration-300 ${urgent ? "bg-rose-500" : "bg-rose-400"}`} style={{ width: `${(secondsLeft / DOODLE_SECONDS) * 100}%` }} />
        </div>

        {/* the AI's live commentary */}
        <div className="bg-white rounded-2xl shadow-sm p-3 mb-3 min-h-[76px]" aria-live="polite">
          <div className="flex items-start gap-2">
            <span className={`text-3xl ${looking ? "animate-bounce" : ""}`} aria-hidden>🤖</span>
            <div className="flex-1 min-w-0">
              <p className="font-black text-gray-800 leading-snug">
                {lookError ?? (look?.line || (strokeCount === 0 ? "Start drawing — I'm watching! 👀" : looking ? "Ooh, let me look…" : "Hmm… keep going!"))}
              </p>
              {look && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {look.guesses.slice(0, 5).map((gs, i) => (
                    <span key={gs} className={`px-2.5 py-1 rounded-full text-sm font-bold ${i === look.matchIndex ? "bg-green-500 text-white" : i === 0 ? "bg-rose-100 text-rose-800" : "bg-gray-100 text-gray-600"}`}>
                      {gs}?
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-right text-xs font-bold text-gray-400 mt-1">{looking ? "👀 looking…" : `AI looks left: ${looksLeft}`}</p>
        </div>

        {fatal && <ErrorBox message={fatal} onRetry={FATAL.test(fatal) ? undefined : () => { g.current.errors = 0; setFatal(null); void sendLook(false); }} />}

        <div className="mx-auto" style={{ width: "min(100%, 58vh)" }}>
          <DoodleCanvas
            ref={canvas}
            color={color}
            width={SIZES[size].width}
            eraser={eraser}
            disabled={timeUp}
            onStrokeStart={strokeStart}
            onStrokeEnd={strokeEnd}
          />
        </div>

        {/* tools */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3" role="toolbar" aria-label="Colours">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.name}
              aria-pressed={!eraser && color === c.value}
              onClick={() => { setColor(c.value); setEraser(false); }}
              className={`w-10 h-10 rounded-full border-4 transition-transform active:scale-90 ${!eraser && color === c.value ? "border-gray-900 scale-110" : "border-white shadow"}`}
              style={{ background: c.value }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2" role="toolbar" aria-label="Brush">
          {SIZES.map((s, i) => (
            <button
              key={s.name}
              type="button"
              aria-label={`${s.name} brush`}
              aria-pressed={size === i}
              onClick={() => setSize(i)}
              className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center bg-white ${size === i ? "border-rose-400 bg-rose-50" : "border-gray-200"}`}
            >
              <span className="rounded-full" style={{ width: s.dot, height: s.dot, background: eraser ? "#d1d5db" : color }} />
            </button>
          ))}
          <button type="button" aria-pressed={eraser} onClick={() => setEraser(!eraser)} className={`h-12 px-3 rounded-xl border-2 font-bold bg-white ${eraser ? "border-rose-400 bg-rose-50" : "border-gray-200"}`}>
            🧽 Rub
          </button>
          <button type="button" onClick={() => canvas.current?.undo()} disabled={strokeCount === 0} className="h-12 px-3 rounded-xl border-2 border-gray-200 bg-white font-bold disabled:opacity-40">
            ↩️ Undo
          </button>
          <button type="button" onClick={() => canvas.current?.clear()} disabled={strokeCount === 0} className="h-12 px-3 rounded-xl border-2 border-gray-200 bg-white font-bold disabled:opacity-40">
            🗑️ Clear
          </button>
        </div>

        <div className="grid grid-cols-[2fr_1fr] gap-2 mt-4">
          <PrimaryButton color="bg-rose-500 hover:bg-rose-600" onClick={() => void done()} disabled={strokeCount === 0 && !timeUp}>
            {timeUp ? "⏰ Final look…" : "✋ Done — guess!"}
          </PrimaryButton>
          <SecondaryButton onClick={skip}>⏭ Skip</SecondaryButton>
        </div>
      </div>
    );
  }

  if (phase === "word-done") {
    const r = results[results.length - 1];
    const last = index + 1 >= words.length;
    return (
      <div className="max-w-lg mx-auto">
        {progress()}
        {r?.solved ? (
          <Celebrate title="The AI got it! 🎉" gradient="linear-gradient(160deg,#e11d48,#f43f5e 55%,#fda4af)">
            <p className="text-xl font-black capitalize">{r.emoji} {r.word} in {r.seconds}s</p>
            <p className="font-bold mt-1">+{r.points} points{g.current.streak > 1 ? ` · 🔥 ${g.current.streak} in a row!` : ""}</p>
          </Celebrate>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm p-5 text-center mb-4">
            <p className="text-4xl mb-1">🤔</p>
            <h2 className="text-2xl font-black text-gray-900">So close!</h2>
            <p className="text-gray-700 font-bold">It was <span className="capitalize">{r?.emoji} {r?.word}</span></p>
          </div>
        )}
        {r?.img && (
          <figure className="bg-white rounded-2xl shadow-sm p-3 mb-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.img} alt={`Your drawing of ${r.word}`} className="w-40 h-40 mx-auto rounded-xl border-2 border-gray-100" />
            <figcaption className="text-sm font-bold text-gray-600 mt-2">{r.caption}</figcaption>
          </figure>
        )}
        <PrimaryButton color="bg-rose-500 hover:bg-rose-600" onClick={nextWord}>
          {last ? "🏁 See my score" : "Next word ▶"}
        </PrimaryButton>
      </div>
    );
  }

  if (phase === "summary") {
    const solved = results.filter((r) => r.solved).length;
    const rank = doodleRank(roundScore, solved);
    return (
      <div className="max-w-xl mx-auto">
        <Celebrate title={`${rank.emoji} ${rank.title}`} gradient="linear-gradient(160deg,#e11d48,#f43f5e 55%,#fda4af)">
          <p className="text-4xl font-black">{roundScore} pts</p>
          <p className="font-bold mt-1">The AI guessed {solved} of {results.length} drawings</p>
          {newBest && <p className="font-black mt-2">🏆 New best score!</p>}
        </Celebrate>
        {!newBest && best > 0 && <p className="text-center text-sm font-bold text-gray-500 mb-3">🏆 Best ({difficulty}): {best}</p>}
        <Gallery items={results} title="This round" />
        {error && <ErrorBox message={error} />}
        <PrimaryButton color="bg-rose-500 hover:bg-rose-600" onClick={startRound} disabled={busy || !kidId || sparks < DOODLE_SPARK_COST}>
          🎨 Play again — {DOODLE_SPARK_COST} ⚡
        </PrimaryButton>
        <div className="mt-3">
          <SecondaryButton onClick={() => setPhase("idle")}>Change level</SecondaryButton>
        </div>
        <SparkNote cost={DOODLE_SPARK_COST} sparks={sparks} />
      </div>
    );
  }

  // idle
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🎨 Doodle Guess</h1>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-5 text-gray-700 font-bold space-y-1">
        <p>✏️ You get a word and {DOODLE_SECONDS} seconds to draw it.</p>
        <p>🤖 The AI peeks at your drawing and shouts out guesses.</p>
        <p>⚡ Make it say your word — faster = more points!</p>
        <p>🔥 {DOODLE_WORDS_PER_ROUND} words a round. Keep a streak for bonus points.</p>
      </div>

      <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Level</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => setDifficulty(l.value)}
            aria-pressed={difficulty === l.value}
            className={`min-h-[76px] px-2 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all ${
              difficulty === l.value ? "border-rose-400 bg-rose-50 text-rose-800" : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            <span className="text-2xl">{l.emoji}</span>
            <span className="font-black text-sm">{l.label}</span>
            <span className="text-[11px] font-bold opacity-70 leading-tight text-center">{l.blurb}</span>
          </button>
        ))}
      </div>

      {best > 0 && <p className="text-center text-sm font-bold text-gray-500 mb-3">🏆 Best ({difficulty}): {best}</p>}
      {error && <ErrorBox message={error} onRetry={sparks >= DOODLE_SPARK_COST ? startRound : undefined} />}
      <PrimaryButton color="bg-rose-500 hover:bg-rose-600" onClick={startRound} disabled={busy || !kidId || sparks < DOODLE_SPARK_COST}>
        Start a round — {DOODLE_SPARK_COST} ⚡
      </PrimaryButton>
      <SparkNote cost={DOODLE_SPARK_COST} sparks={sparks} />
      {gallery.length > 0 && <div className="mt-5"><Gallery items={gallery} title="🖼️ Your gallery (this session)" /></div>}
    </div>
  );
}

function Gallery({ items, title }: { items: WordResult[]; title: string }) {
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
      <p className="font-black text-gray-700 mb-3">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((r, i) => (
          <figure key={i} className={`rounded-xl border-2 p-2 text-center ${r.solved ? "border-green-300 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
            {r.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.img} alt={`Drawing of ${r.word}`} className="w-full aspect-square rounded-lg bg-white" />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-white flex items-center justify-center text-4xl">{r.emoji}</div>
            )}
            <figcaption className="mt-1.5">
              <span className="block font-black text-gray-900 capitalize text-sm">{r.solved ? "✅" : "❌"} {r.word}</span>
              <span className="block text-xs font-bold text-gray-500 leading-tight">{r.caption}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
