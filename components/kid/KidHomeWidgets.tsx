"use client";

import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWidgetPrefs } from "@/lib/hooks/useWidgetPrefs";
import { SUBJECTS } from "@/lib/registry/subject-registry";
import { BADGE_META, BADGE_THRESHOLDS, getTierFromCount } from "@/lib/domain/badge-config";
import type { Kid, Task, BadgeProgress, CustomBadgeProgress, Strike } from "@/lib/domain/types";
import CustomBadgeTile from "@/components/kid/CustomBadgeTile";
import MoodJarWidget from "@/components/kid/MoodJarWidget";

const CIRCUMFERENCE = 2 * Math.PI * 20;

const SORTABLE_IDS = ["tasks", "school", "tomorrow", "badges", "race", "level", "encouragement", "streak", "mood"];
const WIDGET_LABELS: Record<string, string> = {
  tasks: "✅ Today's Tasks",
  school: "📚 School Today",
  tomorrow: "🗓 School Tomorrow",
  badges: "🎖 My Badges",
  race: "🏁 Family Race",
  level: "🌱 Profile Level",
  encouragement: "💬 Encouragement",
  streak: "🔥 Streak Calendar",
  mood: "🫙 Mood Jar",
};
const DEFAULT_WIDTHS: Record<string, "full" | "half"> = {
  tasks: "full",
  school: "half",
  tomorrow: "half",
  badges: "full",
  race: "full",
  level: "half",
  encouragement: "half",
  streak: "full",
  mood: "full",
};

interface LevelData {
  emoji: string;
  name: string;
  color: string;
  pct: number;
  nextMin: number | null;
  nextName: string | null;
}

export interface KidHomeWidgetsProps {
  kid: Kid;
  theme: { accent: string; accentSoft: string; name: string };
  done: number;
  total: number;
  allDone: boolean;
  ringOffset: number;
  taskPct: number;
  incompleteTasks: Task[];
  todaySchoolTasks: Task[];
  tomorrowActivityTasks: Task[];
  badgesInProgress: BadgeProgress[];
  customBadgeProgress: CustomBadgeProgress[];
  allKids: Kid[];
  weeklyStars: Record<string, number>;
  weeklyCompletions: Record<string, number>;
  moodCounts: Record<string, number>;
  level: LevelData;
  encouragement: string;
  activeStrikes?: Strike[];
}

