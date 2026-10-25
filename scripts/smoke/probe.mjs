import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto("http://localhost:4599/canvas-smoke.html?scene=work", { waitUntil: "load" });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => {
  const c = document.querySelector("canvas");
  return {
    dpr: window.devicePixelRatio,
    backingW: c.width, backingH: c.height,
    cssW: c.clientWidth, cssH: c.clientHeight,
  };
});
console.log(JSON.stringify(info));
await browser.close();
