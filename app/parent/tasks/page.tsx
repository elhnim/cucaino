import Link from "next/link";
import { listAllTasks, listKids } from "@/lib/data/stub";
import type { Task, Kid } from "@/lib/domain/types";

function RuleBadge({ rule }: { rule: Task["rule"] }) {
  if (rule === "strict") {
    return (
      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
        Strict
      </span>
    );
  }
  return (
    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
      Flexible
    </span>
  );
}

function TargetBadge({ task }: { task: Task }) {
  if (task.target === "none") return null;
  let label = "";
  if (task.target === "time" && task.targetDurationMinutes) {
    label = `⏱ ${task.targetDurationMinutes} min`;
  } else if (task.target === "reps" && task.targetReps) {
    label = `✕ ${task.targetReps}${task.targetRepLabel ? ` ${task.targetRepLabel}` : " reps"}`;
  } else if (task.target === "checklist") {
    label = "☑ checklist";
  }
  if (!label) return null;
  return (
    <span className="text-xs text-gray-400">{label}</span>
  );
}

function TaskCard({ task, kids }: { task: Task; kids: Kid[] }) {
  const kid = task.kidId ? kids.find((k) => k.id === task.kidId) : null;

  return (
    <Link
      href={`/parent/tasks/${task.id}/edit`}
      className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 block hover:shadow-md transition-shadow"
    >
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-3xl flex-shrink-0">
        {task.icon}
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="font-bold text-gray-900 truncate">{task.name}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <RuleBadge rule={task.rule} />
          <TargetBadge task={task} />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{kid ? kid.name : "All kids"}</span>
          <span>⭐ {task.points}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`w-3 h-3 rounded-full ${task.active ? "bg-green-400" : "bg-gray-300"}`}
          title={task.active ? "Active" : "Paused"}
        />
        <span className="text-gray-300 text-xl">›</span>
      </div>
    </Link>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <h2 className="text-sm font-bold text-gray-500 uppercase mb-2">{label}</h2>
  );
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ rule?: string }>;
}) {
  const { rule } = await searchParams;
  const [tasks, kids] = await Promise.all([listAllTasks(), listKids()]);

  const filtered =
    rule === "strict"
      ? tasks.filter((t) => t.rule === "strict")
      : rule === "flexible"
      ? tasks.filter((t) => t.rule === "flexible")
      : tasks;

  const tabs = [
    { label: "All", value: undefined, href: "?" },
    { label: "Strict", value: "strict", href: "?rule=strict" },
    { label: "Flexible", value: "flexible", href: "?rule=flexible" },
  ];

  return (
    <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">📋 Tasks</h1>
          <Link
            href="/parent/tasks/new"
            className="bg-indigo-600 text-white rounded-full px-4 py-2 text-sm font-bold hover:bg-indigo-700"
          >
            + Add Task
          </Link>
        </div>

        <div className="flex gap-2">
          {tabs.map((tab) => {
            const isActive =
              tab.value === undefined ? !rule : rule === tab.value;
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-12">
            No tasks yet. Add your first task! 🎯
          </p>
        ) : !rule ? (
          <>
            {(["strict", "flexible"] as const).map((r) => {
              const group = filtered.filter((t) => t.rule === r);
              if (group.length === 0) return null;
              return (
                <div key={r}>
                  <SectionHeading
                    label={r === "strict" ? "📌 Strict Tasks" : "🔄 Flexible Tasks"}
                  />
                  <div className="space-y-3">
                    {group.map((task) => (
                      <TaskCard key={task.id} task={task} kids={kids} />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="space-y-3">
            {filtered.map((task) => (
              <TaskCard key={task.id} task={task} kids={kids} />
            ))}
          </div>
        )}
    </div>
  );
}
