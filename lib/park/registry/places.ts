// The buildings and landmarks of Cucaino Park. Pure data: the world builder places them and
// the HUD decides what opening each one does (by `action`). To add a place, add an entry.
import type { KitName } from "../assets/loader";

export type PlaceAction = "quests" | "shop" | "pet" | "friends" | "rides" | "gift" | "build" | "none";

export interface PlaceModel {
  kit: KitName;
  id: string;
  scale: number;
  /** local offset from the place position (x, z) and extra yaw */
  offset?: [number, number];
  rotY?: number;
}

export interface PlaceDef {
  id: string;
  label: string;
  emoji: string;
  x: number;
  z: number;
  /** building footprint radius — the kid is gently pushed out of it */
  radius: number;
  /** walking within this distance of the door opens the place */
  doorRadius: number;
  action: PlaceAction;
  models: PlaceModel[];
  /** height of the floating sign */
  signY: number;
}

export const PLACES: PlaceDef[] = [
  {
    id: "quest-board",
    label: "Quest Board",
    emoji: "📋",
    x: 0,
    z: -17,
    radius: 2.6,
    doorRadius: 5,
    action: "quests",
    signY: 6.2,
    models: [
      { kit: "town", id: "stall-red", scale: 3.4 },
      { kit: "town", id: "banner-red", scale: 3, offset: [-2.2, 0.6] },
      { kit: "town", id: "banner-green", scale: 3, offset: [2.2, 0.6] },
      { kit: "holiday", id: "present-a-cube", scale: 2, offset: [-2.6, 2.2] },
      { kit: "holiday", id: "present-b-rectangle", scale: 2, offset: [2.7, 2] },
    ],
  },
  {
    id: "prize-shop",
    label: "Prize Shop",
    emoji: "🏪",
    x: 18,
    z: -4,
    radius: 3.6,
    doorRadius: 6,
    action: "shop",
    signY: 7,
    models: [
      { kit: "city", id: "building-k", scale: 3.6, rotY: -Math.PI / 2 },
      { kit: "city", id: "detail-parasol-a", scale: 3.2, offset: [-4.2, 2.6] },
      { kit: "food", id: "cupcake", scale: 5, offset: [-4.4, -2.4] },
    ],
  },
  {
    id: "pet-house",
    label: "Pet House",
    emoji: "🐾",
    x: -18,
    z: -4,
    radius: 3,
    doorRadius: 6,
    action: "pet",
    signY: 5.8,
    models: [
      { kit: "city", id: "building-c", scale: 3.8, rotY: Math.PI / 2 },
      { kit: "town", id: "hedge-curved", scale: 3, offset: [3.6, 3] },
      { kit: "food", id: "cookie-chocolate", scale: 9, offset: [3.8, -2.6] },
    ],
  },
  {
    id: "friends-tower",
    label: "Friends",
    emoji: "💌",
    x: 13,
    z: -15,
    radius: 2.2,
    doorRadius: 5,
    action: "friends",
    signY: 8,
    models: [{ kit: "city", id: "building-g", scale: 3.6, rotY: -Math.PI / 4 }],
  },
  {
    id: "ride-station",
    label: "Rides & Games",
    emoji: "🎢",
    x: -13,
    z: -15,
    radius: 3,
    doorRadius: 5.5,
    action: "rides",
    signY: 5.4,
    models: [
      { kit: "coaster", id: "station", scale: 3.2, rotY: Math.PI / 4 },
      { kit: "coaster", id: "coaster-train-front", scale: 3, offset: [0.4, 0.2], rotY: Math.PI / 4 },
      { kit: "coaster", id: "ride-entrance", scale: 3, offset: [3.2, 2.4], rotY: Math.PI / 4 },
    ],
  },
  {
    id: "daily-gift",
    label: "Daily Gift",
    emoji: "🎁",
    x: 5.5,
    z: 4.5,
    radius: 1.1,
    doorRadius: 2.4,
    action: "gift",
    signY: 3.4,
    models: [
      { kit: "holiday", id: "present-a-round", scale: 2.6 },
      { kit: "holiday", id: "present-b-cube", scale: 1.8, offset: [1, 0.6] },
    ],
  },
  {
    // entrance to the kid's own Dream Park lawn (lib/park/builder/rules.ts DREAM_ZONE)
    id: "dream-park",
    label: "My Dream Park",
    emoji: "🔨",
    x: 23.6,
    z: 12.4,
    radius: 0,
    doorRadius: 2.6,
    action: "build",
    signY: 5.6,
    models: [
      { kit: "town", id: "banner-green", scale: 3.2, offset: [-2.6, 0] },
      { kit: "town", id: "banner-red", scale: 3.2, offset: [2.6, 0] },
      { kit: "food", id: "lollypop", scale: 8, offset: [-3.4, 0.6] },
      { kit: "food", id: "lollypop", scale: 8, offset: [3.4, 0.6] },
    ],
  },
  {
    id: "gate",
    label: "Cucaino Park",
    emoji: "🍭",
    x: 0,
    z: 40,
    radius: 0,
    doorRadius: 0,
    action: "none",
    signY: 9.2,
    models: [{ kit: "coaster", id: "park-entrance", scale: 3.4, rotY: Math.PI }],
  },
];

export const SPAWN = { x: 0, z: 20 };

export function getPlace(id: string): PlaceDef | undefined {
  return PLACES.find((p) => p.id === id);
}
