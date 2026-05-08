import { notFound } from "next/navigation";
import { getQuizSet } from "@/lib/data/stub";
import QuizSetFormClient from "../../QuizSetFormClient";

export default async function EditQuizSetPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  const quizSet = await getQuizSet(setId);
  if (!quizSet) notFound();
  return <QuizSetFormClient quizSet={quizSet} />;
}
