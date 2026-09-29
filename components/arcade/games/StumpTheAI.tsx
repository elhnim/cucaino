"use client";

import { useCallback, useEffect, useState } from "react";
import { askStumpQuestion } from "@/lib/actions/arcade";
import { STUMP_MAX_GUESSES, STUMP_MAX_QUESTIONS, stumpProgress, type StumpAnswer, type StumpTurn } from "@/lib/arcade/rules";
import type { StumpMove } from "@/lib/arcade/validate";
import { playSfx } from "@/lib/audio/sound-manager";
import { Celebrate, ErrorBox, PrimaryButton, SecondaryButton, SparkNote, Thinking, readStat, useBusy, useSparks, writeStat, safeAction } from "../ui";

// Rules: think of something secret. The AI has 20 turns to find it; each question or
// guess uses a turn, and it only gets 3 guesses. Survive all that and you win!

type Phase = "idle" | "thinking" | "asking" | "guessing" | "ai_won" | "kid_won";

const CATEGORIES = [
  { label: "Animals", emoji: "🐾", value: "Animals" },
  { label: "Foods", emoji: "🍕", value: "Foods" },
  { label: "Household Items", emoji: "🏠", value: "Household Items" },
  { label: "Sports & Hobbies", emoji: "⚽", value: "Sports & Hobbies" },
  { label: "Characters", emoji: "⭐", value: "Cartoon & Story Characters" },
  { label: "Anything!", emoji: "🎲", value: "Anything!" },
];

const ANSWERS: { value: StumpAnswer; label: string; cls: string }[] = [
  { value: "Yes", label: "✅ Yes", cls: "bg-green-500 hover:bg-green-600" },
  { value: "No", label: "❌ No", cls: "bg-rose-500 hover:bg-rose-600" },
  { value: "Sometimes", label: "🤏 Sometimes", cls: "bg-amber-500 hover:bg-amber-600" },
  { value: "Not sure", label: "🤷 Not sure", cls: "bg-slate-500 hover:bg-slate-600" },
];

const COST = 3;

