// Which in-race messages belong to THIS race. Every race in a family shares one channel
// (karts:<familyId>), so a second race going on at the same time, or a late packet from the race
// before a rematch, arrives here too: without this check its bananas landed on our road.
import type { KartNetMsg } from "./types";

/** true if `m` is an in-race message (pose / item / finish / leave) for the race `raceId`, sent by
 *  one of its own racers */
export function isForThisRace(m: KartNetMsg, raceId: string, racerIds: readonly string[]): boolean {
  if (m.type !== "pose" && m.type !== "item" && m.type !== "finish" && m.type !== "leave") return false;
  if (!racerIds.includes(m.kidId)) return false;
  // (a "leave" may come without a race id — a tablet that just dropped off the channel)
  if (m.raceId === undefined) return m.type === "leave";
  return m.raceId === raceId;
}
