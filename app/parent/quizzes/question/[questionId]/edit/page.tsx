import { notFound } from "next/navigation";
import { getQuizQuestion2 } from "@/lib/data/stub";
import QuestionFormClient from "../../QuestionFormClient";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}) {
  const { questionId } = await params;
  const question = await getQuizQuestion2(questionId);
  if (!question) notFound();
  return <QuestionFormClient question={question} />;
}
