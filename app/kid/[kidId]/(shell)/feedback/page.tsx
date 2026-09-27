"use client";

import { useState, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import { createFeatureRequest } from "@/lib/actions/feature-requests";

const MOODS = [
  { emoji: "😊", label: "Happy" },
  { emoji: "🤔", label: "Confused" },
  { emoji: "😤", label: "Frustrated" },
  { emoji: "🤩", label: "Excited" },
];

const TOPICS = [
  { emoji: "🎮", label: "Games", category: "quiz" as const },
  { emoji: "🎁", label: "Rewards", category: "rewards" as const },
  { emoji: "✅", label: "Tasks", category: "kid_view" as const },
  { emoji: "💬", label: "Something else", category: "other" as const },
];

export default function KidFeedbackPage() {
  const params = useParams<{ kidId: string }>();
  const router = useRouter();
  const [mood, setMood] = useState<string | null>(null);
  const [topicIdx, setTopicIdx] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canSubmit = mood !== null && topicIdx !== null && !isPending;

  const submit = () => {
    if (!canSubmit) return;
    const topic = TOPICS[topicIdx!];
    const title = `${mood} ${message.trim() || topic.label}`;
    const description = message.trim();
    startTransition(async () => {
      await createFeatureRequest({
        title,
        description,
        category: topic.category,
        kidId: params.kidId,
      });
      setDone(true);
    });
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center gap-4">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-black">Thanks for telling us!</h2>
        <p className="text-gray-500 text-sm">Your parents will see your message.</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-2xl shadow"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6 max-w-md mx-auto">
      <h2 className="text-2xl font-black">Tell us what you think 💬</h2>

      {/* Mood */}
      <div>
        <div className="text-sm font-bold text-gray-500 mb-2">How are you feeling?</div>
        <div className="grid grid-cols-4 gap-2">
          {MOODS.map((m) => (
            <button
              key={m.emoji}
              type="button"
              onClick={() => setMood(m.emoji)}
              className={`flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition-all ${
                mood === m.emoji
                  ? "border-indigo-500 bg-indigo-50 shadow-md"
                  : "border-gray-200 bg-white"
              }`}
            >
              <span className="text-3xl">{m.emoji}</span>
              <span className="text-[10px] font-bold text-gray-600">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Topic */}
      <div>
        <div className="text-sm font-bold text-gray-500 mb-2">What&apos;s it about?</div>
        <div className="grid grid-cols-2 gap-2">
          {TOPICS.map((t, i) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setTopicIdx(i)}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ${
                topicIdx === i
                  ? "border-indigo-500 bg-indigo-50 shadow-md"
                  : "border-gray-200 bg-white"
              }`}
            >
              <span className="text-2xl">{t.emoji}</span>
              <span className="font-bold text-sm">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div>
        <div className="text-sm font-bold text-gray-500 mb-2">Say more (optional)</div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="What would you like to change or add?"
          className="w-full bg-white border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-indigo-400 resize-none"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black text-lg py-4 rounded-2xl shadow-lg transition-colors"
      >
        {isPending ? "Sending…" : "Send it! →"}
      </button>
    </div>
  );
}
