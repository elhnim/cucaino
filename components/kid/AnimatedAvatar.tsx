"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Kid avatar emoji that feels alive: floats gently while idle, does a
 * squash-and-stretch bounce when tapped, and jumps to celebrate whenever
 * a task is completed (global "task-completed" event).
 *
 * `kidId` puts the data-kid-avatar attribute on the animated span so
 * KidOverridesApplier can keep patching the emoji via textContent.
 */
export default function AnimatedAvatar({
  emoji,
  kidId,
  celebrate = false,
  className = "",
}: {
  emoji: string;
  kidId?: string;
  celebrate?: boolean;
  className?: string;
}) {
  const [bouncing, setBouncing] = useState(false);
  const bounce = useCallback(() => setBouncing(true), []);

  useEffect(() => {
    if (!celebrate) return;
    window.addEventListener("task-completed", bounce);
    return () => window.removeEventListener("task-completed", bounce);
  }, [celebrate, bounce]);

  return (
    <span
      data-kid-avatar={kidId}
      onPointerDown={bounce}
      onAnimationEnd={() => setBouncing(false)}
      className={`inline-block select-none ${bouncing ? "avatar-bounce" : "avatar-idle"} ${className}`}
    >
      {emoji}
    </span>
  );
}
