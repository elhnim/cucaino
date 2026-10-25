"use client";

// Mystery Detective — a brand-new whodunit in Cucaino Park every time. Search places for
// clues, question the 4 suspects (the AI plays each one in character — the culprit lies,
// but can be caught), keep a notebook, then accuse. Detective energy (3 searches, 6
// questions) makes every choice count. The solution lives in a sealed server token, so
// there's no peeking in devtools. 3 sparks per case.
// Look: a detective's cork case board (pinned notes + red string), suspects as trading
// cards, and a leather-bound notebook.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import {
  ARC,
  ArcButton,
  ArcadeStage,
  Celebrate,
  ErrorBox,
  GameTitle,
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

type Phase = "idle" | "loading" | "playing" | "accuse" | "revealing" | "solved";
type Tab = "search" | "suspects" | "notebook";

interface ChatLine {
  suspectId: string;
  question: string;
  reply: SuspectReply;
}

const LEVEL_ORDER: MysteryDifficulty[] = ["easy", "medium", "hard"];

/** each suspect's trading-card colour (by position in the case) */
const CARD_COLORS = ["#ffc15e", "#5ef2ff", "#c29bff", "#ff86bd"];

const MYSTERY_CSS = `
.arc-cork{position:relative;border-radius:18px;padding:22px 12px 16px;
  background-color:#b0814f;
  background-image:radial-gradient(rgba(80,45,15,.38) 1px, transparent 1.6px), radial-gradient(rgba(255,230,190,.22) 1px, transparent 1.6px), radial-gradient(120% 80% at 50% 0%, rgba(255,220,160,.25), transparent 60%);
  background-size:9px 9px, 13px 13px, 100% 100%;background-position:0 0, 4px 6px, 0 0;
  box-shadow:0 0 0 8px #4a2c14, 0 0 0 10px #2c1808, inset 0 0 26px rgba(40,20,5,.55), 0 16px 34px rgba(0,0,0,.55);margin:10px 10px 18px;}
.arc-note{position:relative;border-radius:4px;padding:18px 14px 14px;color:${PAPER.ink};box-shadow:0 8px 14px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.3);
  background:repeating-linear-gradient(transparent 0 23px, rgba(70,110,190,.16) 23px 24px) 0 10px/100% 100% no-repeat, ${PAPER.note};}
.arc-note.found{background:linear-gradient(170deg, #fff6a8, ${PAPER.sticky} 60%, #f5d955);}
.arc-pin{position:absolute;top:-7px;left:50%;width:18px;height:18px;margin-left:-9px;border-radius:999px;z-index:3;
  background:radial-gradient(circle at 35% 30%, #ff9aa6, #d62839 55%, #7a0c1c);box-shadow:0 3px 3px rgba(0,0,0,.45);}
.arc-tcard{position:relative;border-radius:18px;padding:4px;cursor:pointer;border:0;text-align:left;color:${ARC.text};width:100%;
  background:linear-gradient(135deg, var(--card), rgba(255,255,255,.55) 40%, var(--card) 60%, color-mix(in srgb, var(--card) 50%, #000));
  box-shadow:0 6px 0 rgba(6,5,20,.75), 0 12px 22px rgba(0,0,0,.45), 0 0 16px color-mix(in srgb, var(--card) 35%, transparent);
  transition:transform 140ms cubic-bezier(.3,1.5,.5,1), box-shadow 160ms;touch-action:manipulation;overflow:hidden;}
.arc-tcard:hover{transform:translateY(-2px) rotate(-.6deg);}
.arc-tcard:active{transform:translateY(3px) scale(.98);box-shadow:0 2px 0 rgba(6,5,20,.75), 0 6px 12px rgba(0,0,0,.45);}
.arc-tcard.on{transform:scale(1.03);box-shadow:0 0 0 3px #fff, 0 0 26px var(--card), 0 6px 0 rgba(6,5,20,.75);}
.arc-tcard-in{border-radius:14px;height:100%;display:flex;flex-direction:column;background:linear-gradient(180deg, #221c5c, #120f33);overflow:hidden;}
.arc-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;border-radius:18px;background:rgba(8,7,26,.6);box-shadow:inset 0 0 0 1.5px rgba(160,190,255,.2);margin-bottom:14px;}
.arc-tab{min-height:48px;border:0;border-radius:14px;background:transparent;color:${ARC.dim};font-family:inherit;font-size:15px;cursor:pointer;touch-action:manipulation;padding:0 4px;transition:all 150ms;}
.arc-tab[aria-selected="true"]{background:linear-gradient(180deg, ${ARC.goldHi}, ${ARC.gold} 50%, ${ARC.goldDeep});color:${ARC.ink};box-shadow:0 3px 0 #9a5c00, 0 0 14px rgba(255,211,107,.45);}
.arc-journal{position:relative;border-radius:20px;padding:12px 12px 12px 24px;margin-bottom:16px;
  background:radial-gradient(rgba(0,0,0,.12) 1px, transparent 1.5px) 0 0/5px 5px, linear-gradient(135deg, #7a4526, #5a2f16 55%, #43210d);
  box-shadow:inset 0 2px 0 rgba(255,210,160,.25), inset 0 -3px 0 rgba(0,0,0,.35), 0 14px 30px rgba(0,0,0,.5);}
.arc-journal::before{content:"";position:absolute;inset:6px 6px 6px 16px;border-radius:14px;border:2px dashed rgba(255,214,160,.45);pointer-events:none;}
.arc-journal::after{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;border-radius:20px 0 0 20px;background:linear-gradient(90deg, #2c1406, #5a2f16);}
.arc-page-ruled{position:relative;border-radius:10px;padding:16px 14px 16px 30px;color:${PAPER.ink};
  background:linear-gradient(90deg, transparent 20px, rgba(220,60,70,.45) 20px 21.5px, transparent 21.5px), repeating-linear-gradient(transparent 0 25px, rgba(70,110,190,.22) 25px 26px), #fdf6e3;
  box-shadow:inset 0 0 18px rgba(140,90,30,.2), 0 2px 4px rgba(0,0,0,.3);}
.arc-paper-input{width:100%;border-radius:8px;border:2px solid rgba(106,53,18,.3);background:rgba(255,255,255,.55);color:${PAPER.ink};padding:10px 12px;font-family:inherit;font-weight:700;font-size:16px;line-height:1.45;resize:vertical;}
.arc-paper-input::placeholder{color:rgba(60,45,80,.62);}
.arc-paper-input:focus{outline:none;border-color:#b86a12;box-shadow:0 0 0 3px rgba(232,154,28,.3);}
.arc-stamp{position:absolute;padding:4px 10px;border:3px solid currentColor;border-radius:8px;font-family:var(--font-park-display), 'Lilita One', sans-serif;letter-spacing:2px;text-transform:uppercase;opacity:.85;pointer-events:none;}
`;

