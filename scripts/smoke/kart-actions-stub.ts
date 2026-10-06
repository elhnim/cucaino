// stand-ins for lib/actions/karts.ts in the kart smoke harness (no database)
export async function saveKartLap() {
  return { ok: true };
}
export async function getKartGhosts() {
  return [];
}
export async function getKartLeaderboard() {
  return [
    { kidId: "f1", name: "Zoe", animal: "animal-panda", lapMs: 33900, friend: true },
    { kidId: "a", name: "Mia", animal: "animal-bunny", lapMs: 35200, friend: false },
    { kidId: "f2", name: "Leo", animal: "animal-fox", lapMs: 36100, friend: true },
    { kidId: "smoke-kid", name: "Maymay", animal: "animal-fox", lapMs: 38400, friend: false },
  ];
}
