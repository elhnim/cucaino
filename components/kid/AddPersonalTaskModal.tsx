"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/actions/tasks";
import type { TimeBlock } from "@/lib/domain/types";

const ICONS = ["⭐", "🎯", "📚", "🎨", "🎵", "🏃", "💪", "🧹", "🌿", "🎮", "🐾", "🍎", "🚴", "🧘", "📖", "🌟"];

const TIME_BLOCKS: { value: TimeBlock; label: string; emoji: string }[] = [
  { value: "morning",      label: "Morning",   emoji: "☀️" },
  { value: "afternoon",    label: "Afternoon", emoji: "🌤️" },
  { value: "evening",      label: "Evening",   emoji: "🌙" },
  { value: "anytime",      label: "Anytime",   emoji: "✨" },
];

export default function AddPersonalTaskModal({
  kidId,
  accent,
}: {
  kidId: string;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("⭐");
  const [timeBlock, setTimeBlock] = useState<TimeBlock>("anytime");
  const [points, setPoints] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setName("");
    setIcon("⭐");
    setTimeBlock("anytime");
    setPoints(5);
    setError(null);
  }

  function close() {
    reset();
    setOpen(false);
  }

  function submit() {
    if (!name.trim()) { setError("Give your task a name!"); return; }
    setError(null);
    startTransition(async () => {
      const result = await createTask({
        name: name.trim(),
        icon,
        category: "personal",
        scheduleType: "daily",
        daysOfWeek: [],
        timeBlock,
        startTime: null,
        points,
        familyPointsContribution: 0,
        requiresTimer: false,
        durationMinutes: null,
        requiresCompletion: true,
        location: null,
        packingList: null,
        defaultBpm: null,
        defaultTimeSignature: null,
        kidId,
      });
      if (!result.ok) { setError(result.error); return; }
      close();
      router.refresh();
    });
  }

  return (
    <>
      {/* Add task button */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed text-sm font-bold transition-colors"
        style={{ borderColor: accent, color: accent }}
      >
        <span className="text-lg">＋</span> Add my own task
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <h2 className="text-2xl font-black text-gray-800 text-center">Add your own task ✏️</h2>

            {/* Name */}
            <div>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="What do you want to do?"
                className="w-full text-lg font-semibold border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-400"
                maxLength={40}
              />
            </div>

            {/* Icon picker */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Pick an icon</p>
              <div className="grid grid-cols-8 gap-1">
                {ICONS.map((em) => (
                  <button
                    key={em}
                    onClick={() => setIcon(em)}
                    className={`text-2xl p-1 rounded-xl transition-all ${icon === em ? "ring-2 scale-110" : "hover:scale-105"}`}
                    style={icon === em ? { outline: `2px solid ${accent}` } : {}}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            {/* When */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">When</p>
              <div className="grid grid-cols-2 gap-2">
                {TIME_BLOCKS.map((tb) => (
                  <button
                    key={tb.value}
                    onClick={() => setTimeBlock(tb.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                      timeBlock === tb.value ? "text-white border-transparent" : "border-gray-200 text-gray-600"
                    }`}
                    style={timeBlock === tb.value ? { backgroundColor: accent, borderColor: accent } : {}}
                  >
                    <span>{tb.emoji}</span> {tb.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Points */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Points</p>
              <div className="flex items-center gap-4 justify-center">
                <button
                  onClick={() => setPoints(Math.max(1, points - 1))}
                  className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                >−</button>
                <span className="text-2xl font-black text-gray-800 w-16 text-center">{points} ⭐</span>
                <button
                  onClick={() => setPoints(Math.min(50, points + 1))}
                  className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                >+</button>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm text-center font-semibold">{error}</p>}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={close}
                className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={isPending}
                className="flex-1 py-3 rounded-2xl text-white font-bold text-sm transition-opacity disabled:opacity-60"
                style={{ backgroundColor: accent }}
              >
                {isPending ? "Adding…" : "Add it! 🚀"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