interface MysteryDetectiveProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function MysteryDetective(props: MysteryDetectiveProps) {
  return (
    <ArcadeStage tone="amber" wide backdrop="radial-gradient(60% 30% at 85% 0%, rgba(255,190,90,0.22), transparent 70%)">
      <style>{MYSTERY_CSS}</style>
      <MysteryInner {...props} />
    </ArcadeStage>
  );
}

function MysteryInner({ kidId, sparksBalance }: MysteryDetectiveProps) {
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
  const cardColor = (id: string | null | undefined) => CARD_COLORS[Math.max(0, pc?.suspects.findIndex((s) => s.id === id) ?? 0) % CARD_COLORS.length];

  if (phase === "loading") {
    return <Thinking emoji="🕵️" lines={["Something's gone missing in the park…", "Rounding up the suspects…", "Hiding the clues…", "Sharpening your magnifying glass…"]} />;
  }
  if (phase === "revealing") {
    return <Thinking emoji="🔦" lines={["Everyone gathers round…", "The detective points…", "The truth comes out!"]} />;
  }

  if (phase === "solved" && result && pc) {
    const r = result;
    return (
      <div>
        {r.correct ? (
          <Celebrate title="Case closed! 🎉" accent={ARC.gold}>
            <p className="arc-pop" style={{ fontSize: 64, margin: "2px 0", lineHeight: 1 }}>{r.culprit.emoji}</p>
            <p className="arc-display" style={{ fontSize: 26, margin: 0, color: "#fff" }}>It WAS {r.culprit.name}!</p>
            {stats.streak > 1 && <p className="arc-display" style={{ fontSize: 19, margin: "8px 0 0", color: ARC.fire }}>🔥 {stats.streak} cases in a row!</p>}
          </Celebrate>
        ) : (
          <MissCard emoji={r.culprit.emoji} title="Plot twist!">
            {r.accused.name} was innocent — it was really <strong className="arc-display" style={{ color: ARC.gold, fontSize: 20 }}>{r.culprit.name}</strong>!
          </MissCard>
        )}

        {/* the newspaper-style reveal */}
        <div className="arc-note arc-rise" style={{ background: "linear-gradient(180deg, #faf5e8, #efe6cf)", padding: "18px 16px", marginBottom: 18, rotate: "-0.4deg" }}>
          <span className="arc-stamp" style={{ top: 10, right: 10, color: r.correct ? "#1f8a55" : "#c8243f", fontSize: 13, rotate: "8deg" }}>{r.correct ? "Solved" : "Twist!"}</span>
          <p style={{ margin: "0 0 4px", paddingRight: 84, fontSize: 11, fontWeight: 900, letterSpacing: 2, color: PAPER.inkSoft }}>THE PARK GAZETTE · SPECIAL EDITION</p>
          <h3 className="arc-display" style={{ margin: "0 0 10px", fontSize: 24, color: PAPER.ink, paddingRight: 70, borderBottom: "2px solid rgba(43,33,64,0.25)", paddingBottom: 8 }}>{r.reveal.headline}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, lineHeight: 1.6, fontWeight: 600, fontSize: 16 }}>
            {r.reveal.paragraphs.map((p, i) => <p key={i} style={{ margin: 0 }}>{p}</p>)}
          </div>
          {r.reveal.aboutReason && <p style={{ margin: "14px 0 0", padding: 12, borderRadius: 8, fontWeight: 800, color: "#5a2d00", background: "rgba(255,193,94,0.35)", border: "2px dashed rgba(138,82,0,0.45)" }}>🕵️ {r.reveal.aboutReason}</p>}
        </div>

        <SectionLabel>🧾 All the evidence</SectionLabel>
        <ul style={{ listStyle: "none", margin: "0 0 18px", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {r.clues.map((c, i) => {
            const place = pc.places.find((p) => p.id === c.location);
            const who = suspect(c.suspectId);
            return (
              <li key={c.location} className={`arc-note ${c.found ? "found" : ""}`} style={{ rotate: `${i % 2 ? 0.8 : -0.8}deg`, opacity: c.found ? 1 : 0.8 }}>
                <span className="arc-pin" aria-hidden />
                <p style={{ margin: 0, fontSize: 11.5, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: PAPER.inkSoft }}>
                  {place?.emoji} {place?.name} · {c.found ? "you found this" : "you didn't search here"}
                </p>
                <p style={{ margin: "4px 0 2px", fontWeight: 900 }}>{c.title}</p>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.45, fontWeight: 600 }}>{c.text}</p>
                <p style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 900, color: c.kind === "implicates" ? "#a3172f" : "#11703f" }}>
                  {c.kind === "implicates" ? `👉 Points at ${who?.name}` : `✅ Clears ${who?.name}`}
                </p>
              </li>
            );
          })}
        </ul>
        <p style={{ textAlign: "center", fontSize: 14, fontWeight: 800, color: ARC.dim, margin: "0 0 12px" }}>🏅 Cases solved: <span style={{ color: ARC.gold }}>{stats.solved}</span></p>
        {error && <ErrorBox message={error} />}
        <PrimaryButton variant="amber" onClick={newCase} disabled={busy || !kidId || sparks < MYSTERY_SPARK_COST}>
          🕵️ New case — {MYSTERY_SPARK_COST} ⚡
        </PrimaryButton>
        <div style={{ marginTop: 14 }}><SecondaryButton onClick={() => setPhase("idle")}>Change level</SecondaryButton></div>
        <SparkNote cost={MYSTERY_SPARK_COST} sparks={sparks} />
      </div>
    );
  }

  if ((phase === "playing" || phase === "accuse") && pc) {
    const energy = (
      <div
        style={{ ...panelStyle(ARC.gold, "rgba(10,9,30,0.9)"), padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
        aria-label={`Detective energy: ${searchesLeft} searches and ${questionsLeft} questions left`}
      >
        <span className="arc-display" style={{ fontSize: 14, letterSpacing: 1.4, color: ARC.gold }}>⚡ ENERGY</span>
        <Pips icon="🔎" left={searchesLeft} total={MYSTERY_SEARCHES} color={ARC.gold} title="Searches left" />
        <Pips icon="💬" left={questionsLeft} total={MYSTERY_QUESTIONS} color={ARC.cyan} title="Questions left" />
      </div>
    );

    if (phase === "accuse") {
      return (
        <div>
          <GameTitle emoji="👉" title="Who did it?" sub="You only get one accusation — choose carefully!" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14, marginBottom: 18 }}>
            {pc.suspects.map((s) => (
              <SuspectCard key={s.id} s={s} color={cardColor(s.id)} selected={accused === s.id} onClick={() => setAccused(s.id)} compact>
                {accused === s.id && (
                  <span className="arc-stamp arc-pop" style={{ top: 44, left: "50%", marginLeft: -52, width: 104, textAlign: "center", color: "#ff5d73", fontSize: 17, rotate: "-12deg", background: "rgba(40,6,16,0.6)" }}>
                    Accused!
                  </span>
                )}
              </SuspectCard>
            ))}
          </div>
          <SectionLabel htmlFor="mystery-reason">Why? (which clues gave them away?)</SectionLabel>
          <textarea
            id="mystery-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={240}
            rows={3}
            placeholder="The orange fur at the Pet Meadow matches their coat, and…"
            className="arc-input"
            style={{ marginBottom: 14 }}
          />
          {error && <ErrorBox message={error} />}
          <PrimaryButton variant="danger" onClick={accuse} disabled={busy || !accused}>
            🔦 J&apos;accuse!
          </PrimaryButton>
          <div style={{ marginTop: 14 }}><SecondaryButton onClick={() => setPhase("playing")}>← Keep investigating</SecondaryButton></div>
        </div>
      );
    }

    const me = suspect(suspectId);
    const myChat = chat.filter((c) => c.suspectId === suspectId);
    const suggestions = me ? suggestQuestions(pc, me.id, found) : [];

    return (
      <div>
        {/* the case file */}
        <details className="arc-details" open={found.length === 0 && chat.length === 0} style={{ position: "relative", marginBottom: 14, borderRadius: "4px 16px 16px 16px", padding: "14px 14px 14px", color: "#3a2606", background: "linear-gradient(180deg, #f3d891, #e6c170)", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.4), 0 10px 22px rgba(0,0,0,0.45)" }}>
          <span aria-hidden style={{ position: "absolute", top: -14, left: 0, height: 16, width: 120, borderRadius: "8px 8px 0 0", background: "#f3d891" }} />
          <summary>
            <span style={{ fontSize: 28 }} aria-hidden>{pc.emoji}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 900, letterSpacing: 2, color: "#7a4d06" }}>CASE FILE</span>
              <span className="arc-display" style={{ display: "block", fontSize: 21, color: "#2e1d02" }}>{pc.title}</span>
            </span>
          </summary>
          <p style={{ margin: "10px 0 0", lineHeight: 1.6, fontWeight: 700, fontSize: 16 }}>{pc.intro}</p>
          <p style={{ margin: "10px 0 0", fontSize: 13.5, fontWeight: 900, color: "#6a4204" }}>
            Missing: {pc.item} · Scene: {pc.crimeScene.emoji} {pc.crimeScene.name} · Level: {MYSTERY_LEVELS[pc.difficulty].label}
          </p>
        </details>

        {energy}

        <div className="arc-tabs" role="tablist">
          {([
            ["search", "🗺️ Search"],
            ["suspects", "🗣️ Suspects"],
            ["notebook", `📓 Notes${found.length + chat.length ? ` (${found.length + chat.length})` : ""}`],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="arc-tab arc-display">
              {label}
            </button>
          ))}
        </div>

        {error && <ErrorBox message={error} />}

        {tab === "search" && (
          <CorkBoard>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "22px 14px" }}>
              {pc.places.map((p, i) => {
                const clue = found.find((c) => c.location === p.id);
                return (
                  <div key={p.id} className={`arc-note ${clue ? "found arc-pop" : ""}`} style={{ rotate: `${[-1.2, 1, -0.6, 1.4, -1.6][i % 5]}deg` }}>
                    <span className="arc-pin" data-pin={clue ? "linked" : undefined} aria-hidden />
                    <p className="arc-display" style={{ margin: 0, fontSize: 18, color: PAPER.ink }}>{p.emoji} {p.name}</p>
                    {clue ? (
                      <>
                        <p style={{ margin: "6px 0 2px", fontWeight: 900, color: "#6a3512" }}>🔍 {clue.title}</p>
                        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.45, fontWeight: 600 }}>{clue.text}</p>
                      </>
                    ) : (
                      <ArcButton variant="amber" size="small" block onClick={() => search(p.id)} disabled={busy || searchesLeft <= 0} style={{ marginTop: 10 }}>
                        {searching === p.id ? "Searching…" : searchesLeft > 0 ? "Search here (🔎 −1)" : "No search energy"}
                      </ArcButton>
                    )}
                  </div>
                );
              })}
            </div>
          </CorkBoard>
        )}

        {tab === "suspects" && !me && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14, marginBottom: 18 }}>
            {pc.suspects.map((s) => (
              <SuspectCard key={s.id} s={s} color={cardColor(s.id)} onClick={() => setSuspectId(s.id)} asked={chat.filter((c) => c.suspectId === s.id).length} />
            ))}
          </div>
        )}

        {tab === "suspects" && me && (
          <div style={{ ...panelStyle(cardColor(me.id), "rgba(16,13,44,0.94)"), padding: 12, marginBottom: 16, overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(50% 40% at 50% 0%, rgba(255,240,200,0.18), transparent 70%)" }} />
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <ArcButton variant="glass" size="small" onClick={() => setSuspectId(null)}>← All</ArcButton>
              <span aria-hidden style={{ flexShrink: 0, width: 50, height: 50, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, background: `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.3), ${cardColor(me.id)} 50%, rgba(0,0,0,0.4))`, boxShadow: `0 0 14px ${cardColor(me.id)}` }}>{me.emoji}</span>
              <div style={{ minWidth: 0 }}>
                <p className="arc-display" style={{ margin: 0, fontSize: 19, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.name}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: ARC.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.personality}</p>
              </div>
            </div>
            <p className="arc-note" style={{ margin: "0 0 12px", padding: "10px 12px", fontSize: 14.5, lineHeight: 1.45, fontWeight: 600 }}><span style={{ fontWeight: 900 }}>Alibi:</span> “{me.alibi}”</p>
            <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8, maxHeight: "40vh", overflowY: "auto", marginBottom: 12, padding: "2px 2px 4px" }} className="gp-scroll" aria-live="polite">
              {myChat.length === 0 && !pending && <p style={{ margin: 0, padding: "8px 0", textAlign: "center", fontSize: 14, fontWeight: 800, color: ARC.mute }}>Ask {me.name.split(" ")[0]} anything about the case…</p>}
              {myChat.map((c, i) => (
                <div key={i}>
                  <Bubble mine>{c.question}</Bubble>
                  <Bubble><span style={{ marginRight: 4 }}>{c.reply.mood}</span>{c.reply.answer}</Bubble>
                </div>
              ))}
              {pending && pending.suspectId === me.id && (
                <div>
                  <Bubble mine>{pending.question}</Bubble>
                  <Bubble thinking>{me.emoji} thinking…</Bubble>
                </div>
              )}
              <div ref={chatEnd} />
            </div>
            {questionsLeft > 0 ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {suggestions.map((q) => (
                    <button key={q} type="button" disabled={busy} onClick={() => ask(q)} className="arc-chip gp-press" style={{ minHeight: 40, padding: "8px 12px", textAlign: "left", cursor: "pointer", borderColor: "rgba(255,193,94,0.55)", background: "rgba(255,193,94,0.12)", color: "#ffe3b0", opacity: busy ? 0.5 : 1 }}>
                      {q}
                    </button>
                  ))}
                </div>
                <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); ask(question); }}>
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={160}
                    placeholder={`Ask ${me.name.split(" ")[0]} a question…`}
                    enterKeyHint="send"
                    aria-label={`Ask ${me.name} a question`}
                    className="arc-input"
                    style={{ flex: 1, minWidth: 0, fontSize: 16 }}
                  />
                  <ArcButton type="submit" variant="amber" disabled={busy || question.trim().length < 3}>
                    Ask 💬
                  </ArcButton>
                </form>
              </>
            ) : (
              <p style={{ margin: 0, textAlign: "center", fontWeight: 800, color: ARC.gold }}>No question energy left — time to accuse!</p>
            )}
          </div>
        )}

        {tab === "notebook" && (
          <div className="arc-journal">
            <span aria-hidden style={{ position: "absolute", right: 22, top: -2, bottom: -2, width: 14, background: "linear-gradient(90deg, #1c0c03, #3b1d0a, #1c0c03)", zIndex: 1, opacity: 0.9 }} />
            <div className="arc-page-ruled" style={{ zIndex: 2 }}>
              <p className="arc-display" style={{ margin: "0 0 6px", fontSize: 20, color: PAPER.inkBrown }}>🔍 Clues</p>
              {found.length === 0 ? <p style={{ margin: "0 0 14px", fontSize: 14.5, fontWeight: 800, color: PAPER.inkSoft }}>None yet — go search!</p> : (
                <ul style={{ margin: "0 0 14px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                  {found.map((c) => {
                    const place = pc.places.find((p) => p.id === c.location);
                    return <li key={c.location} style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}><span style={{ fontWeight: 900 }}>{place?.emoji} {c.title}:</span> {c.text}</li>;
                  })}
                </ul>
              )}
              <p className="arc-display" style={{ margin: "0 0 6px", fontSize: 20, color: PAPER.inkBrown }}>🗣️ Statements</p>
              {chat.length === 0 ? <p style={{ margin: "0 0 14px", fontSize: 14.5, fontWeight: 800, color: PAPER.inkSoft }}>Nobody questioned yet.</p> : (
                <ul style={{ margin: "0 0 14px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                  {chat.map((c, i) => {
                    const s = suspect(c.suspectId);
                    return <li key={i} style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}><span style={{ fontWeight: 900 }}>{s?.emoji} {s?.name}:</span> {c.reply.note}</li>;
                  })}
                </ul>
              )}
              <label className="arc-display" htmlFor="mystery-notes" style={{ display: "block", margin: "0 0 6px", fontSize: 20, color: PAPER.inkBrown }}>✏️ My notes</label>
              <textarea
                id="mystery-notes"
                value={myNotes}
                onChange={(e) => setMyNotes(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="Who seems suspicious? What doesn't add up?"
                className="arc-paper-input"
              />
            </div>
          </div>
        )}

        <PrimaryButton variant="danger" onClick={() => { setError(null); setPhase("accuse"); }} disabled={busy}>
          👉 I know who did it!
        </PrimaryButton>
      </div>
    );
  }

  // idle
  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <GameTitle emoji="🕵️" title="Mystery Detective" sub="A brand-new whodunit every time." />
      {/* the case folder */}
      <div className="arc-rise" style={{ position: "relative", marginTop: 16, marginBottom: 20, borderRadius: "4px 18px 18px 18px", padding: "22px 16px 16px", color: "#3a2606", background: "linear-gradient(180deg, #f3d891, #e6c170)", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.4), 0 12px 26px rgba(0,0,0,0.5)" }}>
        <span aria-hidden style={{ position: "absolute", top: -14, left: 0, height: 16, width: 130, borderRadius: "8px 8px 0 0", background: "#f3d891" }} />
        <span className="arc-stamp" style={{ top: 12, right: 12, color: "#c8243f", fontSize: 14, rotate: "9deg" }}>Top secret</span>
        <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 900, letterSpacing: 2, color: "#7a4d06" }}>DETECTIVE BRIEFING</p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10, fontWeight: 800, fontSize: 15.5, lineHeight: 1.4 }}>
          <li>🎡 Something&apos;s gone missing in Cucaino Park — a new mystery every time!</li>
          <li>🔎 Search {MYSTERY_SEARCHES} places for clues.</li>
          <li>💬 Ask the 4 suspects {MYSTERY_QUESTIONS} questions — one of them is fibbing!</li>
          <li>👉 Accuse the culprit and say why. One chance only!</li>
        </ul>
        {stats.solved > 0 && <p style={{ margin: "12px 0 0", paddingTop: 10, borderTop: "1.5px dashed rgba(90,60,10,0.35)", fontSize: 14, fontWeight: 900, color: "#6a4204" }}>🏅 Solved: {stats.solved}{stats.streak > 1 ? ` · 🔥 Streak: ${stats.streak}` : ""}</p>}
      </div>

      <SectionLabel>Level</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 20 }}>
        {LEVEL_ORDER.map((d) => {
          const l = MYSTERY_LEVELS[d];
          return (
            <Tile key={d} selected={difficulty === d} onClick={() => setDifficulty(d)} style={{ minHeight: 62, padding: "8px 16px", display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
              <span style={{ fontSize: 28 }} aria-hidden>{l.emoji}</span>
              <span>
                <span className="arc-display" style={{ display: "block", fontSize: 19 }}>{l.label}</span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: ARC.dim }}>{l.blurb}</span>
              </span>
            </Tile>
          );
        })}
      </div>

      {error && <ErrorBox message={error} onRetry={sparks >= MYSTERY_SPARK_COST ? newCase : undefined} />}
      <PrimaryButton variant="amber" onClick={newCase} disabled={busy || !kidId || sparks < MYSTERY_SPARK_COST}>
        Open a new case — {MYSTERY_SPARK_COST} ⚡
      </PrimaryButton>
      <SparkNote cost={MYSTERY_SPARK_COST} sparks={sparks} />
    </div>
  );
}

