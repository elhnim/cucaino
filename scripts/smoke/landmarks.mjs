import { chromium } from "playwright";
const base = "http://localhost:4599/canvas-smoke.html";
const out = "mockups/2026-06-12-game-world";
const errors = [];
const browser = await chromium.launch();

async function shoot(scene, dev, w, h) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  p.on("console", (m) => m.type() === "error" && errors.push(`[${scene}/${dev}] ${m.text()}`));
  p.on("pageerror", (e) => errors.push(`[${scene}/${dev}] ${e.message}`));
  await p.goto(`${base}?scene=${scene}`, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/lm-${scene}-${dev}.png` });
  await p.close();
}

for (const scene of ["work", "shop", "play", "friends"]) {
  await shoot(scene, "ipad", 1024, 768);
  await shoot(scene, "iphone", 390, 844);
}
await browser.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "NO CONSOLE ERRORS");