interface StumpTheAIProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function StumpTheAI({ kidId, sparksBalance }: StumpTheAIProps) {
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
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-3xl shadow-sm p-6 text-center mb-4">
          <p className="text-6xl mb-2">🤖</p>
          <h2 className="text-2xl font-black text-gray-900 mb-1">Got you!</h2>
          <p className="text-gray-700">
            I knew it was <strong className="text-gray-900">{move?.text}</strong> — in {turns.length} {turns.length === 1 ? "turn" : "turns"}!
          </p>
          <p className="text-sm font-bold text-gray-500 mt-2">Tip: pick something unusual — and remember I only get {STUMP_MAX_GUESSES} guesses.</p>
        </div>
        <Score score={score} />
        <PlayAgain onClick={start} disabled={busy || !kidId || sparks < COST} sparks={sparks} />
        <div className="mt-3"><SecondaryButton onClick={() => setPhase("idle")}>Change category</SecondaryButton></div>
      </div>
    );
  }

  if (phase === "kid_won") {
    return (
      <div className="max-w-lg mx-auto">
        <Celebrate title="YOU STUMPED ME! 🎉" gradient="linear-gradient(160deg,#16a34a,#22c55e 55%,#86efac)">
          <p className="font-bold">
            {progress.left === 0 ? `I used all ${STUMP_MAX_QUESTIONS} turns and still don't know!` : `I used all ${STUMP_MAX_GUESSES} guesses and got them all wrong!`}
          </p>
          {!revealed ? (
            <form className="flex gap-2 mt-4" onSubmit={(e) => { e.preventDefault(); if (secret.trim()) setRevealed(true); }}>
              <input
                type="text"
                value={secret}
                maxLength={40}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="So what was it?"
                className="flex-1 min-w-0 px-4 min-h-[48px] rounded-xl text-gray-900 font-bold focus:outline-none"
              />
              <button type="submit" disabled={!secret.trim()} className="px-4 min-h-[48px] rounded-xl font-black text-green-700 bg-white disabled:opacity-50">
                Reveal
              </button>
            </form>
          ) : (
            <p className="text-xl font-black mt-3">It was {secret}! 🤯 Genius pick!</p>
          )}
        </Celebrate>
        <Score score={score} />
        <PlayAgain onClick={start} disabled={busy || !kidId || sparks < COST} sparks={sparks} />
        <div className="mt-3"><SecondaryButton onClick={() => setPhase("idle")}>Change category</SecondaryButton></div>
      </div>
    );
  }

  if ((phase === "asking" || phase === "guessing") && move) {
    const turnNo = turns.length + 1;
    return (
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-2 text-sm font-black">
          <span className="text-gray-600">Turn {Math.min(turnNo, STUMP_MAX_QUESTIONS)} / {STUMP_MAX_QUESTIONS}</span>
          <span className="text-gray-600" aria-label={`${guessesLeft} guesses left`}>
            AI guesses: {"🎯".repeat(guessesLeft)}{"▫️".repeat(STUMP_MAX_GUESSES - guessesLeft)}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden mb-4">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(turns.length / STUMP_MAX_QUESTIONS) * 100}%` }} />
        </div>

        {phase === "guessing" ? (
          <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-6 mb-5 text-center">
            {move.reaction && <p className="text-sm font-bold text-green-700 mb-1">{move.reaction}</p>}
            <p className="text-sm font-black text-green-700 mb-2">🤖 Is it…</p>
            <p className="text-3xl font-black text-gray-900 capitalize">{move.text}?</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-5">
            {move.reaction && <p className="text-sm font-bold text-gray-500 mb-1">{move.reaction}</p>}
            <div className="flex items-start gap-3">
              <span className="text-3xl">🤖</span>
              <p className="text-xl font-black text-gray-900 leading-snug">{move.text}</p>
            </div>
          </div>
        )}

        {error && <ErrorBox message={error} onRetry={() => void ask(turns)} />}

        {!error && (phase === "guessing" ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => answer("Yes")} disabled={busy} className="min-h-[64px] rounded-2xl font-black text-white text-lg bg-green-500 hover:bg-green-600 active:scale-95 transition-all">
              ✅ Yes, you got it
            </button>
            <button type="button" onClick={() => answer("No")} disabled={busy} className="min-h-[64px] rounded-2xl font-black text-white text-lg bg-rose-500 hover:bg-rose-600 active:scale-95 transition-all">
              ❌ Nope!
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {ANSWERS.map((a) => (
              <button key={a.value} type="button" onClick={() => answer(a.value)} disabled={busy} className={`min-h-[60px] rounded-2xl font-black text-white text-lg active:scale-95 transition-all ${a.cls}`}>
                {a.label}
              </button>
            ))}
          </div>
        ))}

        {turns.length > 0 && (
          <>
            <button type="button" onClick={undo} disabled={busy} className="w-full mt-3 min-h-[40px] text-sm font-bold text-gray-500 underline">
              ↩️ Oops, undo my last answer
            </button>
            <details className="bg-white rounded-2xl shadow-sm p-4 mt-3">
              <summary className="font-black text-gray-700 cursor-pointer">What I know so far ({turns.length})</summary>
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {turns.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-black text-gray-400 w-6 shrink-0">{i + 1}.</span>
                    <span className="flex-1">{t.kind === "guess" ? `Guess: ${t.text}?` : t.text}</span>
                    <span className="font-black">{t.answer}</span>
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
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🐾 Stump The AI</h1>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-5 text-gray-700 font-bold space-y-1">
        <p>🤫 Think of something secret (don&apos;t say it!).</p>
        <p>🤖 The AI asks yes/no questions to work it out.</p>
        <p>🎯 It has {STUMP_MAX_QUESTIONS} turns and only {STUMP_MAX_GUESSES} guesses.</p>
        <p>🏆 Survive them all to WIN!</p>
      </div>

      <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Category</p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setCategory(cat.value)}
            className={`min-h-[52px] px-3 rounded-xl font-bold text-sm flex items-center gap-2 border-2 transition-all ${
              category === cat.value ? "border-green-400 bg-green-50 text-green-800" : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            <span className="text-xl">{cat.emoji}</span>
            <span className="text-left">{cat.label}</span>
          </button>
        ))}
      </div>

      {(score.kid > 0 || score.ai > 0) && <Score score={score} />}
      {error && <ErrorBox message={error} onRetry={sparks >= COST ? start : undefined} />}
      <PrimaryButton color="bg-green-500 hover:bg-green-600" onClick={start} disabled={busy || !kidId || sparks < COST}>
        I&apos;ve got one! Start — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
    </div>
  );
}

function Score({ score }: { score: { kid: number; ai: number } }) {
  return (
    <p className="text-center font-black text-gray-700 mb-4">
      Scoreboard: 🧒 You {score.kid} – {score.ai} AI 🤖
    </p>
  );
}

function PlayAgain({ onClick, disabled, sparks }: { onClick: () => void; disabled: boolean; sparks: number }) {
  return (
    <>
      <PrimaryButton color="bg-green-500 hover:bg-green-600" onClick={onClick} disabled={disabled}>
        🎮 Rematch — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
    </>
  );
}