/** glowing energy pips (searches / questions) */
function Pips({ icon, left, total, color, title }: { icon: string; left: number; total: number; color: string; title: string }) {
  return (
    <span title={title} aria-hidden style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 17 }}>{icon}</span>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ width: 11, height: 11, borderRadius: 999, background: i < left ? color : "rgba(255,255,255,0.12)", boxShadow: i < left ? `0 0 8px ${color}` : "inset 0 0 0 1px rgba(255,255,255,0.15)" }} />
      ))}
    </span>
  );
}

/** a suspect as a collectible trading card */
function SuspectCard({ s, color, onClick, selected, asked, compact, children }: { s: Suspect; color: string; onClick: () => void; selected?: boolean; asked?: number; compact?: boolean; children?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={`arc-tcard ${selected ? "on" : ""}`} style={{ ["--card" as string]: color } as CSSProperties}>
      <div className="arc-tcard-in">
        <div style={{ position: "relative", height: compact ? 96 : 104, display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(70% 90% at 50% 40%, color-mix(in srgb, ${color} 55%, transparent), transparent 70%), repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 6px, transparent 6px 12px)` }}>
          <span className="gp-shimmer" aria-hidden />
          <span aria-hidden style={{ fontSize: 56, filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.45))" }}>{s.emoji}</span>
          {children}
        </div>
        <div className="arc-display" style={{ padding: "7px 8px", textAlign: "center", fontSize: 16.5, color: "#1a1030", background: `linear-gradient(180deg, color-mix(in srgb, ${color} 70%, white), ${color})`, boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.15)" }}>
          {s.name}
        </div>
        {!compact && (
          <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: ARC.dim, lineHeight: 1.35 }}>{s.personality}</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: ARC.text, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 900, color }}>Says:</span> “{s.alibi}”
            </p>
            <p style={{ margin: "auto 0 0", paddingTop: 4, fontSize: 12.5, fontWeight: 900, color: ARC.gold }}>Question them 💬 ({asked ?? 0} asked)</p>
          </div>
        )}
      </div>
    </button>
  );
}

function Bubble({ children, mine, thinking }: { children: ReactNode; mine?: boolean; thinking?: boolean }) {
  return (
    <p
      className={thinking ? "arc-pulse" : "arc-rise"}
      style={{
        margin: mine ? "0 0 0 auto" : "6px 0 0",
        width: "fit-content",
        maxWidth: mine ? "85%" : "90%",
        padding: "9px 13px",
        borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        fontWeight: mine ? 800 : 700,
        fontSize: mine ? 14.5 : 15.5,
        lineHeight: 1.45,
        color: mine ? ARC.ink : thinking ? ARC.dim : ARC.text,
        background: mine ? `linear-gradient(180deg, ${ARC.goldHi}, ${ARC.gold})` : "rgba(255,255,255,0.1)",
        border: mine ? "none" : "1.5px solid rgba(160,190,255,0.25)",
        boxShadow: mine ? "0 3px 0 #9a5c00" : "none",
      }}
    >
      {children}
    </p>
  );
}

/**
 * The cork case board. Pins marked data-pin="linked" (found clues) are joined by a red
 * string, measured after layout so it follows the notes on any screen size.
 */
function CorkBoard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pts, setPts] = useState<[number, number][]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const next = Array.from(el.querySelectorAll<HTMLElement>("[data-pin='linked']")).map((p): [number, number] => {
        const r = p.getBoundingClientRect();
        return [Math.round(r.left + r.width / 2 - box.left - el.clientLeft), Math.round(r.top + r.height / 2 - box.top - el.clientTop)];
      });
      setPts((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // a freshly found note pops in (scale animation): re-measure once it settles
    el.addEventListener("animationend", measure);
    return () => {
      ro.disconnect();
      el.removeEventListener("animationend", measure);
    };
  });
  let d = "";
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    // sag like real string; notes stacked in one column bow out sideways instead
    const straightDown = Math.abs(x1 - x0) < 40;
    d += straightDown ? `M${x0},${y0} Q${Math.max(x0, x1) + 70},${(y0 + y1) / 2} ${x1},${y1} ` : `M${x0},${y0} Q${(x0 + x1) / 2},${Math.max(y0, y1) + 28} ${x1},${y1} `;
  }
  return (
    <div ref={ref} className="arc-cork">
      {children}
      <svg aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", zIndex: 4 }}>
        {d && <path d={d} fill="none" stroke="#d62839" strokeWidth={2.5} strokeLinecap="round" style={{ filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.45))" }} />}
        {pts.length > 1 &&
          pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={8} fill="url(#arc-pin-grad)" style={{ filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.45))" }} />
          ))}
        <defs>
          <radialGradient id="arc-pin-grad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ff9aa6" />
            <stop offset="55%" stopColor="#d62839" />
            <stop offset="100%" stopColor="#7a0c1c" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
