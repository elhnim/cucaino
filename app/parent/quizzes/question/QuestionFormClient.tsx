"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuestion, updateQuestion, deleteQuestion } from "@/lib/actions/quizzes";
import type { QuizQuestion2 } from "@/lib/data/queries";
import { ACTIVE_QUIZ_THEMES } from "@/lib/registry/quiz-theme-registry";
import { QUIZ_DIFFICULTIES } from "@/lib/registry/quiz-difficulty-registry";
import { QUIZ_AGE_BANDS } from "@/lib/registry/quiz-age-band-registry";

export default function QuestionFormClient({ question }: { question?: QuizQuestion2 }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const [type, setType] = useState<"mc" | "fill_blank">(question?.type ?? "mc");
  const [questionText, setQuestionText] = useState(question?.questionText ?? "");
  const [theme, setTheme] = useState(question?.theme ?? "maths");
  const [ageBand, setAgeBand] = useState(question?.ageBand ?? "7_8");
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? "easy");
  const [explanation, setExplanation] = useState(question?.explanation ?? "");

  // MC state
  const [choices, setChoices] = useState<{ label: string; isCorrect: boolean }[]>(
    question?.choices ?? [
      { label: "", isCorrect: true },
      { label: "", isCorrect: false },
      { label: "", isCorrect: false },
      { label: "", isCorrect: false },
    ]
  );

  // Fill in the blank state
  const [sentenceTemplate, setSentenceTemplate] = useState(question?.sentenceTemplate ?? "");
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(
    question?.acceptedAnswers ?? [""]
  );

  const setCorrect = (idx: number) =>
    setChoices((prev) => prev.map((c, i) => ({ ...c, isCorrect: i === idx })));

  const updateChoice = (idx: number, label: string) =>
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, label } : c)));

  const handleSave = () => {
    if (!questionText.trim()) { setError("Question text is required"); return; }
    if (type === "mc" && !choices.some((c) => c.isCorrect)) { setError("Mark one answer as correct"); return; }
    if (type === "mc" && choices.filter((c) => c.label.trim()).length < 2) { setError("At least 2 answer choices required"); return; }
    if (type === "fill_blank" && !sentenceTemplate.includes("___")) { setError("Sentence template must include ___ for the blank"); return; }
    if (type === "fill_blank" && !acceptedAnswers.some((a) => a.trim())) { setError("At least one accepted answer required"); return; }
    setError(null);

    const data = {
      type,
      questionText: questionText.trim(),
      theme,
      ageBand,
      difficulty,
      explanation: explanation.trim(),
      choices: type === "mc" ? choices.filter((c) => c.label.trim()) : [],
      sentenceTemplate: sentenceTemplate.trim(),
      acceptedAnswers: acceptedAnswers.filter((a) => a.trim()),
    };

    startTransition(async () => {
      const result = question
        ? await updateQuestion(question.id, data)
        : await createQuestion(data);
      if (!result.ok) { setError(result.error); return; }
      router.push("/parent/quizzes?tab=library");
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteQuestion(question!.id);
      router.push("/parent/quizzes?tab=library");
    });
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-8">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <h1 className="text-xl font-black text-gray-900 flex-1">{question ? "Edit question" : "New question"}</h1>
        {question && !question.isBuiltin && (
          <button type="button" onClick={() => setShowDelete(true)} className="text-red-400 text-sm font-semibold">Delete</button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">⚠️ {error}</div>
      )}

      {/* Question type */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Question type</div>
        <div className="flex gap-3">
          {([["mc", "☑ Multiple Choice"], ["fill_blank", "✏️ Fill in the Blank"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold border ${type === v ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Question text */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <label className="text-sm font-bold text-gray-700 block">Question</label>
        <textarea
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          rows={3}
          placeholder="e.g. What is 7 × 8?"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none"
        />
      </div>

      {/* MC answers */}
      {type === "mc" && (
        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <div className="text-sm font-bold text-gray-700">Answer choices <span className="font-normal text-gray-400">(tap ○ to mark correct)</span></div>
          {choices.map((choice, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCorrect(idx)}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  choice.isCorrect ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                }`}
              >
                {choice.isCorrect ? "✓" : ""}
              </button>
              <input
                value={choice.label}
                onChange={(e) => updateChoice(idx, e.target.value)}
                placeholder={`Choice ${idx + 1}`}
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          ))}
          <p className="text-xs text-gray-400">Leave unused choices blank — they'll be ignored.</p>
        </div>
      )}

      {/* Fill in the blank */}
      {type === "fill_blank" && (
        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <div>
            <label className="text-sm font-bold text-gray-700 block mb-1">Sentence template</label>
            <textarea
              value={sentenceTemplate}
              onChange={(e) => setSentenceTemplate(e.target.value)}
              rows={2}
              placeholder="e.g. The capital of France is ___."
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">Use ___ where the blank should appear.</p>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-700 mb-1">Accepted answers</div>
            {acceptedAnswers.map((ans, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <input
                  value={ans}
                  onChange={(e) => {
                    const next = [...acceptedAnswers];
                    next[idx] = e.target.value;
                    setAcceptedAnswers(next);
                  }}
                  placeholder={`Answer ${idx + 1}`}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
                {acceptedAnswers.length > 1 && (
                  <button type="button" onClick={() => setAcceptedAnswers(acceptedAnswers.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 text-lg">×</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setAcceptedAnswers([...acceptedAnswers, ""])} className="text-indigo-600 text-sm font-semibold">
              + Add variant
            </button>
            <p className="text-xs text-gray-400 mt-1">Case-insensitive. Add variants like "7" and "seven".</p>
          </div>
        </div>
      )}

      {/* Theme, age band, difficulty */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-4">
        <div>
          <div className="text-sm font-bold text-gray-700 mb-2">Theme</div>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVE_QUIZ_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${theme === t.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-bold text-gray-700 mb-2">Age band</div>
          <div className="flex gap-2">
            {QUIZ_AGE_BANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setAgeBand(b.id)}
                className={`flex-1 py-1.5 rounded-xl text-sm font-bold ${ageBand === b.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-bold text-gray-700 mb-2">Difficulty</div>
          <div className="flex gap-2">
            {QUIZ_DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDifficulty(d.id)}
                className="flex-1 py-1.5 rounded-xl text-sm font-bold transition-colors"
                style={difficulty === d.id ? { background: d.activeBg, color: "#fff" } : { background: "#f3f4f6", color: "#6b7280" }}
              >
                {d.stars} {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <label className="text-sm font-bold text-gray-700 block">Explanation <span className="font-normal text-gray-400">(shown after answering)</span></label>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={2}
          placeholder="e.g. 7 × 8 = 56. Remember: 7, 8, 9 — 56, 7, 8!"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl disabled:opacity-50"
      >
        {isPending ? "Saving…" : question ? "Save changes" : "Add question"}
      </button>

      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="font-bold text-gray-900">Delete this question?</div>
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
