"use client";

import { useState, useCallback } from "react";
import { GoalsScreen, type GoalsOption } from "./GoalsScreen";
import { InterestsScreen } from "./InterestsScreen";
import { WelcomeScreen } from "./WelcomeScreen";
import { TourProvider, TourAutoStart } from "./TourContext";
import { TourCard } from "./TourCard";
import { kidTourSteps } from "./tourSteps";
import {
  saveKidGoals,
  saveKidInterests,
  markKidTourSeen,
} from "@/lib/actions/onboarding";
import type { ThemeId } from "@/lib/domain/types";

const KID_GOALS_OPTIONS: GoalsOption[] = [
  { key: "prizes", emoji: "🎁", label: "Get awesome prizes" },
  { key: "badges", emoji: "🏆", label: "Collect all the badges" },
  { key: "streak", emoji: "🔥", label: "Never break my streak" },
  { key: "music", emoji: "🎵", label: "Become a music superstar" },
  { key: "hero", emoji: "💪", label: "Be my family's hero" },
  { key: "quizzes", emoji: "🎮", label: "Dominate the quizzes" },
  { key: "other", emoji: "✏️", label: "Something else" },
];

type Phase = "goals" | "interests" | "welcome" | "touring" | "done";

interface KidOnboardingWrapperProps {
  tourSeen: boolean;
  kidId: string;
  kidName: string;
  kidAvatar: string;
  themeId: ThemeId;
  children: React.ReactNode;
}

export function KidOnboardingWrapper({
  tourSeen,
  kidId,
  kidName,
  kidAvatar,
  themeId,
  children,
}: KidOnboardingWrapperProps) {
  const [phase, setPhase] = useState<Phase>(tourSeen ? "done" : "goals");
  const steps = kidTourSteps(kidId);

  const handleGoalsContinue = useCallback(
    async (selected: string[], otherText: string) => {
      if (selected.length > 0 || otherText) {
        await saveKidGoals(kidId, selected, otherText);
      }
      setPhase("interests");
    },
    [kidId],
  );

  const handleGoalsSkip = useCallback(() => setPhase("interests"), []);

  const handleInterestsContinue = useCallback(
    async (selected: string[], otherText: string) => {
      if (selected.length > 0 || otherText) {
        await saveKidInterests(kidId, selected, otherText);
      }
      setPhase("welcome");
    },
    [kidId],
  );

  const handleInterestsSkip = useCallback(() => setPhase("welcome"), []);

  const handleWelcomeContinue = useCallback(() => setPhase("touring"), []);

  const handleWelcomeSkip = useCallback(async () => {
    const result = await markKidTourSeen(kidId);
    if (result.ok) setPhase("done");
  }, [kidId]);

  const handleTourComplete = useCallback(async () => {
    const result = await markKidTourSeen(kidId);
    if (result.ok) setPhase("done");
  }, [kidId]);

  return (
    <TourProvider steps={steps} onComplete={handleTourComplete}>
      {children}
      <TourCard />
      {phase === "touring" && <TourAutoStart />}

      {phase === "goals" && (
        <GoalsScreen
          variant="kid"
          kidName={kidName}
          kidAvatar={kidAvatar}
          options={KID_GOALS_OPTIONS}
          onContinue={handleGoalsContinue}
          onSkip={handleGoalsSkip}
        />
      )}

      {phase === "interests" && (
        <InterestsScreen
          kidName={kidName}
          kidAvatar={kidAvatar}
          onContinue={handleInterestsContinue}
          onSkip={handleInterestsSkip}
        />
      )}

      {phase === "welcome" && (
        <WelcomeScreen
          variant="kid"
          kidName={kidName}
          kidAvatar={kidAvatar}
          onContinue={handleWelcomeContinue}
          onSkip={handleWelcomeSkip}
        />
      )}
    </TourProvider>
  );
}
