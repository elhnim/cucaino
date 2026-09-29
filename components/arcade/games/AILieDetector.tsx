"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { askLieDetectorQuestion } from "@/lib/actions/arcade";
import { LIE_MAX_QUESTIONS } from "@/lib/arcade/rules";
import type { LieMove } from "@/lib/arcade/validate";
import { playSfx } from "@/lib/audio/sound-manager";
import { Celebrate, ErrorBox, PrimaryButton, SparkNote, Thinking, readStat, useBusy, useSparks, writeStat, safeAction } from "../ui";

// Rules: write 2 truths and 1 lie about yourself. The AI detective asks up to 3
// questions, then accuses one statement. If it picks wrong, you fooled it!

type Phase = "setup" | "thinking" | "interview" | "caught" | "fooled";
type QA = { q: string; a: string };

const PLACEHOLDERS = [
  "e.g. I once found a starfish on the beach",
  "e.g. I can do a handstand for 10 seconds",
  "e.g. My favourite food is spicy noodles",
];
const STARTERS = ["I have been to", "I can", "I once", "My favourite", "I have never", "I own a"];

const COST = 2;
const MAX_LEN = 120;

interface AILieDetectorProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function AILieDetector({ kidId, sparksBalance }: AILieDetectorProps) {
  const [sparks, setSparks] = useSparks(sparksBalance);
  const [busy, run] = useBusy();
  const [phase, setPhase] = useState<Phase>("setup");
  const [statements, setStatements] = useState<[string, string, string]>(["", "", ""]);
  const [lie, setLie] = useState<1 | 2 | 3 | null>(null);
  const [qa, setQa] = useState<QA[]>([]);
  const [move, setMove] = useState<LieMove | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState({ fooled: 0, caught: 0 });
  const replyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setScore({ fooled: readStat("lie:fooled"), caught: readStat("lie:caught") });
  }, []);

  const clean = statements.map((s) => s.trim()) as [string, string, string];
  const ready = clean.every((s) => s.length >= 3) && lie !== null;

  const ask = useCallback((history: QA[]) => run(async () => {
    setError(null);
    setPhase("thinking");
    const res = await safeAction(() => askLieDetectorQuestion(clean, history, kidId));
    if (!res.ok) {
      setError(res.error);
      setPhase(history.length === 0 ? "setup" : "interview");
      return;
    }
    setSparks(res.sparks);
    setMove(res.data);
    if (res.data.type === "guess" && res.data.guess) {
      const caught = res.data.guess === lie;
      playSfx(caught ? "wrong" : "win");
      const key = caught ? "caught" : "fooled";
      setScore((s) => {
        const next = { ...s, [key]: s[key] + 1 };
        writeStat(`lie:${key}`, next[key]);
        return next;
      });
      setPhase(caught ? "caught" : "fooled");
    } else {
      setPhase("interview");
      setTimeout(() => replyRef.current?.focus(), 50);
    }
  }), [run, clean, kidId, lie, setSparks]);

  const start = () => {
    if (!ready || !kidId) return;
    setQa([]);
    setMove(null);
    setReply("");
    void ask([]);
  };

  const sendReply = () => {
    const a = reply.trim();
    if (!a || !move || move.type !== "question" || busy) return;
    const next = [...qa, { q: move.text, a }];
    setQa(next);
    setReply("");
    void ask(next);
  };

  const reset = () => {
    setStatements(["", "", ""]);
    setLie(null);
    setQa([]);
    setMove(null);
    setError(null);
    setPhase("setup");
  };

  if (phase === "thinking") {
    return <Thinking emoji="🕵️" lines={qa.length ? ["Analysing your answer…", "Checking for sweaty palms…", "Hmm, very interesting…"] : ["Switching on the lie detector…", "Reading your statements…"]} />;
  }

  if ((phase === "caught" || phase === "fooled") && move) {
    const accused = move.guess ?? 0;
    return (
      <div className="max-w-lg mx-auto">
        {phase === "fooled" ? (
          <Celebrate title="YOU FOOLED ME! 🎉" gradient="linear-gradient(160deg,#e11d48,#f43f5e 55%,#fda4af)">
            <p className="font-bold">I accused statement {accused}… but your lie was statement {lie}! Master of disguise! 🥸</p>
          </Celebrate>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm p-6 text-center mb-4">
            <p className="text-6xl mb-2">🕵️</p>
            <h2 className="text-2xl font-black text-gray-900 mb-1">CAUGHT YOU!</h2>
            <p className="text-gray-700">Statement {accused} was the lie!</p>
          </div>
        )}
        <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 mb-4">
          <p className="font-black text-rose-800 mb-1">🤖 {move.text}</p>
          {move.reason && <p className="text-gray-700">{move.reason}</p>}
        </div>
        <Statements statements={clean} lie={lie} accused={accused} />
        <p className="text-center font-black text-gray-700 my-4">Scoreboard: 🥸 Fooled the AI {score.fooled} · Caught {score.caught} 🕵️</p>
        <PrimaryButton color="bg-rose-500 hover:bg-rose-600" onClick={reset}>🎮 Play again</PrimaryButton>
      </div>
    );
  }

  if (phase === "interview" && move) {
    return (
      <div className="max-w-lg mx-auto">
        <Statements statements={clean} lie={null} accused={null} />
        <p className="text-center text-xs font-black uppercase tracking-wider text-gray-500 my-3">
          Question {Math.min(qa.length + 1, LIE_MAX_QUESTIONS)} of {LIE_MAX_QUESTIONS} · stay calm and don&apos;t give yourself away!
        </p>
        {qa.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {qa.map((x, i) => (
              <div key={i} className="text-sm">
                <p className="text-gray-500 font-bold">🤖 {x.q}</p>
                <p className="text-gray-800 font-bold pl-6">🧒 {x.a}</p>
              </div>
            ))}
          </div>
        )}
        <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 mb-4">
          <div className="flex items-start gap-2">
            <span className="text-2xl">🤖</span>
            <p className="text-gray-900 font-black text-lg leading-snug">{move.text}</p>
          </div>
        </div>
        {error && <ErrorBox message={error} onRetry={() => void ask(qa)} />}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); sendReply(); }}>
          <input
            ref={replyRef}
            type="text"
            value={reply}
            maxLength={MAX_LEN}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Your answer…"
            disabled={busy}
            enterKeyHint="send"
            className="flex-1 min-w-0 px-4 min-h-[52px] rounded-xl border-2 border-gray-200 text-gray-900 font-bold focus:outline-none focus:border-rose-400"
          />
          <button type="submit" disabled={!reply.trim() || busy} className="px-5 min-h-[52px] rounded-xl font-black text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-40">
            Answer
          </button>
        </form>
      </div>
    );
  }

  // setup
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🤥 AI Lie Detector</h1>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 text-gray-700 font-bold space-y-1">
        <p>✍️ Write 2 TRUE things and 1 LIE about yourself.</p>
        <p>🕵️ The AI asks up to {LIE_MAX_QUESTIONS} sneaky questions, then accuses one.</p>
        <p>🥸 If it picks wrong, you WIN! Tip: make the truths surprising and the lie boring.</p>
        <p className="text-xs text-gray-500">Keep it fun — don&apos;t write your address, school or full name.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              const i = statements.findIndex((x) => !x.trim());
              if (i < 0) return;
              const next = [...statements] as [string, string, string];
              next[i] = `${s} `;
              setStatements(next);
            }}
            className="min-h-[36px] px-3 rounded-full border-2 border-rose-200 bg-white text-rose-700 text-sm font-bold"
          >
            {s}…
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 mb-4">
        {([0, 1, 2] as const).map((i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const isLie = lie === n;
          return (
            <div key={i} className={`rounded-2xl border-2 p-3 bg-white ${isLie ? "border-rose-400" : "border-gray-200"}`}>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor={`lie-stmt-${i}`} className="text-xs font-black text-gray-500 uppercase tracking-wider">Statement {n}</label>
                <button
                  type="button"
                  onClick={() => setLie(n)}
                  className={`min-h-[36px] px-3 rounded-full text-xs font-black border-2 ${isLie ? "bg-rose-500 border-rose-500 text-white" : "border-gray-200 text-gray-500"}`}
                >
                  {isLie ? "🤥 This is my lie" : "Make this my lie"}
                </button>
              </div>
              <input
                id={`lie-stmt-${i}`}
                type="text"
                value={statements[i]}
                maxLength={MAX_LEN}
                onChange={(e) => {
                  const next = [...statements] as [string, string, string];
                  next[i] = e.target.value;
                  setStatements(next);
                }}
                placeholder={PLACEHOLDERS[i]}
                className="w-full px-3 min-h-[48px] rounded-xl border-2 border-gray-100 text-gray-900 font-medium focus:outline-none focus:border-rose-400"
              />
            </div>
          );
        })}
      </div>

      {!ready && <p className="text-center text-sm font-bold text-gray-500 mb-3">{lie === null ? "Fill in all 3, then tap “Make this my lie” on one." : "Fill in all 3 statements."}</p>}
      {error && <ErrorBox message={error} onRetry={ready && sparks >= COST ? start : undefined} />}
      <PrimaryButton color="bg-rose-500 hover:bg-rose-600" onClick={start} disabled={!ready || busy || !kidId || sparks < COST}>
        🕵️ Start the interview — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
      {(score.fooled > 0 || score.caught > 0) && (
        <p className="text-center font-black text-gray-700 mt-3">🥸 Fooled {score.fooled} · Caught {score.caught} 🕵️</p>
      )}
    </div>
  );
}

function Statements({ statements, lie, accused }: { statements: string[]; lie: number | null; accused: number | null }) {
  return (
    <div className="flex flex-col gap-2">
      {statements.map((s, i) => {
        const n = i + 1;
        const tag = lie === null ? null : n === lie ? "🤥 LIE" : "✅ True";
        return (
          <div key={i} className={`bg-white rounded-xl border-2 px-4 py-3 ${accused === n ? "border-rose-400" : "border-gray-200"}`}>
            <span className="text-xs font-black text-gray-500 uppercase tracking-wider flex justify-between mb-0.5">
              <span>Statement {n}{accused === n ? " · accused 👉" : ""}</span>
              {tag && <span>{tag}</span>}
            </span>
            <span className="text-gray-800 font-medium">{s}</span>
          </div>
        );
      })}
    </div>
  );
}
