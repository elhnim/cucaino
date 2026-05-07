import type { Task } from "@/lib/domain/types";
import TaskCard from "@/components/kid/cards/TaskCard";

export default function TimeBlockSection({
  section,
  accent,
  completedTaskIds,
}: {
  section: {
    type: "time-block";
    key: string;
    title: string;
    blockEmoji: string;
    isCurrent: boolean;
    summary?: string;
    tasks: Task[];
  };
  accent: string;
  completedTaskIds: Set<string>;
}) {
  return (
    <div>
      <div
        className={`text-sm font-black mb-2 flex items-center gap-2 ${
          section.isCurrent ? "text-amber-700" : "text-gray-500"
        }`}
      >
        <span>
          {section.blockEmoji} {section.title}
        </span>
        {section.isCurrent ? (
          <span className="text-xs font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full animate-pulse">
            ← you are here
          </span>
        ) : null}
        {section.summary ? (
          <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            {section.summary}
          </span>
        ) : null}
      </div>
      <div className="space-y-2">
        {section.tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            initiallyDone={completedTaskIds.has(task.id)}
            accent={accent}
          />
        ))}
      </div>
    </div>
  );
}
