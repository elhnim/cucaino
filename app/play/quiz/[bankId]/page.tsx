import { notFound } from "next/navigation";
import { getQuizBank, listQuizQuestions, getQuizSet, listQuizQuestions2, listKids, getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import QuizGame from "@/components/play/QuizGame";

export default async function QuizGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ kid?: string }>;
}) {
  const { bankId } = await params;
  const { kid: kidId } = await searchParams;

  // Try new quiz set first, fall back to legacy bank
  const [set, bank, kids, kid] = await Promise.all([
    getQuizSet(bankId),
    getQuizBank(bankId),
    listKids(),
    kidId ? getKid(kidId) : Promise.resolve(null),
  ]);

  let bankName = "";
  let questions: { id: string; prompt: string; choices: { label: string; isCorrect: boolean }[]; timeLimitSeconds: number }[] = [];

  if (set) {
    bankName = set.name;
    const allQuestions = await listQuizQuestions2({ theme: set.themes[0] });

    // Filter by age band and difficulty
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

  const qs = kidId ? `?kid=${kidId}` : "";
  const game = (
    <QuizGame
      bankName={bankName}
      questions={questions}
      players={kids.map((k) => ({
        id: k.id,
        name: k.name,
        avatar: k.avatar,
        themeId: k.themeId,
      }))}
      backHref={`/play/quiz${qs}`}
    />
  );

  if (kid) {
    return <KidShell kid={kid} active="play">{game}</KidShell>;
  }
  return game;
}
