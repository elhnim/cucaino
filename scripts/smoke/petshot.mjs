import { chromium } from "playwright";
const b = await chromium.launch();
for (const [dev, w, h] of [["ipad", 1024, 768], ["iphone", 390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:4599/canvas-smoke.html?scene=pet", { waitUntil: "load" });
  await p.waitForTimeout(1400);
  await p.screenshot({ path: `mockups/2026-06-12-game-world/lm-pet-${dev}.png` });
  await p.close();
}
await b.close();
console.log("done");
