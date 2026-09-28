import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1180 } });
await p.goto("http://localhost:4599/canvas-smoke.html", { waitUntil: "load" });
await p.waitForTimeout(2400);
await p.screenshot({ path: "mockups/2026-06-12-game-world/roadmap-full.png" });
await b.close();
console.log("done");
