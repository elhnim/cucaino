"use client";

import { useState, useTransition } from "react";
import { createCustomBadge, updateCustomBadge, deleteCustomBadge } from "@/lib/actions/badges";
import type { BadgeFormData } from "@/lib/actions/badges";
import type { CustomBadge, Task, Kid } from "@/lib/domain/types";

const COMMON_ICONS = ["🏅","⭐","🔥","💪","🎯","🌟","🦁","🚀","🎉","🏆","💎","🌈",
                      "🎸","⚽","🏊","🎨","📖","🧠","🌱","🦋","🐉","🦅","🏄","🎺"];

function defaultForm(badge?: CustomBadge): BadgeFormData {
  return {
    name: badge?.name ?? "",
    icon: badge?.icon ?? "🏅",
    description: badge?.description ?? null,
    taskId: badge?.taskId ?? "",
    trackType: badge?.trackType ?? "count",
    bronzeThreshold: badge?.bronzeThreshold ?? 5,
    silverThreshold: badge?.silverThreshold ?? 15,
    goldThreshold: badge?.goldThreshold ?? 30,
    kidIds: badge?.kidIds ?? null,
  };
}

export default function BadgeFormModal({
  badge,
  tasks,
  kids,
  onClose,
}: {
  badge?: CustomBadge;
  tasks: Task[];
  kids: Kid[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<BadgeFormData>(defaultForm(badge));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof BadgeFormData>(k: K, v: BadgeFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function handleTrackTypeChange(t: "count" | "streak") {
    setForm((f) => ({
      ...f,
      trackType: t,
      bronzeThreshold: t === "streak" ? 3 : 5,
      silverThreshold: t === "streak" ? 7 : 15,
      goldThreshold: t === "streak" ? 21 : 30,
    }));
  }

  const submit = () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.taskId) { setError("Select a task."); return; }
    if (form.bronzeThreshold >= form.silverThreshold || form.silverThreshold >= form.goldThreshold) {
      setError("Thresholds must be Bronze < Silver < Gold."); return;
    }
    setError(null);
    startTransition(async () => {
      const result = badge
        ? await updateCustomBadge(badge.id, form)
        : await createCustomBadge(form);
      if (result.ok) onClose();
      else setError(result.error);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl max-h-[90dvh] flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl flex-shrink-0">
          <h2 className="text-lg font-black">{badge ? "Edit Badge" : "New Badge"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-bold rounded-xl px-3 py-2">{error}</div>
          )}

          {/* Icon picker + Name */}
          <div className="flex gap-3 items-start">
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Icon</label>
              <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 rounded-xl w-48">
                {COMMON_ICONS.map((e) => (
                  <button key={e} type="button" onClick={() => set("icon", e)}
                    className={`text-xl w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${form.icon === e ? "bg-indigo-100 ring-2 ring-indigo-500" : "hover:bg-gray-100"}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 block mb-1">Badge name</label>
              <input
                type="text"
                placeholder="e.g. Reading Star"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
              />
              <label className="text-xs font-bold text-gray-500 block mt-3 mb-1">Description (optional)</label>
              <input
                type="text"
                placeholder="e.g. For reading every day"
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value || null)}
                className="w-full border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Task */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Task to track</label>
            <select
              value={form.taskId}
              onChange={(e) => set("taskId", e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400 bg-white"
            >
              <option value="">— select a task —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
              ))}
            </select>
          </div>

          {/* Track type */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Track by</label>
            <div className="flex gap-2">
              {(["count", "streak"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTrackTypeChange(type)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                    form.trackType === type
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-100 text-gray-500 border-gray-200"
                  }`}
                >
                  {type === "count" ? "📊 Total count" : "🔥 Daily streak"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              {form.trackType === "count"
                ? "Counts the total number of times the task is completed."
                : "Counts consecutive days in a row the task is completed (resets if a day is missed)."}
            </p>
          </div>

          {/* Thresholds */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-2">
              Tier thresholds ({form.trackType === "streak" ? "days in a row" : "total completions"})
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "bronzeThreshold" as const, label: "🥉 Bronze", color: "#cd7c3f" },
                { key: "silverThreshold" as const, label: "🥈 Silver", color: "#9ca3af" },
                { key: "goldThreshold" as const,   label: "🥇 Gold",   color: "#f59e0b" },
              ].map(({ key, label, color }) => (
                <div key={key}>
                  <label className="text-[10px] font-bold mb-1 block" style={{ color }}>{label}</label>
                  <input
                    type="number"
                    min={1}
                    value={form[key]}
                    onChange={(e) => set(key, Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full border border-gray-200 rounded-xl p-2 text-sm text-center font-bold focus:outline-none focus:border-indigo-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Kid scope — only show if family has more than 1 kid */}
          {kids.length > 1 && (
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Applies to</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => set("kidIds", null)}
                  className={`py-1.5 px-3 rounded-xl text-sm font-bold border transition-colors ${
                    form.kidIds === null
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-100 text-gray-500 border-gray-200"
                  }`}
                >
                  All kids
                </button>
                {kids.map((k) => {
                  const selected = form.kidIds?.includes(k.id) ?? false;
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => {
                        const current = form.kidIds ?? [];
                        const next = selected
                          ? current.filter((id) => id !== k.id)
                          : [...current, k.id];
                        set("kidIds", next.length === 0 ? null : next);
                      }}
                      className={`py-1.5 px-3 rounded-xl text-sm font-bold border transition-colors ${
                        selected
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }`}
                    >
                      {k.avatar} {k.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 p-5 pt-0 space-y-2">
          {badge && (
            confirmDelete ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-600">
                  Keep
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    const result = await deleteCustomBadge(badge.id);
                    if (result.ok) onClose();
                    else setError(result.error);
                  })}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="w-full py-2 rounded-xl text-sm font-bold text-red-500 bg-red-50">
                Delete badge
              </button>
            )
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-600">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white disabled:opacity-50">
              {isPending ? "Saving…" : badge ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
