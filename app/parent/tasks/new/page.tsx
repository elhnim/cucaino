import { listKids } from "@/lib/data/stub";
import TaskEditClient from "../[taskId]/edit/TaskEditClient";

export default async function NewTaskPage() {
  const kids = await listKids();
  return <TaskEditClient kids={kids} />;
}
