"use client";

import { useState, useTransition } from "react";
import { createTask, updateTask, deleteTask } from "@/lib/actions/tasks";
import type { TaskFormData } from "@/lib/actions/tasks";
import type { Kid, Task, TaskCategory, TimeBlock, ScheduleType } from "@/lib/domain/types";

const CATEGORIES: { value: TaskCategory; label: string; icon: string }[] = [
  { value: "chore", label: "Chore", icon: "🧹" },
  { value: "exercise", label: "Exercise", icon: "🏃" },
  { value: "music", label: "Music", icon: "🎹" },
  { value: "activity", label: "Activity", icon: "🎒" },
  { value: "personal", label: "Personal", icon: "⭐" },
];

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
    scheduleType: task?.scheduleType ?? "daily",
    daysOfWeek: task?.daysOfWeek ?? [],
    timeBlock: task?.timeBlock ?? "morning",
    startTime: task?.startTime ?? null,
    points: task?.points ?? 5,
    familyPointsContribution: task?.familyPointsContribution ?? 0,
    requiresTimer: task?.requiresTimer ?? false,
    durationMinutes: task?.durationMinutes ?? null,
    requiresCompletion: task?.requiresCompletion ?? true,
    location: task?.location ?? null,
    packingList: task?.packingList ?? null,
    defaultBpm: task?.defaultBpm ?? null,
    defaultTimeSignature: task?.defaultTimeSignature ?? null,
    kidId: task?.kidId ?? null,
    kidCanAdd: task?.kidCanAdd ?? false,
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
    if (form.scheduleType === "specific_days" && form.daysOfWeek.length === 0) {
      setError("Pick at least one day."); return;
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
  const showTimer = form.category === "music" || form.category === "exercise";
  const showMetronome = form.category === "music";
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
            <div className="w-16">
              <label className="text-xs font-bold text-gray-500">Icon</label>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => set("icon", e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-center text-2xl focus:outline-none focus:border-indigo-400"
                maxLength={4}
              />
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

          {/* Category */}
          <div>
            <label className="text-xs font-bold text-gray-500">Category</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set("category", c.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                    form.category === c.value
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* For who */}
          <div>
            <label className="text-xs font-bold text-gray-500">Assigned to</label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => set("kidId", null)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  form.kidId === null
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                }`}
              >
                All kids
              </button>
              {kids.map((kid) => (
                <button
                  key={kid.id}
                  type="button"
                  onClick={() => set("kidId", kid.id)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                    form.kidId === kid.id
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  {kid.avatar} {kid.name}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
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

          {/* Time block + start time */}
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
            <div className="w-28">
              <label className="text-xs font-bold text-gray-500">Start time</label>
              <input
                type="time"
                value={form.startTime ?? ""}
                onChange={(e) => set("startTime", e.target.value || null)}
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Points */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500">Points ⭐</label>
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
              <label className="text-xs font-bold text-gray-500">Family points</label>
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

          {/* Timer (music/exercise) */}
          {showTimer ? (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requires-timer"
                  checked={form.requiresTimer}
                  onChange={(e) => set("requiresTimer", e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="requires-timer" className="text-sm font-bold text-amber-900">
                  Has a timer
                </label>
              </div>
              {form.requiresTimer ? (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500">Duration (min)</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={form.durationMinutes ?? ""}
                      onChange={(e) => set("durationMinutes", Number(e.target.value) || null)}
                      className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  {showMetronome ? (
                    <div className="flex-1">
                      <label className="text-xs font-bold text-gray-500">Default BPM</label>
                      <input
                        type="number"
                        min={40}
                        max={240}
                        value={form.defaultBpm ?? ""}
                        onChange={(e) => set("defaultBpm", Number(e.target.value) || null)}
                        className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Activity fields */}
          {showLocation ? (
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
          ) : null}
          {showPackingList ? (
            <div>
              <label className="text-xs font-bold text-gray-500">
                Packing list (comma-separated)
              </label>
              <input
                type="text"
                value={form.packingList?.join(", ") ?? ""}
                onChange={(e) =>
                  set(
                    "packingList",
                    e.target.value
                      ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                      : null,
                  )
                }
                placeholder="e.g. Swimsuit, Towel, Goggles"
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          ) : null}

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
