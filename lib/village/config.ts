// Village Pillage — data-driven card definitions, ported from the game spec.
// Pure data, safe to import anywhere.

export type CardId =
  | "farmer" | "wall" | "guard" | "raider" | "mystic" | "barn"
  | "catapult" | "berserker" | "wizard" | "holycow" | "champion" | "pirate"
  | "necromancer" | "spy" | "merchant" | "saboteur" | "monk" | "warlord";

export type Kind = "producer" | "blocker" | "attacker" | "mystic" | "spy";

export interface CardDef {
  kind: Kind;
  produce?: number;
  raid?: number;
  wall?: boolean;
  bank?: number;
  ignoreWall?: boolean;
  reckless?: boolean;
  immune?: boolean;
  juicy?: boolean;
  perMerc?: boolean;
  sabotage?: boolean;
}

export const DEF: Record<CardId, CardDef> = {
  farmer:     { kind: "producer", produce: 2 },
  wall:       { kind: "blocker", wall: true, produce: 1 },
  guard:      { kind: "blocker", produce: 1 },
  raider:     { kind: "attacker", raid: 2 },
  mystic:     { kind: "mystic" },
  barn:       { kind: "blocker", wall: true, bank: 3 },
  catapult:   { kind: "attacker", raid: 2, ignoreWall: true },
  berserker:  { kind: "attacker", raid: 3, reckless: true },
  wizard:     { kind: "producer", produce: 2, immune: true },
  holycow:    { kind: "producer", produce: 3, juicy: true },
  champion:   { kind: "blocker", produce: 2 },
  pirate:     { kind: "attacker", raid: 2, immune: true }, // +1 vs mystic
  necromancer:{ kind: "attacker", raid: 2 },               // +1 vs producer
  spy:        { kind: "spy" },
  merchant:   { kind: "producer", produce: 1, perMerc: true },
  saboteur:   { kind: "attacker", raid: 1, sabotage: true },
  monk:       { kind: "producer", produce: 1, immune: true, bank: 2 },
  warlord:    { kind: "attacker", raid: 4 },
};

export const BASE: CardId[] = ["farmer", "wall", "guard", "raider", "mystic", "barn"];
export const MERCS: CardId[] = [
  "catapult", "berserker", "wizard", "holycow", "champion", "pirate",
  "necromancer", "spy", "merchant", "saboteur", "monk", "warlord",
];
export const MERC_COST: Partial<Record<CardId, number>> = {
  catapult: 5, berserker: 5, wizard: 6, holycow: 5, champion: 6, pirate: 7,
  necromancer: 6, spy: 6, merchant: 5, saboteur: 7, monk: 5, warlord: 8,
};

export interface CardMeta {
  name: string;
  icon: string;
  text: string;
}

export const META: Record<CardId, CardMeta> = {
  farmer:     { name: "Farmer",     icon: "🌾", text: "+2 turnips" },
  wall:       { name: "Wall",       icon: "🧱", text: "Blocks the attacker facing it. +1 turnip if not attacked." },
  guard:      { name: "Guard",      icon: "🛡️", text: "+1 turnip and blocks the attacker (stops Catapults too)." },
  raider:     { name: "Raider",     icon: "⚔️", text: "Steal 2 from supply. Blocked by Wall/Guard/attacker." },
  mystic:     { name: "Mystic",     icon: "🔮", text: "Opens the shop (buy a Relic 3🥔 or a Mercenary)." },
  barn:       { name: "Barn",       icon: "🛖", text: "Move up to 3 turnips to your safe bank. Blocks like a Wall." },
  catapult:   { name: "Catapult",   icon: "🪨", text: "Steal 2; siege — ignores Walls & Barns." },
  berserker:  { name: "Berserker",  icon: "🪓", text: "Steal 3; reckless — if blocked you lose 1 turnip." },
  wizard:     { name: "Wizard",     icon: "🧙", text: "+2 turnips, immune — can't be robbed." },
  holycow:    { name: "Holy Cow",   icon: "🐄", text: "+3 turnips, juicy — a raider facing it steals +1." },
  champion:   { name: "Champion",   icon: "🏅", text: "+2 turnips and blocks an attacker." },
  pirate:     { name: "Pirate",     icon: "🏴", text: "Steal 2, immune; +1 if it robs a Mystic." },
  necromancer:{ name: "Necromancer",icon: "💀", text: "Steal 2; +1 if it beats a producer." },
  spy:        { name: "Spy",        icon: "🕵️", text: "Becomes a copy of the card it faces this round." },
  merchant:   { name: "Merchant",   icon: "💰", text: "+1 turnip, +1 per mercenary in your hand (max +3)." },
  saboteur:   { name: "Saboteur",   icon: "🧨", text: "Steal 1 and destroy 1 of the opponent's BANKED turnips." },
  monk:       { name: "Monk",       icon: "🔔", text: "+1 turnip, immune, and banks 2 turnips." },
  warlord:    { name: "Warlord",    icon: "🗡️", text: "Steal 4. Blocked by Wall/Guard/attacker." },
};

export const KIND_GRADIENT: Record<Kind, string> = {
  producer: "from-emerald-400 to-green-600",
  blocker:  "from-sky-400 to-blue-600",
  attacker: "from-rose-400 to-pink-600",
  mystic:   "from-violet-400 to-purple-600",
  spy:      "from-slate-400 to-slate-600",
};

export const KIND_RING: Record<Kind, string> = {
  producer: "ring-emerald-300",
  blocker:  "ring-sky-300",
  attacker: "ring-rose-300",
  mystic:   "ring-violet-300",
  spy:      "ring-slate-300",
};

// Tuning knobs
export const START_TURNIPS = 3;
export const START_BANK = 0;
export const WIN_RELICS = 5;
export const RELIC_COST = 3;
export const MARKET_SIZE = 4;
export const PLAYERS = 2;

export const VILLAGE_AVATARS = ["🦊", "🐻"];
