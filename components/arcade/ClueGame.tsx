"use client";

// The shared engine for the two clue-guessing games (What Am I? and Word Detective).
// Rules: clues arrive hardest-first. A wrong guess reveals the next clue. Once all 5
// clues are out you get 3 last tries. The fewer clues (and letter hints) you need, the
// more points you score. Near-misses and typos are forgiven (lib/arcade/match.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArcadeResult } from "@/lib/actions/arcade";
import { matchGuess } from "@/lib/arcade/match";
import { CLUE_COUNT, FINAL_TRIES, clueRank, cluePoints, maxLetterHints, pickRevealIndex, revealPattern } from "@/lib/arcade/rules";
import type { ClueRound } from "@/lib/arcade/validate";
import { recentAnswers, rememberAnswer } from "@/lib/arcade/variety";
import { playSfx } from "@/lib/audio/sound-manager";
import { Celebrate, ErrorBox, PrimaryButton, SecondaryButton, SparkNote, Thinking, readStat, useBusy, useSparks, writeStat, safeAction } from "./ui";

type Phase = "idle" | "loading" | "playing" | "won" | "lost";

export interface ClueGameConfig {
  /** localStorage namespace for recent answers + stats */
  key: string;
  title: string;
  emoji: string;
  intro: string;
  loadingLines: string[];
  /** tailwind colour stem, e.g. "sky" or "amber" (used in a few fixed class names below) */
  tone: "sky" | "amber";
  gradient: string;
  /** Word Detective: show letter blanks + allow letter hints */
  letterBlanks: boolean;
  categories?: { label: string; emoji: string; value: string }[];
  generate: (kidId: string, category: string, avoid: string[]) => Promise<ArcadeResult<ClueRound & { theme?: string }>>;
}

const TONE = {
  sky: { btn: "bg-sky-500 hover:bg-sky-600", ring: "focus:border-sky-400", chip: "border-sky-400 bg-sky-50 text-sky-800", clue: "border-sky-300 bg-sky-50" },
  amber: { btn: "bg-amber-500 hover:bg-amber-600", ring: "focus:border-amber-400", chip: "border-amber-400 bg-amber-50 text-amber-800", clue: "border-amber-300 bg-amber-50" },
} as const;

const COST = 1;

