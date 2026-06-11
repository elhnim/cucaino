"use client";

import { useEffect, useState } from "react";

/**
 * "🕐 Prices updated today 7:04 am" — formatted on the client after mount so
 * the server's UTC timezone can't cause a hydration mismatch.
 */
export default function PriceTimestamp({
  iso,
  prefix = "Prices updated",
  className = "text-[11px] font-bold text-slate-400",
}: {
  iso: string | null;
  prefix?: string;
  className?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) return;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return;
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    setLabel(
      sameDay
        ? `today ${time}`
        : `${d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })} ${time}`,
    );
  }, [iso]);

  if (!label) return null;
  return (
    <p className={className}>
      🕐 {prefix} {label}
    </p>
  );
}
