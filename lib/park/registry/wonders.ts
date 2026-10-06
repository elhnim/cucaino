// The Seven Natural Wonders of the World, scattered true-to-character round the island — each one
// kid-sized but recognisably itself, each teaching a few true, kid-level facts. One entry per wonder;
// add a new one here and the discovery toast, fact signs and the Island map pin all just follow (see
// `onWonder` in lib/park/engine/ParkWorld.ts, the toast + fact card in components/park/ParkApp.tsx,
// and registry/worldMap.ts's ISLAND_DESTINATIONS). Pure data, no three.js.
import { CANYON_OPEN, CANYON_TRAILHEAD, CANYON_VIEWPOINTS } from "./grandCanyon";

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

const ALL_WONDERS: WonderDef[] = [
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
  {
    id: "grand-canyon",
    name: "Grand Canyon",
    emoji: "\u{1F3DC}\u{FE0F}",
    realPlace: "Arizona, USA",
    // the rim trailhead (registry/grandCanyon.ts's CANYON_TRAILHEAD), where the footpath from Park
    // Station arrives and "Ride the Mule Trail" is offered — the canyon itself (CANYON_SITE) is
    // 300+ units further on, far too big to use as a single discovery point
    x: CANYON_TRAILHEAD.x,
    z: CANYON_TRAILHEAD.z,
    r: 140,
    blurb: "An immense, mile-deep gorge carved by the Colorado River through millions of years of layered rock.",
    facts: [
      "The Grand Canyon is about 446 km long and up to 1.8 km deep.",
      "The Colorado River carved it over millions of years — one tiny grain of sand at a time.",
      "Its rock layers are like pages of a history book — the bottom ones are nearly 2 billion years old.",
      "California condors, among the world's biggest flying birds, soar over the canyon on rising warm air.",
      "It's in Arizona, USA, and became a national park in 1919.",
      "Bighorn sheep live right on its steep cliffs, bounding from ledge to ledge.",
      "A Skywalk with a see-through glass floor lets you look straight down into the gorge!",
    ],
    viewpoints: CANYON_VIEWPOINTS,
  },
  {
    id: "paricutin",
    name: "Parícutin",
    emoji: "\u{1F30B}",
    realPlace: "Michoacán, Mexico",
    // Dionisio's farmstead (registry/paricutin.ts's PARICUTIN_FARM_SITE), at the volcano's own foot
    // — kept as a plain number rather than an import, like Victoria Falls/Everest above: paricutin.ts
    // sits in the same settlement-registry import cycle as registry/settlements.ts, so importing it
    // here would risk the module-order trap settlements.ts's own comments warn about. "Climb to the
    // crater!" at the trailhead is the guided walk up (lib/park/climbing/volcanoLogic.ts)
    x: 1115.5,
    z: 25.4,
    r: 150,
    blurb: "A volcano born in a farmer's cornfield in 1943 — scientists watched a mountain grow from nothing.",
    facts: [
      "Parícutin grew out of a cornfield in Mexico in 1943 — scientists watched a volcano being born!",
      "In its first year it grew to about 336 m tall.",
      "It erupted for nine years, until 1952, reaching about 424 m tall.",
      "Lava buried two villages, but everyone had time to leave safely.",
      "A church tower still pokes out of the hardened lava today.",
      "It's a cinder cone: a hill built from bits of lava that cooled as they fell.",
      "It sits in Michoacán, Mexico — part of a long chain of volcanoes across the country.",
    ],
    viewpoints: [
      { x: 1093.57, z: 23.7 }, // the farm's own trailhead, the whole cone rising ahead
      { x: 916.14, z: 9.97 }, // the crater rim, looking right down into the glowing bowl
      { x: 846.81, z: 128.34 }, // out in the lava field, by the half-buried church towers
    ],
  },
];
/** the wonders built into the world right now (the Grand Canyon waits behind CANYON_OPEN) */
export const WONDERS: WonderDef[] = ALL_WONDERS.filter((w) => CANYON_OPEN || w.id !== "grand-canyon");

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
