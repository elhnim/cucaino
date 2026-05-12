"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upsertSchoolSubjectTask, deleteTask } from "@/lib/actions/tasks";
import { getSubject, listSubjects } from "@/lib/registry/subject-registry";
import type { DayOfWeek, Task, Subject } from "@/lib/domain/types";

const DAYS: { dow: DayOfWeek; short: string; full: string }[] = [
  { dow: 1, short: "Mon", full: "Monday" },
  { dow: 2, short: "Tue", full: "Tuesday" },
  { dow: 3, short: "Wed", full: "Wednesday" },
  { dow: 4, short: "Thu", full: "Thursday" },
  { dow: 5, short: "Fri", full: "Friday" },
];

interface DraftClass {
  id: string | null;
  dayOfWeek: DayOfWeek;
  subject: Subject;
  customLabel: string;
  startTime: string;
  endTime: string;
  room: string;
  teacher: string;
  packingList: string[];
}

function taskToDraft(t: Task): DraftClass {
  return {
    id: t.id,
    dayOfWeek: (t.daysOfWeek[0] ?? 1) as DayOfWeek,
    subject: (t.subject ?? "other") as Subject,
    customLabel: t.customLabel ?? "",
    startTime: t.startTime ?? "09:00",
    endTime: t.endTime ?? "10:00",
    room: t.room ?? "",
    teacher: t.teacher ?? "",
    packingList: t.packingList ?? [],
  };
}

