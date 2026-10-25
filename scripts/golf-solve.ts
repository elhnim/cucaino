// Tuning helper: how many strokes does the robot golfer need on each hole?
//   npx tsx scripts/golf-solve.ts
import { COURSE } from "../lib/game3d/minigolf/courses";
import { solveHole } from "../lib/game3d/minigolf/solver";
import { maxStrokes } from "../lib/game3d/minigolf/physics";

for (const [i, h] of COURSE.entries()) {
  const t = Date.now();
  const r = solveHole(h, maxStrokes(h.par));
  console.log(`${String(i + 1).padStart(2)} ${h.name.padEnd(16)} par ${h.par}  robot ${r.strokes ?? "FAIL"}  (${r.shots} putts, ${Date.now() - t}ms)`);
}
