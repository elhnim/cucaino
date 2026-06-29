// Embedded reading library — short public-domain stories with a comprehension
// quiz. Progress reuses the course_progress table under a fixed course id.

export const LIBRARY_COURSE_ID = "library";
export const LIBRARY_PASS_PCT = 0.6;

export interface StoryQuestion {
  q: string;
  options: string[];
  answer: number;
  explain?: string;
}

export interface LibraryStory {
  id: string;
  title: string;
  emoji: string;
  /** Emoji scene used as the storybook banner. */
  illustration: string;
  level: string;
  minutes: number;
  paragraphs: string[];
  moral: string;
  quiz: StoryQuestion[];
  /** Stars awarded the first time the comprehension quiz is passed. */
  starReward: number;
}
