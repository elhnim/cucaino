import type { TaskCategory } from "@/lib/domain/types";

// A curated set of holiday activities, imported as flexible family-level tasks
// so kids can self-add whichever they fancy each day. Stars-only.

export interface HolidayActivity {
  name: string;
  icon: string;
  category: TaskCategory;
  points: number;
}

export const HOLIDAY_PACK: HolidayActivity[] = [
  // 🏃 Active / outdoor
  { name: "Backyard Olympics", icon: "🏅", category: "exercise", points: 5 },
  { name: "Go for a bike or scooter ride", icon: "🚲", category: "exercise", points: 5 },
  { name: "Nature walk & collect treasures", icon: "🌿", category: "activity", points: 4 },
  { name: "Dance to 3 songs", icon: "💃", category: "exercise", points: 3 },
  { name: "Play a ball game outside", icon: "⚽", category: "exercise", points: 4 },
  { name: "Obstacle course in the yard", icon: "🤸", category: "exercise", points: 5 },

  // 🎨 Creative
  { name: "Draw a comic strip", icon: "✏️", category: "activity", points: 4 },
  { name: "Build a fort or den", icon: "🏕️", category: "activity", points: 5 },
  { name: "Make up a song or dance", icon: "🎵", category: "activity", points: 4 },
  { name: "Junk-model something from recycling", icon: "🤖", category: "activity", points: 5 },
  { name: "Paint or colour a masterpiece", icon: "🎨", category: "activity", points: 4 },
  { name: "Write a short story", icon: "📖", category: "brainy", points: 5 },

  // 🧠 Learning
  { name: "Read for 20 minutes", icon: "📚", category: "brainy", points: 5 },
  { name: "Do a Learn course lesson", icon: "🦉", category: "brainy", points: 5 },
  { name: "Play a quiz topic", icon: "🎯", category: "brainy", points: 4 },
  { name: "Learn 3 new words", icon: "🔤", category: "brainy", points: 3 },
  { name: "Watch a documentary clip & share a fact", icon: "🐧", category: "brainy", points: 4 },
  { name: "Build something with blocks or Lego", icon: "🧱", category: "activity", points: 4 },

  // 🧹 Helping
  { name: "Tidy your room", icon: "🧹", category: "chore", points: 5 },
  { name: "Help make a meal", icon: "🍳", category: "chore", points: 5 },
  { name: "Set or clear the table", icon: "🍽️", category: "chore", points: 3 },
  { name: "Sort toys or clothes to donate", icon: "📦", category: "chore", points: 5 },
  { name: "Help with the washing", icon: "🧺", category: "chore", points: 4 },
  { name: "Water the plants", icon: "🪴", category: "chore", points: 3 },

  // 💛 Kindness / social
  { name: "Do something kind without being asked", icon: "💛", category: "personal", points: 5 },
  { name: "Call or message a grandparent", icon: "📞", category: "personal", points: 4 },
  { name: "Write a thank-you note", icon: "💌", category: "personal", points: 4 },
  { name: "Give 3 honest compliments", icon: "🌟", category: "personal", points: 3 },
  { name: "Help a sibling with something", icon: "🤝", category: "personal", points: 4 },

  // 🌿 Calm / screen-free
  { name: "Do a jigsaw puzzle", icon: "🧩", category: "personal", points: 3 },
  { name: "5 minutes of calm quiet time", icon: "🧘", category: "personal", points: 3 },
  { name: "Write in a journal", icon: "📓", category: "personal", points: 3 },

  // 🧑‍🍳 Life skills
  { name: "Make your own lunch", icon: "🥪", category: "chore", points: 5 },
  { name: "Learn to fold laundry", icon: "👕", category: "chore", points: 4 },
  { name: "Count and sort your savings", icon: "🪙", category: "brainy", points: 4 },
  { name: "Plan a family activity", icon: "🗺️", category: "activity", points: 4 },
];
