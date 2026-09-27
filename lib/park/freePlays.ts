// One free play per game per day (then plays cost a ticket earned from quests). Kept on the
// device: it's a friendly daily taste, not a currency, so a cleared browser just gets one more.
import { dayKey } from "./world/treasures";

const key = (kidId: string, game: string) => `cucaino.freeplay.${kidId}.${dayKey()}.${game}`;

export function hasFreePlay(kidId: string, game: string): boolean {
  try {
    return window.localStorage.getItem(key(kidId, game)) !== "1";
  } catch {
    return false; // no storage (private mode): no free plays, tickets still work
  }
}

export function spendFreePlay(kidId: string, game: string): void {
  try {
    window.localStorage.setItem(key(kidId, game), "1");
  } catch {
    /* ignore */
  }
}
