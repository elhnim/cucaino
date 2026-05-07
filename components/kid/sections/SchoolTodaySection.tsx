import Link from "next/link";
import { getSubject } from "@/lib/registry/subject-registry";
import type { SchoolClass } from "@/lib/domain/types";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export default function SchoolTodaySection({
  kidId,
  classes,
}: {
  kidId: string;
  classes: SchoolClass[];
}) {
  if (classes.length === 0) {
    return (
      <section className="bg-white rounded-2xl shadow border-2 border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-black text-gray-700">🏫 SCHOOL TODAY</h3>
          <Link
            href={`/kid/${kidId}/timetable`}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            Edit timetable →
          </Link>
        </div>
        <div className="text-sm text-gray-500 italic py-2">
          No classes for today.{" "}
          <Link href={`/kid/${kidId}/timetable`} className="text-indigo-600 hover:underline font-bold">
            Set up your timetable
          </Link>
          .
        </div>
      </section>
    );
  }

  const now = new Date();
  const nowHm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return (
    <section className="bg-white rounded-2xl shadow border-2 border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-black text-gray-700">🏫 SCHOOL TODAY</h3>
        <Link
          href={`/kid/${kidId}/timetable`}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
        >
          Edit timetable →
        </Link>
      </div>
      <ol className="space-y-1.5">
        {classes.map((c) => {
          const s = getSubject(c.subject);
          const isPast = c.endTime < nowHm;
          const isCurrent = c.startTime <= nowHm && nowHm < c.endTime;
          return (
            <li
              key={c.id}
              className={`rounded-lg p-2 flex items-center gap-3 border-l-4 ${s.bgClass} ${s.borderClass} ${
                isPast ? "opacity-50" : ""
              } ${isCurrent ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
            >
              <span className="text-xl shrink-0">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`font-bold text-sm ${s.textClass}`}>
                  {c.customLabel ?? s.label}
                  {isCurrent ? (
                    <span className="ml-2 text-xs bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full font-bold">
                      now
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-600">
                  {c.startTime} – {c.endTime}
                  {c.room ? ` · ${c.room}` : ""}
                  {c.teacher ? ` · ${c.teacher}` : ""}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
