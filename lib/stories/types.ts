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

export interface StoryChapter {
  title: string;
  paragraphs: string[];
}

export interface LibraryStory {
  id: string;
  /** Collection this story belongs to, e.g. "Aesop's Fables". */
  collection: string;
  title: string;
  /** Legacy emoji fields — unused now that covers are generated (see BookCover). */
  emoji?: string;
  illustration?: string;
  level: string;
  minutes: number;
  /** Single-read stories use paragraphs… */
  paragraphs?: string[];
  /** …longer chapter books use chapters instead. */
  chapters?: StoryChapter[];
  author?: string;
  moral?: string;
  /** Omit (or leave empty) for stories that award stars on finishing the read, with no quiz gate. */
  quiz?: StoryQuestion[];
  /** Stars awarded the first time the story is completed (quiz passed, or read to the end if no quiz). */
  starReward: number;
}
