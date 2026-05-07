import ParentShell from "@/components/parent/ParentShell";
import TasksClient from "@/components/parent/TasksClient";
import { listAllTasks, listKids } from "@/lib/data/stub";

export default async function ParentTasksPage() {
  const [tasks, kids] = await Promise.all([listAllTasks(), listKids()]);
  return (
    <ParentShell active="tasks" title="Tasks">
      <TasksClient tasks={tasks} kids={kids} />
    </ParentShell>
  );
}
