"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upsertSchoolClass, deleteSchoolClass, clearKidTimetable } from "@/lib/actions/school-classes";
import { getSubject, listSubjects } from "@/lib/registry/subject-registry";
import type { DayOfWeek, SchoolClass, Subject } from "@/lib/domain/types";

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
}

export default function TimetableEditor({
  kidId,
  accent,
  initialClasses,
}: {
  kidId: string;
  accent: string;
  initialClasses: SchoolClass[];
}) {
  const router = useRouter();
  const [classes, setClasses] = useState<SchoolClass[]>(initialClasses);
  const [activeDay, setActiveDay] = useState<DayOfWeek>(1);
  const [draft, setDraft] = useState<DraftClass | null>(null);
  const [isPending, startTransition] = useTransition();

  const dayClasses = useMemo(
    () => classes.filter((c) => c.dayOfWeek === activeDay).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [classes, activeDay],
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
    });
  };

  const startEdit = (c: SchoolClass) => {
    setDraft({
      id: c.id,
      dayOfWeek: c.dayOfWeek,
      subject: c.subject,
      customLabel: c.customLabel ?? "",
      startTime: c.startTime,
      endTime: c.endTime,
      room: c.room ?? "",
      teacher: c.teacher ?? "",
    });
  };

  const saveDraft = () => {
    if (!draft) return;
    if (draft.startTime >= draft.endTime) {
      alert("End time must be after start time.");
      return;
    }
    startTransition(async () => {
      const result = await upsertSchoolClass(kidId, {
        id: draft.id ?? undefined,
        dayOfWeek: draft.dayOfWeek,
        subject: draft.subject,
        customLabel: draft.customLabel.trim() || null,
        startTime: draft.startTime,
        endTime: draft.endTime,
        room: draft.room.trim() || null,
        teacher: draft.teacher.trim() || null,
      });
      if (result.ok) {
        router.refresh();
        setDraft(null);
      }
    });
  };

  const removeDraft = () => {
    if (!draft?.id) return;
    startTransition(async () => {
      await deleteSchoolClass(kidId, draft.id!);
      setClasses((cs) => cs.filter((c) => c.id !== draft.id));
      router.refresh();
      setDraft(null);
    });
  };

  const resetAll = () => {
    if (!confirm("Delete your entire timetable from the database? This cannot be undone.")) return;
    startTransition(async () => {
      await clearKidTimetable(kidId);
      setClasses([]);
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
          const count = classes.filter((c) => c.dayOfWeek === d.dow).length;
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
        {dayClasses.length === 0 ? (
          <div className="text-sm text-gray-500 italic py-3">No classes added yet for this day.</div>
        ) : (
          <div className="space-y-2">
            {dayClasses.map((c) => {
              const s = getSubject(c.subject);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => startEdit(c)}
                  className={`w-full text-left rounded-xl p-3 border-l-4 ${s.bgClass} ${s.borderClass} hover:shadow transition-shadow`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl shrink-0">{s.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold ${s.textClass}`}>{c.customLabel ?? s.label}</div>
                      <div className="text-xs text-gray-600">
                        {c.startTime} – {c.endTime}
                        {c.room ? ` · 🚪 ${c.room}` : ""}
                        {c.teacher ? ` · 👤 ${c.teacher}` : ""}
                      </div>
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

      {/* Reset */}
      {classes.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={resetAll}
            className="text-xs text-red-400 hover:text-red-600 font-bold underline"
          >
            Clear entire timetable
          </button>
        </div>
      ) : null}

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

      <div className="flex justify-end">
        <Link href={`/kid/${kidId}/today`} className="text-sm text-gray-500 hover:text-gray-700">
          Done →
        </Link>
      </div>
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
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-black mb-3">
          {draft.id ? "Edit class" : "New class"}
        </h3>

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

        <Field label="Subject">
          <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1">
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

        <div className="grid grid-cols-2 gap-2">
          <Field label="Start">
            <input
              type="time"
              value={draft.startTime}
              onChange={(e) => onChange({ ...draft, startTime: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-sm"
            />
          </Field>
          <Field label="End">
            <input
              type="time"
              value={draft.endTime}
              onChange={(e) => onChange({ ...draft, endTime: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-sm"
            />
          </Field>
        </div>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="text-xs font-bold text-gray-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}
