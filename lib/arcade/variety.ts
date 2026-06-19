/**
 * Arcade variety helpers — the AI games felt repetitive because every prompt
 * was identical, so the model returned its "default" answer almost every time.
 * These utilities inject a random theme/angle on each call and let the client
 * pass a short list of recent answers to actively avoid.
 *
 * Pure functions only (safe to import from both server actions and client
 * components). The localStorage helpers no-op on the server.
 */

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** n distinct random items (or all of them if n exceeds the pool). */
export function sample<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

/** Short random token so otherwise-identical requests don't collapse to one answer. */
export function freshSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** A prompt fragment telling the model which recent answers to steer clear of. */
export function avoidNote(avoid?: string[]): string {
  const list = (avoid ?? []).filter(Boolean).slice(0, 25);
  if (list.length === 0) return "";
  return `\n\nDo NOT use any of these recent answers — pick something clearly different: ${list.join("; ")}.`;
}

// ---- Topic / theme pools -------------------------------------------------

export const WYR_TOPICS = [
  "talking animals", "outer space", "candy and desserts", "superpowers", "dinosaurs",
  "the deep ocean", "magic and wizards", "sports and games", "wild weather", "teeny tiny things",
  "gigantic things", "time travel", "silly food mash-ups", "unusual jobs", "robots and gadgets",
  "jungle adventures", "winter and snow", "pirates and treasure", "music and dancing", "bugs and insects",
  "fairy tales", "school days", "pets", "vehicles and machines", "invisible powers",
  "swapping bodies with an animal", "living in a treehouse", "having a pet dragon", "shrinking and growing",
  "everything made of jelly", "talking food", "endless summer", "a world of slides",
] as const;

export const WHATAMI_FLAVORS: Record<string, readonly string[]> = {
  animal: ["a creature from the ocean", "something that flies", "a minibeast or insect", "a rainforest animal",
    "a desert dweller", "a polar animal", "a reptile or amphibian", "a nocturnal animal", "a farm animal",
    "an unusual or rare animal"],
  food: ["a fruit", "a vegetable", "a dessert", "a breakfast food", "food from another country",
    "a snack", "something cold and icy", "something crunchy", "a drink", "a food you eat at a party"],
  place: ["somewhere in nature", "a building in a city", "a place in space", "somewhere underwater",
    "a place you go on holiday", "a place at school", "a famous landmark", "somewhere very cold",
    "somewhere very hot", "a place in a fairy tale"],
  vehicle: ["something that flies", "something on water", "something on rails", "a construction machine",
    "a vehicle from the past", "an emergency vehicle", "something with two wheels", "a space vehicle",
    "a vehicle that carries lots of people", "an unusual way to travel"],
};

export const WORD_THEMES = [
  "nature and weather", "space and the stars", "animals and creatures", "the ocean and sea life",
  "science and inventions", "music and art", "sports and movement", "food and cooking",
  "buildings and places", "feelings and ideas", "fairy tales and magic", "the human body",
  "tools and machines", "travel and adventure", "colours and shapes", "plants and gardens",
] as const;

export const STORY_GENRES = [
  "a silly adventure", "a gentle bedtime tale", "a mystery to solve", "a superhero story",
  "a fairy tale", "a space journey", "an underwater quest", "a story about an unlikely friendship",
  "a comedy full of mix-ups", "a tale of a brave little hero", "a magical school day",
  "an animal's big adventure",
] as const;

export const STUMP_OPENERS = [
  "whether it is a living thing", "its size", "where it is usually found", "whether people use it every day",
  "whether it can move on its own", "what colour it usually is", "whether it is found indoors or outdoors",
  "whether a child would have seen one in real life",
] as const;

// ---- Client-side recent-answer memory (localStorage) ---------------------

export function recentAnswers(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`arcade:recent:${key}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberAnswer(key: string, answer: string, max = 12): void {
  if (typeof window === "undefined" || !answer) return;
  try {
    const list = recentAnswers(key).filter((a) => a.toLowerCase() !== answer.toLowerCase());
    list.unshift(answer);
    window.localStorage.setItem(`arcade:recent:${key}`, JSON.stringify(list.slice(0, max)));
  } catch {
    // ignore quota / serialization errors
  }
}
