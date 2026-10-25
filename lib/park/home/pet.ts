// My Home: the pet's little brain (pure, no three.js). Where it stands to use each of its things,
// and what it feels like doing next. The 3D room (scene.ts) walks it there and plays the
// animation; all real pet care (feed / wash / sleep ...) still goes through lib/actions/pet.ts.
import { getHomeItem, type PetUse } from "./catalog";
import { GRID_W, footprint, placedTransform, worldToGlobal, type HomePlaced } from "./rules";

export interface PetSpot {
  x: number;
  y: number;
  z: number;
  /** which way the pet faces while using it (rotation.y, model faces +Z) */
  face: number;
}

/**
 * Where the pet goes to use a placed item: into the middle of its bed (lying on the cushion),
 * or standing just beside a bowl / toy / scratching post — on whichever side is free.
 */
export function petSpotFor(p: HomePlaced, blocked: Uint8Array): PetSpot | null {
  const def = getHomeItem(p.item);
  if (!def?.petUse) return null;
  const t = placedTransform(p);
  if (def.petUse === "sleep") return { x: t.x, y: def.seatY ?? 0.3, z: t.z, face: t.rotY };
  const { w, d } = footprint(def, p.r);
  // try the item's front first, then its sides, then behind
  const front = t.rotY;
  const sides = [front, front + Math.PI / 2, front - Math.PI / 2, front + Math.PI];
  for (const a of sides) {
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const reach = Math.abs(dx) * (w / 2) + Math.abs(dz) * (d / 2) + 0.6;
    const x = t.x + dx * reach;
    const z = t.z + dz * reach;
    if (x < -9.4 || x > 9.4 || z < -3.9 || z > 3.9) continue;
    const { c, row } = worldToGlobal(x, z);
    if (blocked[row * GRID_W + c]) continue;
    return { x, y: 0, z, face: Math.atan2(t.x - x, t.z - z) };
  }
  return { x: t.x, y: 0, z: t.z + d / 2 + 0.6, face: Math.PI };
}

export interface PetMood {
  hunger: number;
  happiness: number;
  energy: number;
}

export type PetActivity = { kind: "follow" } | { kind: "wander" } | { kind: PetUse | "rest"; uid: string };

/**
 * What the pet does next when it's awake and nobody asked it anything. Needs pull it towards
 * its things (hungry -> bowl, bored -> toys, tired -> a quick rest in its bed); otherwise it
 * mostly sticks by the kid. `roll` and `pick` are 0..1 random numbers (injected for tests).
 */
export function choosePetActivity(mood: PetMood, placed: HomePlaced[], roll: number, pick: number): PetActivity {
  const byUse = (use: PetUse) => placed.filter((p) => getHomeItem(p.item)?.petUse === use);
  const one = (list: HomePlaced[]) => list[Math.min(list.length - 1, Math.floor(pick * list.length))];
  const beds = byUse("sleep");
  const bowls = byUse("eat");
  const toys = byUse("play");
  const posts = byUse("scratch");
  const w: [PetActivity, number][] = [];
  w.push([{ kind: "follow" }, 3]);
  w.push([{ kind: "wander" }, 1]);
  if (bowls.length) w.push([{ kind: "eat", uid: one(bowls).uid }, mood.hunger < 40 ? 6 : mood.hunger < 70 ? 1.5 : 0.4]);
  if (toys.length && mood.energy >= 20) w.push([{ kind: "play", uid: one(toys).uid }, mood.happiness < 50 ? 5 : 2]);
  if (posts.length && mood.energy >= 20) w.push([{ kind: "scratch", uid: one(posts).uid }, 1.2]);
  if (beds.length) w.push([{ kind: "rest", uid: one(beds).uid }, mood.energy < 30 ? 6 : 0.6]);
  const total = w.reduce((s, [, n]) => s + n, 0);
  let x = Math.max(0, Math.min(0.999999, roll)) * total;
  for (const [a, n] of w) {
    if (x < n) return a;
    x -= n;
  }
  return w[0][0];
}

/** what the pet says when you give it something new of its own */
export function newThingLine(petName: string, itemId: string): string {
  const def = getHomeItem(itemId);
  const n = petName || "Your pet";
  switch (def?.petUse) {
    case "sleep":
      return `${n} loves the new bed! 💤`;
    case "eat":
      return `Yum! ${n} can't wait for dinner! 🍽️`;
    case "play":
      return `A new toy! ${n} wants to play! 🎉`;
    case "scratch":
      return `${n} is having a big stretch! 😸`;
    default:
      return `${n} likes it! 💖`;
  }
}