export default function ClueGame({ kidId, sparksBalance, config }: { kidId: string | null; sparksBalance: number; config: ClueGameConfig }) {
  const t = TONE[config.tone];
  const [sparks, setSparks] = useSparks(sparksBalance);
  const [busy, run] = useBusy();
  const [phase, setPhase] = useState<Phase>("idle");
  const [category, setCategory] = useState(config.categories?.[0]?.value ?? "");
  const [round, setRound] = useState<(ClueRound & { theme?: string }) | null>(null);
  const [shown, setShown] = useState(1);
  const [triesLeft, setTriesLeft] = useState(FINAL_TRIES);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
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
    setRevealed(new Set());
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
      const pts = cluePoints(shown, revealed.size);
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

  const revealLetter = () => {
    if (!round) return;
    const i = pickRevealIndex(round.answer, revealed);
    if (i < 0) return;
    playSfx("sparkle");
    setRevealed(new Set(revealed).add(i));
  };

  if (phase === "loading") return <Thinking emoji={config.emoji} lines={config.loadingLines} />;

  if ((phase === "won" || phase === "lost") && round) {
    const rank = clueRank(points);
    return (
      <div className="max-w-lg mx-auto">
        {phase === "won" ? (
          <Celebrate title="You got it! 🎉" gradient={config.gradient}>
            <p className="text-5xl my-2">{round.emoji}</p>
            <p className="text-2xl font-black capitalize">{round.answer}</p>
            <p className="font-bold mt-2">
              Solved on clue {shown} · {points} / {CLUE_COUNT} points · {rank.emoji} {rank.title}
            </p>
            {streak > 1 && <p className="font-black mt-1">🔥 {streak} in a row!</p>}
          </Celebrate>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm p-6 text-center mb-4">
            <p className="text-5xl mb-2">{round.emoji}</p>
            <h2 className="text-2xl font-black text-gray-900 mb-1">So close!</h2>
            <p className="text-gray-700">
              It was <strong className="text-gray-900 capitalize">{round.answer}</strong>
            </p>
          </div>
        )}
        {round.funFact && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
            <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-1">🤓 Fun fact</p>
            <p className="text-gray-800 leading-relaxed">{round.funFact}</p>
          </div>
        )}
        <details className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <summary className="font-black text-gray-700 cursor-pointer">See all 5 clues</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1 text-gray-700">
            {round.clues.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </details>
        {best > 0 && <p className="text-center text-sm font-bold text-gray-500 mb-3">🏆 Best score: {best} / {CLUE_COUNT}</p>}
        {error && <ErrorBox message={error} />}
        <PrimaryButton color={t.btn} onClick={play} disabled={busy || !kidId || sparks < COST}>
          🎮 Play again — {COST} ⚡
        </PrimaryButton>
        <div className="mt-3">
          <SecondaryButton onClick={() => { setRound(null); setPhase("idle"); }}>{config.categories ? "Change category" : "Back"}</SecondaryButton>
        </div>
        <SparkNote cost={COST} sparks={sparks} />
      </div>
    );
  }

  if (phase === "playing" && round) {
    const potential = cluePoints(shown, revealed.size);
    const hintsLeft = maxLetterHints(round.answer) - revealed.size;
    const firstLetterHint = !config.letterBlanks && shown >= CLUE_COUNT;
    return (
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-3 text-sm font-black">
          <span className="text-gray-600">Clue {shown} / {CLUE_COUNT}{shown >= CLUE_COUNT ? ` · ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left` : ""}</span>
          <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-800">⭐ worth {potential} pt{potential === 1 ? "" : "s"}</span>
        </div>

        {round.theme && <p className="text-center text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Case file: {round.theme}</p>}

        {config.letterBlanks && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-4" aria-label={`${round.answer.length} letters`}>
            {revealPattern(round.answer, revealed).map((ch, i) => (
              <span key={i} className={`w-9 h-11 rounded-lg flex items-center justify-center text-xl font-black ${ch === "_" ? "bg-white border-2 border-amber-200 text-transparent" : "bg-amber-400 text-white"}`}>
                {ch === "_" ? "·" : ch}
              </span>
            ))}
          </div>
        )}

        <ol className="flex flex-col gap-2 mb-4">
          {round.clues.slice(0, shown).map((c, i) => (
            <li key={i} className={`rounded-2xl p-4 border-2 ${i === shown - 1 ? t.clue : "border-gray-200 bg-white opacity-80"}`}>
              <span className="text-xs font-black text-gray-500 block mb-0.5">Clue {i + 1}</span>
              <span className={`text-gray-800 leading-relaxed ${i === shown - 1 ? "text-lg font-bold" : ""}`}>{c}</span>
            </li>
          ))}
        </ol>

        {firstLetterHint && (
          <p className="text-center font-bold text-gray-700 mb-3">
            💡 Free hint: it starts with <strong className="text-gray-900">&quot;{round.answer[0].toUpperCase()}&quot;</strong>
          </p>
        )}

        {feedback && (
          <div className={`rounded-xl p-3 mb-3 text-center font-bold ${feedback.tone === "close" ? "bg-yellow-50 border-2 border-yellow-300 text-yellow-800" : "bg-rose-50 border-2 border-rose-200 text-rose-700"}`} aria-live="polite">
            {feedback.text}
          </div>
        )}

        <form className="flex gap-2 mb-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
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
            className={`flex-1 min-w-0 px-4 min-h-[52px] rounded-xl border-2 border-gray-200 text-gray-900 text-lg font-bold focus:outline-none ${t.ring}`}
          />
          <button type="submit" disabled={!guess.trim()} className={`px-5 min-h-[52px] rounded-xl font-black text-white disabled:opacity-40 ${t.btn}`}>
            Guess!
          </button>
        </form>

        {wrong.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {wrong.map((w) => (
              <span key={w} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-sm font-bold line-through">{w}</span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={nextClue} disabled={shown >= CLUE_COUNT}>Next clue ▶ (−1)</SecondaryButton>
          {config.letterBlanks ? (
            <SecondaryButton onClick={revealLetter} disabled={hintsLeft <= 0 || pickRevealIndex(round.answer, revealed) < 0}>
              🔤 Letter ({hintsLeft}) −1
            </SecondaryButton>
          ) : (
            <SecondaryButton onClick={lose}>🏳️ Give up</SecondaryButton>
          )}
        </div>
        {config.letterBlanks && (
          <button type="button" onClick={lose} className="w-full mt-3 text-sm font-bold text-gray-500 underline min-h-[40px]">
            Give up and see the word
          </button>
        )}
      </div>
    );
  }

  // idle
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">{config.emoji} {config.title}</h1>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-5 text-gray-700 font-bold space-y-1">
        <p>{config.intro}</p>
        <p>🧩 Clues start tricky and get easier.</p>
        <p>❌ A wrong guess shows the next clue.</p>
        <p>⭐ Solve it early for more points (5 max)!</p>
        {(streak > 0 || best > 0) && (
          <p className="text-sm text-gray-500 pt-1">
            {streak > 0 ? `🔥 Streak: ${streak}` : ""}{streak > 0 && best > 0 ? " · " : ""}{best > 0 ? `🏆 Best: ${best}/${CLUE_COUNT}` : ""}
          </p>
        )}
      </div>

      {config.categories && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {config.categories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`min-h-[72px] rounded-2xl font-bold text-base flex flex-col items-center justify-center gap-1 border-2 transition-all ${
                category === cat.value ? t.chip : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              <span className="text-2xl">{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBox message={error} onRetry={sparks >= COST ? play : undefined} />}
      <PrimaryButton color={t.btn} onClick={play} disabled={busy || !kidId || sparks < COST}>
        Play — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
    </div>
  );
}
