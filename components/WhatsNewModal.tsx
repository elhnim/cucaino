"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "whats_new_seen_v3";

const FEATURES = [
  {
    icon: "💵",
    title: "Cash Account",
    color: "#dcfce7",
    accent: "#15803d",
    body: "Kids can now earn real cash alongside stars. Set a cash value on any task or gig, and kids build a balance they can spend on cash-priced rewards — a hands-on way to feel money moving.",
  },
  {
    icon: "🏠",
    title: "Home Screen Widgets",
    color: "#ede9fe",
    accent: "#7c3aed",
    body: "Kids can personalise their home screen. Drag tiles to reorder, hide the ones they don't need, and keep what matters front and centre — tasks, badges, level progress, and more.",
  },
  {
    icon: "🏅",
    title: "Custom Badges",
    color: "#fef3c7",
    accent: "#d97706",
    body: "Build habits that matter to your family. Create your own badges tied to any task — tracked by total completions or daily streak — with Bronze, Silver, and Gold tiers. Find them under Rewards → Badges.",
  },
  {
    icon: "🧠",
    title: "Brain Gigs",
    color: "#dbeafe",
    accent: "#1d4ed8",
    body: "20 new learning tasks are now in the task library — watch a TED Talk, research a career, audit family subscriptions, or map out a savings goal. Kids earn cash and stars for thinking.",
  },
  {
    icon: "📋",
    title: "Pro Tip: Checklist Tasks",
    color: "#fce7f3",
    accent: "#be185d",
    body: "Combine small habits into one grouped task using the Checklist type. Try a \"Morning Routine\" with steps like Brush teeth, Make bed, and Pack school bag — kids tick each one off as they go.",
  },
];

export default function WhatsNewModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(SEEN_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(SEEN_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          <div className="text-3xl mb-2">🎉</div>
          <h2 className="text-2xl font-black text-gray-900 leading-tight">What's new</h2>
          <p className="text-sm text-gray-400 mt-1">A few things to explore in your next session.</p>
        </div>

        {/* Feature list */}
        <div className="overflow-y-auto flex-1 px-6 pb-2 space-y-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl p-4 flex gap-3 items-start"
              style={{ background: f.color }}
            >
              <span className="text-3xl flex-shrink-0 mt-0.5">{f.icon}</span>
              <div>
                <div className="font-black text-gray-900 mb-0.5">{f.title}</div>
                <div className="text-sm text-gray-600 leading-snug">{f.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="px-6 py-5 flex-shrink-0">
          <button
            type="button"
            onClick={dismiss}
            className="w-full py-3.5 rounded-2xl text-base font-black text-white"
            style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
          >
            Let's go! 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
