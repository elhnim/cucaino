import { notFound } from "next/navigation";
import { getTask, listKids } from "@/lib/data/stub";
import TaskEditClient from "./TaskEditClient";

export default async function TaskEditPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const [task, kids] = await Promise.all([getTask(taskId), listKids()]);
  if (!task || task.isBuiltin) notFound();
  return <TaskEditClient task={task} kids={kids} />;
}
