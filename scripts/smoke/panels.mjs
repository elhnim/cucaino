import { chromium } from "playwright";
const base = "http://localhost:4599/canvas-smoke.html?scene=work";
const out = "mockups/2026-06-12-game-world";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));

async function open(x, y, name, extraTaps = []) {
  await p.goto(base, { waitUntil: "load" });
  await p.waitForTimeout(1700);
  await p.mouse.click(x, y);
  await p.waitForTimeout(600);
  for (const [tx, ty] of extraTaps) { await p.mouse.click(tx, ty); await p.waitForTimeout(450); }
  await p.screenshot({ path: `${out}/panel-${name}.png` });
}

// Grid centres (CSS px) on the verified 3x2 layout:
// row1 y~250, row2 y~452; cols x ~ 304, 512, 720
await open(512, 250, "checklist", [[512, 384 + 30]]);       // tick one item
await open(720, 250, "timer", [[512, 480]]);                // press Start
await open(304, 452, "music", [[512, 540]]);                // start beat
await open(512, 452, "reps", [[565, 480], [565, 480], [565, 480]]); // +1 thrice

await browser.close();
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "NO ERRORS");
