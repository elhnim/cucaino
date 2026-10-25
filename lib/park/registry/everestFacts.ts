// True, kid-level facts for "Climb Everest!" (the guided climb at Everest Base Camp —
// components/park/EverestClimb.tsx, driven by lib/park/climbing/logic.ts) and for the Island map's
// Mount Everest wonder card (lib/park/registry/wonders.ts). Split out just like weaveFacts.ts/
// drumFacts.ts/fishFacts.ts/marketFacts.ts: pure data, no three.js, no logic — easy to fact-check and
// easy to extend without touching the climb's own state machine.
//
// Real route altitudes (the South Col route, the one most climbers take), rounded to numbers a kid
// can hold onto. Every camp here is a real stop on the real mountain, in the real order.
export interface EverestCamp {
  id: string;
  /** shown on the altitude meter and the camp-arrival card */
  name: string;
  /** metres above sea level (true) */
  altitude: number;
  emoji: string;
  /** a true, kid-level fact shown the moment this camp is reached (≤ 120 chars) */
  fact: string;
}

export const EVEREST_CAMPS: EverestCamp[] = [
  { id: "basecamp", name: "Base Camp", altitude: 5364, emoji: "⛺", fact: "Base Camp sits 5,364 m up — already higher than most clouds on a rainy day!" },
  { id: "icefall", name: "The Khumbu Icefall", altitude: 5800, emoji: "🧊", fact: "The Icefall is a maze of huge, shifting ice blocks — climbers cross cracks on tall ladders!" },
  { id: "camp1", name: "Camp 1", altitude: 6065, emoji: "🏔️", fact: "Camp 1 sits at 6,065 m, in a flat snowy bowl called the Western Cwm." },
  { id: "camp2", name: "Camp 2", altitude: 6500, emoji: "🏔️", fact: "Camp 2, at 6,500 m, is where climbers rest a while to get used to the thin air." },
  { id: "camp3", name: "Camp 3", altitude: 7200, emoji: "🧗", fact: "Camp 3 clings to the steep, icy Lhotse Face at 7,200 m — tents are anchored right onto the ice!" },
  { id: "camp4", name: "Camp 4 (the South Col)", altitude: 7950, emoji: "🌬️", fact: "Camp 4 sits at 7,950 m in the \"death zone\", where there's barely enough air to breathe." },
  { id: "summit", name: "The Summit", altitude: 8849, emoji: "🚩", fact: "You made it to the summit — 8,849 m, the highest point on Earth!" },
];

/** true, kid-level facts about the real mountain, for the Island map's wonder card and its wooden
 *  info signs (lib/park/registry/wonders.ts) — ≤ 120 chars each */
export const EVEREST_WONDER_FACTS: string[] = [
  "Mount Everest is the highest mountain above sea level: about 8,849 m tall.",
  "It's in the Himalayas, on the border of Nepal and China.",
  "In Nepal it's called Sagarmatha; in Tibet, Chomolungma.",
  "Climbers usually take about two months to adjust to the thin air before the summit.",
  "Tenzing Norgay and Edmund Hillary first reached the top in 1953.",
  "Strong winds called the jet stream can blow across the summit at over 160 km/h.",
  "Everest is still slowly growing — pushed up by a few millimetres most years!",
];
