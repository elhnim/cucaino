"use client";

// Mystery Detective — a brand-new whodunit in Cucaino Park every time. Search places for
// clues, question the 4 suspects (the AI plays each one in character — the culprit lies,
// but can be caught), keep a notebook, then accuse. Detective energy (3 searches, 6
// questions) makes every choice count. The solution lives in a sealed server token, so
// there's no peeking in devtools. 3 sparks per case.
import { useEffect, useRef, useState } from "react";
import { accuseMystery, askMystery, searchMystery, startMystery, type MysteryAccuseResult } from "@/lib/actions/arcade";
import {
  MYSTERY_LEVELS,
  MYSTERY_QUESTIONS,
  MYSTERY_SEARCHES,
  MYSTERY_SPARK_COST,
  suggestQuestions,
  type FoundClue,
  type MysteryDifficulty,
  type PublicCase,
  type Suspect,
  type SuspectReply,
} from "@/lib/arcade/mystery";
import { playSfx } from "@/lib/audio/sound-manager";
import { Celebrate, ErrorBox, PrimaryButton, SecondaryButton, SparkNote, Thinking, readStat, safeAction, useBusy, useSparks, writeStat } from "../ui";

type Phase = "idle" | "loading" | "playing" | "accuse" | "revealing" | "solved";
type Tab = "search" | "suspects" | "notebook";

interface ChatLine {
  suspectId: string;
  question: string;
  reply: SuspectReply;
}

const LEVEL_ORDER: MysteryDifficulty[] = ["easy", "medium", "hard"];

