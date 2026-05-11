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
import { SUBJECTS } from "@/lib/registry/subject-registry";

const CATEGORIES: { value: TaskCategory; label: string; icon: string }[] = [
  { value: "chore", label: "Chore", icon: "🧹" },
  { value: "exercise", label: "Exercise", icon: "🏃" },
  { value: "music", label: "Music", icon: "🎹" },
  { value: "activity", label: "Activity", icon: "🎒" },
  { value: "personal", label: "Personal", icon: "⭐" },
  { value: "school_subject", label: "School Subject", icon: "📚" },
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
    rule: task?.rule ?? "strict",
    flexibleMinPerWeek: task?.flexibleMinPerWeek ?? null,
    scheduleType: task?.scheduleType ?? "daily",
    daysOfWeek: task?.daysOfWeek ?? [],
    timeBlock: task?.timeBlock ?? "morning",
    startTime: task?.startTime ?? null,
    points: task?.points ?? 5,
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
    kidId: task?.kidId ?? null,
    kidCanAdd: task?.kidCanAdd ?? false,
    subject: task?.subject ?? null,
    customLabel: task?.customLabel ?? null,
    endTime: task?.endTime ?? null,
    room: task?.room ?? null,
    teacher: task?.teacher ?? null,
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
    if (form.rule === "strict" && form.scheduleType === "specific_days" && form.daysOfWeek.length === 0) {
      setError("Pick at least one day."); return;
    }
    if (form.target === "checklist" && (!form.checklistItems || form.checklistItems.length === 0)) {
      setError("Add at least one checklist item."); return;
    }
    setError(null);
    startTransition(async () => {
      const payload = isSchoolSubject
        ? { ...form, requiresCompletion: false, points: 0, familyPointsContribution: 0, kidCanAdd: false }
        : form;
      const result = task
        ? await updateTask(task.id, payload)
        : await createTask(payload);
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

  const isSchoolSubject = form.category === "school_subject";
  const showPackingList = form.category === "activity";
  const showLocation = form.category === "activity";
  const showMusicToggle = form.category === "music";

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

          {/* School Subject fields */}
          {isSchoolSubject ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500">Subject *</label>
                <div className="grid grid-cols-3 gap-1.5 mt-1">
                  {Object.values(SUBJECTS).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => set("subject", s.id)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border text-center transition-colors ${
                        form.subject === s.id
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <div className="text-base">{s.icon}</div>
                      <div>{s.label}</div>
                    </button>
                  ))}
                </div>
                {form.subject === "other" ? (
                  <input
                    type="text"
                    value={form.customLabel ?? ""}
                    onChange={(e) => set("customLabel", e.target.value || null)}
                    placeholder="e.g. Drama, Woodwork…"
                    className="w-full mt-2 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                  />
                ) : null}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500">Start time</label>
                  <input
                    type="time"
                    value={form.startTime ?? ""}
                    onChange={(e) => set("startTime", e.target.value || null)}
                    className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500">End time</label>
                  <input
                    type="time"
                    value={form.endTime ?? ""}
                    onChange={(e) => set("endTime", e.target.value || null)}
                    className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500">Room (optional)</label>
                  <input
                    type="text"
                    value={form.room ?? ""}
                    onChange={(e) => set("room", e.target.value || null)}
                    placeholder="e.g. 4A"
                    className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500">Teacher (optional)</label>
                  <input
                    type="text"
                    value={form.teacher ?? ""}
                    onChange={(e) => set("teacher", e.target.value || null)}
                    placeholder="e.g. Ms Lee"
                    className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
              <p className="text-xs text-indigo-600 font-semibold bg-indigo-50 rounded-xl px-3 py-2">
                📚 School subjects are info-only — no completion, no points.
              </p>
            </div>
          ) : null}

          {/* Rule */}
          {!isSchoolSubject ? (
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
                  onClick={() => set("rule", r.value)}
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
          ) : null}

          {/* Assigned to */}
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
          {!isSchoolSubject ? (<div>
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
          </div>) : null}

          {/* Music/metronome toggle */}
          {showMusicToggle ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="music-enabled"
                  checked={form.musicEnabled ?? false}
                  onChange={(e) => set("musicEnabled", e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="music-enabled" className="text-sm font-bold text-gray-700">
                  🎵 Show metronome when kid starts
                </label>
              </div>
              {form.musicEnabled ? (
                <div className="flex gap-2 pl-6">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500">Default BPM</label>
                    <input
                      type="number"
                      min={40}
                      max={240}
                      value={form.defaultBpm ?? 80}
                      onChange={(e) => set("defaultBpm", Number(e.target.value) || null)}
                      className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500">Time signature</label>
                    <select
                      value={form.defaultTimeSignature ?? "4/4"}
                      onChange={(e) => set("defaultTimeSignature", e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400 bg-white"
                    >
                      <option value="2/4">2/4</option>
                      <option value="3/4">3/4</option>
                      <option value="4/4">4/4</option>
                      <option value="6/8">6/8</option>
                    </select>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Points */}
          {!isSchoolSubject ? (<div className="flex gap-2">
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
          </div>) : null}

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
          {!isSchoolSubject ? (<div className="flex items-center gap-2">
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
          </div>) : null}

          {/* Kids can add */}
          {!isSchoolSubject ? (<div className="flex items-center gap-2">
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
          </div>) : null}

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
