// Playwright auto-play of Dream Life: a priority-driven loop that plays whatever
// the screen offers, snapshotting each distinct screen kind once.
// Run: node scripts/dream-life-screens.mjs

import { chromium } from "playwright"
import { mkdirSync } from "fs"

const BASE = "http://localhost:3000"
const OUT = "screenshots/dream-life"
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 430, height: 900 } })
let shot = 0
const seen = new Set()
const snap = async name => {
  if (seen.has(name)) return
  seen.add(name)
  await page.screenshot({ path: `${OUT}/${String(++shot).padStart(2, "0")}-${name}.png` })
  console.log(`📸 ${name}`)
}

const vis = async sel => await page.locator(sel).first().isVisible().catch(() => false)
const click = async sel => {
  await page.locator(sel).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(350)
}

await page.goto(`${BASE}/dev-dream-life`)
await page.waitForLoadState("networkidle")

let phase3Snapped = false
let actionsRotation = 0

let lastBranch = ""
const hit = b => { if (b !== lastBranch) { console.log("→", b); lastBranch = b } }
for (let step = 0; step < 400; step++) {
  await page.waitForTimeout(120)

  // ---- priority ladder: dialogs first ----
  if (await vis("text=How to Win")) { hit("rules");  await snap("rules"); await click("text=Skip"); continue }
  if (await vis("text=Collect!")) { hit("collect");  await click("text=Collect!"); continue }
  if (await vis("text=Start!")) { hit("start");  await snap("minigame-start"); await click("text=Start!"); await page.waitForTimeout(2500); await snap("minigame-playing"); await page.waitForTimeout(14000); continue }
  if (await vis("text=Time's up")) { hit("timesup");  await page.waitForTimeout(600); continue }
  if (await vis("text=SETTLE THE YEAR")) { hit("settle");  await snap("event-card"); await click("text=SETTLE THE YEAR"); continue }
  if (await vis("text=/LIVE THE YEAR!/")) { hit("live");  await click("text=/LIVE THE YEAR!/"); continue }
  if (await vis("text=▶ PLAY!")) { hit("play");  await snap("minigame-intro"); await click("text=▶ PLAY!"); continue }
  if (await vis("text=Pass the tablet")) { hit("reaction");  await snap("reaction-prompt"); await click("text=Take the hit"); continue }
  if (await vis("text=Year in Review")) { hit("review"); 
    await snap("settlement")
    const btn = page.locator("text=/TURN ▶|KEEP GOING/").first()
    await btn.click({ timeout: 3000 }).catch(() => {})
    continue
  }
  if (await vis("text=SPIN THE CAREER REEL")) { hit("reel");  await snap("career-reel"); await click("text=SPIN THE CAREER REEL"); await snap("career-reel-result"); await click("text=START MY APPRENTICESHIP"); continue }
  if (await vis("text=winning life")) { hit("win");  await snap("win-screen"); break }

  // ---- boards ----
  if (await vis("text=PLAN YOUR YEAR")) { hit("phase3"); 
    // phase 3
    if (!phase3Snapped) {
      await snap("phase3-board")
      // tour the sheets once (sheet close button is the LAST ✕ — first is header Exit)
      const closeSheet = async () => { await page.locator("text=✕").last().click(); await page.waitForTimeout(300) }
      await click("text=💼 Portfolio"); await snap("portfolio"); await closeSheet()
      await click("text=📈 Skills"); await snap("skills"); await closeSheet()
      await click("text=🃏 Cards"); await snap("powerup-hand"); await closeSheet()
      phase3Snapped = true
    }
    await click("text=PLAN YOUR YEAR")
    await snap("action-sheet")
    // rotate through strategies: insurance → work → buy asset → invest
    const wants = [
      "text=Insurance",
      "text=Work harder",
      "text=Buy an asset",
      "text=Invest (study the markets)",
      "text=Live modestly",
    ]
    const want = wants[actionsRotation++ % wants.length]
    const el = page.locator(want).first()
    if (await el.isVisible().catch(() => false)) {
      await el.click()
      if (want === "text=Buy an asset") {
        await snap("asset-shop")
        // buy first unlocked row, else close
        const buyable = page.locator("button:not([disabled]):has-text('Savings')").first()
        if (await buyable.isVisible().catch(() => false)) await buyable.click()
        else await click("text=✕")
      }
    } else {
      await click("text=Invest (study the markets)")
    }
    continue
  }

  if (await vis("text=Pick ONE action")) { hit("board"); 
    // phase 1 or 2 board
    if (await vis("text=Apprentice")) await snap("phase2-board")
    else await snap("phase1-board")
    // click the first enabled action row
    const rows = ["Master the trade", "Work harder", "Invest", "Overtime", "Hustle", "Study"]
    let clicked = false
    for (const r of rows) {
      const el = page.locator(`button:not([disabled]):has-text("${r}")`).first()
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {})
        clicked = true
        break
      }
    }
    if (!clicked) console.log("⚠️ no action row clickable at step", step)
    continue
  }

  // stuck telemetry: every 25 idle steps dump a screenshot
  if (step % 25 === 24) {
    await page.screenshot({ path: `${OUT}/zz-stuck-${step}.png` })
    console.log("…idle at step", step)
  }

  if (await vis("text=START LIFE")) { hit("lobby"); 
    await snap("lobby")
    // select both stub kids
    const join = page.locator("text=TAP TO JOIN")
    while ((await join.count()) > 0) await join.first().click()
    await click("text=START LIFE")
    continue
  }
}

console.log(`✅ done — ${shot} screens`)
await browser.close()
