"use client";

// The park-native homes of the learning & money games. Each hall is a candy hub (shelf, game
// picker, wallet) that runs the existing game components natively on a GameStage — same
// server actions, same progress, same rewards — instead of opening the old flat pages.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { COURSES } from "@/lib/courses/registry";
import { STORIES } from "@/lib/stories/registry";
import { ARCADE_GAMES } from "@/lib/arcade/games";
import { REAL_ASSETS } from "@/lib/invest/assets";
import { convertStarsToSparks } from "@/lib/actions/arcade";
import { getArcadeInfo, getBankData, getLearnProgress, getLibraryProgress, getMoneyTownKids } from "@/lib/actions/park-games";
import { playSfx } from "@/lib/audio/sound-manager";
import type { Kid } from "@/lib/domain/types";
import { GameStage } from "./GameStage";
import { CandyButton } from "../ui/CandySheet";

const CourseClient = dynamic(() => import("@/components/course/CourseClient"), { ssr: false });
const StoryLibrary = dynamic(() => import("@/components/library/StoryLibrary"), { ssr: false });
const MoneyTownGame = dynamic(() => import("@/components/money-town/MoneyTownGame"), { ssr: false });
const InvestHub = dynamic(() => import("@/components/invest/InvestHub"), { ssr: false });
const ARCADE_COMPONENTS = {
  "emoji-story": dynamic(() => import("@/components/arcade/games/EmojiStory"), { ssr: false }),
  "would-you-rather": dynamic(() => import("@/components/arcade/games/WouldYouRather"), { ssr: false }),
  "what-am-i": dynamic(() => import("@/components/arcade/games/WhatAmI"), { ssr: false }),
  "word-detective": dynamic(() => import("@/components/arcade/games/WordDetective"), { ssr: false }),
  "stump-the-ai": dynamic(() => import("@/components/arcade/games/StumpTheAI"), { ssr: false }),
  "ai-lie-detector": dynamic(() => import("@/components/arcade/games/AILieDetector"), { ssr: false }),
} as const;

export type HallKind = "learn" | "library" | "theatre" | "arcade" | "money-town" | "bank";

export function GameHall({ kind, kidId, onClose }: { kind: HallKind; kidId: string; onClose: () => void }) {
  if (kind === "learn") return <LearnHall kidId={kidId} onClose={onClose} />;
  if (kind === "library") return <LibraryHall kidId={kidId} onClose={onClose} books />;
  if (kind === "theatre") return <LibraryHall kidId={kidId} onClose={onClose} />;
  if (kind === "arcade") return <ArcadeHall kidId={kidId} onClose={onClose} />;
  if (kind === "money-town") return <MoneyTownHall kidId={kidId} onClose={onClose} />;
  return <BankHall kidId={kidId} onClose={onClose} />;
}

// ── 🎓 Learn: a candy shelf of mini-courses ──
function LearnHall({ kidId, onClose }: { kidId: string; onClose: () => void }) {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof getLearnProgress>> | null>(null);
  useEffect(() => {
    if (!courseId) return;
    setProgress(null);
    getLearnProgress(kidId, courseId).then(setProgress);
  }, [kidId, courseId]);
  const course = COURSES.find((c) => c.id === courseId);
  return (
    <GameStage title={course ? `${course.emoji} ${course.title}` : "🎓 Learning Tree"} color="#f43f5e" onClose={onClose} onBack={course ? () => setCourseId(null) : undefined}>
      {course ? (
        progress ? (
          <CourseClient course={course} kidId={kidId} initialProgress={progress} />
        ) : (
          <Loading />
        )
      ) : (
        <Shelf intro="Mini-courses from the best books — read, take the quiz, earn ⭐ stars!">
          {COURSES.map((c) => (
            <ShelfCard key={c.id} emoji={c.emoji} title={c.title} sub={`${c.subtitle} · ${c.lessons.length} lessons`} color="#f43f5e" onClick={() => setCourseId(c.id)} />
          ))}
        </Shelf>
      )}
    </GameStage>
  );
}

// ── 📚 Library (chapter books) and 🎭 Story Theatre (fables, myths and short tales) ──
const CHAPTER_BOOKS = STORIES.filter((s) => s.chapters?.length);
const SHORT_TALES = STORIES.filter((s) => !s.chapters?.length);
function LibraryHall({ kidId, onClose, books }: { kidId: string; onClose: () => void; books?: boolean }) {
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof getLibraryProgress>> | null>(null);
  useEffect(() => {
    getLibraryProgress(kidId).then(setProgress);
  }, [kidId]);
  return (
    <GameStage title={books ? "📚 Library" : "🎭 Story Theatre"} color={books ? "#0ea5e9" : "#e84a8a"} onClose={onClose}>
      {progress ? <StoryLibrary stories={books ? CHAPTER_BOOKS : SHORT_TALES} kidId={kidId} initialProgress={progress} /> : <Loading />}
    </GameStage>
  );
}

