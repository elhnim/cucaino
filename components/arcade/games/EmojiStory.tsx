"use client";

import { useCallback, useEffect, useState } from "react";
import { continueEmojiStory, generateEmojiStory } from "@/lib/actions/arcade";
import type { StoryChoice, StoryEnd, StoryStart } from "@/lib/arcade/validate";
import { playSfx } from "@/lib/audio/sound-manager";
import {
  ARC,
  ARC_FONT,
  ArcButton,
  ArcadeStage,
  ErrorBox,
  GameTitle,
  PAPER,
  PrimaryButton,
  SecondaryButton,
  SectionLabel,
  SparkNote,
  Thinking,
  Tile,
  panelStyle,
  safeAction,
  useBusy,
  useSparks,
} from "../ui";

// Look: a magical storybook — ingredient "stickers", then a parchment page with a ribbon
// title, a bookmark for the kid's choice and a flourish for The End.

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

const BOOK_CSS = `
.arc-page p.arc-story{margin:0;font-size:17.5px;line-height:1.7;font-weight:600;color:${PAPER.ink};}
.arc-page p.arc-story.first::first-letter{float:left;font-family:${ARC_FONT.display};font-weight:400;font-size:52px;line-height:.9;margin:4px 8px 0 0;color:#6a2fc0;text-shadow:0 2px 0 rgba(106,47,192,.18);}
.arc-sticker{aspect-ratio:1/1;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:clamp(28px,9vw,44px);cursor:pointer;border:0;
  background:radial-gradient(circle at 50% 35%, #fffdf4, #ffeec8 70%);color:#000;
  box-shadow:0 0 0 3px ${ARC.gold}, 0 0 0 5px rgba(138,82,0,.55), 0 6px 0 5px rgba(20,10,40,.55), 0 0 18px rgba(255,211,107,.45);
  transition:transform 140ms cubic-bezier(.3,1.6,.5,1);}
.arc-sticker:active{transform:scale(.88) rotate(-6deg);}
`;

export default function EmojiStory(props: EmojiStoryProps) {
  return (
    <ArcadeStage tone="violet">
      <style>{BOOK_CSS}</style>
      <EmojiStoryInner {...props} />
    </ArcadeStage>
  );
}

