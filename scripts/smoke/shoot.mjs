import { chromium } from "playwright";

const base = "http://localhost:4599/canvas-smoke.html";
const out = "mockups/2026-06-12-game-world";
const errors = [];

const browser = await chromium.launch();

async function shoot(name, w, h, scene = "world", waitMs = 2600) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("console", (m) => m.type() === "error" && errors.push(`[${name}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[${name}] PAGEERROR ${e.message}`));
  await page.goto(scene === "pet" ? `${base}?scene=pet` : base, { waitUntil: "load" });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${out}/smoke-${name}.png` });
  await page.close();
}

await shoot("ipad-world", 1024, 768, "world");
await shoot("iphone-world", 390, 844, "world");
await shoot("ipad-pet", 1024, 768, "pet");
await shoot("iphone-pet", 390, 844, "pet");

await browser.close();
console.log(errors.length ? "CONSOLE ERRORS:\n" + errors.join("\n") : "NO CONSOLE ERRORS");