// ── 🕹️ AI Arcade: sparks wallet + game picker ──
function ArcadeHall({ kidId, onClose }: { kidId: string; onClose: () => void }) {
  const [info, setInfo] = useState<{ sparks: number; stars: number } | null>(null);
  const [game, setGame] = useState<keyof typeof ARCADE_COMPONENTS | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const reload = () => getArcadeInfo(kidId).then(setInfo);
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidId]);
  const convert = async (stars: number) => {
    const res = await convertStarsToSparks(kidId, stars);
    if (!res.ok) {
      setMsg(res.error);
      playSfx("wrong");
      return;
    }
    playSfx("coin");
    setMsg(`+${stars * 5} ⚡ sparks!`);
    window.dispatchEvent(new CustomEvent("stars-spent", { detail: { amount: stars } }));
    void reload();
  };
  const def = game ? ARCADE_GAMES.find((g) => g.id === game) : null;
  const Game = game ? ARCADE_COMPONENTS[game] : null;
  return (
    <GameStage
      title={def ? `${def.emoji} ${def.name}` : "🕹️ AI Arcade"}
      color="#06b6d4"
      onClose={onClose}
      onBack={game ? () => { setGame(null); void reload(); } : undefined}
    >
      {Game && info ? (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: 12 }}>
          <Game kidId={kidId} sparksBalance={info.sparks} />
        </div>
      ) : !info ? (
        <Loading />
      ) : (
        <Shelf intro="Brain games powered by AI. Each game costs a few ⚡ sparks — turn your stars into sparks here.">
          <div style={{ ...wallet, gridColumn: "1 / -1" }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#0e5d73" }}>
              ⚡ {info.sparks} sparks <span style={{ fontSize: 13, color: "#5a8a98" }}>· ⭐ {info.stars} stars · 1 ⭐ = 5 ⚡</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 3, 5].map((n) => (
                <CandyButton key={n} small color="#06b6d4" disabled={info.stars < n} onClick={() => convert(n)}>
                  ⭐{n} → ⚡{n * 5}
                </CandyButton>
              ))}
            </div>
            {msg && <div style={{ fontWeight: 900, color: "#0e5d73" }}>{msg}</div>}
          </div>
          {ARCADE_GAMES.map((g) => (
            <ShelfCard
              key={g.id}
              emoji={g.emoji}
              title={g.name}
              sub={`${g.tagline} · ⚡${g.sparkCost}`}
              color="#06b6d4"
              locked={info.sparks < g.sparkCost}
              onClick={() => g.id in ARCADE_COMPONENTS && setGame(g.id as keyof typeof ARCADE_COMPONENTS)}
            />
          ))}
        </Shelf>
      )}
    </GameStage>
  );
}

// ── 💰 Money Town: the family board game ──
function MoneyTownHall({ kidId, onClose }: { kidId: string; onClose: () => void }) {
  const [kids, setKids] = useState<Kid[] | null>(null);
  useEffect(() => {
    getMoneyTownKids().then(setKids);
  }, []);
  return (
    <GameStage title="💰 Money Town" color="#eab308" onClose={onClose}>
      {kids ? <div style={{ height: "100%" }}><MoneyTownGame kids={kids} activeKidId={kidId} /></div> : <Loading />}
    </GameStage>
  );
}

// ── 🏦 The Bank: real-money investing, still switched on by a grown-up ──
function BankHall({ kidId, onClose }: { kidId: string; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getBankData>> | "loading">("loading");
  useEffect(() => {
    getBankData(kidId).then(setData);
  }, [kidId]);
  return (
    <GameStage title="🏦 The Bank" color="#4f46e5" onClose={onClose}>
      {data === "loading" ? (
        <Loading />
      ) : !data || !data.enabled ? (
        <div style={{ maxWidth: 460, margin: "40px auto", textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 64 }}>🔒</div>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#3b2a7a" }}>The Bank is locked</div>
          <p style={{ fontWeight: 800, color: "#6b5aa0" }}>Ask a grown-up to switch on investing when your family is ready for real money ups and downs. Until then, practise in the Nugget Market! 📈</p>
        </div>
      ) : (
        <InvestHub kid={data.kid} account={data.account} licence={data.licence} holdings={data.holdings} transactions={data.transactions} prices={data.prices} assets={REAL_ASSETS} />
      )}
    </GameStage>
  );
}

// ── shared bits ──
function Loading() {
  return <div style={{ textAlign: "center", padding: "48px 0", fontWeight: 900, color: "#b0799f", fontSize: 18 }}>🍭 Loading…</div>;
}

function Shelf({ intro, children }: { intro: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 16 }}>
      <p style={{ fontWeight: 800, color: "#9b7090", marginTop: 0 }}>{intro}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>{children}</div>
    </div>
  );
}

function ShelfCard({ emoji, title, sub, color, locked, onClick }: { emoji: string; title: string; sub: string; color: string; locked?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        borderRadius: 24,
        padding: 14,
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#fff",
        boxShadow: `0 5px 0 ${color}55, 0 10px 18px rgba(122,46,98,0.08)`,
        cursor: "pointer",
        opacity: locked ? 0.7 : 1,
      }}
    >
      <div style={{ width: 58, height: 58, borderRadius: 20, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 }}>{emoji}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: "#5a2350" }}>{title}</div>
        <div style={{ fontWeight: 800, fontSize: 12, color: "#9b7090" }}>{locked ? "Need more ⚡ sparks" : sub}</div>
      </div>
    </button>
  );
}

const wallet: React.CSSProperties = {
  borderRadius: 24,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "linear-gradient(#e6fbff, #ffffff)",
  boxShadow: "0 5px 0 #b6ecf5",
};
