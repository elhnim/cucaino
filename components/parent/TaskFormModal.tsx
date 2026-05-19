"use client";

import { useState, useTransition } from "react";
import { createTask, updateTask, deleteTask } from "@/lib/actions/tasks";
import type { TaskFormData } from "@/lib/actions/tasks";
import type {
  Kid,
  Task,
  TaskCategory,
  TimeBlock,
  ScheduleType,
  TaskRule,
  TaskTarget,
} from "@/lib/domain/types";
import { PARENT_CATEGORIES } from "@/lib/registry/category-registry";

const COMMON_ICONS = [
  "🛁","🦷","🪥","🍽️","📚","🎵","🏃","🛏️","🎒","🧹","🐕","🎮",
  "✏️","🥗","💊","🧘","🚿","👕","💪","🎸","🎹","⚽","🏊","🚴",
  "🌱","⭐","🎯","🤸","📖","🧠","🍳","🥤",
];

function PackingListEditor({
  items,
  onChange,
  placeholder = "Add item…",
}: {
  items: string[] | null;
  onChange: (v: string[] | null) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    const next = [...(items ?? []), v];
    onChange(next);
    setInput("");
  };
  const remove = (i: number) => {
    const next = (items ?? []).filter((_, idx) => idx !== i);
    onChange(next.length ? next : null);
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 rounded-xl min-h-[44px] cursor-text">
      {(items ?? []).map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full">
          {item}
          <button type="button" onClick={() => remove(i)} className="text-indigo-400 hover:text-indigo-700 leading-none">✕</button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
        className="flex-1 min-w-[80px] text-xs outline-none bg-transparent text-gray-600 placeholder-gray-400"
      />
    </div>
  );
}


const TIME_BLOCKS: { value: TimeBlock; label: string }[] = [
  { value: "before_school", label: "Before school" },
  { value: "morning", label: "Morning" },
  { value: "after_school", label: "After school" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "anytime", label: "Anytime" },
];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function defaultForm(task?: Task): TaskFormData {
  return {
    name: task?.name ?? "",
    icon: task?.icon ?? "✅",
    category: task?.category ?? "chore",
    rule: task?.rule ?? "strict",
    flexibleMinPerWeek: task?.flexibleMinPerWeek ?? null,
    scheduleType: task?.scheduleType ?? "daily",
    daysOfWeek: task?.daysOfWeek ?? [],
    timeBlock: task?.timeBlock ?? "morning",
    startTime: task?.startTime ?? null,
    points: task?.points ?? 0,
    familyPointsContribution: task?.familyPointsContribution ?? 0,
    target: task?.target ?? "none",
    targetDurationMinutes: task?.targetDurationMinutes ?? null,
    targetReps: task?.targetReps ?? null,
    targetRepLabel: task?.targetRepLabel ?? null,
    checklistItems: task?.checklistItems ?? null,
    musicEnabled: task?.musicEnabled ?? false,
    description: task?.description ?? null,
    timeSlots: task?.timeSlots ?? [],
    requiresTimer: task?.requiresTimer ?? false,
    durationMinutes: task?.durationMinutes ?? null,
    requiresCompletion: task?.requiresCompletion ?? true,
    location: task?.location ?? null,
    packingList: task?.packingList ?? null,
    defaultBpm: task?.defaultBpm ?? null,
    defaultTimeSignature: task?.defaultTimeSignature ?? null,
    kidIds: task?.kidIds ?? null,
    kidCanAdd: task?.kidCanAdd ?? false,
    frequencyPerDay: task?.frequencyPerDay ?? 1,
    subject: task?.subject ?? null,
    customLabel: task?.customLabel ?? null,
    endTime: task?.endTime ?? null,
    room: task?.room ?? null,
    teacher: task?.teacher ?? null,
    cashValueCents: task?.cashValueCents ?? 0,
    requiresParentApproval: task?.requiresParentApproval ?? false,
  };
}

export default function TaskFormModal({
  kids,
  task,
  onClose,
}: {
  kids: Kid[];
  task?: Task;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TaskFormData>(defaultForm(task));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const set = <K extends keyof TaskFormData>(k: K, v: TaskFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleDay = (d: number) => {
    set(
      "daysOfWeek",
      form.daysOfWeek.includes(d)
        ? form.daysOfWeek.filter((x) => x !== d)
        : [...form.daysOfWeek, d].sort(),
    );
  };

  const submit = () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (form.rule === "strict" && form.scheduleType === "specific_days" && form.daysOfWeek.length === 0) {
      setError("Pick at least one day."); return;
    }
    if (form.target === "checklist" && (!form.checklistItems || form.checklistItems.length === 0)) {
      setError("Add at least one checklist item."); return;
    }
    setError(null);
    startTransition(async () => {
      const result = task
        ? await updateTask(task.id, form)
        : await createTask(form);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  };

  const handleDelete = () => {
    if (!task) return;
    startTransition(async () => {
      await deleteTask(task.id);
      onClose();
    });
  };

  const showPackingList = form.category === "activity";
  const showLocation = form.category === "activity";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-lg font-black">
            {task ? "Edit task" : "New task"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-bold rounded-xl px-3 py-2">
              {error}
            </div>
          ) : null}

          {/* Name + icon */}
          <div className="flex gap-2">
            <div className="w-16 flex-shrink-0">
              <label className="text-xs font-bold text-gray-500">Icon</label>
              <button
                type="button"
                onClick={() => setShowIconPicker((v) => !v)}
                className="w-full mt-1 h-[42px] border-2 rounded-xl text-2xl flex items-center justify-center transition-colors hover:bg-gray-50"
                style={{ borderColor: showIconPicker ? "#6366f1" : "#e5e7eb" }}
              >
                {form.icon}
              </button>
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500">Task name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Make bed"
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Icon picker grid */}
          {showIconPicker && (
            <div className="bg-gray-50 rounded-2xl p-3 -mt-1">
              <div className="grid grid-cols-8 gap-1.5">
                {COMMON_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => { set("icon", ic); setShowIconPicker(false); }}
                    className={`h-9 rounded-xl text-xl flex items-center justify-center transition-colors ${
                      form.icon === ic ? "bg-indigo-100 ring-2 ring-indigo-400" : "hover:bg-white"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => { if (e.target.value) set("icon", e.target.value); }}
                placeholder="Or type any emoji…"
                className="w-full mt-2 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
                maxLength={4}
              />
            </div>
          )}

          {/* Category */}
          <div>
            <label className="text-xs font-bold text-gray-500">Category</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PARENT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set("category", c.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                    form.category === c.id
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Activity: location + packing list — shown right after category when Activity selected */}
          {showLocation && (
            <div>
              <label className="text-xs font-bold text-gray-500">Location (optional)</label>
              <input
                type="text"
                value={form.location ?? ""}
                onChange={(e) => set("location", e.target.value || null)}
                placeholder="e.g. City Pool"
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          )}
          {showPackingList && (
            <div>
              <label className="text-xs font-bold text-gray-500">🎒 Packing list</label>
              <div className="mt-1">
                <PackingListEditor
                  items={form.packingList}
                  onChange={(v) => set("packingList", v)}
                  placeholder="Add item… (press Enter)"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Items to pack — shown as a reminder the evening before</p>
            </div>
          )}

          {/* Rule */}
          <div>
            <label className="text-xs font-bold text-gray-500">Rule</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(
                [
                  { value: "strict" as TaskRule, label: "📅 Strict", desc: "Fixed days & time" },
                  { value: "flexible" as TaskRule, label: "🎯 Flexible", desc: "Kid self-schedules" },
                ]
              ).map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => { set("rule", r.value); if (r.value === "flexible") set("kidCanAdd", true); }}
                  className={`py-2.5 px-3 rounded-xl text-sm font-bold border text-left transition-colors ${
                    form.rule === r.value
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  <div>{r.label}</div>
                  <div className={`text-xs mt-0.5 font-normal ${form.rule === r.value ? "text-indigo-200" : "text-gray-400"}`}>
                    {r.desc}
                  </div>
                </button>
              ))}
            </div>
            {form.rule === "flexible" ? (
              <div className="mt-2">
                <label className="text-xs font-bold text-gray-500">Min times per week</label>
                <input
                  type="number"
                  min={0}
                  max={14}
                  value={form.flexibleMinPerWeek ?? 1}
                  onChange={(e) => set("flexibleMinPerWeek", Number(e.target.value))}
                  className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                />
                <p className="text-xs text-gray-400 mt-1">0 = bonus/optional · 1+ = expected each week</p>
              </div>
            ) : null}
          </div>

          {/* Assigned to */}
          <div>
            <label className="text-xs font-bold text-gray-500">Assigned to</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              <button
                type="button"
                onClick={() => set("kidIds", null)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  form.kidIds === null
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                }`}
              >
                All kids
              </button>
              {kids.map((kid) => {
                const selected = form.kidIds?.includes(kid.id) ?? false;
                return (
                  <button
                    key={kid.id}
                    type="button"
                    onClick={() => {
                      const current = form.kidIds ?? [];
                      const next = current.includes(kid.id)
                        ? current.filter((id) => id !== kid.id)
                        : [...current, kid.id];
                      set("kidIds", next.length === 0 ? null : next);
                    }}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                      selected
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    {kid.avatar} {kid.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Schedule (Strict only) */}
          {form.rule === "strict" ? (
            <div>
              <label className="text-xs font-bold text-gray-500">Schedule</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(["daily", "weekdays", "weekends", "specific_days"] as ScheduleType[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set("scheduleType", s)}
                    className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                      form.scheduleType === s
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    {s === "daily" ? "Every day" : s === "weekdays" ? "Weekdays" : s === "weekends" ? "Weekends" : "Pick days"}
                  </button>
                ))}
              </div>
              {form.scheduleType === "specific_days" ? (
                <div className="flex gap-1.5 mt-2">
                  {DAY_NAMES.map((name, i) => {
                    const d = i + 1;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          form.daysOfWeek.includes(d)
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Times per day — strict tasks only */}
          {form.rule === "strict" ? (
            <div>
              <label className="text-xs font-bold text-gray-500">Times per day</label>
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set("frequencyPerDay", n)}
                    className={`py-2 rounded-xl text-sm font-bold border text-center transition-colors ${
                      (form.frequencyPerDay ?? 1) === n
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    {n}×
                  </button>
                ))}
              </div>
              {(form.frequencyPerDay ?? 1) > 1 ? (
                <p className="text-xs text-gray-400 mt-1">Kid sees a 0 / {form.frequencyPerDay} counter — tap to increment each time</p>
              ) : null}
            </div>
          ) : null}

          {/* Time of day + start time */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500">Time of day</label>
              <select
                value={form.timeBlock}
                onChange={(e) => set("timeBlock", e.target.value as TimeBlock)}
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400 bg-white"
              >
                {TIME_BLOCKS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {form.rule === "strict" ? (
              <div className="w-28">
                <label className="text-xs font-bold text-gray-500">Start time</label>
                <input
                  type="time"
                  step="300"
                  value={form.startTime ?? ""}
                  onChange={(e) => set("startTime", e.target.value || null)}
                  className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>
            ) : null}
          </div>

          {/* Instructions / description */}
          <div>
            <label className="text-xs font-bold text-gray-500">Instructions (optional)</label>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
              placeholder="e.g. Brush for at least 2 minutes, don't forget the back teeth"
              rows={2}
              className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
            />
          </div>

          {/* Target */}
          <div>
            <label className="text-xs font-bold text-gray-500">Target</label>
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {(
                [
                  { value: "none" as TaskTarget, icon: "✓", label: "None" },
                  { value: "time" as TaskTarget, icon: "⏱", label: "Timer" },
                  { value: "reps" as TaskTarget, icon: "🔄", label: "Reps" },
                  { value: "checklist" as TaskTarget, icon: "☑", label: "List" },
                ]
              ).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("target", t.value)}
                  className={`py-2 rounded-xl text-xs font-bold border text-center transition-colors ${
                    form.target === t.value
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  <div className="text-base">{t.icon}</div>
                  <div>{t.label}</div>
                </button>
              ))}
            </div>

            {/* Time: duration */}
            {form.target === "time" ? (
              <div className="mt-2">
                <label className="text-xs font-bold text-gray-500">Duration (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.targetDurationMinutes ?? ""}
                  onChange={(e) => set("targetDurationMinutes", Number(e.target.value) || null)}
                  placeholder="e.g. 30"
                  className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>
            ) : null}

            {/* Reps: count + label */}
            {form.target === "reps" ? (
              <div className="mt-2 flex gap-2">
                <div className="w-24">
                  <label className="text-xs font-bold text-gray-500">Count</label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={form.targetReps ?? ""}
                    onChange={(e) => set("targetReps", Number(e.target.value) || null)}
                    placeholder="10"
                    className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500">Label</label>
                  <input
                    type="text"
                    value={form.targetRepLabel ?? ""}
                    onChange={(e) => set("targetRepLabel", e.target.value || null)}
                    placeholder="e.g. push-ups"
                    className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
            ) : null}

            {/* Checklist: items one per line */}
            {form.target === "checklist" ? (
              <div className="mt-2">
                <label className="text-xs font-bold text-gray-500">Items (one per line)</label>
                <textarea
                  value={form.checklistItems?.join("\n") ?? ""}
                  onChange={(e) =>
                    set(
                      "checklistItems",
                      e.target.value
                        ? e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                        : null,
                    )
                  }
                  placeholder={"Brush teeth\nFloss\nRinse with mouthwash"}
                  rows={4}
                  className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                />
              </div>
            ) : null}
          </div>

          {/* Points */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500">Kid ⭐</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.points}
                onChange={(e) => set("points", Number(e.target.value))}
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500">Family ⭐</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.familyPointsContribution}
                onChange={(e) => set("familyPointsContribution", Number(e.target.value))}
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Cash per completion */}
          <div>
            <label className="text-xs font-bold text-gray-500">
              💵 Cash per completion ($) — optional
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={form.cashValueCents === 0 ? "" : (form.cashValueCents! / 100).toFixed(2)}
              onChange={(e) => {
                const v = e.target.value;
                set("cashValueCents", v === "" ? 0 : Math.round(parseFloat(v) * 100));
              }}
              className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Parent approval */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requires-parent-approval"
              checked={form.requiresParentApproval ?? false}
              onChange={(e) => set("requiresParentApproval", e.target.checked)}
              className="rounded"
            />
            <label
              htmlFor="requires-parent-approval"
              className="text-sm font-bold text-gray-700"
            >
              Requires parent approval before stars/cash are awarded
            </label>
          </div>

          {/* Completion required */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requires-completion"
              checked={form.requiresCompletion}
              onChange={(e) => set("requiresCompletion", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="requires-completion" className="text-sm font-bold text-gray-700">
              Requires completion (uncheck for info-only activities)
            </label>
          </div>

          {/* Kids can add */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="kid-can-add"
              checked={form.kidCanAdd}
              onChange={(e) => set("kidCanAdd", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="kid-can-add" className="text-sm font-bold text-gray-700">
              Kids can add this task themselves
            </label>
          </div>

          {/* Actions */}
          <div className="pt-2 flex gap-2">
            {task && !confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 border border-red-200 hover:bg-red-50"
              >
                Delete
              </button>
            ) : task && confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Confirm delete"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "Saving…" : task ? "Save" : "Add task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
