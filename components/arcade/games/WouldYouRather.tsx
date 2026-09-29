"use client";

import { useCallback, useState } from "react";
import { generateWouldYouRather } from "@/lib/actions/arcade";
import { recentAnswers, rememberAnswer } from "@/lib/arcade/variety";
import { wyrVerdict } from "@/lib/arcade/rules";
import type { WyrRound } from "@/lib/arcade/validate";
import { playSfx } from "@/lib/audio/sound-manager";
import { Celebrate, ErrorBox, PrimaryButton, SparkNote, Thinking, useBusy, useSparks, safeAction } from "../ui";

// Rules: 5 dilemmas per pack. Pick one — then the AI tries to talk you out of it.
// Stick with your choice and you win the round; get talked round and the AI wins it.

type Phase = "idle" | "loading" | "pick" | "argue" | "summary";

interface KidPick {
  round: WyrRound;
  side: "a" | "b";
  stuck: boolean;
}

interface WouldYouRatherProps {
  kidId: string | null;
  sparksBalance: number;
}

const COST = 2;

export default function WouldYouRather({ kidId, sparksBalance }: WouldYouRatherProps) {
  const [sparks, setSparks] = useSparks(sparksBalance);
  const [busy, run] = useBusy();
  const [phase, setPhase] = useState<Phase>("idle");
  const [rounds, setRounds] = useState<WyrRound[]>([]);
  const [idx, setIdx] = useState(0);
  const [side, setSide] = useState<"a" | "b" | null>(null);
  const [picks, setPicks] = useState<KidPick[]>([]);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => run(async () => {
    if (!kidId) return;
    setError(null);
    setPhase("loading");
    const res = await safeAction(() => generateWouldYouRather(kidId, recentAnswers("would-you-rather")));
    if (!res.ok) {
      setError(res.error);
      setPhase("idle");
      return;
    }
    setSparks(res.sparks);
    for (const r of res.data.rounds) rememberAnswer("would-you-rather", `${r.a} / ${r.b}`, 30);
    setRounds(res.data.rounds);
    setIdx(0);
    setPicks([]);
    setSide(null);
    setPhase("pick");
  }), [run, kidId, setSparks]);

  const choose = (s: "a" | "b") => {
    playSfx("tap");
    setSide(s);
    setPhase("argue");
  };

  const decide = (stuck: boolean) => {
    const round = rounds[idx];
    if (!round || !side) return;
    // "switch" flips the final side
    const finalSide: "a" | "b" = stuck ? side : side === "a" ? "b" : "a";
    playSfx(stuck ? "correct" : "wrong");
    const next = [...picks, { round, side: finalSide, stuck }];
    setPicks(next);
    setSide(null);
    if (idx + 1 >= rounds.length) {
      playSfx("win");
      setPhase("summary");
    } else {
      setIdx(idx + 1);
      setPhase("pick");
    }
  };

  const held = picks.filter((p) => p.stuck).length;

  if (phase === "loading") {
    return <Thinking emoji="🤷" lines={["Cooking up impossible choices…", "Sharpening my arguments…", "Making it EXTRA tricky…"]} />;
  }

  const round = rounds[idx];

  if (phase === "pick" && round) {
    return (
      <div className="max-w-lg mx-auto">
        <Scoreboard idx={idx} total={rounds.length} held={held} ai={picks.length - held} />
        <h2 className="text-2xl font-black text-center text-gray-900 mb-4">Would you rather…</h2>
        <div className="flex flex-col gap-3">
          <OptionButton emoji={round.emojiA} text={round.a} tone="orange" onClick={() => choose("a")} />
          <div className="text-center text-gray-400 font-black text-lg">— OR —</div>
          <OptionButton emoji={round.emojiB} text={round.b} tone="sky" onClick={() => choose("b")} />
        </div>
      </div>
    );
  }

  if (phase === "argue" && round && side) {
    const chosen = side === "a" ? round.a : round.b;
    const other = side === "a" ? round.b : round.a;
    const otherEmoji = side === "a" ? round.emojiB : round.emojiA;
    const pitch = side === "a" ? round.forB : round.forA;
    return (
      <div className="max-w-lg mx-auto">
        <Scoreboard idx={idx} total={rounds.length} held={held} ai={picks.length - held} />
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-3">
          <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-1">You picked</p>
          <p className="text-lg font-black text-gray-900">{chosen}</p>
        </div>
        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl">🤖</span>
            <span className="font-black text-orange-800 text-lg">Wait! Think about {otherEmoji} instead…</span>
          </div>
          <p className="text-gray-800 leading-relaxed text-[17px]">{pitch}</p>
          <p className="text-sm font-bold text-gray-500 mt-3">({other})</p>
        </div>
        <p className="text-center font-black text-gray-900 mb-3">Did I change your mind?</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => decide(true)} className="min-h-[64px] rounded-2xl font-black text-white text-lg bg-green-500 hover:bg-green-600 active:scale-95 transition-all">
            💪 No way!<span className="block text-xs font-bold opacity-90">I&apos;m sticking</span>
          </button>
          <button type="button" onClick={() => decide(false)} className="min-h-[64px] rounded-2xl font-black text-white text-lg bg-rose-500 hover:bg-rose-600 active:scale-95 transition-all">
            🔄 OK, fine…<span className="block text-xs font-bold opacity-90">You convinced me</span>
          </button>
        </div>
      </div>
    );
  }

  if (phase === "summary") {
    const v = wyrVerdict(held, picks.length);
    return (
      <div className="max-w-lg mx-auto">
        <Celebrate title={`${v.emoji} ${v.title}`} gradient="linear-gradient(160deg,#f97316,#fb923c 55%,#fdba74)">
          <p className="text-lg font-bold">You held your ground {held} / {picks.length} times</p>
          <p className="text-white/90 mt-1">{v.line}</p>
        </Celebrate>
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Your final choices</p>
          <ul className="space-y-2">
            {picks.map((p, i) => (
              <li key={i} className="flex gap-2 text-gray-800">
                <span className="text-xl">{p.side === "a" ? p.round.emojiA : p.round.emojiB}</span>
                <span className="flex-1">{p.side === "a" ? p.round.a : p.round.b}</span>
                <span title={p.stuck ? "You stuck to it" : "The AI changed your mind"}>{p.stuck ? "💪" : "🔄"}</span>
              </li>
            ))}
          </ul>
        </div>
        {error && <ErrorBox message={error} />}
        <PrimaryButton color="bg-orange-500 hover:bg-orange-600" onClick={start} disabled={busy || !kidId || sparks < COST}>
          🎮 New pack of 5 — {COST} ⚡
        </PrimaryButton>
        <SparkNote cost={COST} sparks={sparks} />
      </div>
    );
  }

  // idle
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🤷 Would You Rather</h1>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-5 text-gray-700 font-bold space-y-1">
        <p>1️⃣ Pick one of two impossible choices.</p>
        <p>2️⃣ The AI tries to talk you out of it.</p>
        <p>3️⃣ Stick to your guns 💪 to win the round!</p>
        <p className="text-sm text-gray-500">5 rounds per pack.</p>
      </div>
      {error && <ErrorBox message={error} onRetry={sparks >= COST ? start : undefined} />}
      <PrimaryButton color="bg-orange-500 hover:bg-orange-600" onClick={start} disabled={busy || !kidId || sparks < COST}>
        Let&apos;s go — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
    </div>
  );
}

function Scoreboard({ idx, total, held, ai }: { idx: number; total: number; held: number; ai: number }) {
  return (
    <div className="flex items-center justify-between mb-4 text-sm font-black">
      <span className="px-3 py-1 rounded-full bg-green-100 text-green-800">💪 You {held}</span>
      <span className="text-gray-500">Round {Math.min(idx + 1, total)} / {total}</span>
      <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800">🤖 AI {ai}</span>
    </div>
  );
}

function OptionButton({ emoji, text, tone, onClick }: { emoji: string; text: string; tone: "orange" | "sky"; onClick: () => void }) {
  const cls = tone === "orange" ? "bg-orange-100 border-orange-300 text-orange-900" : "bg-sky-100 border-sky-300 text-sky-900";
  return (
    <button type="button" onClick={onClick} className={`w-full min-h-[88px] p-5 rounded-3xl border-2 font-black text-lg text-left flex items-center gap-3 active:scale-[0.97] transition-all ${cls}`}>
      <span className="text-4xl shrink-0">{emoji}</span>
      <span>{text}</span>
    </button>
  );
}
