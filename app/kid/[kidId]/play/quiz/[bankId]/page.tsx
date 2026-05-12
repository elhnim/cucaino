import { notFound } from "next/navigation";
import { getQuizBank, listQuizQuestions, getQuizSet, listQuizQuestions2, listKids, getKid } from "@/lib/data/stub";
import QuizGame from "@/components/play/QuizGame";

export default async function KidQuizGamePage({
  params,
}: {
  params: Promise<{ kidId: string; bankId: string }>;
}) {
  const { kidId, bankId } = await params;

  const [set, bank, kids, kid] = await Promise.all([
    getQuizSet(bankId),
    getQuizBank(bankId),
    listKids(),
    getKid(kidId),
  ]);

  if (!kid) notFound();

  let bankName = "";
  let questions: { id: string; prompt: string; choices: { label: string; isCorrect: boolean }[]; timeLimitSeconds: number }[] = [];

  if (set) {
    bankName = set.name;
    const allQuestions = await listQuizQuestions2({ theme: set.themes[0] });
    const difficultyOrder = { easy: 0, medium: 1, hard: 2 };
    const maxDiff = difficultyOrder[set.maxDifficulty as keyof typeof difficultyOrder] ?? 2;
    const eligible = allQuestions.filter((q) => {
      const qDiff = difficultyOrder[q.difficulty as keyof typeof difficultyOrder] ?? 0;
      return qDiff <= maxDiff && q.choices && q.choices.length > 0;
    });
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const drawn = shuffled.slice(0, set.questionsPerSession);
    questions = drawn.map((q) => ({
      id: q.id,
      prompt: q.questionText,
      choices: (q.choices ?? []).map((c) => ({ label: c.label, isCorrect: c.isCorrect })),
      timeLimitSeconds: 30,
    }));
  } else if (bank) {
    bankName = bank.name;
    const rawQuestions = await listQuizQuestions(bank.id);
    const shuffled = [...rawQuestions].sort(() => Math.random() - 0.5);
    questions = shuffled.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices.map((c) => ({ label: c.label, isCorrect: c.isCorrect })),
      timeLimitSeconds: q.timeLimitSeconds,
    }));
  } else {
    notFound();
  }

  if (questions.length === 0) notFound();

  return (
    <QuizGame
      bankName={bankName}
      questions={questions}
      players={kids.map((k) => ({
        id: k.id,
        name: k.name,
        avatar: k.avatar,
        themeId: k.themeId,
      }))}
      backHref={`/kid/${kidId}/play/quiz`}
    />
  );
}
