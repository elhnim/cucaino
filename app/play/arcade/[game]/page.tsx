import { notFound } from "next/navigation";
import { ARCADE_GAMES } from "@/lib/arcade/games";
import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import GameShell from "@/components/arcade/GameShell";
import EmojiStory from "@/components/arcade/games/EmojiStory";
import WhatAmI from "@/components/arcade/games/WhatAmI";
import StumpTheAI from "@/components/arcade/games/StumpTheAI";
import DoodleGuess from "@/components/arcade/games/DoodleGuess";
import MysteryDetective from "@/components/arcade/games/MysteryDetective";
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
  } else if (gameSlug === "what-am-i") {
    gameComponent = <WhatAmI kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else if (gameSlug === "stump-the-ai") {
    gameComponent = <StumpTheAI kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else if (gameSlug === "doodle-guess") {
    gameComponent = <DoodleGuess kidId={kidIdStr} sparksBalance={sparksBalance} />;
  } else if (gameSlug === "mystery-detective") {
    gameComponent = <MysteryDetective kidId={kidIdStr} sparksBalance={sparksBalance} />;
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
