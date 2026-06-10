"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import AddTaskButton from "@/components/kid/AddTaskButton";
import type { Task } from "@/lib/domain/types";

// ── FG-01: Task done bottom sheet ──────────────────────────────────────────
export function TaskDoneSheet({
  taskIcon,
  taskName,
  points,
  onContinue,
  accent = "#c026d3",
  decoration,
}: {
  taskIcon: string;
  taskName: string;
  points: number;
  onContinue: () => void;
  /** Theme accent — colours the continue button */
  accent?: string;
  /** Theme decoration emoji — woven into the celebration row */
  decoration?: string;
}) {
  // Auto-dismiss after 4s if user doesn't tap
  useEffect(() => {
    const t = setTimeout(onContinue, 4000);
    return () => clearTimeout(t);
  }, [onContinue]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onContinue}>
      {/* dim */}
      <div className="absolute inset-0 bg-black/30" />
      {/* card */}
      <div
        className="relative bg-white rounded-t-[28px] px-7 pt-6 pb-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center gap-1.5 mb-2 text-lg select-none">
          {decoration ? `🎊 ${decoration} 🎉 ${decoration} 🎊` : "🎊 🎉 ✨ 🎊 🎉"}
        </div>
        <div className="text-6xl leading-none mb-2 animate-pop inline-block">{taskIcon}</div>
        <div className="text-xl font-black text-gray-900 mb-1">{taskName}</div>
        <div className="text-sm text-gray-500 mb-4">Task complete! Nice work 💪</div>
        <div className="inline-flex items-center gap-2 bg-yellow-50 border-2 border-yellow-300 rounded-full px-5 py-2 text-lg font-black text-yellow-800 mb-5">
          ⭐ +{points} stars
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="w-full py-3.5 rounded-2xl font-black text-base text-white active:scale-95 transition-transform"
          style={{ background: accent }}
        >
          Keep going →
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ── FG-03: All tasks done full-screen ─────────────────────────────────────
export function AllDoneScreen({
  kidName,
  kidAvatar,
  starsToday,
  streak,
  taskCount,
  kidId,
  selfAddableTasks = [],
  accentColor,
  gradient,
  decoration,
}: {
  kidName: string;
  kidAvatar: string;
  starsToday: number;
  streak: number;
  taskCount: number;
  kidId: string;
  selfAddableTasks?: Task[];
  accentColor?: string;
  /** Theme header gradient classes (e.g. "from-orange-500 to-amber-500") */
  gradient?: string;
  /** Theme decoration emoji — rains down the screen */
  decoration?: string;
}) {
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-7 text-center overflow-hidden ${gradient ? `bg-gradient-to-br ${gradient}` : ""}`}
      style={gradient ? undefined : { background: "linear-gradient(160deg, #a21caf 0%, #c026d3 50%, #f0abfc 100%)" }}
    >
      {/* theme-emoji rain */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {[8, 24, 42, 58, 74, 90].map((left, i) => (
          <span
            key={left}
            className="emoji-rain-piece"
            style={{
              left: `${left}%`,
              animationDelay: `${i * 0.55}s`,
              fontSize: i % 2 === 0 ? 28 : 20,
            }}
          >
            {decoration ?? "🎉"}
          </span>
        ))}
      </div>

      {/* avatar ring */}
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-5xl mb-6"
        style={{
          background: "rgba(255,255,255,0.25)",
          border: "4px solid rgba(255,255,255,0.5)",
          boxShadow: "0 0 60px rgba(255,255,255,0.2)",
        }}
      >
        <span className="avatar-party inline-block">{kidAvatar}</span>
      </div>
      <h1 className="text-3xl font-black text-white leading-tight mb-2">
        All done, {kidName}! 🎉
      </h1>
      <p className="text-sm text-white/80 mb-7">
        You crushed every task today — incredible! 🚀
      </p>

      {/* stats */}
      <div className="flex gap-3 mb-7">
        {[
          { val: `⭐ ${starsToday}`, lbl: "STARS TODAY" },
          { val: `🔥 ${streak}d`, lbl: "STREAK" },
          { val: `✅ ${taskCount}`, lbl: "TASKS DONE" },
        ].map((s) => (
          <div
            key={s.lbl}
            className="rounded-2xl px-4 py-3 text-center"
            style={{ background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.3)" }}
          >
            <div className="text-xl font-black text-white mb-0.5">{s.val}</div>
            <div className="text-[9px] font-bold text-white/70 tracking-widest">{s.lbl}</div>
          </div>
        ))}
      </div>

      {selfAddableTasks.length > 0 && accentColor && (
        <div className="w-full mb-3">
          <p className="text-xs font-bold text-white/70 mb-2 text-center">
            Want to keep the momentum going? 💪
          </p>
          <AddTaskButton
            kidId={kidId}
            availableTasks={selfAddableTasks}
            accentColor="rgba(255,255,255,0.25)"
            dayLabel="today"
          />
        </div>
      )}

      <Link
        href={`/kid/${kidId}/home`}
        className="w-full py-4 rounded-2xl font-black text-base mb-3 active:scale-95 transition-transform"
        style={{ background: "white", color: accentColor ?? "#c026d3" }}
      >
        Back to home 🏠
      </Link>
      <Link
        href={`/kid/${kidId}/rewards`}
        className="text-sm font-bold text-white/80"
      >
        Spend my stars ⭐
      </Link>
    </div>,
    document.body,
  );
}
