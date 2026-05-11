"use client";

import { useEffect, useState } from "react";
import { AllDoneScreen } from "@/components/kid/CelebrationOverlay";

/**
 * Listens for the custom "task-completed" event dispatched by TodoTaskCard
 * after each completion. When total completions reach total tasks, shows
 * the FG-03 all-done screen.
 */
export default function AllDoneDetector({
  kidId,
  kidName,
  kidAvatar,
  streak,
  total,
  initialDone,
}: {
  kidId: string;
  kidName: string;
  kidAvatar: string;
  streak: number;
  total: number;
  initialDone: number;
}) {
  const [doneCount, setDoneCount] = useState(initialDone);
  const [starsToday, setStarsToday] = useState(0);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ points: number }>).detail;
      setDoneCount((n) => n + 1);
      setStarsToday((s) => s + (detail?.points ?? 0));
    };
    window.addEventListener("task-completed", handler);
    return () => window.removeEventListener("task-completed", handler);
  }, []);

  useEffect(() => {
    if (total > 0 && doneCount >= total && !shown) {
      // Small delay so the task-done sheet can auto-dismiss first
      const t = setTimeout(() => setShown(true), 4500);
      return () => clearTimeout(t);
    }
  }, [doneCount, total, shown]);

  if (!shown) return null;

  return (
    <AllDoneScreen
      kidId={kidId}
      kidName={kidName}
      kidAvatar={kidAvatar}
      starsToday={starsToday}
      streak={streak}
      taskCount={total}
    />
  );
}
