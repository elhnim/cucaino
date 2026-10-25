export interface ArcadeGame {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  color: string;
  sparkCost: number;
  earnStars: boolean;
}

export const ARCADE_GAMES: ArcadeGame[] = [
  { id: 'doodle-guess',      name: 'Doodle Guess',      emoji: '🎨', tagline: 'Draw it — can the AI guess?',  color: 'rose',   sparkCost: 2, earnStars: false },
  { id: 'mystery-detective', name: 'Mystery Detective', emoji: '🕵️', tagline: 'Crack a brand-new whodunit',   color: 'amber',  sparkCost: 3, earnStars: false },
  { id: 'stump-the-ai',      name: 'Stump The AI',      emoji: '🐾', tagline: 'Can you fool the AI?',         color: 'green',  sparkCost: 3, earnStars: false },
  { id: 'what-am-i',         name: 'What Am I?',        emoji: '❓', tagline: "Crack the AI's clues",         color: 'sky',    sparkCost: 1, earnStars: false },
  { id: 'emoji-story',       name: 'Emoji Story',       emoji: '🎭', tagline: 'AI writes your story',         color: 'violet', sparkCost: 1, earnStars: false },
];