interface MysteryDetectiveProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function MysteryDetective({ kidId, sparksBalance }: MysteryDetectiveProps) {
  const [sparks, setSparks] = useSparks(sparksBalance);
  const [busy, run] = useBusy();
  const [phase, setPhase] = useState<Phase>("idle");
  const [difficulty, setDifficulty] = useState<MysteryDifficulty>("easy");
  const [pc, setPc] = useState<PublicCase | null>(null);
  const [questionsLeft, setQuestionsLeft] = useState(MYSTERY_QUESTIONS);
  const [searchesLeft, setSearchesLeft] = useState(MYSTERY_SEARCHES);
  const [found, setFound] = useState<FoundClue[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [tab, setTab] = useState<Tab>("search");
  const [suspectId, setSuspectId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<{ suspectId: string; question: string } | null>(null);
  const [searching, setSearching] = useState<string | null>(null);
  const [myNotes, setMyNotes] = useState("");
  const [accused, setAccused] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<MysteryAccuseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ solved: 0, streak: 0 });
  const token = useRef("");
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStats({ solved: readStat("mystery:solved"), streak: readStat("mystery:streak") });
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chat.length, pending]);

  const newCase = () => run(async () => {
    if (!kidId) return;
    setError(null);
    setPhase("loading");
    // remember the last few cases on this device so the next one is something new
    let recent: string[] = [];
    try {
      recent = JSON.parse(window.localStorage.getItem("arcade:mystery:recent") ?? "[]") as string[];
    } catch {}
    const res = await safeAction(() => startMystery(kidId, difficulty, Array.isArray(recent) ? recent : []));
    if (!res.ok) {
      setError(res.error);
      setPhase("idle");
      return;
    }
    setSparks(res.sparks);
    token.current = res.data.token;
    setPc(res.data.case);
    try {
      const seen = `${res.data.case.title} (${res.data.case.item})`;
      window.localStorage.setItem("arcade:mystery:recent", JSON.stringify([seen, ...recent.filter((r) => r !== seen)].slice(0, 10)));
    } catch {}
    setQuestionsLeft(res.data.questionsLeft);
    setSearchesLeft(res.data.searchesLeft);
    setFound([]);
    setChat([]);
    setTab("search");
    setSuspectId(null);
    setQuestion("");
    setMyNotes("");
    setAccused(null);
    setReason("");
    setResult(null);
    playSfx("sparkle");
    setPhase("playing");
  });

  const search = (locationId: string) => run(async () => {
    if (!kidId) return;
    setError(null);
    setSearching(locationId);
    const res = await safeAction(() => searchMystery(kidId, token.current, locationId));
    setSearching(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    token.current = res.data.token;
    setSearchesLeft(res.data.searchesLeft);
    setFound((f) => (f.some((c) => c.location === res.data.clue.location) ? f : [...f, res.data.clue]));
    playSfx("correct");
  });

  const ask = (text: string) => run(async () => {
    if (!kidId || !suspectId) return;
    const q = text.trim();
    if (q.length < 3) return;
    setError(null);
    setPending({ suspectId, question: q });
    setQuestion("");
    const res = await safeAction(() => askMystery(kidId, token.current, suspectId, q));
    setPending(null);
    if (!res.ok) {
      setError(res.error);
      setQuestion(q);
      return;
    }
    token.current = res.data.token;
    setQuestionsLeft(res.data.questionsLeft);
    setChat((c) => [...c, { suspectId: res.data.suspectId, question: res.data.question, reply: res.data.reply }]);
    playSfx("tap");
  });

  const accuse = () => run(async () => {
    if (!kidId || !accused) return;
    setError(null);
    setPhase("revealing");
    const res = await safeAction(() => accuseMystery(kidId, token.current, accused, reason));
    if (!res.ok) {
      setError(res.error);
      setPhase("accuse");
      return;
    }
    setResult(res.data);
    const next = res.data.correct
      ? { solved: stats.solved + 1, streak: stats.streak + 1 }
      : { solved: stats.solved, streak: 0 };
    setStats(next);
    writeStat("mystery:solved", next.solved);
    writeStat("mystery:streak", next.streak);
    playSfx(res.data.correct ? "win" : "wrong");
    setPhase("solved");
  });

  const suspect = (id: string | null | undefined): Suspect | undefined => pc?.suspects.find((s) => s.id === id);

  if (phase === "loading") {
    return <Thinking emoji="🕵️" lines={["Something's gone missing in the park…", "Rounding up the suspects…", "Hiding the clues…", "Sharpening your magnifying glass…"]} />;
  }
  if (phase === "revealing") {
    return <Thinking emoji="🔦" lines={["Everyone gathers round…", "The detective points…", "The truth comes out!"]} />;
  }

  if (phase === "solved" && result && pc) {
    const r = result;
    return (
      <div className="max-w-xl mx-auto">
        {r.correct ? (
          <Celebrate title="Case closed! 🎉" gradient="linear-gradient(160deg,#b45309,#f59e0b 55%,#fde68a)">
            <p className="text-5xl my-1">{r.culprit.emoji}</p>
            <p className="text-xl font-black">It WAS {r.culprit.name}!</p>
            {stats.streak > 1 && <p className="font-black mt-1">🔥 {stats.streak} cases in a row!</p>}
          </Celebrate>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm p-6 text-center mb-4">
            <p className="text-5xl mb-1">{r.culprit.emoji}</p>
            <h2 className="text-2xl font-black text-gray-900">Plot twist!</h2>
            <p className="text-gray-700 font-bold">
              {r.accused.name} was innocent — it was really <strong className="text-gray-900">{r.culprit.name}</strong>!
            </p>
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <h3 className="text-lg font-black text-gray-900 mb-2">{r.reveal.headline}</h3>
          <div className="space-y-2 text-gray-800 leading-relaxed">
            {r.reveal.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {r.reveal.aboutReason && <p className="mt-3 p-3 rounded-xl bg-amber-50 border-2 border-amber-200 font-bold text-amber-900">🕵️ {r.reveal.aboutReason}</p>}
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-2">🧾 All the evidence</p>
          <ul className="space-y-2">
            {r.clues.map((c) => {
              const place = pc.places.find((p) => p.id === c.location);
              const who = suspect(c.suspectId);
              return (
                <li key={c.location} className={`rounded-xl border-2 p-3 ${c.found ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                  <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                    {place?.emoji} {place?.name} · {c.found ? "you found this" : "you didn't search here"}
                  </p>
                  <p className="font-bold text-gray-900">{c.title}</p>
                  <p className="text-sm text-gray-700">{c.text}</p>
                  <p className="text-xs font-black mt-1 text-gray-600">
                    {c.kind === "implicates" ? `👉 Points at ${who?.name}` : `✅ Clears ${who?.name}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="text-center text-sm font-bold text-gray-500 mb-3">🏅 Cases solved: {stats.solved}</p>
        {error && <ErrorBox message={error} />}
        <PrimaryButton color="bg-amber-500 hover:bg-amber-600" onClick={newCase} disabled={busy || !kidId || sparks < MYSTERY_SPARK_COST}>
          🕵️ New case — {MYSTERY_SPARK_COST} ⚡
        </PrimaryButton>
        <div className="mt-3"><SecondaryButton onClick={() => setPhase("idle")}>Change level</SecondaryButton></div>
        <SparkNote cost={MYSTERY_SPARK_COST} sparks={sparks} />
      </div>
    );
  }

  if ((phase === "playing" || phase === "accuse") && pc) {
    const energy = (
      <div className="flex items-center justify-between gap-2 bg-white rounded-2xl shadow-sm px-3 py-2 mb-3 text-sm font-black" aria-label={`Detective energy: ${searchesLeft} searches and ${questionsLeft} questions left`}>
        <span className="text-gray-500 text-xs uppercase tracking-wider">Energy</span>
        <span title="Searches left">🔎 {"●".repeat(searchesLeft)}<span className="text-gray-300">{"●".repeat(Math.max(0, MYSTERY_SEARCHES - searchesLeft))}</span></span>
        <span title="Questions left">💬 {"●".repeat(questionsLeft)}<span className="text-gray-300">{"●".repeat(Math.max(0, MYSTERY_QUESTIONS - questionsLeft))}</span></span>
      </div>
    );

    if (phase === "accuse") {
      return (
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-black text-center text-gray-900 mb-1">👉 Who did it?</h2>
          <p className="text-center text-sm font-bold text-gray-500 mb-4">You only get one accusation — choose carefully!</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {pc.suspects.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setAccused(s.id)}
                aria-pressed={accused === s.id}
                className={`min-h-[88px] rounded-2xl border-2 p-2 flex flex-col items-center justify-center transition-all ${accused === s.id ? "border-amber-500 bg-amber-50 scale-[1.02]" : "border-gray-200 bg-white"}`}
              >
                <span className="text-4xl">{s.emoji}</span>
                <span className="font-black text-gray-900 text-sm text-center">{s.name}</span>
              </button>
            ))}
          </div>
          <label className="block text-sm font-black text-gray-700 mb-1" htmlFor="mystery-reason">Why? (which clues gave them away?)</label>
          <textarea
            id="mystery-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={240}
            rows={3}
            placeholder="The orange fur at the Pet Meadow matches their coat, and…"
            className="w-full rounded-xl border-2 border-gray-200 p-3 font-bold text-gray-900 focus:outline-none focus:border-amber-400 mb-3"
          />
          {error && <ErrorBox message={error} />}
          <PrimaryButton color="bg-amber-500 hover:bg-amber-600" onClick={accuse} disabled={busy || !accused}>
            🔦 J&apos;accuse!
          </PrimaryButton>
          <div className="mt-3"><SecondaryButton onClick={() => setPhase("playing")}>← Keep investigating</SecondaryButton></div>
        </div>
      );
    }

    const me = suspect(suspectId);
    const myChat = chat.filter((c) => c.suspectId === suspectId);
    const suggestions = me ? suggestQuestions(pc, me.id, found) : [];

    return (
      <div className="max-w-xl mx-auto">
        <details className="bg-white rounded-2xl shadow-sm p-4 mb-3" open={found.length === 0 && chat.length === 0}>
          <summary className="cursor-pointer">
            <span className="text-2xl mr-1">{pc.emoji}</span>
            <span className="font-black text-gray-900">{pc.title}</span>
          </summary>
          <p className="text-gray-800 leading-relaxed mt-2">{pc.intro}</p>
          <p className="text-sm font-bold text-gray-500 mt-2">
            Missing: {pc.item} · Scene: {pc.crimeScene.emoji} {pc.crimeScene.name} · Level: {MYSTERY_LEVELS[pc.difficulty].label}
          </p>
        </details>

        {energy}

        <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-2xl p-1 mb-3" role="tablist">
          {([
            ["search", "🗺️ Search"],
            ["suspects", "🗣️ Suspects"],
            ["notebook", `📓 Notes${found.length + chat.length ? ` (${found.length + chat.length})` : ""}`],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-[44px] rounded-xl font-black text-sm transition-all ${tab === t ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <ErrorBox message={error} />}

        {tab === "search" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {pc.places.map((p) => {
              const clue = found.find((c) => c.location === p.id);
              return (
                <div key={p.id} className={`rounded-2xl border-2 p-3 ${clue ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
                  <p className="font-black text-gray-900">{p.emoji} {p.name}</p>
                  {clue ? (
                    <>
                      <p className="font-bold text-amber-900 mt-1">🔍 {clue.title}</p>
                      <p className="text-sm text-gray-800 mt-0.5">{clue.text}</p>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => search(p.id)}
                      disabled={busy || searchesLeft <= 0}
                      className="mt-2 w-full min-h-[44px] rounded-xl font-black text-white bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-40"
                    >
                      {searching === p.id ? "Searching…" : searchesLeft > 0 ? "Search here (🔎 −1)" : "No search energy"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "suspects" && !me && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {pc.suspects.map((s) => (
              <button key={s.id} type="button" onClick={() => setSuspectId(s.id)} className="text-left rounded-2xl border-2 border-gray-200 bg-white p-3 active:scale-[0.98] transition-all">
                <p className="font-black text-gray-900"><span className="text-2xl mr-1">{s.emoji}</span>{s.name}</p>
                <p className="text-sm text-gray-600">{s.personality}</p>
                <p className="text-sm text-gray-800 mt-1"><span className="font-black">Says:</span> “{s.alibi}”</p>
                <p className="text-xs font-black text-amber-700 mt-1">Question them 💬 ({chat.filter((c) => c.suspectId === s.id).length} asked)</p>
              </button>
            ))}
          </div>
        )}

        {tab === "suspects" && me && (
          <div className="bg-white rounded-2xl shadow-sm p-3 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <button type="button" onClick={() => setSuspectId(null)} className="min-h-[40px] px-3 rounded-xl bg-gray-100 font-bold text-gray-700">← All</button>
              <span className="text-3xl">{me.emoji}</span>
              <div className="min-w-0">
                <p className="font-black text-gray-900 truncate">{me.name}</p>
                <p className="text-xs text-gray-500 truncate">{me.personality}</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-2"><span className="font-black">Alibi:</span> “{me.alibi}”</p>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto mb-3" aria-live="polite">
              {myChat.length === 0 && !pending && <p className="text-sm font-bold text-gray-400 text-center py-2">Ask {me.name.split(" ")[0]} anything about the case…</p>}
              {myChat.map((c, i) => (
                <div key={i}>
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500 text-white font-bold px-3 py-2 text-sm">{c.question}</p>
                  <p className="mt-1 w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-gray-100 text-gray-900 px-3 py-2">
                    <span className="mr-1">{c.reply.mood}</span>{c.reply.answer}
                  </p>
                </div>
              ))}
              {pending && pending.suspectId === me.id && (
                <div>
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500 text-white font-bold px-3 py-2 text-sm">{pending.question}</p>
                  <p className="mt-1 w-fit rounded-2xl bg-gray-100 text-gray-500 px-3 py-2 animate-pulse">{me.emoji} thinking…</p>
                </div>
              )}
              <div ref={chatEnd} />
            </div>
            {questionsLeft > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {suggestions.map((q) => (
                    <button key={q} type="button" disabled={busy} onClick={() => ask(q)} className="px-3 py-2 rounded-full border-2 border-amber-200 bg-amber-50 text-amber-900 text-sm font-bold text-left disabled:opacity-40">
                      {q}
                    </button>
                  ))}
                </div>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={160}
                    placeholder={`Ask ${me.name.split(" ")[0]} a question…`}
                    enterKeyHint="send"
                    className="flex-1 min-w-0 px-3 min-h-[48px] rounded-xl border-2 border-gray-200 font-bold text-gray-900 focus:outline-none focus:border-amber-400"
                  />
                  <button type="submit" disabled={busy || question.trim().length < 3} className="px-4 min-h-[48px] rounded-xl font-black text-white bg-amber-500 disabled:opacity-40">
                    Ask 💬
                  </button>
                </form>
              </>
            ) : (
              <p className="text-center font-bold text-gray-500">No question energy left — time to accuse!</p>
            )}
          </div>
        )}

        {tab === "notebook" && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
            <div>
              <p className="font-black text-gray-700 mb-1">🔍 Clues</p>
              {found.length === 0 ? <p className="text-sm text-gray-400 font-bold">None yet — go search!</p> : (
                <ul className="space-y-1.5">
                  {found.map((c) => {
                    const place = pc.places.find((p) => p.id === c.location);
                    return <li key={c.location} className="text-sm text-gray-800"><span className="font-black">{place?.emoji} {c.title}:</span> {c.text}</li>;
                  })}
                </ul>
              )}
            </div>
            <div>
              <p className="font-black text-gray-700 mb-1">🗣️ Statements</p>
              {chat.length === 0 ? <p className="text-sm text-gray-400 font-bold">Nobody questioned yet.</p> : (
                <ul className="space-y-1.5">
                  {chat.map((c, i) => {
                    const s = suspect(c.suspectId);
                    return <li key={i} className="text-sm text-gray-800"><span className="font-black">{s?.emoji} {s?.name}:</span> {c.reply.note}</li>;
                  })}
                </ul>
              )}
            </div>
            <div>
              <label className="font-black text-gray-700 mb-1 block" htmlFor="mystery-notes">✏️ My notes</label>
              <textarea
                id="mystery-notes"
                value={myNotes}
                onChange={(e) => setMyNotes(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="Who seems suspicious? What doesn't add up?"
                className="w-full rounded-xl border-2 border-gray-200 p-3 text-gray-900 font-bold focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        )}

        <PrimaryButton color="bg-amber-500 hover:bg-amber-600" onClick={() => { setError(null); setPhase("accuse"); }} disabled={busy}>
          👉 I know who did it!
        </PrimaryButton>
      </div>
    );
  }

  // idle
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🕵️ Mystery Detective</h1>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-5 text-gray-700 font-bold space-y-1">
        <p>🎡 Something&apos;s gone missing in Cucaino Park — a new mystery every time!</p>
        <p>🔎 Search {MYSTERY_SEARCHES} places for clues.</p>
        <p>💬 Ask the 4 suspects {MYSTERY_QUESTIONS} questions — one of them is fibbing!</p>
        <p>👉 Accuse the culprit and say why. One chance only!</p>
        {stats.solved > 0 && <p className="text-sm text-gray-500 pt-1">🏅 Solved: {stats.solved}{stats.streak > 1 ? ` · 🔥 Streak: ${stats.streak}` : ""}</p>}
      </div>

      <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Level</p>
      <div className="grid grid-cols-1 gap-2 mb-5">
        {LEVEL_ORDER.map((d) => {
          const l = MYSTERY_LEVELS[d];
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              aria-pressed={difficulty === d}
              className={`min-h-[56px] px-4 rounded-2xl border-2 flex items-center gap-3 text-left transition-all ${difficulty === d ? "border-amber-400 bg-amber-50 text-amber-900" : "border-gray-200 bg-white text-gray-700"}`}
            >
              <span className="text-2xl">{l.emoji}</span>
              <span>
                <span className="block font-black">{l.label}</span>
                <span className="block text-xs font-bold opacity-70">{l.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error && <ErrorBox message={error} onRetry={sparks >= MYSTERY_SPARK_COST ? newCase : undefined} />}
      <PrimaryButton color="bg-amber-500 hover:bg-amber-600" onClick={newCase} disabled={busy || !kidId || sparks < MYSTERY_SPARK_COST}>
        Open a new case — {MYSTERY_SPARK_COST} ⚡
      </PrimaryButton>
      <SparkNote cost={MYSTERY_SPARK_COST} sparks={sparks} />
    </div>
  );
}
