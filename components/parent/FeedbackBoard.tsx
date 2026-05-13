"use client";

import { useState, useTransition } from "react";
import {
  createFeatureRequest,
  updateFeatureRequestStatus,
  deleteFeatureRequest,
} from "@/lib/actions/feature-requests";
import type { FeatureRequest } from "@/lib/data/queries";

type Status = FeatureRequest["status"];
type Category = FeatureRequest["category"];

const STATUS_META: Record<Status, { label: string; class: string }> = {
  new: { label: "New", class: "bg-blue-100 text-blue-700" },
  considering: { label: "Considering", class: "bg-amber-100 text-amber-700" },
  in_progress: { label: "In progress", class: "bg-purple-100 text-purple-700" },
  shipped: { label: "Shipped", class: "bg-green-100 text-green-700" },
  wont_do: { label: "Won't do", class: "bg-gray-100 text-gray-600" },
};

const CATEGORY_META: Record<Category, { emoji: string; label: string }> = {
  kid_view: { emoji: "🧒", label: "Kid view" },
  parent_view: { emoji: "👤", label: "Parent view" },
  quiz: { emoji: "🎮", label: "Quiz / Play" },
  rewards: { emoji: "🎁", label: "Rewards" },
  music: { emoji: "🎵", label: "Music" },
  other: { emoji: "💡", label: "Other" },
};

export default function FeedbackBoard({
  initialItems,
}: {
  initialItems: FeatureRequest[];
}) {
  const [items, setItems] = useState<FeatureRequest[]>(initialItems);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!title.trim()) return;
    const optimistic: FeatureRequest = {
      id: `temp-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      category,
      status: "new",
      createdAt: new Date().toISOString(),
      kidId: null,
      kidName: null,
      kidAvatar: null,
    };
    setItems((prev) => [optimistic, ...prev]);
    setTitle("");
    setDescription("");
    setCategory("other");
    setShowForm(false);
    startTransition(async () => {
      await createFeatureRequest({ title: optimistic.title, description: optimistic.description, category: optimistic.category });
    });
  };

  const setStatus = (id: string, status: Status) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status } : i));
    startTransition(async () => {
      await updateFeatureRequestStatus(id, status);
    });
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    startTransition(async () => {
      await deleteFeatureRequest(id);
    });
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);
  const counts = (Object.keys(STATUS_META) as Status[]).reduce(
    (acc, s) => { acc[s] = items.filter((i) => i.status === s).length; return acc; },
    {} as Record<Status, number>,
  );

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-2xl shadow p-3 text-sm text-gray-700">
        💡 Capture ideas as you use the app — kids&apos; suggestions, parent gripes,
        &quot;wouldn&apos;t it be cool if...&quot;. Saved to your family account.
      </div>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow"
        >
          + Add an idea
        </button>
      ) : null}

      {showForm ? (
        <div className="bg-white rounded-2xl shadow p-4 space-y-3 border-2 border-indigo-200">
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Add a swearing jar tracker"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What problem does it solve?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Category</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.entries(CATEGORY_META) as [Category, { emoji: string; label: string }][]).map(
                ([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={`text-xs py-1.5 rounded-lg border ${
                      category === key
                        ? "bg-indigo-600 text-white border-indigo-600 font-bold"
                        : "bg-white text-gray-700 border-gray-200"
                    }`}
                  >
                    {meta.emoji} {meta.label}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setTitle(""); setDescription(""); }}
              className="bg-gray-100 hover:bg-gray-200 font-bold py-2 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!title.trim() || isPending}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="flex gap-1.5 flex-wrap text-xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full font-bold ${filter === "all" ? "bg-indigo-600 text-white" : "bg-white text-gray-700 shadow"}`}
          >
            All ({items.length})
          </button>
          {(Object.keys(STATUS_META) as Status[]).map((s) => {
            if (counts[s] === 0) return null;
            const meta = STATUS_META[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full font-bold ${filter === s ? "bg-indigo-600 text-white" : `${meta.class} shadow`}`}
              >
                {meta.label} ({counts[s]})
              </button>
            );
          })}
        </div>
      ) : null}

      {items.length === 0 && !showForm ? (
        <div className="bg-white rounded-2xl shadow p-6 text-center text-sm text-gray-500">
          No ideas yet. The first one&apos;s yours!
        </div>
      ) : null}

      <div className="space-y-2">
        {filtered.map((item) => (
          <FeatureCard
            key={item.id}
            item={item}
            isPending={isPending}
            onSetStatus={(s) => setStatus(item.id, s)}
            onRemove={() => remove(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FeatureCard({
  item,
  isPending,
  onSetStatus,
  onRemove,
}: {
  item: FeatureRequest;
  isPending: boolean;
  onSetStatus: (s: Status) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = CATEGORY_META[item.category];
  const status = STATUS_META[item.status];

  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-3 hover:bg-gray-50"
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0">{meta.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-bold">{item.title}</div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${status.class}`}>{status.label}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              {item.kidAvatar && <span>{item.kidAvatar} {item.kidName} ·</span>}
              <span>{meta.label} · {formatAgo(item.createdAt)}</span>
            </div>
            {item.description ? (
              <div className={`text-sm text-gray-700 mt-1 ${open ? "" : "line-clamp-2"}`}>
                {item.description}
              </div>
            ) : null}
          </div>
        </div>
      </button>

      {open ? (
        <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-2">
          <div className="text-xs font-bold text-gray-700">Status</div>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(STATUS_META) as Status[]).map((s) => {
              const m = STATUS_META[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSetStatus(s)}
                  disabled={isPending}
                  className={`text-xs px-2.5 py-1 rounded-full font-bold disabled:opacity-50 ${
                    item.status === s ? `ring-2 ring-indigo-500 ${m.class}` : `${m.class} opacity-60`
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={isPending}
            className="text-xs text-red-600 hover:text-red-800 font-bold mt-1 disabled:opacity-50"
          >
            🗑 Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