export default function KidHomeWidgets(props: KidHomeWidgetsProps) {
  const {
    kid, theme, done, total, allDone, ringOffset, taskPct,
    incompleteTasks, todaySchoolTasks, tomorrowActivityTasks,
    badgesInProgress, customBadgeProgress, allKids, weeklyStars, weeklyCompletions, level, encouragement,
    activeStrikes,
  } = props;

  const storageKey = `kid-home:${kid.id}`;
  const { prefs, editing, setEditing, reorder, toggleHidden, toggleWidth } = useWidgetPrefs(storageKey, SORTABLE_IDS, DEFAULT_WIDTHS);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function isAvailable(id: string): boolean {
    switch (id) {
      case "school": return todaySchoolTasks.length > 0;
      case "tomorrow": return tomorrowActivityTasks.length > 0;
      case "badges": return badgesInProgress.length > 0 || customBadgeProgress.length > 0;
      case "race": return allKids.length > 1;
      case "tasks": return total > 0;
      default: return true;
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const o = prefs.order.indexOf(active.id as string);
    const n = prefs.order.indexOf(over.id as string);
    if (o === -1 || n === -1) return;
    reorder(arrayMove(prefs.order, o, n));
  }

  // In edit mode show all available (so you can un-hide); otherwise only visible
  const availableIds = prefs.order.filter(isAvailable);
  const displayIds = editing
    ? availableIds
    : availableIds.filter((id) => !prefs.hidden.includes(id));

  const hiddenCount = availableIds.filter((id) => prefs.hidden.includes(id)).length;

  return (
    <>
      {/* PINNED: Strike alert */}
      {activeStrikes && activeStrikes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3 items-start">
          <span className="text-2xl flex-shrink-0">⚡</span>
          <div>
            <div className="font-black text-red-700 text-sm">
              {activeStrikes.length} active strike{activeStrikes.length !== 1 ? "s" : ""}
            </div>
            <div className="text-xs text-red-500 mt-0.5 leading-snug">
              {activeStrikes.length >= 3
                ? "Rewards are locked. Talk to a parent to clear your strikes."
                : "Talk to a parent about what happened."}
            </div>
            {activeStrikes[0]?.reason && (
              <div className="text-[11px] text-red-400 mt-1 italic">&ldquo;{activeStrikes[0].reason}&rdquo;</div>
            )}
          </div>
        </div>
      )}

      {/* PINNED: Stats */}
      <StatsWidget kid={kid} theme={theme} done={done} total={total} allDone={allDone} ringOffset={ringOffset} />

      {/* SORTABLE widgets — 2-column grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={availableIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3">
            {displayIds.map((id) => {
              const isHalf = (prefs.widths[id] ?? DEFAULT_WIDTHS[id] ?? "full") === "half";
              return (
                <SortableWidget
                  key={id}
                  id={id}
                  editing={editing}
                  hidden={prefs.hidden.includes(id)}
                  colSpan={isHalf ? 1 : 2}
                  onToggleHide={() => toggleHidden(id)}
                  onToggleWidth={() => toggleWidth(id)}
                  label={WIDGET_LABELS[id] ?? id}
                >
                  <WidgetContent id={id} props={props} />
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Edit / Done button */}
      {editing ? (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="w-full py-2.5 rounded-2xl text-sm font-bold bg-indigo-600 text-white shadow-sm"
        >
          ✓ Done
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full py-2 rounded-2xl text-xs font-bold text-gray-400 bg-white/60"
        >
          ✏️ Edit layout{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
        </button>
      )}
    </>
  );
}

// ─── Sortable wrapper ────────────────────────────────────────────────────────

function SortableWidget({
  id,
  editing,
  hidden,
  colSpan,
  onToggleHide,
  onToggleWidth,
  label,
  children,
}: {
  id: string;
  editing: boolean;
  hidden: boolean;
  colSpan: 1 | 2;
  onToggleHide: () => void;
  onToggleWidth: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !editing });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  const colClass = colSpan === 1 ? "col-span-1" : "col-span-2";

  if (!editing) {
    return <div className={colClass}>{children}</div>;
  }

  return (
    <div ref={setNodeRef} style={style} className={colClass}>
      <div className="flex items-stretch gap-1.5">
        {/* Drag handle */}
        <button
          type="button"
          className="flex items-center justify-center w-8 rounded-xl bg-gray-100 text-gray-400 text-lg cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          aria-label={`Drag to reorder ${label}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>

        {/* Widget content — dimmed when hidden */}
        <div className={`flex-1 min-w-0 transition-opacity ${hidden ? "opacity-40" : ""}`}>
          {children}
        </div>

        {/* Width toggle */}
        <button
          type="button"
          onClick={onToggleWidth}
          className="flex items-center justify-center w-8 rounded-xl bg-gray-100 text-gray-500 text-[11px] font-black flex-shrink-0"
          aria-label={colSpan === 2 ? `Make ${label} half-width` : `Make ${label} full-width`}
        >
          {colSpan === 2 ? "½" : "↔"}
        </button>

        {/* Visibility toggle */}
        <button
          type="button"
          onClick={onToggleHide}
          className={`flex items-center justify-center w-8 rounded-xl text-sm flex-shrink-0 ${hidden ? "bg-gray-100 text-gray-400" : "bg-gray-100 text-gray-600"}`}
          aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
        >
          {hidden ? "🚫" : "👁"}
        </button>
      </div>
    </div>
  );
}

// ─── Widget content dispatcher ───────────────────────────────────────────────

