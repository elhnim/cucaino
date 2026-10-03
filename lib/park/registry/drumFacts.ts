// Drumming mini-game data: kid-level true facts about drums, rhythm and rainforest music, shown
// one at a time after a level is completed. Pure data, no logic. Each fact is <=120 characters.
export interface DrumFact {
  id: string;
  text: string;
}

export const DRUM_FACTS: readonly DrumFact[] = [
  {
    id: "talking-drums",
    text: "Talking drums can copy the ups and downs of speech to send messages across villages.",
  },
  {
    id: "heart-rhythm",
    text: "Your heart beats about 70-100 times a minute — that's a rhythm too!",
  },
  {
    id: "log-drums",
    text: "Log drums are carved from a single hollowed-out tree trunk and can be heard for miles.",
  },
  {
    id: "rainforest-sound",
    text: "Sound travels further in a rainforest at dawn and dusk, when the air is cool and still.",
  },
  {
    id: "shaker-seeds",
    text: "Shakers are often just dried seeds or beans rattling inside a hollow gourd.",
  },
  {
    id: "call-response",
    text: "Call-and-response is one of the oldest ways to make music — one voice leads, others answer.",
  },
  {
    id: "drum-skin",
    text: "Many drums are topped with stretched animal skin that was once soaked to make it bendy.",
  },
  {
    id: "polyrhythm",
    text: "Some drummers play two different rhythms at once — one with each hand!",
  },
  {
    id: "echo-location",
    text: "Deep, low drumbeats travel further than high ones, which is why 'talking drums' sound low.",
  },
  {
    id: "practice-makes",
    text: "Drummers practise the same short pattern again and again until their hands remember it.",
  },
] as const;

export function getDrumFact(id: string): DrumFact | undefined {
  return DRUM_FACTS.find((f) => f.id === id);
}
