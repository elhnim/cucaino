import Link from "next/link";
import { tasksForDay } from "@/lib/domain/schedule";
import { getSubject } from "@/lib/registry/subject-registry";
import { getCategory } from "@/lib/registry/category-registry";
import { getTheme } from "@/lib/themes/presets";
import type { Kid, Task, SchoolClass, DayOfWeek } from "@/lib/domain/types";

const WEEKDAYS: { dow: DayOfWeek; short: string; full: string }[] = [
  { dow: 1, short: "Mon", full: "Monday" },
  { dow: 2, short: "Tue", full: "Tuesday" },
  { dow: 3, short: "Wed", full: "Wednesday" },
  { dow: 4, short: "Thu", full: "Thursday" },
  { dow: 5, short: "Fri", full: "Friday" },
];

type EventItem =
  | { kind: "class"; data: SchoolClass; sortKey: string }
  | { kind: "task"; data: Task; sortKey: string };

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - (day - 1));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isoWeekday(): DayOfWeek {
  const d = new Date().getDay();
  return (d === 0 ? 7 : d) as DayOfWeek;
}

export default function WeekGridClient({
  kid,
  tasks,
  classes,
}: {
  kid: Kid;
  tasks: Task[];
  classes: SchoolClass[];
}) {
  const theme = getTheme(kid.themeId);
  const todayDow = isoWeekday();
  const monday = startOfWeek(new Date());

  const columns = WEEKDAYS.map(({ dow, short, full }) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + dow - 1);

    const dayClasses = classes.filter((c) => c.dayOfWeek === dow).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const dayTasks = tasksForDay(tasks, dow).filter(
      (t) =>
        t.scheduleType !== "daily" ||
        t.category === "music" ||
        t.category === "activity",
    );

    const events: EventItem[] = [
      ...dayClasses.map((c) => ({
        kind: "class" as const,
        data: c,
        sortKey: c.startTime,
      })),
      ...dayTasks.map((t) => ({
        kind: "task" as const,
        data: t,
        sortKey: t.startTime ?? "23:59",
      })),
    ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    return {
      dow,
      short,
      full,
      date,
      isToday: dow === todayDow,
      isPast: dow < todayDow,
      events,
    };
  });

  const monthLabel = (() => {
    const MONTHS = [
      "Jan","Feb","Mar","Apr","May","Jun",
      "Jul","Aug","Sep","Oct","Nov","Dec",
    ];
    const sun = new Date(monday);
    sun.setDate(monday.getDate() + 4); // Friday
    const m1 = monday.getMonth();
    const m2 = sun.getMonth();
    if (m1 === m2) {
      return `${MONTHS[m1]} ${monday.getDate()}–${sun.getDate()}`;
    }
    return `${MONTHS[m1]} ${monday.getDate()} – ${MONTHS[m2]} ${sun.getDate()}`;
  })();

  return (
    <div className="p-3 md:p-5 space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-2">
        <div className="text-center flex-1">
          <h2 className="text-2xl md:text-3xl font-black">📅 This Week</h2>
          <div className="text-sm font-bold" style={{ color: theme.accent }}>
            {monthLabel}
          </div>
        </div>
        <Link
          href={`/kid/${kid.id}/timetable`}
          className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full shrink-0"
        >
          Edit timetable →
        </Link>
      </header>

      {/* Grid table */}
      <div className="grid grid-cols-5 gap-1.5 md:gap-2">
        {/* Day headers */}
        {columns.map((col) => (
          <div
            key={col.dow}
            className={`rounded-xl p-2 text-center ${
              col.isToday
                ? "text-white shadow-md"
                : col.isPast
                  ? "bg-gray-100 text-gray-400"
                  : "bg-white text-gray-700 shadow"
            }`}
            style={
              col.isToday
                ? { background: theme.accent }
                : undefined
            }
          >
            <div
              className={`text-xs font-black uppercase tracking-widest ${
                col.isToday ? "opacity-90" : ""
              }`}
            >
              {col.short}
            </div>
            <div className="text-xl font-black leading-none mt-0.5">
              {col.date.getDate()}
            </div>
            {col.isToday && (
              <div className="text-[9px] font-black opacity-80 uppercase tracking-widest mt-0.5">
                today
              </div>
            )}
          </div>
        ))}

        {/* Event columns */}
        {columns.map((col) => (
          <div key={col.dow} className="space-y-1 min-h-[60px]">
            {col.events.length === 0 ? (
              <div
                className={`text-center text-[10px] font-bold py-3 rounded-lg ${
                  col.isPast ? "text-gray-300" : "text-gray-300"
                }`}
              >
                —
              </div>
            ) : (
              col.events.map((ev) => (
                <EventCard
                  key={ev.kind === "class" ? ev.data.id : ev.data.id}
                  ev={ev}
                  isPast={col.isPast}
                />
              ))
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-white rounded-2xl p-3 shadow">
        <div className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
          Legend
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
            🏫 School class
          </span>
          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">
            🎒 Activity / task
          </span>
        </div>
      </div>
    </div>
  );
}

function EventCard({
  ev,
  isPast,
}: {
  ev: EventItem;
  isPast: boolean;
}) {
  if (ev.kind === "class") {
    const c = ev.data;
    const s = getSubject(c.subject);
    return (
      <div
        className={`rounded-lg px-1.5 py-1 border-l-2 ${s.bgClass} ${s.borderClass} ${
          isPast ? "opacity-40" : ""
        }`}
      >
        <div className="text-sm leading-none">{s.icon}</div>
        <div className={`text-[10px] font-bold leading-tight mt-0.5 ${s.textClass}`}>
          {c.customLabel ?? s.label}
        </div>
        <div className="text-[9px] text-gray-500 leading-tight">
          {c.startTime}
        </div>
      </div>
    );
  }

  // task
  const t = ev.data;
  const cat = getCategory(t.category);
  return (
    <div
      className={`rounded-lg px-1.5 py-1 border-l-2 ${cat.badgeClass} ${cat.borderClass} ${
        isPast ? "opacity-40" : ""
      }`}
    >
      <div className="text-sm leading-none">{t.icon}</div>
      <div className="text-[10px] font-bold leading-tight mt-0.5 truncate">
        {t.name}
      </div>
      {t.startTime ? (
        <div className="text-[9px] text-gray-500 leading-tight">
          {t.startTime}
        </div>
      ) : null}
    </div>
  );
}
