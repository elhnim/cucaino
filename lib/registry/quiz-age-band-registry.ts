import type { QuizAgeBand } from "@/lib/domain/types";

export interface QuizAgeBandDisplay {
  id: QuizAgeBand;
  label: string;
  minAge: number;
}

export const QUIZ_AGE_BANDS: QuizAgeBandDisplay[] = [
  { id: "5_6",   label: "5–6",   minAge: 5  },
  { id: "7_8",   label: "7–8",   minAge: 7  },
  { id: "9_10",  label: "9–10",  minAge: 9  },
  { id: "11_12", label: "11–12", minAge: 11 },
];

export function getAgeBandMin(id: string): number {
  return QUIZ_AGE_BANDS.find((b) => b.id === id)?.minAge ?? 0;
}
