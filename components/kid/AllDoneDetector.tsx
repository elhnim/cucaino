"use client";

import { useEffect, useState } from "react";
import { AllDoneScreen } from "@/components/kid/CelebrationOverlay";
import type { Task } from "@/lib/domain/types";

export default function AllDoneDetector({
  kidId,
  kidName,
  kidAvatar,
  streak,
  total,
  initialDone,
  selfAddableTasks,
  accentColor,
}: {
  kidId: string;
  kidName: string;
  kidAvatar: string;
  streak: number;
  total: number;
  initialDone: number;
  selfAddableTasks?: Task[];
  accentColor?: string;
}) {
  const [doneCount, setDoneCount] = useState(initialDone);
  const [starsToday, setStarsToday] = useState(0);
  const [shown, setShown] = useState(false);
  const [completedInSession, setCompletedInSession] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ points: number }>).detail;
      setDoneCount((n) => n + 1);
      setStarsToday((s) => s + (detail?.points ?? 0));
      setCompletedInSession(true);
    };
    window.addEventListener("task-completed", handler);
    return () => window.removeEventListener("task-completed", handler);
  }, []);

  useEffect(() => {
    if (total > 0 && doneCount >= total && completedInSession && !shown) {
      const t = setTimeout(() => setShown(true), 4500);
      return () => clearTimeout(t);
    }
  }, [doneCount, total, shown, completedInSession]);

  if (!shown) return null;

  return (
    <AllDoneScreen
      kidId={kidId}
      kidName={kidName}
      kidAvatar={kidAvatar}
      starsToday={starsToday}
      streak={streak}
      taskCount={total}
      selfAddableTasks={selfAddableTasks}
      accentColor={accentColor}
    />
  );
}
