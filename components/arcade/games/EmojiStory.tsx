"use client";

import { useCallback, useEffect, useState } from "react";
import { continueEmojiStory, generateEmojiStory } from "@/lib/actions/arcade";
import type { StoryChoice, StoryEnd, StoryStart } from "@/lib/arcade/validate";
import { playSfx } from "@/lib/audio/sound-manager";
import { ErrorBox, PrimaryButton, SecondaryButton, SparkNote, Thinking, useBusy, useSparks, safeAction } from "../ui";

const SAFE_EMOJIS = [
  "🐶", "🐱", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐷", "🐸", "🐵", "🐧", "🦉", "🦄", "🐙", "🦈",
  "🐢", "🦖", "🦕", "🐘", "🦒", "🦩", "🦜", "🐝", "🦋", "🐌", "🦔", "🦥",
  "🍕", "🌮", "🍩", "🍪", "🎂", "🍭", "🧁", "🍦", "🍿", "🍉", "🍓", "🥑", "🥕", "🧀",
  "🌈", "🌟", "🌙", "☀️", "🌊", "🌋", "🌴", "❄️", "⚡", "🌪️",
  "🚀", "🛸", "🚁", "🚂", "🏎️", "⛵", "🎈", "🪐",
  "🏰", "🏝️", "🎡", "🗺️", "💎", "🔮", "🎩", "🧲", "🔭", "🎸", "🥁", "⚽", "🛹", "🎁", "🧸", "🤖", "🧙", "👑", "🏴‍☠️", "👻",
];

const STYLES = [
  { label: "Surprise me", emoji: "🎲", value: "" },
  { label: "Silly", emoji: "🤪", value: "a laugh-out-loud silly comedy" },
  { label: "Adventure", emoji: "🗺️", value: "a daring treasure-hunt adventure" },
  { label: "Mystery", emoji: "🔍", value: "a detective mystery with clues" },
  { label: "Space", emoji: "🚀", value: "a space-age sci-fi adventure" },
  { label: "Superhero", emoji: "🦸", value: "a superhero origin story" },
  { label: "Magic", emoji: "🪄", value: "a magical fantasy quest" },
];

function randomEmoji(exclude: readonly string[]): string {
  const pool = SAFE_EMOJIS.filter((e) => !exclude.includes(e));
  return pool[Math.floor(Math.random() * pool.length)];
}
function pickRandom(count: number): string[] {
  const out: string[] = [];
  while (out.length < count) out.push(randomEmoji(out));
  return out;
}

type Phase = "pick" | "writing" | "choose" | "ending" | "done";

interface EmojiStoryProps {
  kidId: string | null;
  sparksBalance: number;
}

const COST = 1;

