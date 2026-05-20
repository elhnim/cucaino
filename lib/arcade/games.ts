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
  { id: 'emoji-story',      name: 'Emoji Story',      emoji: '🎭', tagline: 'AI writes your story',       color: 'violet', sparkCost: 1, earnStars: true  },
  { id: 'would-you-rather', name: 'Would You Rather',  emoji: '🤷', tagline: 'AI argues the other side',   color: 'orange', sparkCost: 2, earnStars: true  },
  { id: 'what-am-i',        name: 'What Am I?',        emoji: '❓', tagline: "Crack the AI's clues",       color: 'sky',    sparkCost: 1, earnStars: false },
  { id: 'word-detective',   name: 'Word Detective',    emoji: '🕵️', tagline: 'Decode the mystery word',    color: 'amber',  sparkCost: 1, earnStars: false },
  { id: 'stump-the-ai',     name: 'Stump The AI',      emoji: '🐾', tagline: 'Can you fool the AI?',       color: 'green',  sparkCost: 3, earnStars: false },
  { id: 'ai-lie-detector',  name: 'AI Lie Detector',   emoji: '🤥', tagline: 'Hide your lie from the AI',  color: 'rose',   sparkCost: 2, earnStars: false },
];
