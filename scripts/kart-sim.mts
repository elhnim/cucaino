// Cucaino Karts tuning sim: `npx tsx scripts/kart-sim.mts` — drives the circuit with the computer
// drivers at three skills, a "small kid" (slow reactions, full-lock steering, never brakes) and a
// kart with no input at all, and prints lap times, time on the grass, wall hits and rescues.
import { buildKartTrackShape, trackAt } from "../lib/park/karts/track.ts";
import { gridStartState, stepKart, type KartInput, type KartPhysState } from "../lib/park/karts/physics.ts";
import { aiInput, aiPower } from "../lib/park/karts/ai.ts";

const track = buildKartTrackShape();
const id = (p: { x: number; z: number }) => p;
const DT = 1 / 60;
type Driver = (s: KartPhysState, t: number) => { input: KartInput; power: number; assist: number };

function run(name: string, drive: Driver, laps = 3, maxT = 400) {
  let s = gridStartState(track, id, 0);
  let t = 0, grass = 0, walls = 0, rescues = 0, lapStart = 0, maxV = 0;
  const lapTimes: number[] = [];
  let lap = s.lap;
  let wasWall = false;
  while (s.lap <= laps && t < maxT) {
    const d = drive(s, t);
    s = stepKart(s, d.input, track, DT, [], { power: d.power, assist: d.assist });
    t += DT;
    if (s.offTrack) grass += DT;
    if (s.wallHit > 0.05 && !wasWall) walls++;
    wasWall = s.wallHit > 0.05;
    if (s.rescued) rescues++;
    maxV = Math.max(maxV, s.speed);
    if (s.lap !== lap) { lapTimes.push(t - lapStart); lapStart = t; lap = s.lap; }
  }
  console.log(name.padEnd(22), "laps", lapTimes.map((x) => x.toFixed(1)).join(" / ") || "DNF", "| total", t.toFixed(1), "| grass", grass.toFixed(1) + "s", "| walls", walls, "| rescues", rescues, "| top", maxV.toFixed(1));
}

console.log("track length", track.length.toFixed(0), "width", track.width);
for (const skill of [0.25, 0.6, 0.95]) run(`ai skill ${skill}`, (s) => ({ input: aiInput(s, track, { skill, seed: 7 }), power: aiPower({ skill, seed: 7 }), assist: 0 }));
run("ai best, full power", (s) => ({ input: aiInput(s, track, { skill: 1, seed: 3 }), power: 1, assist: 0 }));

// a small kid: sees where the road goes ~10 m ahead, reacts 0.3 s late, steers full-lock or not at all, never brakes
function kid(assist: number, react = 0.3, dead = 0.16): Driver {
  const queue: { t: number; steer: number }[] = [];
  let cur = 0;
  return (s, t) => {
    const at = trackAt(track, s.sLocal + 9 + s.speed * 0.35);
    let diff = Math.atan2(at.x - s.x, at.z - s.z) - s.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    queue.push({ t: t + react, steer: Math.abs(diff) < dead ? 0 : Math.sign(diff) });
    while (queue.length && queue[0].t <= t) cur = queue.shift()!.steer;
    return { input: { steer: cur, brake: false }, power: 1, assist };
  };
}
run("kid (assist on)", kid(1));
run("kid slow 0.45s", kid(1, 0.45, 0.2));
run("kid (assist off)", kid(0));
run("no input, assist on", () => ({ input: { steer: 0, brake: false }, power: 1, assist: 1 }), 1, 120);
run("hold right forever", () => ({ input: { steer: 1, brake: false }, power: 1, assist: 1 }), 1, 60);
