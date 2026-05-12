"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuizSet, updateQuizSet, deleteQuizSet } from "@/lib/actions/quizzes";
import type { QuizSet } from "@/lib/domain/types";
import { ACTIVE_QUIZ_THEMES } from "@/lib/registry/quiz-theme-registry";
import { QUIZ_DIFFICULTIES } from "@/lib/registry/quiz-difficulty-registry";
import { QUIZ_AGE_BANDS } from "@/lib/registry/quiz-age-band-registry";
const SET_EMOJIS = ["🎯", "🧠", "🏆", "⚡", "🌟", "🎓", "🔥", "🎪", "🎲", "🌍", "🧮", "📖"];

export default function QuizSetFormClient({ quizSet }: { quizSet?: QuizSet }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const [name, setName] = useState(quizSet?.name ?? "");
  const [description, setDescription] = useState(quizSet?.description ?? "");
  const [emoji, setEmoji] = useState(quizSet?.emoji ?? "🎯");
  const [themes, setThemes] = useState<string[]>(quizSet?.themes ?? []);
  const [ageBandFilter, setAgeBandFilter] = useState<string | null>(quizSet?.ageBandFilter ?? null);
  const [maxDifficulty, setMaxDifficulty] = useState(quizSet?.maxDifficulty ?? "medium");
  const [questionsPerSession, setQuestionsPerSession] = useState(quizSet?.questionsPerSession ?? 10);

  const toggleTheme = (id: string) =>
    setThemes((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const handleSave = () => {
    if (!name.trim()) { setError("Set name is required"); return; }
    if (themes.length === 0) { setError("Select at least one theme"); return; }
    setError(null);

    startTransition(async () => {
      const data = { name: name.trim(), description: description.trim() || null, emoji, themes, ageBandFilter, maxDifficulty, questionsPerSession };
      const result = quizSet
        ? await updateQuizSet(quizSet.id, data)
        : await createQuizSet(data);
      if (!result.ok) { setError(result.error); return; }
      router.push("/parent/quizzes?tab=sets");
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteQuizSet(quizSet!.id);
      router.push("/parent/quizzes?tab=sets");
    });
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-8">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <h1 className="text-xl font-black text-gray-900 flex-1">{quizSet ? "Edit quiz set" : "New quiz set"}</h1>
        {quizSet && (
          <button type="button" onClick={() => setShowDelete(true)} className="text-red-400 text-sm font-semibold">Delete</button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">⚠️ {error}</div>
      )}

      {/* Emoji + name */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div>
          <div className="text-sm font-bold text-gray-700 mb-2">Icon</div>
          <div className="flex flex-wrap gap-2">
            {SET_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`w-11 h-11 rounded-xl text-2xl flex items-center justify-center ${emoji === e ? "ring-2 ring-indigo-500 bg-indigo-50 scale-110" : "bg-gray-100"}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1">Set name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Times Tables Challenge"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold"
          />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1">Tagline <span className="font-normal text-gray-400">(optional)</span></label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Test your multiplication skills!"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-600"
          />
        </div>
      </div>

      {/* Themes */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Themes <span className="font-normal text-gray-400">(pick one or more)</span></div>
        <div className="flex flex-wrap gap-1.5">
          {ACTIVE_QUIZ_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTheme(t.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${themes.includes(t.id) ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Age band filter */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Age band <span className="font-normal text-gray-400">(leave unset to match each kid automatically)</span></div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setAgeBandFilter(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${ageBandFilter === null ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            Auto (per kid)
          </button>
          {QUIZ_AGE_BANDS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setAgeBandFilter(b.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${ageBandFilter === b.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Max difficulty</div>
        <div className="flex gap-2">
          {QUIZ_DIFFICULTIES.map((d) => {
            const active = maxDifficulty === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setMaxDifficulty(d.id)}
                className="flex-1 py-1.5 rounded-xl text-sm font-bold transition-colors"
                style={active ? { background: d.activeBg, color: "#fff" } : { background: "#f3f4f6", color: "#6b7280" }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Questions per session */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Questions per session</div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setQuestionsPerSession((v) => Math.max(3, v - 1))} className="w-10 h-10 rounded-full bg-gray-100 text-lg font-bold">−</button>
          <span className="text-2xl font-black w-12 text-center">{questionsPerSession}</span>
          <button type="button" onClick={() => setQuestionsPerSession((v) => Math.min(30, v + 1))} className="w-10 h-10 rounded-full bg-gray-100 text-lg font-bold">+</button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl disabled:opacity-50"
      >
        {isPending ? "Saving…" : quizSet ? "Save changes" : "Create quiz set"}
      </button>

      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="font-bold text-gray-900">Delete "{quizSet?.name}"?</div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowDelete(false)} className="flex-1 border border-gray-200 text-gray-600 font-bold py-2.5 rounded-xl text-sm">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isPending} className="flex-1 bg-red-500 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
