import TasksClient from "@/components/parent/TasksClient";
import { listAllTasks, listKids } from "@/lib/data/stub";

export default async function ParentTasksPage() {
  const [tasks, kids] = await Promise.all([listAllTasks(), listKids()]);
  return <TasksClient tasks={tasks} kids={kids} />;
}
