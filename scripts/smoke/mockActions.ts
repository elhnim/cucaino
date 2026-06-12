// Stub of @/lib/actions/pet for the standalone canvas smoke build (no server/DB).
let coins = 128;
const okPet = () => ({ ok: true as const, pet: undefined, pointsBalance: (coins -= 1) });
export async function feedPet() { return okPet(); }
export async function playWithPet() { return okPet(); }
export async function cuddlePet() { return okPet(); }
export async function washPet() { return okPet(); }
export async function toggleSleep() { return okPet(); }
