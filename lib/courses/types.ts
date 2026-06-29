// Educational course types — data-driven so new courses are just a content file
// plus a registry entry.

export interface QuizQuestion {
  q: string;
  options: string[];
  /** Index into options of the correct answer. */
  answer: number;
  explain?: string;
}

export interface LessonBlock {
  heading?: string;
  body: string;
}

export interface Lesson {
  id: string;
  title: string;
  emoji: string;
  summary: string;
  reading: LessonBlock[];
  /** A practical "try it today" prompt. */
  tryIt: string;
  quiz: QuizQuestion[];
  /** Stars awarded the first time the kid passes this lesson's quiz. */
  starReward: number;
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  about: string;
  /** Fraction of quiz questions needed to pass (0–1). */
  passPct: number;
  lessons: Lesson[];
}
