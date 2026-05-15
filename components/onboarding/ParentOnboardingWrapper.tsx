"use client";

import { useState, useCallback } from "react";
import { GoalsScreen, type GoalsOption } from "./GoalsScreen";
import { WelcomeScreen } from "./WelcomeScreen";
import { TourProvider, TourAutoStart } from "./TourContext";
import { TourCard } from "./TourCard";
import { PARENT_TOUR_STEPS } from "./tourSteps";
import { saveParentGoals, markParentTourSeen } from "@/lib/actions/onboarding";

const PARENT_GOALS_OPTIONS: GoalsOption[] = [
  { key: "habits", emoji: "🌟", label: "Build habits my kids stick to on their own" },
  { key: "morning", emoji: "☀️", label: "Create a calm, smooth morning routine" },
  { key: "screen_time", emoji: "📱", label: "Take the battle out of screen time" },
  { key: "music", emoji: "🎵", label: "Make music practice a daily habit" },
  { key: "school", emoji: "📚", label: "Stay on top of schoolwork together" },
  { key: "value", emoji: "💰", label: "Teach my kids the value of earning things" },
  { key: "other", emoji: "✏️", label: "Other" },
];

type Phase = "goals" | "welcome" | "touring" | "done";

interface ParentOnboardingWrapperProps {
  parentTourSeen: boolean;
  familyName: string;
  children: React.ReactNode;
}

export function ParentOnboardingWrapper({
  parentTourSeen,
  familyName,
  children,
}: ParentOnboardingWrapperProps) {
  const [phase, setPhase] = useState<Phase>(parentTourSeen ? "done" : "goals");

  const handleGoalsContinue = useCallback(
    async (selected: string[], otherText: string) => {
      if (selected.length > 0 || otherText) {
        await saveParentGoals(selected, otherText);
      }
      setPhase("welcome");
    },
    [],
  );

  const handleGoalsSkip = useCallback(() => setPhase("welcome"), []);

  const handleWelcomeContinue = useCallback(() => setPhase("touring"), []);

  const handleWelcomeSkip = useCallback(async () => {
    await markParentTourSeen();
    setPhase("done");
  }, []);

  const handleTourComplete = useCallback(async () => {
    await markParentTourSeen();
    setPhase("done");
  }, []);

  return (
    <TourProvider steps={PARENT_TOUR_STEPS} onComplete={handleTourComplete}>
      {children}
      <TourCard />
      {phase === "touring" && <TourAutoStart />}

      {phase === "goals" && (
        <GoalsScreen
          variant="parent"
          familyName={familyName}
          options={PARENT_GOALS_OPTIONS}
          onContinue={handleGoalsContinue}
          onSkip={handleGoalsSkip}
        />
      )}

      {phase === "welcome" && (
        <WelcomeScreen
          variant="parent"
          familyName={familyName}
          onContinue={handleWelcomeContinue}
          onSkip={handleWelcomeSkip}
        />
      )}
    </TourProvider>
  );
}
