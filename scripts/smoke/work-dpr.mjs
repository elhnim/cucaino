import { chromium } from "playwright";
const base = "http://localhost:4599/canvas-smoke.html";
const out = "mockups/2026-06-12-game-world";
const browser = await chromium.launch();
async function shoot(scene, dev, w, h, dpr) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${base}?scene=${scene}`, { waitUntil: "load" });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}/dpr-${scene}-${dev}.png` });
  const info = await p.evaluate(() => {
    const c = document.querySelector("canvas");
    return { backingW: c.width, cssW: c.clientWidth };
  });
  if (errs.length) console.log(`[${scene}/${dev}]`, errs.join("; "));
  console.log(`${scene}/${dev}: backing=${info.backingW} css=${info.cssW}`);
  await ctx.close();
}
await shoot("work", "ipad", 1024, 768, 2);
await shoot("work", "iphone", 390, 844, 3);
await shoot("world", "ipad", 1024, 768, 2);
await shoot("pet", "iphone", 390, 844, 3);
await browser.close();
console.log("done");
