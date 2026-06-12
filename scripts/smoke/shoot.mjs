import { chromium } from "playwright";

const base = "http://localhost:4599/canvas-smoke.html";
const out = "mockups/2026-06-12-game-world";
const errors = [];
const browser = await chromium.launch();

async function page(w, h, scene = "world") {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  p.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  await p.goto(scene === "pet" ? `${base}?scene=pet` : base, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  return p;
}

// static layouts
for (const [name, w, h] of [["ipad-world", 1024, 768], ["iphone-world", 390, 844]]) {
  const p = await page(w, h);
  await p.screenshot({ path: `${out}/smoke-${name}.png` });
  await p.close();
}

// walk interaction: tap empty ground bottom-left, character should walk there
{
  const p = await page(1024, 768);
  await p.screenshot({ path: `${out}/smoke-walk-0.png` });
  await p.mouse.click(190, 700);
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${out}/smoke-walk-1.png` });
  await p.close();
}

await browser.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "NO CONSOLE ERRORS");
