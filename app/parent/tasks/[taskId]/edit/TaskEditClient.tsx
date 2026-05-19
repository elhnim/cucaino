"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Task, Kid, TaskCategory, TimeBlock, ScheduleType, TaskRule, TaskTarget } from "@/lib/domain/types";
import { createTask, updateTask, deleteTask } from "@/lib/actions/tasks";
import { PARENT_CATEGORIES } from "@/lib/registry/category-registry";

const TIME_BLOCKS: { value: TimeBlock; label: string }[] = [
  { value: "before_school", label: "🌅 Before school" },
  { value: "morning", label: "☀️ Morning" },
  { value: "afternoon", label: "🌤 Afternoon" },
  { value: "after_school", label: "🏠 After school" },
  { value: "evening", label: "🌙 Evening" },
  { value: "anytime", label: "🕐 Anytime" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const COMMON_ICONS = ["🛁", "🦷", "🪥", "🍽️", "📚", "🎵", "🏃", "🛏️", "🎒", "🧹", "🐕", "🎮", "✏️", "🥗", "💊", "🧘"];

export default function TaskEditClient({ task, kids }: { task?: Task; kids: Kid[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const [name, setName] = useState(task?.name ?? "");
  const [icon, setIcon] = useState(task?.icon ?? "✏️");
  const [customIcon, setCustomIcon] = useState(task ? !COMMON_ICONS.includes(task.icon) : false);
  const [category, setCategory] = useState<TaskCategory>(task?.category ?? "chore");
  const [rule, setRule] = useState<TaskRule>(task?.rule ?? "strict");
  const [timeBlock, setTimeBlock] = useState<TimeBlock>(task?.timeBlock ?? "after_school");
  const [scheduleType, setScheduleType] = useState<ScheduleType>(task?.scheduleType ?? "daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(task?.daysOfWeek ?? [1,2,3,4,5]);
  const [flexMin, setFlexMin] = useState(task?.flexibleMinPerWeek ?? 1);
  const [target, setTarget] = useState<TaskTarget>(task?.target ?? "none");
  const [durationMinutes, setDurationMinutes] = useState(task?.targetDurationMinutes ?? task?.durationMinutes ?? 10);
  const [reps, setReps] = useState(task?.targetReps ?? 10);
  const [repLabel, setRepLabel] = useState(task?.targetRepLabel ?? "reps");
  const [checklistItems, setChecklistItems] = useState<string[]>(task?.checklistItems ?? [""]);
  const [points, setPoints] = useState(task?.points ?? 5);
  const [kidIds, setKidIds] = useState<string[] | null>(task?.kidIds ?? null);
  const [description, setDescription] = useState(task?.description ?? "");
  const [location, setLocation] = useState(task?.location ?? "");
  const [packingList, setPackingList] = useState<string[]>(task?.packingList ?? []);
  const [packingInput, setPackingInput] = useState("");
  const [frequencyPerDay, setFrequencyPerDay] = useState(task?.frequencyPerDay ?? 1);
  const [cashValueCents, setCashValueCents] = useState(task?.cashValueCents ?? 0);
  const [requiresParentApproval, setRequiresParentApproval] = useState(task?.requiresParentApproval ?? false);

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };

  const buildData = () => ({
    name: name.trim(),
    icon,
    category,
    rule,
    scheduleType: rule === "flexible" ? "specific_days" as const : scheduleType,
    daysOfWeek: rule === "flexible" ? [] : daysOfWeek,
    timeBlock,
    startTime: task?.startTime ?? null,
    points,
    familyPointsContribution: task?.familyPointsContribution ?? 0,
    requiresTimer: target === "time",
    durationMinutes: target === "time" ? durationMinutes : null,
    requiresCompletion: category === "school_subject" ? false : true,
    location: location.trim() || null,
    packingList: packingList.length > 0 ? packingList : null,
    defaultBpm: category === "music" ? (task?.defaultBpm ?? 120) : null,
    defaultTimeSignature: category === "music" ? (task?.defaultTimeSignature ?? "4/4") : null,
    kidIds,
    kidCanAdd: task?.kidCanAdd ?? false,
    frequencyPerDay,
    flexibleMinPerWeek: rule === "flexible" ? flexMin : null,
    target,
    targetDurationMinutes: target === "time" ? durationMinutes : null,
    targetReps: target === "reps" ? reps : null,
    targetRepLabel: target === "reps" ? repLabel : null,
    checklistItems: target === "checklist" ? checklistItems.filter(Boolean) : null,
    musicEnabled: category === "music",
    description: description.trim() || null,
    timeSlots: task?.timeSlots ?? [],
    subject: task?.subject ?? null,
    customLabel: task?.customLabel ?? null,
    endTime: task?.endTime ?? null,
    room: task?.room ?? null,
    teacher: task?.teacher ?? null,
    cashValueCents,
    requiresParentApproval,
  });

  const handleSave = () => {
    if (!name.trim()) { setError("Task name is required"); return; }
    setError(null);
    startTransition(async () => {
      const data = buildData();
      const result = task
        ? await updateTask(task.id, data)
        : await createTask(data);
      if (!result.ok) { setError(result.error); return; }
      router.push("/parent/tasks");
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteTask(task!.id);
      router.push("/parent/tasks");
    });
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-600 text-lg"
        >
          ←
        </button>
        <h1 className="text-xl font-black text-gray-900 flex-1">{task ? "Edit task" : "New task"}</h1>
        {task && (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="text-red-400 hover:text-red-600 text-sm font-semibold"
          >
            Delete
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm font-medium px-4 py-2 rounded-xl">
          {error}
        </div>
      )}

      {/* Icon */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="text-sm font-bold text-gray-700">Icon</div>
        <div className="flex flex-wrap gap-2">
          {COMMON_ICONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { setIcon(e); setCustomIcon(false); }}
              className={`w-11 h-11 rounded-xl text-2xl flex items-center justify-center ${
                icon === e && !customIcon ? "ring-2 ring-indigo-500 bg-indigo-50 scale-110" : "bg-gray-100"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          placeholder="Or type any emoji…"
          value={customIcon ? icon : ""}
          onChange={(e) => { setIcon(e.target.value); setCustomIcon(true); }}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
        />
      </div>

      {/* Name + description */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1">Task name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold"
          />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1">Description <span className="font-normal text-gray-400">(optional)</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Instructions shown to the kid…"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none"
          />
        </div>
      </div>

      {/* Category */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Category</div>
        <div className="flex flex-wrap gap-2">
          {PARENT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                category === c.id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity: location + packing list */}
      {category === "activity" && (
        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <div className="text-sm font-bold text-gray-700">🎒 Activity details</div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Location (optional)</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. City Pool"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Packing list</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {packingList.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => setPackingList(packingList.filter((i) => i !== item))}
                    className="leading-none opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={packingInput}
                onChange={(e) => setPackingInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = packingInput.trim();
                    if (v && !packingList.includes(v)) { setPackingList([...packingList, v]); setPackingInput(""); }
                  }
                }}
                placeholder="Add item…"
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const v = packingInput.trim();
                  if (v && !packingList.includes(v)) { setPackingList([...packingList, v]); setPackingInput(""); }
                }}
                className="bg-indigo-100 text-indigo-700 font-bold text-sm px-3 py-2 rounded-xl"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assigned to */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Assigned to</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setKidIds(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
              kidIds === null ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            All kids
          </button>
          {kids.map((k) => {
            const selected = kidIds?.includes(k.id) ?? false;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() =>
                  setKidIds((prev) => {
                    const current = prev ?? [];
                    const next = current.includes(k.id)
                      ? current.filter((id) => id !== k.id)
                      : [...current, k.id];
                    return next.length === 0 ? null : next;
                  })
                }
                className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                  selected ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {k.avatar} {k.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rule */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="text-sm font-bold text-gray-700">Rule</div>
        <div className="flex gap-3">
          {(["strict", "flexible"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRule(r)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold border ${
                rule === r
                  ? r === "strict"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-green-600 text-white border-green-600"
                  : "border-gray-200 text-gray-500"
              }`}
            >
              {r === "strict" ? "📌 Strict" : "🔄 Flexible"}
            </button>
          ))}
        </div>

        {rule === "strict" && (
          <>
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">Schedule</div>
              <div className="flex flex-wrap gap-2">
                {(["daily", "weekdays", "weekends", "specific_days"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScheduleType(s)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      scheduleType === s ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {s === "daily" ? "Every day" : s === "weekdays" ? "Weekdays" : s === "weekends" ? "Weekends" : "Custom"}
                  </button>
                ))}
              </div>
            </div>
            {scheduleType === "specific_days" && (
              <div className="flex gap-1.5">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(i + 1)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                      daysOfWeek.includes(i + 1)
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">Time of day</div>
              <div className="flex flex-wrap gap-2">
                {TIME_BLOCKS.map((tb) => (
                  <button
                    key={tb.value}
                    type="button"
                    onClick={() => setTimeBlock(tb.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      timeBlock === tb.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {tb.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">Times per day</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFrequencyPerDay(n)}
                    className={`py-2 rounded-xl text-sm font-bold border text-center transition-colors ${
                      frequencyPerDay === n
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    {n}×
                  </button>
                ))}
              </div>
              {frequencyPerDay > 1 && (
                <p className="text-xs text-gray-400 mt-1">Kid sees a 0 / {frequencyPerDay} counter — tap to increment each time</p>
              )}
            </div>
          </>
        )}

        {rule === "flexible" && (
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">Minimum times per week</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFlexMin((v) => Math.max(0, v - 1))}
                className="w-9 h-9 rounded-full bg-gray-100 text-lg font-bold"
              >
                −
              </button>
              <span className="text-xl font-black w-8 text-center">{flexMin}</span>
              <button
                type="button"
                onClick={() => setFlexMin((v) => v + 1)}
                className="w-9 h-9 rounded-full bg-gray-100 text-lg font-bold"
              >
                +
              </button>
              <span className="text-xs text-gray-400">{flexMin === 0 ? "(bonus / optional)" : "per week"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Target */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="text-sm font-bold text-gray-700">Target</div>
        <div className="flex flex-wrap gap-2">
          {(["none", "time", "reps", "checklist"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTarget(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                target === t ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {t === "none" ? "None" : t === "time" ? "⏱ Time" : t === "reps" ? "🔢 Reps" : "☑ Checklist"}
            </button>
          ))}
        </div>

        {target === "time" && (
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-20 border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold text-center"
            />
            <span className="text-sm text-gray-500">minutes</span>
          </div>
        )}

        {target === "reps" && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={reps}
              onChange={(e) => setReps(Number(e.target.value))}
              className="w-20 border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold text-center"
            />
            <input
              value={repLabel}
              onChange={(e) => setRepLabel(e.target.value)}
              placeholder="reps"
              className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm"
            />
          </div>
        )}

        {target === "checklist" && (
          <div className="space-y-2">
            {checklistItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  value={item}
                  onChange={(e) => {
                    const next = [...checklistItems];
                    next[idx] = e.target.value;
                    setChecklistItems(next);
                  }}
                  placeholder={`Step ${idx + 1}`}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setChecklistItems(checklistItems.filter((_, i) => i !== idx))}
                  className="text-gray-300 hover:text-red-400 text-lg"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setChecklistItems([...checklistItems, ""])}
              className="text-indigo-600 text-sm font-semibold"
            >
              + Add step
            </button>
          </div>
        )}
      </div>

      {/* Stars */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <label className="text-sm font-bold text-gray-700 block">Stars per completion</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPoints((v) => Math.max(0, v - 1))}
            className="w-10 h-10 rounded-full bg-gray-100 text-lg font-bold"
          >
            −
          </button>
          <span className="text-2xl font-black w-10 text-center">⭐{points}</span>
          <button
            type="button"
            onClick={() => setPoints((v) => v + 1)}
            className="w-10 h-10 rounded-full bg-gray-100 text-lg font-bold"
          >
            +
          </button>
        </div>
      </div>


      {/* Cash + approval */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-4">
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1">
            💵 Cash per completion ($) — optional
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder="0.00"
            value={cashValueCents === 0 ? "" : (cashValueCents / 100).toFixed(2)}
            onChange={(e) => {
              const v = e.target.value;
              setCashValueCents(v === "" ? 0 : Math.round(parseFloat(v) * 100));
            }}
            className="w-full border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="requires-parent-approval"
            checked={requiresParentApproval}
            onChange={(e) => setRequiresParentApproval(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="requires-parent-approval" className="text-sm font-bold text-gray-700">
            Requires parent approval before stars/cash are awarded
          </label>
        </div>
      </div>

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl disabled:opacity-50"
      >
        {isPending ? "Saving…" : task ? "Save changes" : "Create task"}
      </button>

      {/* Delete confirm */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="font-bold text-gray-900">Delete "{task?.name}"?</div>
            <p className="text-sm text-gray-500">This will hide the task from all kids. You can restore it from Supabase if needed.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="flex-1 border border-gray-200 text-gray-600 font-bold py-2.5 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="flex-1 bg-red-500 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