function WidgetContent({ id, props }: { id: string; props: KidHomeWidgetsProps }) {
  const { kid, theme, done, total, allDone, taskPct, incompleteTasks, todaySchoolTasks, tomorrowActivityTasks, badgesInProgress, customBadgeProgress, allKids, weeklyStars, weeklyCompletions, moodCounts, level, encouragement } = props;

  switch (id) {
    case "tasks":
      return <TasksWidget kid={kid} theme={theme} done={done} total={total} allDone={allDone} taskPct={taskPct} incompleteTasks={incompleteTasks} />;

    case "school":
      return (
        <div className="bg-white rounded-2xl p-4 shadow-sm h-full">
          <div className="text-sm font-black text-gray-800 mb-3">📚 School today</div>
          <div className="flex flex-wrap gap-1.5">
            {todaySchoolTasks.map((t) => {
              const subj = t.subject && t.subject in SUBJECTS ? SUBJECTS[t.subject as keyof typeof SUBJECTS] : null;
              return (
                <span
                  key={t.id}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${subj ? `${subj.bgClass} ${subj.textClass}` : "text-white"}`}
                  style={!subj ? { background: theme.accent } : undefined}
                >
                  {subj?.icon} {t.customLabel ?? subj?.label ?? t.name}
                </span>
              );
            })}
          </div>
        </div>
      );

    case "tomorrow":
      return (
        <div className="bg-white rounded-2xl p-4 shadow-sm h-full">
          <div className="text-sm font-black text-gray-800 mb-3">🗓 Tomorrow</div>
          <div className="space-y-2.5">
            {tomorrowActivityTasks.map((t) => (
              <div key={t.id}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center text-sm flex-shrink-0">
                    {t.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-black text-gray-900 truncate">{t.name}</div>
                    {(t.location || t.startTime) && (
                      <div className="text-[10px] text-gray-400 font-semibold truncate">
                        {t.startTime && `${t.startTime} · `}{t.location && `📍 ${t.location}`}
                      </div>
                    )}
                  </div>
                </div>
                {t.packingList && t.packingList.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-9">
                    {t.packingList.map((item, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold">
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );

    case "badges":
      return (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-black text-gray-800">🎖 My badges</div>
            <Link href={`/kid/${kid.id}/rewards?tab=badges`} className="text-xs font-bold" style={{ color: theme.accent }}>
              See all →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {badgesInProgress.map((b) => {
              const meta = BADGE_META[b.category];
              const thresholds = BADGE_THRESHOLDS[b.category];
              if (!meta || !thresholds) return null;
              const tier = getTierFromCount(b.category, b.completionCount);
              const prev = tier === "gold" ? thresholds.silver : tier === "silver" ? thresholds.bronze : 0;
              const next = tier === "gold" ? thresholds.gold : tier === "silver" ? thresholds.gold : tier === "bronze" ? thresholds.silver : thresholds.bronze;
              const pct = tier === "gold" ? 1 : Math.min(1, (b.completionCount - prev) / (next - prev));
              const tierEmoji = tier === "gold" ? "🥇" : tier === "silver" ? "🥈" : tier === "bronze" ? "🥉" : "";
              return (
                <div key={b.category} className="rounded-2xl p-2.5 text-center border-[1.5px]" style={{ background: theme.accentSoft, borderColor: theme.accent + "44" }}>
                  <div className="text-2xl mb-1">{meta.icon}</div>
                  <div className="text-[9px] font-black uppercase tracking-wide mb-1.5" style={{ color: theme.accent }}>{meta.label}</div>
                  <div className="h-1 rounded-full bg-gray-200 overflow-hidden mb-1">
                    <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: theme.accent }} />
                  </div>
                  <div className="text-[9px] text-gray-400 font-semibold">{b.completionCount} / {next} {tierEmoji}</div>
                </div>
              );
            })}
            {customBadgeProgress.slice(0, 3).map((p) => (
              <CustomBadgeTile key={p.badgeId} progress={p} size="sm" />
            ))}
          </div>
        </div>
      );

    case "race": {
      const ranked = allKids.map((k) => ({ kid: k, stars: weeklyStars[k.id] ?? 0 })).sort((a, b) => b.stars - a.stars);
      const leader = ranked[0]?.stars ?? 0;
      return (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-black text-gray-800 mb-3">🏁 This week&apos;s family race</h3>
          <div className="space-y-2">
            {ranked.map(({ kid: k, stars }, idx) => {
              const isMe = k.id === kid.id;
              const barPct = leader > 0 ? (stars / leader) * 100 : 0;
              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
              return (
                <div key={k.id} className={`flex items-center gap-2 p-2 rounded-xl ${isMe ? "bg-indigo-50" : ""}`}>
                  <span className="text-lg w-6 text-center">{medal}</span>
                  <span className="text-xl w-8 text-center">{k.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className={`text-sm font-bold ${isMe ? "text-indigo-700" : "text-gray-700"}`}>
                        {k.name}{isMe && " (you)"}
                      </span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: isMe ? "#4f46e5" : "#d1d5db" }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold">⭐ {stars}</div>
                    {leader - stars > 0 && isMe && <div className="text-[10px] text-gray-400">{leader - stars} behind</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case "level":
      return (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Profile Level</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black" style={{ background: level.color + "20", color: level.color }}>
              {level.emoji} {level.name}
            </span>
          </div>
          <div className="bg-gray-100 rounded-full h-2 overflow-hidden mb-1.5">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(level.pct * 100)}%`, background: level.color }} />
          </div>
          <p className="text-[11px] text-gray-400 font-semibold">
            {level.nextName
              ? `${(level.nextMin ?? 0) - kid.totalStarsEarned} more ⭐ to ${level.nextName}`
              : "Maximum level reached! 🎉"}
          </p>
        </div>
      );

    case "encouragement":
      return (
        <div className="bg-white/60 rounded-2xl px-4 py-3 text-center text-sm text-gray-500 font-medium">
          {encouragement}
        </div>
      );

    case "streak":
      return <StreakCalendarWidget completions={weeklyCompletions} streak={kid.currentStreak} accent={theme.accent} />;

    case "mood":
      return <MoodJarWidget kidId={kid.id} initialCounts={moodCounts} accent={theme.accent} />;

    default:
      return null;
  }
}

// ─── Streak calendar widget ───────────────────────────────────────────────────

function StreakCalendarWidget({
  completions,
  streak,
  accent,
}: {
  completions: Record<string, number>;
  streak: number;
  accent: string;
}) {
  const days: { date: string; label: string; short: string; count: number; isToday: boolean }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-AU", { weekday: "short" });
    const short = d.getDate().toString();
    days.push({ date: dateStr, label, short, count: completions[dateStr] ?? 0, isToday: i === 0 });
  }

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">7-Day Streak</span>
        <span className="flex items-center gap-1 text-xs font-black" style={{ color: accent }}>
          🔥 {streak} day{streak !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex gap-1.5 items-end justify-between">
        {days.map((d) => {
          const filled = d.count > 0;
          const height = filled ? Math.max(24, Math.round((d.count / maxCount) * 48)) : 8;
          return (
            <div key={d.date} className="flex flex-col items-center gap-1 flex-1">
              <div
                className="w-full rounded-full transition-all"
                style={{
                  height,
                  background: filled ? accent : "#e5e7eb",
                  opacity: d.isToday ? 1 : filled ? 0.75 : 1,
                  outline: d.isToday ? `2px solid ${accent}` : "none",
                  outlineOffset: 1,
                }}
              />
              <span className="text-[9px] font-bold text-gray-400">{d.label.slice(0, 1)}</span>
              <span className="text-[9px] text-gray-300">{d.short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pinned widgets ──────────────────────────────────────────────────────────

function StatsWidget({ kid, theme, done, total, allDone, ringOffset }: {
  kid: Kid; theme: { accent: string; accentSoft: string }; done: number; total: number; allDone: boolean; ringOffset: number;
}) {
  if (kid.cashBalance > 0) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
          <span className="text-xl font-black">⭐ {kid.pointsBalance}</span>
          <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Stars</span>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1" style={{ background: "#f0fdf4" }}>
          <span className="text-xl font-black" style={{ color: "#15803d" }}>💵 ${(kid.cashBalance / 100).toFixed(2)}</span>
          <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: "#16a34a" }}>Cash</span>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
          <span className="text-xl font-black">🔥 {kid.currentStreak}d</span>
          <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Streak</span>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
          <RingChart done={done} total={total} allDone={allDone} accent={theme.accent} ringOffset={ringOffset} />
          <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Tasks</span>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
        <span className="text-xl font-black">⭐ {kid.pointsBalance}</span>
        <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Stars</span>
      </div>
      <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
        <span className="text-xl font-black">🔥 {kid.currentStreak}d</span>
        <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Streak</span>
      </div>
      <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
        <RingChart done={done} total={total} allDone={allDone} accent={theme.accent} ringOffset={ringOffset} />
        <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Tasks</span>
      </div>
    </div>
  );
}

function RingChart({ done, total, allDone, accent, ringOffset }: { done: number; total: number; allDone: boolean; accent: string; ringOffset: number }) {
  return (
    <svg width={50} height={50} viewBox="0 0 52 52">
      <circle cx={26} cy={26} r={20} fill="none" stroke="#e5e7eb" strokeWidth={5} />
      {total > 0 && (
        <circle cx={26} cy={26} r={20} fill="none" stroke={allDone ? "#22c55e" : accent} strokeWidth={5} strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={ringOffset} transform="rotate(-90 26 26)" />
      )}
      <text x={26} y={30} textAnchor="middle" fontSize={11} fontWeight="bold" fill={total > 0 ? (allDone ? "#22c55e" : accent) : "#9ca3af"}>
        {total > 0 ? `${done}/${total}` : "—"}
      </text>
    </svg>
  );
}

function TasksWidget({ kid, theme, done, total, allDone, taskPct, incompleteTasks }: {
  kid: Kid; theme: { accent: string }; done: number; total: number; allDone: boolean; taskPct: number; incompleteTasks: Task[];
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm" style={allDone ? { background: "#f0fdf4", border: "2px solid #86efac" } : {}}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-sm font-black text-gray-800">Today&apos;s tasks</div>
        {total > 0 && (
          <span className="text-xs font-bold" style={{ color: allDone ? "#16a34a" : theme.accent }}>
            {done} / {total} done
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="bg-gray-100 rounded-full h-2 overflow-hidden mb-3">
          <div className="h-full rounded-full transition-all" style={{ width: `${taskPct}%`, background: allDone ? "#22c55e" : theme.accent }} />
        </div>
      )}
      {incompleteTasks.length > 0 && (
        <div className="space-y-2 mb-3">
          {incompleteTasks.slice(0, 3).map((task) => (
            <div key={task.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-lg flex-shrink-0 shadow-sm">{task.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-gray-900 truncate">{task.name}</div>
                <div className="text-[10px] text-gray-400 font-semibold">
                  {task.points > 0 && `+${task.points} ⭐`}
                  {task.cashValueCents > 0 && ` +$${(task.cashValueCents / 100).toFixed(2)}`}
                </div>
              </div>
              <div className="w-6 h-6 rounded-full border-2 border-gray-200 flex-shrink-0" />
            </div>
          ))}
          {incompleteTasks.length > 3 && (
            <div className="text-xs text-gray-400 font-semibold pl-1">+{incompleteTasks.length - 3} more…</div>
          )}
        </div>
      )}
      <Link
        href={`/kid/${kid.id}/todo`}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-white text-sm"
        style={{ background: allDone ? "#16a34a" : theme.accent }}
      >
        {allDone ? "All done! 🎉" : "Jump in →"}
      </Link>
    </div>
  );
}
