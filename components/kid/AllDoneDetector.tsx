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
  gradient,
  decoration,
}: {
  kidId: string;
  kidName: string;
  kidAvatar: string;
  streak: number;
  total: number;
  initialDone: number;
  selfAddableTasks?: Task[];
  accentColor?: string;
  gradient?: string;
  decoration?: string;
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
    const undoHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ points: number }>).detail;
      setDoneCount((n) => Math.max(0, n - 1));
      setStarsToday((s) => Math.max(0, s - (detail?.points ?? 0)));
    };
    window.addEventListener("task-completed", handler);
    window.addEventListener("task-uncompleted", undoHandler);
    return () => {
      window.removeEventListener("task-completed", handler);
      window.removeEventListener("task-uncompleted", undoHandler);
    };
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
      gradient={gradient}
      decoration={decoration}
    />
  );
}
