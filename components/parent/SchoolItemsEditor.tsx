"use client";

import { useState, useTransition } from "react";
import { upsertSchoolItem, deleteSchoolItem } from "@/lib/actions/school-items";
import type { Kid, SchoolItem, DayOfWeek } from "@/lib/domain/types";

const DAYS: { dow: DayOfWeek; short: string }[] = [
  { dow: 1, short: "Mon" },
  { dow: 2, short: "Tue" },
  { dow: 3, short: "Wed" },
  { dow: 4, short: "Thu" },
  { dow: 5, short: "Fri" },
];

const QUICK_ICONS = ["📚", "🎒", "🎨", "🎵", "⚽", "🏊", "🎭", "🥗", "💻", "✏️", "📐", "🔬", "📖", "🧃", "👟"];

type Draft = { id?: string; name: string; icon: string; daysOfWeek: DayOfWeek[] };

const emptyDraft = (): Draft => ({ name: "", icon: "📦", daysOfWeek: [1, 2, 3, 4, 5] });

export default function SchoolItemsEditor({
  kids,
  initialItems,
}: {
  kids: Kid[];
  initialItems: SchoolItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [activeKidId, setActiveKidId] = useState(kids[0]?.id ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SchoolItem[]>(initialItems);

  const kidItems = items.filter((i) => i.kidId === activeKidId);

  const openAdd = () => { setDraft(emptyDraft()); setError(null); };
  const openEdit = (item: SchoolItem) => {
    setDraft({ id: item.id, name: item.name, icon: item.icon, daysOfWeek: item.daysOfWeek });
    setError(null);
  };

  const toggleDay = (dow: DayOfWeek) => {
    if (!draft) return;
    const has = draft.daysOfWeek.includes(dow);
    setDraft({
      ...draft,
      daysOfWeek: has
        ? draft.daysOfWeek.filter((d) => d !== dow)
        : [...draft.daysOfWeek, dow].sort((a, b) => a - b) as DayOfWeek[],
    });
  };

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) { setError("Item needs a name."); return; }
    if (draft.daysOfWeek.length === 0) { setError("Select at least one day."); return; }
    const optimisticId = draft.id ?? `temp-${Date.now()}`;
    const optimistic: SchoolItem = {
      id: optimisticId,
      familyId: "",
      kidId: activeKidId,
      name: draft.name.trim(),
      icon: draft.icon,
      daysOfWeek: draft.daysOfWeek,
      active: true,
    };
    setItems((prev) =>
      draft.id
        ? prev.map((i) => i.id === draft.id ? optimistic : i)
        : [...prev, optimistic]
    );
    setDraft(null);
    startTransition(async () => {
      const result = await upsertSchoolItem(activeKidId, draft);
      if (!result.ok) { setError(result.error); }
    });
  };

  const remove = (item: SchoolItem) => {
    if (!confirm(`Remove "${item.name}" from the bag list?`)) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    startTransition(async () => {
      await deleteSchoolItem(item.id, activeKidId);
    });
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">🎒 School bag items</h2>
        <span className="text-xs text-gray-500">Appears as evening pack reminder</span>
      </div>

      {/* Kid tabs */}
      {kids.length > 1 ? (
        <div className="flex gap-2">
          {kids.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setActiveKidId(k.id)}
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
                activeKidId === k.id
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-gray-200 text-gray-700"
              }`}
            >
              {k.avatar} {k.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* Item list */}
      <div className="bg-white rounded-2xl shadow divide-y divide-gray-100">
        {kidItems.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            No items yet — tap <strong>+ Add item</strong> to get started.
          </div>
        ) : (
          kidItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-2xl w-8 text-center">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{item.name}</div>
                <div className="text-xs text-gray-500 flex gap-1 mt-0.5">
                  {DAYS.map((d) => (
                    <span
                      key={d.dow}
                      className={`px-1.5 py-0.5 rounded font-bold ${
                        item.daysOfWeek.includes(d.dow)
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {d.short}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openEdit(item)}
                className="text-xs text-gray-500 hover:text-gray-700 font-bold px-2 py-1"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => remove(item)}
                disabled={isPending}
                className="text-xs text-red-400 hover:text-red-600 font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={openAdd}
        disabled={isPending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl disabled:opacity-50"
      >
        + Add item
      </button>

      {/* Add/edit modal */}
      {draft ? (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-xl p-5 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-black">{draft.id ? "Edit item" : "New bag item"}</h3>

            {error ? <p className="text-sm text-red-600 font-bold">{error}</p> : null}

            {/* Icon picker */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Icon</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {QUICK_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setDraft({ ...draft, icon: ic })}
                    className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-colors ${
                      draft.icon === ic ? "bg-indigo-100 ring-2 ring-indigo-400" : "bg-gray-100 hover:bg-gray-200"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Or type any emoji"
                value={draft.icon}
                onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm"
                maxLength={4}
              />
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Name</label>
              <input
                type="text"
                placeholder="e.g. Library bag, Violin, Swimming kit"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm"
                maxLength={40}
                autoFocus
              />
            </div>

            {/* Days */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Days needed</label>
              <div className="flex gap-1.5">
                {DAYS.map((d) => {
                  const on = draft.daysOfWeek.includes(d.dow);
                  return (
                    <button
                      key={d.dow}
                      type="button"
                      onClick={() => toggleDay(d.dow)}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs transition-colors ${
                        on ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