export default function EmojiStory({ kidId, sparksBalance }: EmojiStoryProps) {
  const [sparks, setSparks] = useSparks(sparksBalance);
  const [busy, run] = useBusy();
  const [phase, setPhase] = useState<Phase>("pick");
  const [emojis, setEmojis] = useState<string[]>(() => pickRandom(5));
  const [style, setStyle] = useState("");
  const [hero, setHero] = useState("");
  const [start, setStart] = useState<StoryStart | null>(null);
  const [choice, setChoice] = useState<StoryChoice | null>(null);
  const [ending, setEnding] = useState<StoryEnd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  // stop any read-aloud if the kid leaves the game
  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  const swapOne = (i: number) => {
    playSfx("tap");
    setEmojis((cur) => cur.map((e, j) => (j === i ? randomEmoji(cur) : e)));
  };

  const write = useCallback(() => run(async () => {
    if (!kidId) return;
    setError(null);
    setPhase("writing");
    const res = await safeAction(() => generateEmojiStory(emojis, kidId, { style, hero }));
    if (!res.ok) {
      setError(res.error);
      setPhase("pick");
      return;
    }
    setSparks(res.sparks);
    playSfx("sparkle");
    setStart(res.data);
    setPhase("choose");
  }), [run, kidId, emojis, style, hero, setSparks]);

  const finish = useCallback((c: StoryChoice) => run(async () => {
    if (!start) return;
    setError(null);
    setChoice(c);
    setPhase("ending");
    const res = await safeAction(() => continueEmojiStory({ emojis, title: start.title, paragraphs: start.paragraphs, choice: c.text, hero, kidId }));
    if (!res.ok) {
      setError(res.error);
      setPhase("choose");
      return;
    }
    playSfx("win");
    setEnding(res.data);
    setPhase("done");
  }), [run, start, emojis, hero, kidId]);

  const readAloud = () => {
    if (typeof window === "undefined" || !window.speechSynthesis || !start) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const text = [start.title, ...start.paragraphs, choice ? `You chose: ${choice.text}.` : "", ...(ending?.paragraphs ?? []), ending?.moral ?? ""].filter(Boolean).join(" ");
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };

  const newStory = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setEmojis(pickRandom(5));
    setStart(null);
    setChoice(null);
    setEnding(null);
    setError(null);
    setPhase("pick");
  };

  if (phase === "writing") {
    return <Thinking emoji="✍️" lines={["Mixing your emojis into a story…", "Inventing a hero…", "Adding a cliffhanger…"]} />;
  }

  if (start && (phase === "choose" || phase === "ending" || phase === "done")) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="flex justify-center gap-2 text-3xl mb-2" aria-hidden>
          {emojis.map((e, i) => <span key={i}>{e}</span>)}
        </div>
        <h1 className="text-2xl font-black text-center text-gray-900 mb-4 leading-tight">{start.title}</h1>

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 space-y-3">
          {start.paragraphs.map((p, i) => (
            <p key={i} className="leading-relaxed text-gray-800 text-[17px]">{p}</p>
          ))}
          {choice && (
            <p className="font-black text-violet-700 bg-violet-50 rounded-xl px-3 py-2">
              {choice.emoji} You chose: {choice.text}
            </p>
          )}
          {ending?.paragraphs.map((p, i) => (
            <p key={`e${i}`} className="leading-relaxed text-gray-800 text-[17px]">{p}</p>
          ))}
        </div>

        {phase === "choose" && (
          <>
            <p className="text-center font-black text-gray-900 text-lg mb-3">🤔 {start.question}</p>
            {error && <ErrorBox message={error} />}
            <div className="flex flex-col gap-3">
              {start.choices.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={busy}
                  onClick={() => finish(c)}
                  className={`w-full min-h-[64px] p-4 rounded-2xl border-2 text-left font-black text-lg active:scale-[0.98] transition-all disabled:opacity-50 ${
                    i === 0 ? "bg-violet-100 border-violet-300 text-violet-900" : "bg-pink-100 border-pink-300 text-pink-900"
                  }`}
                >
                  <span className="text-2xl mr-2">{c.emoji}</span>
                  {c.text}
                </button>
              ))}
            </div>
            <p className="text-center text-xs font-bold text-gray-500 mt-2">Picking the ending is free!</p>
          </>
        )}

        {phase === "ending" && <Thinking emoji="📖" lines={["Writing what happens next…", "Adding a twist…"]} />}

        {phase === "done" && ending && (
          <>
            <p className="text-center font-black text-gray-900 text-xl mb-2">✨ The End ✨</p>
            {ending.moral && (
              <div className="bg-violet-50 rounded-2xl p-4 mb-4">
                <p className="italic text-gray-700 leading-relaxed text-center">{ending.moral}</p>
              </div>
            )}
            <div className="flex flex-col gap-3">
              <SecondaryButton onClick={readAloud}>{speaking ? "⏹️ Stop reading" : "🔊 Read it to me"}</SecondaryButton>
              <PrimaryButton color="bg-violet-500 hover:bg-violet-600" onClick={newStory}>📚 Make another story</PrimaryButton>
            </div>
          </>
        )}
      </div>
    );
  }

  // pick
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-1">🎭 Emoji Story</h1>
      <p className="text-center text-gray-500 mb-4 text-sm font-bold">
        Pick 5 story ingredients — the AI writes a story with ALL of them, and YOU choose what happens next!
      </p>

      <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2 text-center">Tap an emoji to swap it</p>
      <div className="grid grid-cols-5 gap-2 mb-3">
        {emojis.map((e, i) => (
          <button
            key={i}
            type="button"
            onClick={() => swapOne(i)}
            aria-label={`Swap ingredient ${i + 1}`}
            className="aspect-square rounded-2xl bg-white shadow-sm flex items-center justify-center text-4xl active:scale-90 transition-transform border-2 border-violet-100"
          >
            {e}
          </button>
        ))}
      </div>
      <div className="mb-5">
        <SecondaryButton onClick={() => { playSfx("tap"); setEmojis(pickRandom(5)); }}>🎲 Shuffle all</SecondaryButton>
      </div>

      <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Story style</p>
      <div className="flex flex-wrap gap-2 mb-5">
        {STYLES.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStyle(s.value)}
            className={`min-h-[44px] px-3 rounded-full border-2 font-bold text-sm transition-all ${
              style === s.value ? "border-violet-400 bg-violet-100 text-violet-800" : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      <label className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2 block" htmlFor="emoji-hero">
        Hero name (optional — make one up!)
      </label>
      <input
        id="emoji-hero"
        type="text"
        value={hero}
        maxLength={24}
        onChange={(e) => setHero(e.target.value)}
        placeholder="e.g. Captain Waffles"
        className="w-full px-4 py-3 mb-5 rounded-xl border-2 border-gray-200 text-gray-900 font-medium focus:outline-none focus:border-violet-400"
      />

      {error && <ErrorBox message={error} onRetry={sparks >= COST ? write : undefined} />}

      <PrimaryButton color="bg-violet-500 hover:bg-violet-600" onClick={write} disabled={busy || !kidId || sparks < COST}>
        ✍️ Write my story — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
    </div>
  );
}
