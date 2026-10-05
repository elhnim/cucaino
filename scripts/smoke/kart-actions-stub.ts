// stand-ins for lib/actions/karts.ts in the kart smoke harness (no database)
export async function saveKartLap() {
  return { ok: true };
}
export async function getKartGhosts() {
  return [];
}
export async function getKartLeaderboard() {
  return [{ kidId: "a", name: "Mia", animal: "animal-bunny", lapMs: 31200 }];
}
