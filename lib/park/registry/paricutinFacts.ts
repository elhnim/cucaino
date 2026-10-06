// True, kid-level facts for "Climb to the crater!" (the guided walk up Parícutin from Dionisio's
// farm — components/park/VolcanoClimb.tsx, driven by lib/park/climbing/volcanoLogic.ts) and for the
// Island map's Parícutin wonder card (lib/park/registry/wonders.ts). Split out just like
// everestFacts.ts/weaveFacts.ts/drumFacts.ts: pure data, no three.js, no logic.
//
// The real story, in order: a crack opened in a farmer's cornfield in 1943; within a day the new
// cone was already taller than a house; within a year it was a real mountain; its lava slowly
// buried two villages (everyone got out safely); it kept erupting for nine years; today it stands
// quiet, a church tower still poking from the hardened lava.
export interface ParicutinStop {
  id: string;
  /** shown on the progress meter and the arrival card */
  name: string;
  /** the real mountain's own height at this point in the story (metres) — shown like Everest's
   *  altitude meter, even though the park's own cone is kid-sized and doesn't match these numbers;
   *  the figures are the true, educational part */
  height: number;
  emoji: string;
  /** a true, kid-level fact shown the moment this stop is reached (≤ 120 chars) */
  fact: string;
}

export const PARICUTIN_STOPS: ParicutinStop[] = [
  { id: "start", name: "1943: A Crack Opens", height: 0, emoji: "🌱", fact: "On 20 February 1943, a crack opened in farmer Dionisio Pulido's cornfield — a volcano was born!" },
  { id: "day1", name: "One Day Old", height: 50, emoji: "💨", fact: "By the very next day, the new volcano had already grown about 50 m tall." },
  { id: "year1", name: "One Year Old", height: 336, emoji: "🌋", fact: "In its very first year, Parícutin grew to about 336 m tall — astonishingly fast for a mountain." },
  { id: "village", name: "The Lava Spreads", height: 336, emoji: "🏘️", fact: "Lava slowly buried two villages, San Juan and Paricutín — but everyone had time to leave safely." },
  { id: "quiet", name: "1952: It Stops", height: 424, emoji: "🧊", fact: "The volcano erupted for nine whole years, finally falling quiet in 1952 at about 424 m tall." },
  { id: "rim", name: "The Crater Rim", height: 424, emoji: "🚩", fact: "Today Parícutin is quiet — a church tower still pokes out of the hardened lava below." },
];

/** true, kid-level facts about the real volcano, for the Island map's wonder card and its wooden
 *  info signs (lib/park/registry/wonders.ts) — ≤ 120 chars each */
export const PARICUTIN_WONDER_FACTS: string[] = [
  "Parícutin grew out of a cornfield in Mexico in 1943 — scientists watched a volcano being born!",
  "In its first year it grew to about 336 m tall.",
  "It erupted for nine years, until 1952, reaching about 424 m tall.",
  "Lava buried two villages, but everyone had time to leave safely.",
  "A church tower still pokes out of the hardened lava today.",
  "It's a cinder cone: a hill built from bits of lava that cooled as they fell.",
  "It sits in Michoacán, Mexico — part of a long chain of volcanoes across the country.",
];
