import { notFound } from "next/navigation";
import { ARCADE_GAMES } from "@/lib/arcade/games";
import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import GameShell from "@/components/arcade/GameShell";
import EmojiStory from "@/components/arcade/games/EmojiStory";
import WouldYouRather from "@/components/arcade/games/WouldYouRather";
import WhatAmI from "@/components/arcade/games/WhatAmI";
import WordDetective from "@/components/arcade/games/WordDetective";
import StumpTheAI from "@/components/arcade/games/StumpTheAI";
import AILieDetector from "@/components/arcade/games/AILieDetector";
import FamilyTalkingPoint from "@/components/arcade/games/FamilyTalkingPoint";
import type { ReactNode } from "react";

export default async function ArcadeGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ kid?: string }>;
}) {
  const { game: gameSlug } = await params;
  const { kid: kidId } = await searchParams;

  const game = ARCADE_GAMES.find((g) => g.id === gameSlug);
  if (!game) notFound();

  const kid = kidId ? await getKid(kidId) : null;
  const sparksBalance = kid?.sparksBalance ?? 0;
  const kidIdStr = kid?.id ?? null;

  let gameComponent: ReactNode;
  if (gameSlug === "emoji-story") {
    gameComponent = <EmojiStory kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else if (gameSlug === "would-you-rather") {
    gameComponent = <WouldYouRather kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else if (gameSlug === "what-am-i") {
    gameComponent = <WhatAmI kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else if (gameSlug === "word-detective") {
    gameComponent = <WordDetective kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else if (gameSlug === "stump-the-ai") {
    gameComponent = <StumpTheAI kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else if (gameSlug === "ai-lie-detector") {
    gameComponent = <AILieDetector kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else if (gameSlug === "family-talking-point") {
    gameComponent = <FamilyTalkingPoint kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else {
    notFound();
    return null;
  }

  const content = (
    <GameShell kidId={kidIdStr} sparksBalance={sparksBalance} game={game}>
      {gameComponent}
    </GameShell>
  );

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-sky-100">
      {content}
    </div>
  );
}