function EmojiStoryInner({ kidId, sparksBalance }: EmojiStoryProps) {
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
      <div>
        {/* the storybook */}
        <div className="arc-rise" style={{ position: "relative", padding: 8, borderRadius: 22, marginBottom: 18, background: "linear-gradient(135deg, #5a2fc8, #3a1a8f 55%, #26105f)", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.2), 0 0 0 2px rgba(255,211,107,0.55), 0 12px 30px rgba(0,0,0,0.5), 0 0 30px rgba(176,107,255,0.35)" }}>
          <div className="arc-page" style={{ position: "relative", borderRadius: 16, padding: "30px 18px 22px", background: `radial-gradient(120% 90% at 50% 0%, #fffdf6, ${PAPER.cream} 60%, #f6e7c6)`, boxShadow: "inset 0 0 30px rgba(140,90,30,0.18), inset 10px 0 18px -12px rgba(90,50,10,0.3)" }}>
            <div aria-hidden style={{ display: "flex", justifyContent: "center", gap: 8, fontSize: 30, marginBottom: 10 }}>
              {emojis.map((e, i) => (
                <span key={i} className="arc-pop" style={{ display: "inline-block", animationDelay: `${i * 70}ms`, filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.2))" }}>{e}</span>
              ))}
            </div>
            <Ribbon>{start.title}</Ribbon>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
              {start.paragraphs.map((p, i) => (
                <p key={i} className={`arc-story${i === 0 ? " first" : ""}`}>{p}</p>
              ))}
              {choice && (
                <p className="arc-pop" style={{ margin: "4px -18px", padding: "10px 18px 10px 22px", fontWeight: 900, fontSize: 16.5, color: "#fff", background: "linear-gradient(90deg, #7c4dea, #a86bff)", clipPath: "polygon(0 0, 100% 0, calc(100% - 14px) 50%, 100% 100%, 0 100%)", boxShadow: "0 4px 10px rgba(60,20,140,0.3)" }}>
                  🔖 {choice.emoji} You chose: {choice.text}
                </p>
              )}
              {ending?.paragraphs.map((p, i) => (
                <p key={`e${i}`} className="arc-story arc-rise">{p}</p>
              ))}
            </div>
            {phase === "done" && ending && (
              <p className="arc-display arc-pop" style={{ textAlign: "center", fontSize: 28, margin: "22px 0 0", color: "#6a2fc0" }}>
                ✦ The End ✦
              </p>
            )}
          </div>
        </div>

        {phase === "choose" && (
          <>
            <p className="arc-display" style={{ textAlign: "center", fontSize: 22, margin: "0 0 14px", color: "#fff", textShadow: "0 0 16px rgba(194,155,255,0.7)" }}>🤔 {start.question}</p>
            {error && <ErrorBox message={error} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {start.choices.map((c, i) => (
                <ArcButton key={i} block wrap size="big" variant={i === 0 ? "magic" : "rose"} disabled={busy} onClick={() => finish(c)} style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 18px", minHeight: 72 }}>
                  <span style={{ fontSize: 30, flexShrink: 0 }} aria-hidden>{c.emoji}</span>
                  <span>{c.text}</span>
                </ArcButton>
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: 13.5, fontWeight: 800, color: ARC.dim, marginTop: 12 }}>Picking the ending is free!</p>
          </>
        )}

        {phase === "ending" && <Thinking emoji="📖" lines={["Writing what happens next…", "Adding a twist…"]} />}

        {phase === "done" && ending && (
          <>
            {ending.moral && (
              <div className="arc-pop" style={{ ...panelStyle(ARC.gold, "rgba(40,24,70,0.9)"), padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
                <p className="arc-display" style={{ margin: "0 0 4px", fontSize: 14, letterSpacing: 1.4, color: ARC.gold }}>✨ THE MORAL ✨</p>
                <p style={{ margin: 0, fontStyle: "italic", fontWeight: 700, lineHeight: 1.55, color: ARC.text }}>{ending.moral}</p>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SecondaryButton onClick={readAloud}>{speaking ? "⏹️ Stop reading" : "🔊 Read it to me"}</SecondaryButton>
              <PrimaryButton variant="magic" onClick={newStory}>📚 Make another story</PrimaryButton>
            </div>
          </>
        )}
      </div>
    );
  }

  // pick
  return (
    <div>
      <GameTitle emoji="📖" title="Emoji Story" sub="Pick 5 story ingredients — the AI writes a story with ALL of them, and YOU choose what happens next!" />

      <div style={{ ...panelStyle(ARC.gold, "rgba(36,22,78,0.88)"), padding: "16px 12px", marginBottom: 18 }}>
        <SectionLabel center>Tap a sticker to swap it</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16, padding: "0 4px" }}>
          {emojis.map((e, i) => (
            <button key={i} type="button" onClick={() => swapOne(i)} aria-label={`Swap ingredient ${i + 1}`} className="arc-sticker" style={{ rotate: `${[-4, 3, -2, 4, -3][i]}deg` }}>
              <span key={e} className="arc-pop" style={{ display: "inline-block" }}>{e}</span>
            </button>
          ))}
        </div>
        <SecondaryButton onClick={() => { playSfx("tap"); setEmojis(pickRandom(5)); }}>🎲 Shuffle all</SecondaryButton>
      </div>

      <SectionLabel>Story style</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        {STYLES.map((s) => (
          <Tile key={s.label} selected={style === s.value} onClick={() => setStyle(s.value)} style={{ minHeight: 46, padding: "0 14px", borderRadius: 999, fontWeight: 900, fontSize: 15 }}>
            {s.emoji} {s.label}
          </Tile>
        ))}
      </div>

      <SectionLabel htmlFor="emoji-hero">Hero name (optional — make one up!)</SectionLabel>
      <input
        id="emoji-hero"
        type="text"
        value={hero}
        maxLength={24}
        onChange={(e) => setHero(e.target.value)}
        placeholder="e.g. Captain Waffles"
        className="arc-input"
        style={{ marginBottom: 20 }}
      />

      {error && <ErrorBox message={error} onRetry={sparks >= COST ? write : undefined} />}

      <PrimaryButton variant="magic" onClick={write} disabled={busy || !kidId || sparks < COST}>
        ✍️ Write my story — {COST} ⚡
      </PrimaryButton>
      <SparkNote cost={COST} sparks={sparks} />
    </div>
  );
}

/** the storybook title on a notched violet ribbon */
function Ribbon({ children }: { children: string }) {
  return (
    <div style={{ position: "relative", margin: "0 -6px" }}>
      <h1
        className="arc-display arc-pop"
        style={{
          margin: 0,
          padding: "12px 30px",
          textAlign: "center",
          fontSize: 25,
          lineHeight: 1.15,
          color: "#fff",
          background: "linear-gradient(180deg, #9a6bff, #6a3fe0 60%, #5230c0)",
          clipPath: "polygon(0 0, 100% 0, calc(100% - 16px) 50%, 100% 100%, 0 100%, 16px 50%)",
          textShadow: "0 2px 0 rgba(30,10,80,0.55)",
          filter: "drop-shadow(0 4px 6px rgba(60,20,140,0.35))",
        }}
      >
        {children}
      </h1>
    </div>
  );
}
