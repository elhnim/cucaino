import { chromium } from "playwright";
const base = "http://localhost:4599/canvas-smoke.html?scene=world";
const out = "mockups/2026-06-12-game-world";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(base, { waitUntil: "load" });
await p.waitForTimeout(2200);

const start = await p.evaluate(() => {
  const g = window.__game;
  const hud = g.scene.getScene("Hud");
  const w = g.scene.getScene("World");
  return { joy: hud.joyCenter, r: hud.joyR, player: { x: Math.round(w.player.x), y: Math.round(w.player.y) } };
});
console.log("joyCenter:", JSON.stringify(start.joy), "player:", JSON.stringify(start.player));

// Drag from joystick centre up-right (steer the player up-right), hold, then release.
await p.mouse.move(start.joy.x, start.joy.y);
await p.mouse.down();
await p.mouse.move(start.joy.x + 55, start.joy.y - 40, { steps: 5 });
await p.waitForTimeout(1200);
const during = await p.evaluate(() => {
  const w = window.__game.scene.getScene("World");
  return { vec: w.moveVec, player: { x: Math.round(w.player.x), y: Math.round(w.player.y) } };
});
await p.screenshot({ path: `${out}/joystick.png` });
await p.mouse.up();
await p.waitForTimeout(150);
const after = await p.evaluate(() => window.__game.scene.getScene("World").moveVec);

console.log("during:", JSON.stringify(during), "dx:", during.player.x - start.player.x, "dy:", during.player.y - start.player.y);
console.log("vec after release:", JSON.stringify(after));
await browser.close();
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "NO ERRORS");
