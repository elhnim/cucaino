// The Seven Natural Wonders of the World, scattered true-to-character round the island — each one
// kid-sized but recognisably itself, each teaching a few true, kid-level facts. One entry per wonder;
// add a new one here and the discovery toast, fact signs and the Island map pin all just follow (see
// `onWonder` in lib/park/engine/ParkWorld.ts, the toast + fact card in components/park/ParkApp.tsx,
// and registry/worldMap.ts's ISLAND_DESTINATIONS). Pure data, no three.js.
export interface WonderDef {
  id: string;
  name: string;
  emoji: string;
  /** where it really is, for the fact card's subtitle, e.g. "Zambia & Zimbabwe, Africa" */
  realPlace: string;
  x: number;
  z: number;
  /** how close the kid must walk for the first-time discovery toast + fact card to fire */
  r: number;
  blurb: string;
  /** true, kid-level facts (≤ 120 chars each) — the sign posts and the discovery card cycle through these */
  facts: string[];
  /** wooden info-sign spots near the wonder: walk up to one and "📖 Read the sign" shows a fact
   *  (facts[i % facts.length], i = this spot's index in the array) */
  viewpoints?: { x: number; z: number }[];
}

export const WONDERS: WonderDef[] = [
  {
    id: "victoria-falls",
    name: "Victoria Falls",
    emoji: "💦",
    realPlace: "Zambia & Zimbabwe, Africa",
    // midway between the plunge pool and the Victoria Falls Bridge downstream (registry/wildWater.ts's
    // WILD_FALLS.pool and VIC_BRIDGE) — walking up from the falls-station railway stop, along the
    // gorge-top path, or over the bridge all cross into its discovery radius
    x: 1039,
    z: -744,
    r: 90,
    blurb: "Mosi-oa-Tunya — \"the Smoke that Thunders\" — the widest curtain of falling water on Earth.",
    facts: [
      "Victoria Falls is about 1,700 m wide — the widest single curtain of falling water in the world.",
      "Its local name, Mosi-oa-Tunya, means \"the Smoke that Thunders\".",
      "The spray can rise over 400 m high and be seen from 50 km away.",
      "It sits on the Zambezi River, right on the border of Zambia and Zimbabwe.",
      "The water drops about 108 m — more than twice as high as Niagara Falls.",
      "A steel bridge arches across the gorge just downstream of the falls.",
      "On full-moon nights you can sometimes see a \"moonbow\" — a rainbow made by moonlight!",
    ],
    viewpoints: [
      { x: 1034.34, z: -753.78 }, // the Victoria Falls Bridge, mid-span over the gorge
      { x: 1051.0, z: -768.1 }, // the clifftop path on the rim opposite the falls, by the bridge
      { x: 1062.1, z: -752.8 }, // further along that rim: the whole wide curtain across the chasm
    ],
  },
  {
    id: "everest",
    name: "Mount Everest",
    emoji: "\u{1F3D4}\u{FE0F}",
    realPlace: "Nepal & China (Tibet), the Himalayas",
    // Everest Base Camp (registry/everestBaseCamp.ts's BASE_CAMP_SITE), at the mountain's own foot —
    // the true summit (registry/landform.ts's EVEREST_SUMMIT) is far too high and steep to walk to;
    // "Climb Everest!" at the trailhead is the guided climb up there (lib/park/climbing/logic.ts)
    x: 1566.6,
    z: -1111.7,
    r: 110,
    blurb: "The roof of the world — Earth's highest mountain, 8,849 m of snow, ice and rock.",
    facts: [
      "Mount Everest is the highest mountain above sea level: about 8,849 m tall.",
      "It's in the Himalayas, on the border of Nepal and China.",
      "In Nepal it's called Sagarmatha; in Tibet, Chomolungma.",
      "Climbers usually take about two months to adjust to the thin air before the summit.",
      "Tenzing Norgay and Edmund Hillary first reached the top in 1953.",
      "Strong winds called the jet stream can blow across the summit at over 160 km/h.",
      "Everest is still slowly growing — pushed up by a few millimetres most years!",
    ],
    viewpoints: [
      { x: 1566.6, z: -1111.7 }, // Base Camp itself, right below the glacier
      { x: 1512, z: -905 }, // the trail in from Great Lake Station, with the whole peak in view
    ],
  },
];

/** find a wonder by id (undefined if none) */
export function wonderById(id: string): WonderDef | undefined {
  return WONDERS.find((w) => w.id === id);
}

/** the wonder the kid is standing inside (within its `r`), if any */
export function wonderAt(x: number, z: number): WonderDef | null {
  for (const w of WONDERS) if (Math.hypot(x - w.x, z - w.z) < w.r) return w;
  return null;
}

/** the nearest wonder sign-post within `pad` of (x, z), and which fact it shows (null if none near) */
export function wonderSignAt(x: number, z: number, pad = 6): { wonder: WonderDef; fact: string } | null {
  let best: { wonder: WonderDef; fact: string; d: number } | null = null;
  for (const w of WONDERS) {
    if (!w.viewpoints) continue;
    for (let i = 0; i < w.viewpoints.length; i++) {
      const vp = w.viewpoints[i];
      const d = Math.hypot(x - vp.x, z - vp.z);
      if (d < pad && (!best || d < best.d)) best = { wonder: w, fact: w.facts[i % w.facts.length], d };
    }
  }
  return best ? { wonder: best.wonder, fact: best.fact } : null;
}