export default function TimetableEditor({
  kidId,
  accent,
  initialTasks,
  initialDay = 1,
}: {
  kidId: string;
  accent: string;
  initialTasks: Task[];
  initialDay?: DayOfWeek;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activeDay, setActiveDay] = useState<DayOfWeek>(initialDay);
  const [draft, setDraft] = useState<DraftClass | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const dayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.daysOfWeek.includes(activeDay))
        .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")),
    [tasks, activeDay],
  );

  const startAdd = () => {
    setDraft({
      id: null,
      dayOfWeek: activeDay,
      subject: "math",
      customLabel: "",
      startTime: "09:00",
      endTime: "10:00",
      room: "",
      teacher: "",
      packingList: [],
    });
  };

  const startEdit = (t: Task) => setDraft(taskToDraft(t));

  const saveDraft = () => {
    if (!draft) return;
    if (draft.startTime >= draft.endTime) {
      alert("End time must be after start time.");
      return;
    }
    startTransition(async () => {
      const result = await upsertSchoolSubjectTask({
        id: draft.id ?? undefined,
        kidId,
        dayOfWeek: draft.dayOfWeek,
        subject: draft.subject,
        customLabel: draft.customLabel.trim() || null,
        startTime: draft.startTime,
        endTime: draft.endTime,
        room: draft.room.trim() || null,
        teacher: draft.teacher.trim() || null,
        packingList: draft.packingList.length > 0 ? draft.packingList : null,
      });
      if (result.ok) {
        router.refresh();
        setDraft(null);
      } else {
        alert(result.error);
      }
    });
  };

  const removeDraft = () => {
    if (!draft?.id) return;
    startTransition(async () => {
      await deleteTask(draft.id!);
      setTasks((ts) => ts.filter((t) => t.id !== draft.id));
      router.refresh();
      setDraft(null);
    });
  };

  const clearDay = () => {
    if (dayTasks.length === 0) return;
    const dayLabel = DAYS.find((d) => d.dow === activeDay)?.full ?? "this day";
    if (!confirm(`Clear all classes for ${dayLabel}?`)) return;
    startTransition(async () => {
      await Promise.all(dayTasks.map((t) => deleteTask(t.id)));
      setTasks((ts) => ts.filter((t) => !t.daysOfWeek.includes(activeDay)));
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-black">📚 Timetable</h2>
          <p className="text-sm text-gray-600">Build your weekly school schedule.</p>
        </div>
        {isPending ? (
          <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">Saving…</span>
        ) : null}
      </header>

      {/* Day tabs */}
      <div className="bg-white rounded-2xl shadow p-2 grid grid-cols-5 gap-1">
        {DAYS.map((d) => {
          const active = activeDay === d.dow;
          const count = tasks.filter((t) => t.daysOfWeek.includes(d.dow)).length;
          return (
            <button
              key={d.dow}
              type="button"
              onClick={() => setActiveDay(d.dow)}
              className={`py-2 rounded-xl font-bold text-sm transition-colors ${
                active ? "text-white" : "text-gray-700 hover:bg-gray-100"
              }`}
              style={active ? { background: accent } : undefined}
            >
              {d.short}
              <div className={`text-[10px] font-bold mt-0.5 ${active ? "opacity-90" : "text-gray-400"}`}>
                {count}
              </div>
            </button>
          );
        })}
      </div>

      {/* Class list for selected day */}
      <section className="bg-white rounded-2xl shadow p-4 space-y-2">
        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">
          {DAYS.find((d) => d.dow === activeDay)?.full}
        </h3>
        {dayTasks.length === 0 ? (
          <div className="text-sm text-gray-500 italic py-3">No classes added yet for this day.</div>
        ) : (
          <div className="space-y-2">
            {dayTasks.map((t) => {
              const s = getSubject((t.subject ?? "other") as Subject);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => startEdit(t)}
                  className={`w-full text-left rounded-xl p-3 border-l-4 ${s.bgClass} ${s.borderClass} hover:shadow transition-shadow`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl shrink-0">{s.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold ${s.textClass}`}>{t.customLabel ?? s.label}</div>
                      <div className="text-xs text-gray-600">
                        {t.startTime} – {t.endTime}
                        {t.room ? ` · 🚪 ${t.room}` : ""}
                        {t.teacher ? ` · 👤 ${t.teacher}` : ""}
                      </div>
                      {t.packingList && t.packingList.length > 0 && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          🎒 {t.packingList.join(", ")}
                        </div>
                      )}
                    </div>
                    <span className="text-gray-400 text-sm shrink-0">edit</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={startAdd}
          disabled={isPending}
          className="w-full text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
          style={{ background: accent }}
        >
          + Add a class
        </button>
      </section>

      {/* Bottom actions */}
      <div className="flex justify-between items-center">
        {dayTasks.length > 0 ? (
          <button
            type="button"
            onClick={clearDay}
            disabled={isPending}
            className="text-sm font-bold text-red-500 border-2 border-red-200 hover:border-red-400 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            🗑 Clear {DAYS.find((d) => d.dow === activeDay)?.short}
          </button>
        ) : (
          <div />
        )}
        <Link
          href={`/kid/${kidId}/todo`}
          className="block text-center text-white font-black text-base px-6 py-3 rounded-2xl shadow-md"
          style={{ background: accent }}
        >
          ← Back to Schedule
        </Link>
      </div>

      {/* Edit modal */}
      {draft ? (
        <ClassEditor
          accent={accent}
          draft={draft}
          isPending={isPending}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
          onDelete={draft.id ? removeDraft : undefined}
        />
      ) : null}
    </div>
  );
}

function ClassEditor({
  accent,
  draft,
  isPending,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  accent: string;
  draft: DraftClass;
  isPending: boolean;
  onChange: (next: DraftClass) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const selectedSubject = getSubject(draft.subject);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{selectedSubject.icon}</span>
          <h3 className="text-xl font-black flex-1">
            {draft.id ? "Edit class" : "New class"}
          </h3>
        </div>

        {/* Day */}
        <Field label="Day">
          <div className="grid grid-cols-5 gap-1">
            {DAYS.map((d) => {
              const active = draft.dayOfWeek === d.dow;
              return (
                <button
                  key={d.dow}
                  type="button"
                  onClick={() => onChange({ ...draft, dayOfWeek: d.dow })}
                  className={`py-2 rounded-lg font-bold text-sm ${active ? "text-white" : "bg-gray-100 text-gray-700"}`}
                  style={active ? { background: accent } : undefined}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Subject */}
        <Field label="Subject">
          <div className="grid grid-cols-4 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {listSubjects().map((s) => {
              const active = draft.subject === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChange({ ...draft, subject: s.id })}
                  className={`py-2 px-2 rounded-lg text-xs text-left transition-colors ${
                    active ? `${s.bgClass} ${s.textClass} ring-2` : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                  }`}
                  style={active ? ({ "--tw-ring-color": accent } as React.CSSProperties) : undefined}
                >
                  <div className="text-lg">{s.icon}</div>
                  <div className="font-bold truncate">{s.label}</div>
                </button>
              );
            })}
          </div>
        </Field>

        {/* Time */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start">
            <TimeSelect value={draft.startTime} onChange={(v) => onChange({ ...draft, startTime: v })} />
          </Field>
          <Field label="End">
            <TimeSelect value={draft.endTime} onChange={(v) => onChange({ ...draft, endTime: v })} />
          </Field>
        </div>

        {/* Custom label */}
        {draft.subject === "other" ? (
          <div className="mb-3">
            <label className="text-xs font-black text-gray-700 block mb-1">
              Subject name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Drama, Swimming, Mandarin, Coding"
              value={draft.customLabel}
              onChange={(e) => onChange({ ...draft, customLabel: e.target.value })}
              className="w-full border-2 border-indigo-300 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm bg-indigo-50"
              maxLength={40}
              autoFocus
            />
          </div>
        ) : (
          <Field label="Custom name (optional)">
            <input
              type="text"
              placeholder="e.g. Algebra with Mr Brown"
              value={draft.customLabel}
              onChange={(e) => onChange({ ...draft, customLabel: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm"
              maxLength={40}
            />
          </Field>
        )}

        {/* Room + Teacher */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Room">
            <input
              type="text"
              placeholder="e.g. 4A"
              value={draft.room}
              onChange={(e) => onChange({ ...draft, room: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-sm"
              maxLength={10}
            />
          </Field>
          <Field label="Teacher">
            <input
              type="text"
              placeholder="e.g. Ms Lee"
              value={draft.teacher}
              onChange={(e) => onChange({ ...draft, teacher: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-sm"
              maxLength={20}
            />
          </Field>
        </div>

        {/* Packing list */}
        <Field label="🎒 Materials needed (e.g. book, instrument, gym kit)">
          <PackingListInput
            items={draft.packingList}
            onChange={(v) => onChange({ ...draft, packingList: v })}
          />
        </Field>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            className="text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
            style={{ background: accent }}
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="w-full mt-2 text-red-600 hover:text-red-800 text-sm font-bold py-2 disabled:opacity-50"
          >
            🗑 Delete this class
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TimeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const options: string[] = [];
  for (let h = 7; h <= 18; h++) {
    for (const m of [0, 15, 30, 45]) {
      options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-sm"
    >
      {options.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

function PackingListInput({
  items,
  onChange,
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setInput("");
  };

  return (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-full"
          >
            {item}
            <button
              type="button"
              onClick={() => onChange(items.filter((i) => i !== item))}
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Type item and press Add"
          className="flex-1 border-2 border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          maxLength={40}
        />
        <button
          type="button"
          onClick={add}
          className="bg-indigo-100 text-indigo-700 font-bold text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-200"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="text-xs font-bold text-gray-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}
