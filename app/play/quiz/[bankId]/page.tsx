import { notFound } from "next/navigation";
import { getQuizBank, listQuizQuestions, listKids } from "@/lib/data/stub";
import QuizGame from "@/components/play/QuizGame";

export default async function QuizGamePage({
  params,
}: {
  params: Promise<{ bankId: string }>;
}) {
  const { bankId } = await params;
  const [bank, questions, kids] = await Promise.all([
    getQuizBank(bankId),
    listQuizQuestions(bankId),
    listKids(),
  ]);

  if (!bank || questions.length === 0) notFound();

  return (
    <QuizGame
      bankName={bank.name}
      questions={questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        choices: q.choices.map((c) => ({ label: c.label, isCorrect: c.isCorrect })),
        timeLimitSeconds: q.timeLimitSeconds,
      }))}
      players={kids.map((k) => ({
        id: k.id,
        name: k.name,
        avatar: k.avatar,
        themeId: k.themeId,
      }))}
    />
  );
}
